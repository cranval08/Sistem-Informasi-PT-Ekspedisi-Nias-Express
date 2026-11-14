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
        expect(await res.text()).not.toContain("Application error");
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
  ];
  for (const peran of Object.keys(AKUN) as Peran[]) {
    it.each(DINAMIS)(`${peran}: %s tidak dikenal`, async (path, rute) => {
      const res = await fetch(APP + path, { headers: { cookie: cookie[peran] }, redirect: "manual" });
      if (bolehAkses(peran, rute)) expect(res.status).toBe(404);
      else expect(res.headers.get("location")).toMatch(/\/akses-ditolak$/);
    });
  }
});
