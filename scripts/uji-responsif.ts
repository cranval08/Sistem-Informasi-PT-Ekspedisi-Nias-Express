// Uji responsivitas (PRD §14 "Tampilan responsif di desktop dan smartphone"):
//   npm run dev          (terminal lain)
//   npm run uji:responsif
//
// Membuka setiap rute yang diizinkan untuk tiap akun demo di Chrome/Edge
// headless pada lebar ponsel (375 px), tablet (768 px), dan desktop (1280 px),
// lalu memeriksa:
//   - scroll horizontal pada halaman (elemen yang meluber keluar layar,
//     kecuali di dalam kotak yang memang dapat di-scroll, mis. tabel);
//   - galat JavaScript & console.error di browser;
//   - teks galat ("Application error", "gagal dimuat").
// Tangkapan layar disimpan ke UJI_RESPONSIF_OUT (bawaan: .uji-responsif/,
// diabaikan git) untuk diperiksa mata. Hanya membaca; tidak mengubah data.
// Tidak mencetak password maupun kunci.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { bolehAkses, RUTE, type KunciRute, type Peran } from "../src/lib/domain/peran";
import { AKUN_DEMO as AKUN, buka, denganPeramban, pasangSesi, sesiDemo } from "./lib/peramban";

process.loadEnvFile(".env.local");
const APP = process.env.UJI_APP_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.env.UJI_RESPONSIF_OUT ?? ".uji-responsif");
const PORT = 9333;

const LEBAR = [
  { nama: "ponsel", w: 375, h: 812, mobile: true },
  { nama: "tablet", w: 768, h: 1024, mobile: true },
  { nama: "desktop", w: 1280, h: 800, mobile: false },
] as const;


// Dievaluasi di halaman: elemen yang meluber ke kanan layar, kecuali bila
// leluhurnya adalah kotak scroll/clip (tabel di dalam overflow-x-auto boleh).
const PERIKSA = `(() => {
  const iw = window.innerWidth;
  const sw = document.documentElement.scrollWidth;
  const dalamKotakScroll = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  };
  const luber = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > iw + 1 && !dalamKotakScroll(el)) {
      const s = getComputedStyle(el);
      if (s.position === "fixed" || s.visibility === "hidden") continue;
      luber.push({
        tag: el.tagName.toLowerCase(),
        kelas: (el.getAttribute("class") || "").slice(0, 80),
        teks: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60),
        kanan: Math.round(r.right),
      });
    }
  }
  // Ambil elemen terdalam saja (anak dari elemen lain di daftar disaring).
  const teks = document.body.innerText;
  return JSON.stringify({
    iw, sw,
    luber: luber.slice(-6),
    galat: /Application error|gagal dimuat/.test(teks),
    tinggi: document.documentElement.scrollHeight,
  });
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const hasil: { peran: string; lebar: string; path: string; masalah: string[] }[] = [];
  await denganPeramban(PORT, async (cdp) => {

    let galatBrowser: string[] = [];
    cdp.dengar((m) => {
      if (m.method === "Runtime.exceptionThrown") galatBrowser.push("JS: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split("\n")[0]);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
        galatBrowser.push("console.error: " + m.params.args.map((a: { value?: string; description?: string }) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    });

    for (const peran of Object.keys(AKUN) as Peran[]) {
      const { supabase, cookies } = await sesiDemo(AKUN[peran]);
      await pasangSesi(cdp, APP, cookies);

      // Rute statis + satu contoh rute detail bila datanya ada (dibaca sebagai peran itu).
      const rute: string[] = (Object.keys(RUTE) as KunciRute[]).filter((k) => bolehAkses(peran, k)).map((k) => RUTE[k].href);
      if (bolehAkses(peran, "transaksi")) {
        const { data } = await supabase.from("data_transaksi").select("no_resi").order("waktu_transaksi", { ascending: false }).limit(1).maybeSingle();
        if (data) rute.push(`/transaksi/${data.no_resi}`, `/transaksi/${data.no_resi}/cetak`);
      }
      if (bolehAkses(peran, "manifes")) {
        const { data } = await supabase.from("manifes").select("id_manifes").limit(1).maybeSingle();
        if (data) rute.push(`/manifes/${data.id_manifes}`);
      }
      if (bolehAkses(peran, "armada")) {
        const { data } = await supabase.from("data_armada").select("id_armada").limit(1).maybeSingle();
        if (data) rute.push(`/armada/${data.id_armada}`);
      }
      if (peran === "pemilik") rute.push("/lacak");

      for (const l of LEBAR) {
        await cdp.kirim("Emulation.setDeviceMetricsOverride", { width: l.w, height: l.h, deviceScaleFactor: 1, mobile: l.mobile });
        for (const p of rute) {
          galatBrowser = [];
          await buka(cdp, APP + p); // termasuk jeda hidrasi & tata letak klien
          const r = JSON.parse(await cdp.nilai<string>(PERIKSA));
          const masalah: string[] = [];
          if (r.sw > r.iw + 1) masalah.push(`scroll horizontal: lebar konten ${r.sw}px > layar ${r.iw}px`);
          for (const e of r.luber) masalah.push(`meluber s.d. ${e.kanan}px: <${e.tag} class="${e.kelas}"> "${e.teks}"`);
          // /sistem-desain sengaja memperagakan state galat.
          if (r.galat && p !== RUTE.sistemDesain.href) masalah.push("teks galat di halaman");
          masalah.push(...galatBrowser);
          hasil.push({ peran, lebar: l.nama, path: p, masalah });

          const nama = `${peran}_${l.nama}_${p.replace(/^\//, "").replace(/[^\w-]+/g, "_") || "root"}.png`;
          const tinggi = Math.min(r.tinggi, 6000);
          const shot = await cdp.kirim<{ data: string }>("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: l.w, height: tinggi, scale: 1 },
          });
          writeFileSync(path.join(OUT, nama), Buffer.from(shot.data, "base64"));
          process.stdout.write(masalah.length ? "✗" : ".");
        }
      }
      await supabase.auth.signOut({ scope: "local" });
    }
  });

  writeFileSync(path.join(OUT, "laporan.json"), JSON.stringify(hasil, null, 2));
  const gagal = hasil.filter((h) => h.masalah.length);
  console.log(`\n\n${hasil.length} tampilan diperiksa, ${gagal.length} bermasalah. Tangkapan layar: ${OUT}`);
  for (const g of gagal) console.log(`\n✗ ${g.peran} · ${g.lebar} · ${g.path}\n  - ${g.masalah.join("\n  - ")}`);
  process.exitCode = gagal.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
