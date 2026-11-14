/**
 * Validasi frontend/server action Fase 2. Aturan harus sejalan dengan
 * constraint database (tests/db/fase2.test.ts menguji sisi database).
 */
import { describe, expect, it } from "vitest";
import { ARMADA_DEMO, ITEM_DEMO, PELANGGAN_DEMO, PENANDA_DEMO } from "../../../scripts/data-demo";
import { ringkasPerubahan } from "./audit";
import { formatRupiah } from "./format";
import {
  skemaArmada,
  skemaAturPassword,
  skemaItem,
  skemaPelanggan,
  skemaPengaturan,
  skemaPenggunaBaru,
  skemaStatusArmada,
  skemaKendala,
  skemaManifes,
  skemaOverrideBelumLunas,
  skemaPengambilan,
  skemaPindahResi,
} from "./skema";

const galat = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

describe("pelanggan", () => {
  it("menormalkan nama dan telepon", () => {
    expect(skemaPelanggan.parse({ nama: "  Budi   Santoso ", telepon: "+62 812-3456-7890" })).toEqual({
      nama: "Budi Santoso",
      telepon: "081234567890",
    });
  });

  it("nama kosong dan telepon tidak valid ditolak dengan pesan jelas", () => {
    const r = skemaPelanggan.safeParse({ nama: "   ", telepon: "0812" });
    expect(galat(r)).toEqual({
      nama: "Nama pelanggan wajib diisi.",
      telepon: "Nomor telepon harus 10–13 digit angka, contoh: 081234567890.",
    });
    expect(galat(skemaPelanggan.safeParse({ nama: "A", telepon: "08123456789012" })).telepon).toBeDefined();
  });
});

describe("jenis barang & tarif", () => {
  it("tarif bilangan bulat Rupiah; pemisah ribuan diabaikan", () => {
    expect(skemaItem.parse({ nama_item: "Sembako", satuan: "kg", tarif_per_satuan: "15.000" }).tarif_per_satuan).toBe(15000);
  });

  it("tarif 0, negatif, atau desimal ditolak; satuan wajib dari daftar", () => {
    for (const t of ["0", "-5", "1500,5", ""]) {
      expect(skemaItem.safeParse({ nama_item: "X", satuan: "kg", tarif_per_satuan: t }).success, t).toBe(false);
    }
    expect(galat(skemaItem.safeParse({ nama_item: "X", satuan: "liter", tarif_per_satuan: "1" })).satuan).toBe("Pilih satuan tarif.");
  });
});

describe("armada", () => {
  const dasar = { plat_nomor: " bb  1234 ab", jenis_unit: "besar", kapasitas_ton: "7,5", id_supir: "tanpa", catatan: "" };

  it("plat dinormalisasi, koma desimal diterima, supir opsional", () => {
    expect(skemaArmada.parse(dasar)).toEqual({ plat_nomor: "BB 1234 AB", jenis_unit: "besar", kapasitas_ton: 7.5, id_supir: null, catatan: null });
  });

  it("kapasitas wajib positif, maksimal 3 desimal, tanpa nilai bawaan", () => {
    for (const k of ["", "0", "-1", "1.2345", "abc"]) {
      expect(skemaArmada.safeParse({ ...dasar, kapasitas_ton: k }).success, k).toBe(false);
    }
  });

  it("format plat salah ditolak", () => {
    expect(galat(skemaArmada.safeParse({ ...dasar, plat_nomor: "1234" })).plat_nomor).toMatch(/Format plat/);
  });

  it("status perbaikan/rusak wajib catatan; Perjalanan tidak dapat dipilih manual", () => {
    const id = "30000000-0000-4000-8000-000000000001";
    expect(skemaStatusArmada.safeParse({ id_armada: id, status: "rusak", catatan: " " }).success).toBe(false);
    expect(skemaStatusArmada.safeParse({ id_armada: id, status: "siaga" }).success).toBe(true);
    expect(skemaStatusArmada.safeParse({ id_armada: id, status: "perjalanan" }).success).toBe(false);
  });
});

describe("pengguna", () => {
  it("akun baru: email dinormalkan, password minimal 8 karakter, peran dari daftar", () => {
    const r = skemaPenggunaBaru.parse({
      nama_lengkap: "Staf Baru",
      nomor_telepon: "0811-2222-3333",
      peran: "staf_gudang",
      email: " Staf@Contoh.COM ",
      password: "rahasia123",
    });
    expect(r).toMatchObject({ email: "staf@contoh.com", nomor_telepon: "081122223333" });
    const salah = galat(skemaPenggunaBaru.safeParse({ nama_lengkap: "A", nomor_telepon: "0811", peran: "direktur", email: "x", password: "123" }));
    expect(Object.keys(salah).sort()).toEqual(["email", "nomor_telepon", "password", "peran"]);
  });

  it("konfirmasi password harus sama", () => {
    expect(galat(skemaAturPassword.safeParse({ password: "rahasia123", konfirmasi: "rahasia124" })).konfirmasi).toBe(
      "Konfirmasi password tidak sama.",
    );
  });
});

describe("pengaturan", () => {
  const dasar = { nama_perusahaan: "PT. Contoh", prefiks_resi: " nx ", ambang_peringatan_kapasitas_persen: "" };

  it("ambang kosong = belum diatur (NULL), checkbox tidak dicentang = false", () => {
    expect(skemaPengaturan.parse(dasar)).toEqual({
      nama_perusahaan: "PT. Contoh",
      alamat: null,
      telepon: null,
      prefiks_resi: "NX",
      ambang_peringatan_kapasitas_persen: null,
      izinkan_override_kapasitas: false,
      izinkan_override_belum_lunas: false,
      mode_demo: false,
      pelacakan_publik_aktif: false,
    });
    expect(skemaPengaturan.parse({ ...dasar, ambang_peringatan_kapasitas_persen: "92,5", mode_demo: "on" })).toMatchObject({
      ambang_peringatan_kapasitas_persen: 92.5,
      mode_demo: true,
    });
  });

  it("ambang di luar 0–100 dan prefiks tidak valid ditolak", () => {
    for (const a of ["0", "101", "abc"]) {
      expect(skemaPengaturan.safeParse({ ...dasar, ambang_peringatan_kapasitas_persen: a }).success, a).toBe(false);
    }
    expect(skemaPengaturan.safeParse({ ...dasar, prefiks_resi: "NX-1" }).success).toBe(false);
  });
});

describe("Data Demo", () => {
  it("seluruh data demo berlabel [Demo]/fiktif dan lolos validasi", () => {
    for (const p of PELANGGAN_DEMO) {
      expect(p.nama.startsWith(PENANDA_DEMO)).toBe(true);
      expect(skemaPelanggan.parse(p)).toEqual(p);
    }
    for (const i of ITEM_DEMO) {
      expect(i.nama_item).toMatch(/^\[Demo\] .*\(tarif contoh\)$/);
      expect(skemaItem.safeParse({ ...i, tarif_per_satuan: String(i.tarif_per_satuan) }).success).toBe(true);
    }
    for (const a of ARMADA_DEMO) {
      expect(a.plat_nomor.startsWith("XX ")).toBe(true); // kode wilayah fiktif
      expect(skemaArmada.safeParse({ ...a, kapasitas_ton: String(a.kapasitas_ton) }).success).toBe(true);
    }
  });
});

describe("ringkasan audit", () => {
  it("menampilkan nilai lama → baru dengan format Rupiah", () => {
    expect(ringkasPerubahan("data_item", "ubah", { tarif_per_satuan: { lama: 1000, baru: 1500 } })).toEqual([
      { label: "Tarif", lama: formatRupiah(1000), baru: formatRupiah(1500) },
    ]);
  });
});

describe("manifes & pengambilan (Fase 5)", () => {
  it("pengambilan tanpa centang verifikasi identitas ditolak (PRD §15 Pengiriman 3)", () => {
    const r = skemaPengambilan.safeParse({ no_resi: "nx-20261114-0001" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["identitas_terverifikasi"]);
    expect(skemaPengambilan.parse({ no_resi: " nx-20261114-0001 ", identitas_terverifikasi: "on", catatan: "" })).toEqual({
      no_resi: "NX-20261114-0001",
      identitas_terverifikasi: true,
      catatan: null,
    });
  });

  it("rute wajib; override muat & pemindahan wajib alasan", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(skemaManifes.safeParse({ id_armada: id, id_supir: id, rute: "   " }).success).toBe(false);
    expect(skemaManifes.parse({ id_armada: id, id_supir: id, rute: " Gunungsitoli  →  Teluk Dalam " }).rute).toBe("Gunungsitoli → Teluk Dalam");
    expect(skemaPindahResi.safeParse({ no_resi: "NX-1", id_manifes_tujuan: id, alasan: "" }).success).toBe(false);
    expect(skemaOverrideBelumLunas.safeParse({ no_resi: "NX-1", alasan: " " }).success).toBe(false);
    expect(skemaKendala.safeParse({ id_manifes: id, jenis: "banjir", deskripsi: "x" }).success).toBe(false);
  });
});
