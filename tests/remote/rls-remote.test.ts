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

  it("Supir & Admin tidak dapat membuat manifes; Gudang tidak dapat menulis manifes langsung (Fase 5)", async () => {
    for (const peran of ["supir", "admin_loket"] as Peran[]) {
      const { error } = await klien[peran].rpc("buat_manifes", {
        p_id_armada: "00000000-0000-0000-0000-000000000000",
        p_id_supir: "00000000-0000-0000-0000-000000000000",
        p_rute: "UJI DITOLAK",
      });
      expect(error?.code, peran).toBe("42501");
    }
    const { error } = await klien.staf_gudang
      .from("manifes")
      .update({ status_manifes: "berangkat" })
      .eq("id_manifes", "00000000-0000-0000-0000-000000000000");
    expect(error?.code).toBe("42501");
  });

  it("Supir tidak dapat membaca transaksi; data perjalanan hanya lewat RPC tanpa kolom finansial", async () => {
    const t = await klien.supir.from("data_transaksi").select("no_resi").limit(1);
    expect(t.data).toEqual([]);
    const { data, error } = await klien.supir.rpc("perjalanan_saya");
    expect(error).toBeNull();
    for (const baris of (data ?? []) as Record<string, unknown>[]) {
      expect(Object.keys(baris).some((k) => /biaya|bayar|telepon|pengirim|penerima/.test(k))).toBe(false);
    }
  });

  it("anon: lacak_resi hanya mengembalikan resi, status, waktu", async () => {
    const { url, publishableKey } = envPublik(process.env);
    const anon = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: resi } = await klien.admin_loket.from("data_transaksi").select("no_resi").limit(1).maybeSingle();
    const { data, error } = await anon.rpc("lacak_resi", { p_no_resi: resi?.no_resi ?? "NX-19000101-0001" });
    expect(error).toBeNull();
    for (const baris of (data ?? []) as Record<string, unknown>[]) expect(Object.keys(baris).sort()).toEqual(["no_resi", "status", "waktu"]);
    const ditolak = await anon.rpc("perjalanan_saya");
    expect(ditolak.error).not.toBeNull();
  });

  it("agregat laporan hanya untuk Pemilik; peringatan data untuk Pemilik & Admin (Fase 6)", async () => {
    const hari = new Date().toISOString().slice(0, 10);
    const pemilik = await klien.pemilik.rpc("ringkasan_operasional", { p_dari: hari, p_sampai: hari });
    expect(pemilik.error).toBeNull();
    for (const peran of ["admin_loket", "staf_gudang", "supir"] as const) {
      const r = await klien[peran].rpc("ringkasan_operasional", { p_dari: hari, p_sampai: hari });
      expect(r.error?.code, peran).toBe("42501");
      const a = await klien[peran].rpc("laporan_armada", { p_dari: hari, p_sampai: hari });
      expect(a.error?.code, peran).toBe("42501");
    }
    expect((await klien.admin_loket.rpc("peringatan_data")).error).toBeNull();
    expect((await klien.staf_gudang.rpc("peringatan_data")).error?.code).toBe("42501");
  });

  it("Admin tidak dapat mengubah pengaturan", async () => {
    const { data } = await klien.admin_loket.from("pengaturan").update({ mode_demo: false }).eq("id", 1).select();
    expect(data).toEqual([]);
  });
});
