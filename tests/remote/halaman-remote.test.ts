/**
 * Uji asap halaman: login sebagai tiap akun demo (Supabase Cloud), lalu
 * buka SETIAP rute internal pada server Next.js yang sedang berjalan.
 *  - rute yang diizinkan  → 200 (bukan 500: menangkap galat render server)
 *  - rute yang tidak      → 307 ke /akses-ditolak
 * Hanya membaca; tidak mengubah data.
 *
 *   npm run dev            (terminal lain)
 *   npm run test:halaman   (UJI_APP_URL untuk port lain)
 */
import { existsSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { beforeAll, describe, expect, it } from "vitest";
import { envPublik } from "@/lib/supabase/env";
import { bolehAkses, RUTE, type KunciRute, type Peran } from "@/lib/domain/peran";

const APP = process.env.UJI_APP_URL ?? "http://localhost:3000";
const aktif = process.env.UJI_REMOTE === "1" && !!APP && existsSync(".env.local");
if (aktif) process.loadEnvFile(".env.local");

const AKUN: Record<Peran, string> = {
  pemilik: "demo.pemilik@example.com",
  admin_loket: "demo.admin@example.com",
  staf_gudang: "demo.gudang@example.com",
  supir: "demo.supir@example.com",
};

/** Login lewat @supabase/ssr agar format cookie sama persis dengan aplikasi. */
async function cookieSesi(email: string): Promise<string> {
  const { url, publishableKey } = envPublik(process.env);
  const jar = new Map<string, string>();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (daftar) => {
        for (const { name, value } of daftar) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD! });
  if (error) throw new Error(`Login ${email} gagal: ${error.message}`);
  return [...jar].map(([n, v]) => `${n}=${v}`).join("; ");
}

const cookie = {} as Record<Peran, string>;
const SEMUA_RUTE = Object.keys(RUTE) as KunciRute[];

describe.skipIf(!aktif)("halaman per peran (server berjalan + Supabase Cloud)", () => {
  beforeAll(async () => {
    for (const p of Object.keys(AKUN) as Peran[]) cookie[p] = await cookieSesi(AKUN[p]);
  });

  for (const peran of Object.keys(AKUN) as Peran[]) {
    it.each(SEMUA_RUTE)(`${peran}: %s`, async (rute) => {
      const res = await fetch(APP + RUTE[rute].href, { headers: { cookie: cookie[peran] }, redirect: "manual" });
      if (bolehAkses(peran, rute)) {
        expect(res.status, `${RUTE[rute].href} harus 200`).toBe(200);
        const html = await res.text();
        expect(html).not.toContain("Application error");
        // Galat kueri ditampilkan sebagai EmptyState "… gagal dimuat" dengan status 200 — tangkap juga.
        // (/sistem-desain sengaja memperagakan state galat.)
        if (rute !== "sistemDesain") expect(html, `${RUTE[rute].href} menampilkan galat muat data`).not.toMatch(/gagal dimuat/);
        // Nilai tampilan rusak (format angka/tanggal) di teks halaman, di luar <script>.
        const teks = html.replace(/<script[\s\S]*?<\/script>/g, "");
        expect(teks, `${RUTE[rute].href} menampilkan nilai rusak`).not.toMatch(/>[^<]*(\bNaN\b|Invalid Date|\bundefined\b|\[object Object\])[^<]*</);
      } else {
        expect(res.status).toBe(307);
        expect(res.headers.get("location")).toMatch(/\/akses-ditolak$/);
      }
    });
  }

  // Rute dinamis: id tidak ada → 404 (bukan 500); peran tanpa akses → /akses-ditolak.
  const DINAMIS: [string, KunciRute][] = [
    ["/armada/00000000-0000-4000-8000-000000000000", "armada"],
    ["/transaksi/NX-19000101-0001", "transaksi"],
    ["/transaksi/NX-19000101-0001/cetak", "transaksi"],
    ["/transaksi/bukan-resi", "transaksi"],
    ["/manifes/00000000-0000-4000-8000-000000000000", "manifes"],
    ["/manifes/bukan-uuid", "manifes"],
  ];
  for (const peran of Object.keys(AKUN) as Peran[]) {
    it.each(DINAMIS)(`${peran}: %s tidak dikenal`, async (path, rute) => {
      const res = await fetch(APP + path, { headers: { cookie: cookie[peran] }, redirect: "manual" });
      if (bolehAkses(peran, rute)) expect(res.status).toBe(404);
      else expect(res.headers.get("location")).toMatch(/\/akses-ditolak$/);
    });
  }
  // Manifes sungguhan (bila ada di cloud): detail tampil untuk peran yang diizinkan.
  it("detail manifes yang ada tampil untuk peran yang diizinkan", async () => {
    const { url, publishableKey } = envPublik(process.env);
    const klien = createServerClient(url, publishableKey, { cookies: { getAll: () => [], setAll: () => {} } });
    await klien.auth.signInWithPassword({ email: AKUN.staf_gudang, password: process.env.DEMO_PASSWORD! });
    const { data, error } = await klien.from("manifes").select("id_manifes").limit(1).maybeSingle();
    expect(error).toBeNull();
    if (!data) return; // belum ada manifes di cloud
    for (const peran of Object.keys(AKUN) as Peran[]) {
      const res = await fetch(`${APP}/manifes/${data.id_manifes}`, { headers: { cookie: cookie[peran] }, redirect: "manual" });
      if (bolehAkses(peran, "manifes")) {
        expect(res.status, peran).toBe(200);
        expect(await res.text()).not.toMatch(/gagal dimuat/);
      } else {
        expect(res.headers.get("location"), peran).toMatch(/\/akses-ditolak$/);
      }
    }
  });

  // Pelacakan publik: dapat dibuka tanpa login dan tidak menampilkan data pribadi/finansial.
  it("/lacak tanpa login → 200, tanpa nama pelanggan maupun nominal", async () => {
    const { url, publishableKey } = envPublik(process.env);
    const klien = createServerClient(url, publishableKey, { cookies: { getAll: () => [], setAll: () => {} } });
    await klien.auth.signInWithPassword({ email: AKUN.admin_loket, password: process.env.DEMO_PASSWORD! });
    const { data } = await klien
      .from("data_transaksi")
      .select("no_resi, total_biaya, penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama, telepon)")
      .limit(1)
      .maybeSingle();
    for (const path of ["/lacak", `/lacak?resi=${data?.no_resi ?? "NX-19000101-0001"}`]) {
      const res = await fetch(APP + path, { redirect: "manual" });
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html).not.toContain("Application error");
      const p = data?.penerima as { nama?: string; telepon?: string } | { nama?: string; telepon?: string }[] | undefined;
      const pen = Array.isArray(p) ? p[0] : p;
      if (pen?.nama) expect(html).not.toContain(pen.nama);
      if (pen?.telepon) expect(html).not.toContain(pen.telepon);
      expect(html).not.toMatch(/Rp\s?\d/);
    }
  });

  // Fase 6: dashboard & laporan dengan filter, dan ekspor CSV hanya untuk Pemilik.
  const VARIAN: [string, KunciRute][] = [
    ["/dashboard?periode=bulan_ini&grafik=minggu", "dashboard"],
    ["/dashboard?dari=2026-01-01&sampai=2026-11-14", "dashboard"],
    ["/laporan/transaksi?periode=7_hari&bayar=belum_lunas&batal=ya", "laporanTransaksi"],
    ["/laporan/pembayaran?status=semua", "laporanBayar"],
    ["/laporan/pengiriman?status=tiba", "laporanKirim"],
    ["/audit-log?aksi=buat_transaksi&entitas=data_transaksi", "auditLog"],
  ];
  for (const peran of Object.keys(AKUN) as Peran[]) {
    it.each(VARIAN)(`${peran}: %s (dengan filter)`, async (path, rute) => {
      const res = await fetch(APP + path, { headers: { cookie: cookie[peran] }, redirect: "manual" });
      if (bolehAkses(peran, rute)) {
        expect(res.status, path).toBe(200);
        expect(await res.text()).not.toMatch(/gagal dimuat|Application error/);
      } else {
        expect(res.headers.get("location")).toMatch(/\/akses-ditolak$/);
      }
    });
  }

  const EKSPOR = ["transaksi", "pembayaran", "armada", "pengiriman", "audit"];
  for (const peran of Object.keys(AKUN) as Peran[]) {
    it.each(EKSPOR)(`${peran}: ekspor CSV %s`, async (jenis) => {
      const res = await fetch(`${APP}/laporan/ekspor/${jenis}?periode=bulan_ini`, { headers: { cookie: cookie[peran] }, redirect: "manual" });
      if (peran === "pemilik") {
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
        expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="laporan-/);
        // res.text() membuang BOM saat decoding — periksa bytenya langsung.
        const bytes = new Uint8Array(await res.arrayBuffer());
        expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        const isi = new TextDecoder().decode(bytes);
        expect(isi.split("\r\n")[0]).toContain(";");
      } else {
        expect(res.status).toBe(403);
      }
    });
  }
  it("ekspor tanpa login diarahkan ke /login; jenis tidak dikenal → 404", async () => {
    const anon = await fetch(`${APP}/laporan/ekspor/transaksi`, { redirect: "manual" });
    expect(anon.status).toBe(307);
    expect(anon.headers.get("location")).toMatch(/\/login/);
    const x = await fetch(`${APP}/laporan/ekspor/rahasia`, { headers: { cookie: cookie.pemilik }, redirect: "manual" });
    expect(x.status).toBe(404);
  });

  // Data sungguhan: rute detail harus merender data yang ada (bukan 404).
  it("detail & cetak resi yang ada tampil untuk peran yang diizinkan", async () => {
    const { url, publishableKey } = envPublik(process.env);
    const klien = createServerClient(url, publishableKey, { cookies: { getAll: () => [], setAll: () => {} } });
    await klien.auth.signInWithPassword({ email: AKUN.admin_loket, password: process.env.DEMO_PASSWORD! });
    const { data, error } = await klien.from("data_transaksi").select("no_resi").limit(1).maybeSingle();
    expect(error).toBeNull();
    if (!data) return; // belum ada transaksi di cloud
    for (const peran of Object.keys(AKUN) as Peran[]) {
      for (const path of [`/transaksi/${data.no_resi}`, `/transaksi/${data.no_resi}/cetak`, `/transaksi/${data.no_resi}/cetak?format=thermal58`]) {
        const res = await fetch(APP + path, { headers: { cookie: cookie[peran] }, redirect: "manual" });
        if (bolehAkses(peran, "transaksi")) {
          expect(res.status, `${peran} ${path}`).toBe(200);
          expect(await res.text()).toContain(data.no_resi);
        } else {
          expect(res.headers.get("location"), `${peran} ${path}`).toMatch(/\/akses-ditolak$/);
        }
      }
    }
  });
});
