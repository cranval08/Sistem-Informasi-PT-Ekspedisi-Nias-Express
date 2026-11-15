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
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServerClient } from "@supabase/ssr";
import { envPublik } from "../src/lib/supabase/env";
import { bolehAkses, RUTE, type KunciRute, type Peran } from "../src/lib/domain/peran";

process.loadEnvFile(".env.local");
const APP = process.env.UJI_APP_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.env.UJI_RESPONSIF_OUT ?? ".uji-responsif");
const PORT = 9333;

const AKUN: Record<Peran, string> = {
  pemilik: "demo.pemilik@example.com",
  admin_loket: "demo.admin@example.com",
  staf_gudang: "demo.gudang@example.com",
  supir: "demo.supir@example.com",
};
const LEBAR = [
  { nama: "ponsel", w: 375, h: 812, mobile: true },
  { nama: "tablet", w: 768, h: 1024, mobile: true },
  { nama: "desktop", w: 1280, h: 800, mobile: false },
] as const;

function cariBrowser(): string {
  const kandidat = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean) as string[];
  const b = kandidat.find((p) => existsSync(p));
  if (!b) throw new Error("Chrome/Edge tidak ditemukan. Atur CHROME_PATH.");
  return b;
}

async function cookieSesi(email: string) {
  const { url, publishableKey } = envPublik(process.env);
  const jar = new Map<string, string>();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (d) => d.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD! });
  if (error) throw new Error(`Login ${email} gagal (periksa DEMO_PASSWORD & seed:akun).`);
  return { supabase, cookies: [...jar].map(([name, value]) => ({ name, value })) };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- payload protokol CDP tidak bertipe */
/** Klien CDP minimal di atas WebSocket bawaan Node. */
class Cdp {
  private id = 0;
  private tunggu = new Map<number, { ok: (v: unknown) => void; gagal: (e: Error) => void }>();
  private pendengar: ((m: { method: string; params: any }) => void)[] = [];
  constructor(private ws: WebSocket) {
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(String(ev.data));
      if (m.id && this.tunggu.has(m.id)) {
        const t = this.tunggu.get(m.id)!;
        this.tunggu.delete(m.id);
        if (m.error) t.gagal(new Error(m.error.message));
        else t.ok(m.result);
      } else if (m.method) this.pendengar.forEach((f) => f(m));
    });
  }
  static async sambung(url: string) {
    const ws = new WebSocket(url);
    await new Promise((ok, gagal) => {
      ws.addEventListener("open", ok, { once: true });
      ws.addEventListener("error", gagal, { once: true });
    });
    return new Cdp(ws);
  }
  kirim<T = any>(method: string, params: object = {}): Promise<T> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((ok, gagal) => this.tunggu.set(id, { ok: ok as (v: unknown) => void, gagal }));
  }
  dengar(f: (m: { method: string; params: any }) => void) {
    this.pendengar.push(f);
  }
  sekali(method: string, ms = 30_000) {
    return new Promise<void>((ok, gagal) => {
      const t = setTimeout(() => gagal(new Error(`timeout ${method}`)), ms);
      const f = (m: { method: string }) => {
        if (m.method === method) {
          clearTimeout(t);
          this.pendengar = this.pendengar.filter((x) => x !== f);
          ok();
        }
      };
      this.pendengar.push(f);
    });
  }
  tutup() {
    this.ws.close();
  }
}

const jeda = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const profilDir = mkdtempSync(path.join(tmpdir(), "uji-responsif-"));
  const chrome = spawn(
    cariBrowser(),
    ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profilDir}`, "--no-first-run", "--hide-scrollbars", "about:blank"],
    { stdio: "ignore" },
  );
  const hasil: { peran: string; lebar: string; path: string; masalah: string[] }[] = [];
  try {
    let daftar: { type: string; webSocketDebuggerUrl: string }[] = [];
    for (let i = 0; i < 50 && !daftar.length; i++) {
      await jeda(200);
      daftar = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json()).catch(() => []);
      daftar = daftar.filter((t) => t.type === "page");
    }
    if (!daftar.length) throw new Error("Browser headless tidak merespons.");
    const cdp = await Cdp.sambung(daftar[0].webSocketDebuggerUrl);
    await Promise.all(["Page.enable", "Runtime.enable", "Network.enable"].map((m) => cdp.kirim(m)));

    let galatBrowser: string[] = [];
    cdp.dengar((m) => {
      if (m.method === "Runtime.exceptionThrown") galatBrowser.push("JS: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).split("\n")[0]);
      if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
        galatBrowser.push("console.error: " + m.params.args.map((a: any) => a.value ?? a.description ?? "").join(" ").slice(0, 200));
    });

    const host = new URL(APP).hostname;
    for (const peran of Object.keys(AKUN) as Peran[]) {
      const { supabase, cookies } = await cookieSesi(AKUN[peran]);
      await cdp.kirim("Network.clearBrowserCookies");
      await cdp.kirim("Network.setCookies", { cookies: cookies.map((c) => ({ ...c, domain: host, path: "/" })) });

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
          const muat = cdp.sekali("Page.loadEventFired");
          await cdp.kirim("Page.navigate", { url: APP + p });
          await muat;
          await jeda(700); // hidrasi & tata letak klien
          const r = JSON.parse((await cdp.kirim("Runtime.evaluate", { expression: PERIKSA, returnByValue: true })).result.value);
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
    cdp.tutup();
  } finally {
    chrome.kill();
    await jeda(300);
    rmSync(profilDir, { recursive: true, force: true, maxRetries: 5 });
  }

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
