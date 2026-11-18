// Uji alur Transaksi & Resi di peramban sungguhan (uji manual bagian B,
// docs/uji-manual.md), diotomatiskan dengan Chrome/Edge headless:
//   npm run dev                (terminal lain)
//   npm run uji:alur-transaksi
//
// PERHATIAN: MENULIS ke database cloud — membuat pelanggan & transaksi
// berlabel [Demo] (tidak dapat dihapus permanen; pelanggan uji dinonaktifkan
// dan transaksi Rp0 dibatalkan di akhir). Tarif jenis barang demo diubah
// sementara untuk B6 lalu dikembalikan. Jalankan hanya pada project demo.
//
// Menguji: validasi per field (B3), dua transaksi berturut-turut tanpa
// memuat ulang halaman (B2 + regresi "form terkunci setelah simpan"),
// peringatan duplikasi (B4), klik ganda (B5), snapshot tarif (B6), cetak 3
// format & tombol "Simpan & Cetak Resi" (B7, B7a), pembatalan oleh Pemilik (B8), dan normalisasi/duplikat
// telepon pelanggan (B1). Tangkapan layar: .uji-responsif/alur-*.png.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { AKUN_DEMO, buka, denganPeramban, jeda, pasangSesi, sesiDemo, type Cdp } from "./lib/peramban";

process.loadEnvFile(".env.local");
const APP = process.env.UJI_APP_URL ?? "http://localhost:3000";
const OUT = path.resolve(process.env.UJI_RESPONSIF_OUT ?? ".uji-responsif");
const PORT = 9334;

type Hasil = { kode: string; nama: string; ok: boolean; catatan: string[] };
const hasil: Hasil[] = [];
let aktif: Hasil | null = null;

function langkah(kode: string, nama: string) {
  aktif = { kode, nama, ok: true, catatan: [] };
  hasil.push(aktif);
  process.stdout.write(`\n${kode} ${nama}\n`);
}
function periksa(kondisi: boolean, pesan: string) {
  process.stdout.write(`   ${kondisi ? "✓" : "✗"} ${pesan}\n`);
  if (!kondisi && aktif) {
    aktif.ok = false;
    aktif.catatan.push(pesan);
  }
}

// ── Pembantu interaksi (event mouse & keyboard sungguhan lewat CDP) ──────────

// Dipasang di halaman: cari elemen terlihat menurut selector + teks.
const PEMBANTU = `window.__cari = (sel, teks, ke = 0) => {
  const cocok = [...document.querySelectorAll(sel)].filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (teks == null) return true;
    const t = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").replace(/\\s+/g, " ");
    return t.includes(teks);
  });
  return cocok[ke] || null;
};`;

async function pasangPembantu(cdp: Cdp) {
  await cdp.nilai(PEMBANTU);
}

async function tunggu(cdp: Cdp, ekspresi: string, ms = 8000): Promise<boolean> {
  const batas = Date.now() + ms;
  while (Date.now() < batas) {
    try {
      if (await cdp.nilai<boolean>(`!!(${ekspresi})`)) return true;
    } catch {
      /* halaman sedang berpindah */
    }
    await jeda(150);
  }
  return false;
}

async function klik(cdp: Cdp, sel: string, teks?: string, ke = 0) {
  await pasangPembantu(cdp);
  const kotak = await cdp.nilai<{ x: number; y: number } | null>(`(() => {
    const el = window.__cari(${JSON.stringify(sel)}, ${JSON.stringify(teks ?? null)}, ${ke});
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!kotak) throw new Error(`Elemen tidak ditemukan: ${sel} "${teks ?? ""}"`);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"] as const) {
    await cdp.kirim("Input.dispatchMouseEvent", { type, x: kotak.x, y: kotak.y, button: "left", clickCount: 1, pointerType: "mouse" });
  }
  await jeda(250);
}

/** Kosongkan lalu ketik ke input/textarea (memicu onChange React). */
async function ketik(cdp: Cdp, sel: string, teks: string, ke = 0) {
  await pasangPembantu(cdp);
  const ada = await cdp.nilai<boolean>(`(() => {
    const el = window.__cari(${JSON.stringify(sel)}, null, ${ke});
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    el.focus();
    el.select?.();
    return true;
  })()`);
  if (!ada) throw new Error(`Input tidak ditemukan: ${sel}`);
  // Hapus isi lama dengan Backspace, lalu sisipkan teks baru.
  await cdp.kirim("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  await cdp.kirim("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
  if (teks) await cdp.kirim("Input.insertText", { text: teks });
  await jeda(150);
}

const teksHalaman = (cdp: Cdp) => cdp.nilai<string>("document.body.innerText");
const pesanGalatField = (cdp: Cdp) =>
  cdp.nilai<string[]>(`[...document.querySelectorAll("p.text-danger, [id$='-galat']")].map((p) => p.innerText.trim()).filter(Boolean)`);

async function tangkap(cdp: Cdp, nama: string) {
  const tinggi = await cdp.nilai<number>("document.documentElement.scrollHeight");
  const shot = await cdp.kirim<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 1280, height: Math.min(tinggi, 5000), scale: 1 },
  });
  writeFileSync(path.join(OUT, `alur-${nama}.png`), Buffer.from(shot.data, "base64"));
}

// ── Langkah-langkah form Buat Transaksi ──────────────────────────────────────

const SEL_SIMPAN = "button[type=submit][value=simpan]";
const SEL_SIMPAN_CETAK = "button[type=submit][value=cetak]";

async function pilihPelanggan(cdp: Cdp, peran: "pengirim" | "penerima", nama: string) {
  await ketik(cdp, `input[aria-label="Cari ${peran}"]`, nama);
  const ada = await tunggu(cdp, `window.__cari('[aria-label="Hasil pencarian ${peran}"] [role=option]', ${JSON.stringify(nama)})`);
  if (!ada) throw new Error(`Pelanggan "${nama}" tidak muncul di hasil pencarian ${peran}.`);
  await klik(cdp, `[aria-label="Hasil pencarian ${peran}"] [role=option]`, nama);
}

async function pilihItem(cdp: Cdp, baris: number, teksOpsi: string) {
  await klik(cdp, "button[role=combobox]", undefined, baris);
  await tunggu(cdp, `window.__cari('[role=option]', ${JSON.stringify(teksOpsi)})`);
  await klik(cdp, "[role=option]", teksOpsi);
}

async function totalBiaya(cdp: Cdp): Promise<number> {
  const t = await cdp.nilai<string>(`(() => {
    const dt = [...document.querySelectorAll("dt")].find((d) => d.innerText.trim() === "Total biaya");
    return dt?.nextElementSibling?.innerText ?? "";
  })()`);
  return Number(t.replace(/\D/g, ""));
}

/** Isi form lengkap: 1 baris barang satuan kg. Mengembalikan total biaya. */
async function isiForm(
  cdp: Cdp,
  o: { pengirim: string; penerima: string; item: string; berat: string; lunas: boolean; alasan?: string },
): Promise<number> {
  await pilihPelanggan(cdp, "pengirim", o.pengirim);
  await pilihPelanggan(cdp, "penerima", o.penerima);
  await pilihItem(cdp, 0, o.item);
  await ketik(cdp, "input[id$='-berat']", o.berat);
  const total = await totalBiaya(cdp);
  if (o.lunas) await ketik(cdp, "#bayar_awal", String(total));
  else {
    await ketik(cdp, "#bayar_awal", "");
    if (o.alasan) await ketik(cdp, "#alasan_belum_bayar", o.alasan);
  }
  return total;
}

const urlSekarang = (cdp: Cdp) => cdp.nilai<string>("location.pathname + location.search");
const RE_RESI = /\/transaksi\/(NX-\d{8}-\d{4})/;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const admin = await sesiDemo(AKUN_DEMO.admin_loket);
  const pemilik = await sesiDemo(AKUN_DEMO.pemilik);

  // Data demo yang dibutuhkan: dua pelanggan [Demo] aktif & satu jenis barang kg aktif.
  const { data: pel } = await admin.supabase.from("data_pelanggan").select("id_pelanggan, nama").like("nama", "[Demo]%").eq("is_active", true).order("nama").limit(2);
  const { data: itemKg } = await admin.supabase
    .from("data_item")
    .select("id_item, nama_item, tarif_per_satuan")
    .eq("satuan", "kg")
    .eq("is_active", true)
    .like("nama_item", "[Demo]%")
    .limit(1)
    .maybeSingle();
  if (!pel || pel.length < 2 || !itemKg) throw new Error("Butuh 2 pelanggan [Demo] aktif dan 1 jenis barang [Demo] bersatuan kg (jalankan seed:demo).");
  const [P1, P2] = pel.map((p) => p.nama as string);
  const ITEM = itemKg.nama_item as string;
  // Berat unik per jalan agar tidak bentrok dengan transaksi uji sebelumnya hari ini.
  const dasar = (Date.now() % 900) + 100; // 100–999
  const beratA = `${dasar},125`;
  const beratB = `${dasar},375`;
  const beratC = `${dasar},625`;
  const beratD = `${dasar},875`;
  const beratE = `${dasar},250`;
  const dibuat: string[] = [];

  await denganPeramban(PORT, async (cdp) => {
    await cdp.kirim("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    // Dialog cetak tidak dapat dibuka di headless: ganti window.print dengan
    // penghitung (sessionStorage bertahan antar-navigasi di tab yang sama).
    await cdp.kirim("Page.addScriptToEvaluateOnNewDocument", {
      source: "window.print = () => sessionStorage.setItem('__cetak', String(Number(sessionStorage.getItem('__cetak') ?? 0) + 1));",
    });
    await pasangSesi(cdp, APP, admin.cookies);

    // ── B3: validasi per field (tanpa menulis) ────────────────────────────
    langkah("B3", "Field wajib kosong/tidak valid ditolak dengan pesan di field terkait");
    await buka(cdp, `${APP}/transaksi/baru`);
    await klik(cdp, SEL_SIMPAN);
    await tunggu(cdp, `document.body.innerText.includes("Periksa kembali isian")`);
    const galat = await pesanGalatField(cdp);
    periksa((await teksHalaman(cdp)).includes("Periksa kembali isian yang ditandai"), "pesan ringkas 'Periksa kembali isian yang ditandai.'");
    periksa(galat.length >= 3, `pesan per field muncul (${galat.length}): ${galat.slice(0, 4).join(" | ")}`);
    periksa((await cdp.nilai<number>(`document.querySelectorAll("[aria-invalid=true]").length`)) >= 2, "field bermasalah ditandai aria-invalid");

    await pilihPelanggan(cdp, "pengirim", P1);
    await pilihPelanggan(cdp, "penerima", P2);
    await pilihItem(cdp, 0, ITEM);
    for (const [berat, alasan] of [
      ["0", "berat 0"],
      ["-5", "berat negatif"],
      ["1,2345", "berat > 3 desimal"],
    ] as const) {
      await ketik(cdp, "input[id$='-berat']", berat);
      await klik(cdp, SEL_SIMPAN);
      await jeda(300);
      const g = await cdp.nilai<string>(`document.querySelector("[id$='-berat-galat']")?.innerText ?? ""`);
      periksa(g.length > 0, `${alasan} → pesan di field Berat: "${g}"`);
    }
    await ketik(cdp, "input[id$='-berat']", "10");
    const total = await totalBiaya(cdp);
    await ketik(cdp, "#bayar_awal", String(total + 1000));
    await klik(cdp, SEL_SIMPAN);
    await jeda(300);
    const gBayar = await cdp.nilai<string>(`document.querySelector("#bayar_awal-galat")?.innerText ?? ""`);
    periksa(/melebihi/.test(gBayar), `pembayaran melebihi total → pesan di field Pembayaran awal: "${gBayar}"`);
    periksa(RE_RESI.test(await urlSekarang(cdp)) === false, "tidak ada transaksi tersimpan (masih di Buat Transaksi)");
    await tangkap(cdp, "B3-validasi");

    // ── B2: transaksi lunas, lalu transaksi berikutnya tanpa memuat ulang ──
    langkah("B2", "Transaksi lengkap & lunas → resi terbentuk; total = Σ subtotal");
    await buka(cdp, `${APP}/transaksi/baru`);
    const totalA = await isiForm(cdp, { pengirim: P1, penerima: P2, item: ITEM, berat: beratA, lunas: true });
    await klik(cdp, SEL_SIMPAN);
    periksa(await tunggu(cdp, `/\\/transaksi\\/NX-/.test(location.pathname)`, 15000), "pindah ke detail resi");
    const resiA = (await urlSekarang(cdp)).match(RE_RESI)?.[1];
    periksa(!!resiA && /^NX-\d{8}-\d{4}$/.test(resiA), `format resi ${resiA}`);
    if (resiA) dibuat.push(resiA);
    await tunggu(cdp, `document.body.innerText.includes("Lunas")`);
    const detailA = await teksHalaman(cdp);
    periksa(detailA.includes("Lunas") && !detailA.includes("Belum Lunas"), "status bayar Lunas");
    periksa(detailA.replace(/\s/g, "").includes(`Rp${totalA.toLocaleString("id-ID")}`.replace(/\s/g, "")), `total biaya Rp${totalA.toLocaleString("id-ID")} tampil di detail`);

    langkah("B2b", "Kembali ke Buat Transaksi lewat menu (tanpa muat ulang) → form kosong & dapat dipakai lagi");
    await klik(cdp, "nav a", "Buat Transaksi");
    await tunggu(cdp, `location.pathname === "/transaksi/baru"`);
    await jeda(500);
    periksa((await cdp.nilai<number>(`[...document.querySelectorAll("button")].filter((b) => b.innerText.trim() === "Ganti").length`)) === 0, "pengirim & penerima kosong");
    periksa((await cdp.nilai<string>(`document.querySelector("#bayar_awal")?.value ?? "x"`)) === "", "pembayaran awal kosong");
    await klik(cdp, SEL_SIMPAN);
    periksa(await tunggu(cdp, `document.body.innerText.includes("Periksa kembali isian")`, 3000), "tombol Simpan merespons lagi (validasi muncul)");
    const totalB = await isiForm(cdp, { pengirim: P1, penerima: P2, item: ITEM, berat: beratB, lunas: true });
    await klik(cdp, SEL_SIMPAN);
    periksa(await tunggu(cdp, `/\\/transaksi\\/NX-/.test(location.pathname) && !location.pathname.endsWith(${JSON.stringify(resiA ?? "")})`, 15000), "transaksi kedua tersimpan");
    const resiB = (await urlSekarang(cdp)).match(RE_RESI)?.[1];
    if (resiB) dibuat.push(resiB);
    periksa(!!resiB && resiB !== resiA, `resi kedua berbeda: ${resiB} (total Rp${totalB.toLocaleString("id-ID")})`);

    langkah("B2c", "Tombol Back browser ke Buat Transaksi → form kosong & dapat dipakai lagi");
    await cdp.nilai("history.back()");
    await tunggu(cdp, `location.pathname === "/transaksi/baru"`);
    await jeda(600);
    periksa((await cdp.nilai<number>(`[...document.querySelectorAll("button")].filter((b) => b.innerText.trim() === "Ganti").length`)) === 0, "form kosong setelah Back");
    await klik(cdp, SEL_SIMPAN);
    periksa(await tunggu(cdp, `document.body.innerText.includes("Periksa kembali isian")`, 3000), "tombol Simpan merespons setelah Back");

    // ── B4: peringatan duplikasi ───────────────────────────────────────────
    langkah("B4", "Data sama persis dengan transaksi hari ini → dialog duplikasi");
    await buka(cdp, `${APP}/transaksi/baru`);
    await isiForm(cdp, { pengirim: P1, penerima: P2, item: ITEM, berat: beratB, lunas: true });
    await klik(cdp, SEL_SIMPAN);
    periksa(await tunggu(cdp, `document.body.innerText.includes("Kemungkinan transaksi ganda")`, 10000), "dialog 'Kemungkinan transaksi ganda' muncul");
    periksa(!!resiB && (await teksHalaman(cdp)).includes(resiB), `resi mirip ${resiB} ditampilkan`);
    await klik(cdp, "button", "Periksa lagi");
    await jeda(500);
    periksa((await urlSekarang(cdp)) === "/transaksi/baru", "'Periksa lagi' tidak menyimpan; isian tetap ada");
    periksa((await cdp.nilai<number>(`[...document.querySelectorAll("button")].filter((b) => b.innerText.trim() === "Ganti").length`)) === 2, "isian pengirim & penerima tidak hilang");
    await klik(cdp, SEL_SIMPAN);
    await tunggu(cdp, `document.body.innerText.includes("Kemungkinan transaksi ganda")`, 10000);
    await klik(cdp, "button", "Bukan duplikat, tetap simpan");
    periksa(await tunggu(cdp, `/\\/transaksi\\/NX-/.test(location.pathname)`, 15000), "'tetap simpan' menyimpan transaksi");
    const resiDup = (await urlSekarang(cdp)).match(RE_RESI)?.[1];
    if (resiDup) dibuat.push(resiDup);

    // ── B5: klik ganda ─────────────────────────────────────────────────────
    langkah("B5", "Klik Simpan dua kali cepat → hanya satu transaksi");
    await buka(cdp, `${APP}/transaksi/baru`);
    await isiForm(cdp, { pengirim: P2, penerima: P1, item: ITEM, berat: beratC, lunas: true });
    await pasangPembantu(cdp);
    await cdp.nilai(`(() => { const b = window.__cari(${JSON.stringify(SEL_SIMPAN)}); b.click(); b.click(); b.click(); })()`);
    await tunggu(cdp, `/\\/transaksi\\/NX-/.test(location.pathname)`, 15000);
    const resiC = (await urlSekarang(cdp)).match(RE_RESI)?.[1];
    if (resiC) dibuat.push(resiC);
    await jeda(1500);
    const beratAngka = Number(beratC.replace(",", "."));
    const { count } = await admin.supabase
      .from("data_transaksi")
      .select("no_resi", { count: "exact", head: true })
      .eq("total_berat_kg", beratAngka)
      .gte("waktu_transaksi", new Date(Date.now() - 10 * 60_000).toISOString());
    periksa(count === 1, `transaksi tersimpan dengan berat ${beratC} kg: ${count} (harus 1)`);

    // ── B6: snapshot tarif ─────────────────────────────────────────────────
    langkah("B6", "Tarif master diubah → total resi lama tidak berubah");
    const tarifLama = Number(itemKg.tarif_per_satuan);
    const { error: eTarif } = await pemilik.supabase.from("data_item").update({ tarif_per_satuan: tarifLama + 1000 }).eq("id_item", itemKg.id_item);
    periksa(!eTarif, "Pemilik mengubah tarif (sementara)");
    try {
      await buka(cdp, `${APP}/transaksi/${resiA}`);
      const d = (await teksHalaman(cdp)).replace(/\s/g, "");
      periksa(d.includes(`Rp${totalA.toLocaleString("id-ID")}`), `resi lama ${resiA} tetap Rp${totalA.toLocaleString("id-ID")}`);
      await buka(cdp, `${APP}/transaksi/baru`);
      await pilihItem(cdp, 0, ITEM);
      await ketik(cdp, "input[id$='-berat']", "1");
      const baru = await totalBiaya(cdp);
      periksa(baru === tarifLama + 1000, `transaksi baru memakai tarif baru (1 kg = Rp${baru.toLocaleString("id-ID")})`);
    } finally {
      const { error } = await pemilik.supabase.from("data_item").update({ tarif_per_satuan: tarifLama }).eq("id_item", itemKg.id_item);
      periksa(!error, `tarif dikembalikan ke Rp${tarifLama.toLocaleString("id-ID")}`);
    }

    // ── B7: cetak resi ─────────────────────────────────────────────────────
    langkah("B7", "Cetak resi: Standar (A5), Thermal 80 mm, Thermal 58 mm");
    await cdp.kirim("Emulation.setEmulatedMedia", { media: "print" });
    for (const f of ["standar", "thermal80", "thermal58"]) {
      await buka(cdp, `${APP}/transaksi/${resiA}/cetak?format=${f}`);
      const t = await teksHalaman(cdp);
      const navTerlihat = await cdp.nilai<boolean>(`[...document.querySelectorAll("nav[aria-label='Menu utama'], .no-print")].some((el) => el.getBoundingClientRect().height > 0)`);
      periksa(t.includes(resiA ?? "") && /Total biaya/.test(t), `${f}: resi & total tampil`);
      periksa(!navTerlihat, `${f}: sidebar/banner tidak ikut tercetak`);
      await tangkap(cdp, `B7-${f}`);
    }
    await cdp.kirim("Emulation.setEmulatedMedia", { media: "" });

    langkah("B7a", "Tombol 'Simpan & Cetak Resi' → tersimpan, halaman cetak, dialog cetak terbuka sekali");
    await buka(cdp, `${APP}/transaksi/baru`);
    await cdp.nilai("sessionStorage.removeItem('__cetak')");
    await isiForm(cdp, { pengirim: P2, penerima: P1, item: ITEM, berat: beratE, lunas: true });
    await klik(cdp, SEL_SIMPAN_CETAK);
    periksa(await tunggu(cdp, `location.pathname.startsWith("/transaksi/NX-") && location.pathname.endsWith("/cetak")`, 15000), "pindah ke halaman cetak resi");
    const resiE = (await urlSekarang(cdp)).match(RE_RESI)?.[1];
    if (resiE) dibuat.push(resiE);
    periksa(await tunggu(cdp, `sessionStorage.getItem("__cetak") === "1"`, 5000), "dialog cetak browser dibuka otomatis");
    await jeda(1500);
    periksa((await cdp.nilai<string>(`sessionStorage.getItem("__cetak")`)) === "1", "dialog cetak dibuka tepat sekali");
    periksa(!(await urlSekarang(cdp)).includes("otomatis"), "?otomatis dihapus dari URL (muat ulang tidak mencetak lagi)");
    periksa((await teksHalaman(cdp)).includes(resiE ?? "—"), `resi ${resiE} tampil di halaman cetak`);

    // ── B8: pembatalan oleh Pemilik ────────────────────────────────────────
    langkah("B8", "Pemilik membatalkan transaksi tanpa pembayaran (wajib alasan)");
    await buka(cdp, `${APP}/transaksi/baru`);
    await isiForm(cdp, { pengirim: P2, penerima: P1, item: ITEM, berat: beratD, lunas: false, alasan: "[Demo] Uji otomatis B8" });
    await klik(cdp, SEL_SIMPAN);
    await tunggu(cdp, `/\\/transaksi\\/NX-/.test(location.pathname)`, 15000);
    const resiD = (await urlSekarang(cdp)).match(RE_RESI)?.[1];
    if (resiD) dibuat.push(resiD);
    periksa((await teksHalaman(cdp)).includes("Uji otomatis B8"), "alasan belum bayar tampil di detail");
    periksa(!(await teksHalaman(cdp)).includes("Batalkan Transaksi"), "Admin Loket tidak melihat tombol Batalkan Transaksi");

    await pasangSesi(cdp, APP, pemilik.cookies);
    await buka(cdp, `${APP}/transaksi/${resiA}`);
    periksa(!(await teksHalaman(cdp)).includes("Batalkan Transaksi"), `transaksi berpembayaran ${resiA}: tombol Batalkan tidak ada`);
    await buka(cdp, `${APP}/transaksi/${resiD}`);
    await klik(cdp, "button", "Batalkan Transaksi");
    await tunggu(cdp, `document.querySelector("[role=dialog] textarea[name=alasan]")`);
    await klik(cdp, "[role=dialog] button[type=submit]");
    await jeda(400);
    const gAlasan = await cdp.nilai<string>(`document.querySelector("#alasan-galat")?.innerText ?? ""`);
    periksa(gAlasan.length > 0, `tanpa alasan ditolak: "${gAlasan}"`);
    await ketik(cdp, "[role=dialog] textarea[name=alasan]", "[Demo] Uji otomatis B8");
    await klik(cdp, "[role=dialog] button[type=submit]");
    periksa(await tunggu(cdp, `document.body.innerText.includes("Dibatalkan")`, 10000), "status Dibatalkan beserta alasan");
    await tangkap(cdp, "B8-dibatalkan");

    // ── B1: pelanggan & normalisasi telepon ────────────────────────────────
    langkah("B1", "Pelanggan baru: telepon +62 dinormalisasi ke 08…; nomor sama ditolak");
    await pasangSesi(cdp, APP, admin.cookies);
    const ekor = String(Date.now()).slice(-7);
    const namaUji = `[Demo] Uji Otomatis B1 ${ekor}`;
    await buka(cdp, `${APP}/pelanggan`);
    await klik(cdp, "button", "Tambah Pelanggan");
    await tunggu(cdp, `document.querySelector("[role=dialog] input[name=nama]")`);
    await ketik(cdp, "[role=dialog] input[name=nama]", namaUji);
    await ketik(cdp, "[role=dialog] input[name=telepon]", `+62 812-${ekor.slice(0, 3)}-${ekor.slice(3)}9`);
    await klik(cdp, "[role=dialog] button[type=submit]");
    await tunggu(cdp, `!document.querySelector("[role=dialog]")`, 10000);
    const { data: pb } = await admin.supabase.from("data_pelanggan").select("id_pelanggan, telepon").eq("nama", namaUji).maybeSingle();
    periksa(pb?.telepon === `0812${ekor}9`, `telepon tersimpan ${pb?.telepon} (harus 0812${ekor}9)`);
    await klik(cdp, "button", "Tambah Pelanggan");
    await tunggu(cdp, `document.querySelector("[role=dialog] input[name=nama]")`);
    await ketik(cdp, "[role=dialog] input[name=nama]", `${namaUji} kedua`);
    await ketik(cdp, "[role=dialog] input[name=telepon]", `0812${ekor}9`);
    await klik(cdp, "[role=dialog] button[type=submit]");
    await jeda(1500);
    const tDup = await cdp.nilai<string>(`document.querySelector("[role=dialog]")?.innerText ?? ""`);
    periksa(/terdaftar|sudah/i.test(tDup), "nomor yang sama ditolak dengan pesan 'sudah terdaftar'");
    if (pb) await admin.supabase.from("data_pelanggan").update({ is_active: false }).eq("id_pelanggan", pb.id_pelanggan);
  });

  await admin.supabase.auth.signOut({ scope: "local" });
  await pemilik.supabase.auth.signOut({ scope: "local" });

  const gagal = hasil.filter((h) => !h.ok);
  console.log(`\n${hasil.length - gagal.length}/${hasil.length} langkah lulus. Resi uji: ${dibuat.join(", ") || "-"}. Tangkapan layar: ${OUT}${path.sep}alur-*.png`);
  for (const g of gagal) console.log(`✗ ${g.kode} ${g.nama}\n  - ${g.catatan.join("\n  - ")}`);
  process.exitCode = gagal.length ? 1 : 0;
}

main().catch((e) => {
  console.error("\n" + (e instanceof Error ? e.message : String(e)));
  process.exitCode = 1;
});
