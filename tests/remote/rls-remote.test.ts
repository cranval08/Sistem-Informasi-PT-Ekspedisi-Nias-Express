/**
 * Uji asap RLS terhadap Supabase Cloud memakai akun demo dan publishable
 * key — persis seperti aplikasi. Hanya membaca, atau mencoba menulis yang
 * HARUS ditolak; tidak ada data yang berubah bila RLS benar.
 *
 *   npm run test:remote
 *
 * Dilewati otomatis bila tidak dijalankan lewat script di atas.
 */
import { existsSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { envPublik } from "@/lib/supabase/env";

const aktif = process.env.UJI_REMOTE === "1" && existsSync(".env.local");
if (aktif) process.loadEnvFile(".env.local");

const AKUN = {
  pemilik: "demo.pemilik@example.com",
  admin_loket: "demo.admin@example.com",
  staf_gudang: "demo.gudang@example.com",
  supir: "demo.supir@example.com",
} as const;
type Peran = keyof typeof AKUN;

const klien = {} as Record<Peran, SupabaseClient>;

describe.skipIf(!aktif)("RLS di Supabase Cloud (akun demo)", () => {
  beforeAll(async () => {
    const { url, publishableKey } = envPublik(process.env);
    for (const peran of Object.keys(AKUN) as Peran[]) {
      const c = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await c.auth.signInWithPassword({ email: AKUN[peran], password: process.env.DEMO_PASSWORD! });
      if (error) throw new Error(`Login ${peran} gagal: ${error.message}`);
      klien[peran] = c;
    }
  });

  afterAll(async () => {
    await Promise.all(Object.values(klien).map((c) => c.auth.signOut()));
  });

  it.each(Object.keys(AKUN) as Peran[])("login %s → peran_saya() sesuai", async (peran) => {
    const { data, error } = await klien[peran].rpc("peran_saya");
    expect(error).toBeNull();
    expect(data).toBe(peran);
  });

  it("Pemilik melihat semua pengguna; Supir hanya dirinya", async () => {
    const semua = await klien.pemilik.from("data_pengguna").select("email");
    expect(semua.data?.length).toBeGreaterThanOrEqual(4);
    const supir = await klien.supir.from("data_pengguna").select("email");
    expect(supir.data?.map((r) => r.email)).toEqual([AKUN.supir]);
  });

  it("Admin Loket tidak dapat menambah jenis barang/tarif", async () => {
    const { error } = await klien.admin_loket
      .from("data_item")
      .insert({ nama_item: "UJI DITOLAK", satuan: "kg", tarif_per_satuan: 1 });
    expect(error?.code).toBe("42501");
  });

  it("Staf Gudang tidak dapat menambah pelanggan", async () => {
    const { error } = await klien.staf_gudang.from("data_pelanggan").insert({ nama: "UJI DITOLAK", telepon: "081999999999" });
    expect(error?.code).toBe("42501");
  });

  it.each(["pemilik", "admin_loket"] as Peran[])("%s tidak dapat menulis langsung ke pembayaran", async (peran) => {
    const { error } = await klien[peran]
      .from("pembayaran")
      .insert({ no_resi: "UJI", jumlah_bayar: 1, id_pengguna_pencatat: "00000000-0000-0000-0000-000000000000" });
    expect(error?.code).toBe("42501");
  });

  it("Supir tidak dapat membaca audit log; Pemilik dapat (seed tercatat)", async () => {
    const supir = await klien.supir.from("audit_log").select("id").limit(1);
    expect(supir.data).toEqual([]);
    const pemilik = await klien.pemilik.from("audit_log").select("id").limit(1);
    expect(pemilik.error).toBeNull();
    expect(pemilik.data?.length).toBe(1);
  });

  it("Admin tidak dapat mengubah pengaturan", async () => {
    const { data } = await klien.admin_loket.from("pengaturan").update({ mode_demo: false }).eq("id", 1).select();
    expect(data).toEqual([]);
  });
});
