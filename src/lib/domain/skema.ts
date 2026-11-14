/**
 * Skema validasi Zod untuk data inti (Fase 2). Dipakai bersama oleh form
 * klien (umpan balik cepat) dan server action (validasi sebelum ke
 * database). Database tetap sumber kebenaran: constraint & trigger di
 * Postgres menegakkan aturan yang sama.
 *
 * Input berasal dari FormData sehingga semua field diterima sebagai string.
 */
import { z } from "zod";
import { normalisasiTelepon, POLA_TELEPON } from "./format";

const teks = (label: string, maks: number) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, { error: `${label} wajib diisi.` })
        .max(maks, { error: `${label} maksimal ${maks} karakter.` }),
    );

const teksOpsional = (label: string, maks: number) =>
  z
    .string()
    .optional()
    .transform((s) => {
      const t = (s ?? "").trim();
      return t === "" ? null : t;
    })
    .pipe(z.string().max(maks, { error: `${label} maksimal ${maks} karakter.` }).nullable());

export const telepon = z
  .string({ error: "Nomor telepon wajib diisi." })
  .transform((s) => normalisasiTelepon(s))
  .pipe(
    z
      .string()
      .min(1, { error: "Nomor telepon wajib diisi." })
      .regex(POLA_TELEPON, { error: "Nomor telepon harus 10–13 digit angka, contoh: 081234567890." }),
  );

/** Checkbox HTML: terkirim "on" bila dicentang, tidak terkirim bila tidak. */
const centang = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

/** Angka positif dengan maksimal 3 desimal; menerima koma desimal. */
const angkaDesimal = (label: string, maks: number) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .transform((s) => s.trim().replace(",", "."))
    .pipe(
      z
        .string()
        .min(1, { error: `${label} wajib diisi.` })
        .regex(/^\d+(\.\d{1,3})?$/, { error: `${label} harus angka positif dengan maksimal 3 angka desimal.` })
        .transform(Number)
        .pipe(
          z
            .number()
            .gt(0, { error: `${label} harus lebih dari 0.` })
            .lt(maks, { error: `${label} terlalu besar.` }),
        ),
    );

/** Rupiah bilangan bulat; titik/spasi pemisah ribuan diabaikan. */
const rupiahPositif = (label: string) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .transform((s) => s.trim().replace(/[.\s]/g, ""))
    .pipe(
      z
        .string()
        .min(1, { error: `${label} wajib diisi.` })
        .regex(/^\d+$/, { error: `${label} harus bilangan bulat Rupiah tanpa desimal.` })
        .transform(Number)
        .pipe(
          z
            .number()
            .int()
            .gt(0, { error: `${label} harus lebih dari Rp0.` })
            .max(1_000_000_000_000, { error: `${label} terlalu besar.` }),
        ),
    );

const uuid = z.uuid({ error: "Data tidak valid. Muat ulang halaman lalu coba lagi." });

// ---------------------------------------------------------------------
// Pelanggan (PRD §7.6)
// ---------------------------------------------------------------------
export const skemaPelanggan = z.object({
  nama: teks("Nama pelanggan", 120),
  telepon,
});
export type InputPelanggan = z.output<typeof skemaPelanggan>;

// ---------------------------------------------------------------------
// Master item & tarif (PRD §7.7)
// ---------------------------------------------------------------------
export const SATUAN = ["kg", "ton", "koli"] as const;
export const LABEL_SATUAN: Record<(typeof SATUAN)[number], string> = { kg: "Kilogram (kg)", ton: "Ton", koli: "Koli" };

export const skemaItem = z.object({
  nama_item: teks("Nama jenis barang", 100),
  satuan: z.enum(SATUAN, { error: "Pilih satuan tarif." }),
  tarif_per_satuan: rupiahPositif("Tarif per satuan"),
});

// ---------------------------------------------------------------------
// Armada (PRD §7.10)
// ---------------------------------------------------------------------
export const POLA_PLAT = /^[A-Z]{1,2} [0-9]{1,4}( [A-Z]{1,3})?$/;
export const JENIS_UNIT = ["kecil", "besar"] as const;
export const STATUS_ARMADA_MANUAL = ["siaga", "perbaikan", "rusak"] as const;

export function normalisasiPlat(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase();
}

export const skemaArmada = z.object({
  plat_nomor: z
    .string({ error: "Plat nomor wajib diisi." })
    .transform(normalisasiPlat)
    .pipe(
      z
        .string()
        .min(1, { error: "Plat nomor wajib diisi." })
        .regex(POLA_PLAT, { error: "Format plat nomor tidak valid. Contoh: BB 1234 AB." }),
    ),
  jenis_unit: z.enum(JENIS_UNIT, { error: "Pilih jenis unit." }),
  // numeric(8,3) → maksimal 99.999,999 ton.
  kapasitas_ton: angkaDesimal("Kapasitas", 100_000),
  id_supir: z
    .string()
    .optional()
    .transform((s) => (s && s !== "tanpa" ? s : null))
    .pipe(uuid.nullable()),
  catatan: teksOpsional("Catatan", 500),
});

export const skemaStatusArmada = z
  .object({
    id_armada: uuid,
    status: z.enum(STATUS_ARMADA_MANUAL, { error: "Pilih status armada." }),
    catatan: teksOpsional("Catatan", 500),
  })
  .refine((v) => v.status === "siaga" || v.catatan !== null, {
    error: "Catatan wajib diisi saat armada ditandai perbaikan atau rusak.",
    path: ["catatan"],
  });

// ---------------------------------------------------------------------
// Pengguna (PRD §7.1)
// ---------------------------------------------------------------------
export const PERAN = ["pemilik", "admin_loket", "staf_gudang", "supir"] as const;

const password = z
  .string({ error: "Password wajib diisi." })
  .min(8, { error: "Password minimal 8 karakter." })
  .max(72, { error: "Password maksimal 72 karakter." });

export const skemaUbahPengguna = z.object({
  nama_lengkap: teks("Nama lengkap", 120),
  nomor_telepon: telepon,
  peran: z.enum(PERAN, { error: "Pilih peran pengguna." }),
});

export const skemaPenggunaBaru = skemaUbahPengguna.extend({
  email: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.email({ error: "Masukkan alamat email yang valid, contoh: nama@perusahaan.com." })),
  password,
});

export const skemaAturPassword = z
  .object({ password, konfirmasi: z.string() })
  .refine((v) => v.password === v.konfirmasi, { error: "Konfirmasi password tidak sama.", path: ["konfirmasi"] });

// ---------------------------------------------------------------------
// Pengaturan perusahaan
// ---------------------------------------------------------------------
export const skemaPengaturan = z.object({
  nama_perusahaan: teks("Nama perusahaan", 150),
  alamat: teksOpsional("Alamat", 300),
  telepon: teksOpsional("Telepon perusahaan", 30).pipe(
    z
      .string()
      .regex(/^[0-9+()\-\s]{6,30}$/, { error: "Telepon perusahaan hanya boleh berisi angka, spasi, +, -, dan tanda kurung." })
      .nullable(),
  ),
  prefiks_resi: z
    .string()
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{1,6}$/, { error: "Prefiks resi 1–6 huruf kapital/angka, contoh: NX." })),
  ambang_peringatan_kapasitas_persen: z
    .string()
    .optional()
    .transform((s) => (s ?? "").trim().replace(",", "."))
    .pipe(
      z.union([
        z.literal("").transform(() => null),
        z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, { error: "Ambang harus angka dengan maksimal 2 desimal." })
          .transform(Number)
          .pipe(
            z
              .number()
              .gt(0, { error: "Ambang harus lebih dari 0%." })
              .max(100, { error: "Ambang maksimal 100%." }),
          ),
      ]),
    ),
  izinkan_override_kapasitas: centang,
  izinkan_override_belum_lunas: centang,
  mode_demo: centang,
  pelacakan_publik_aktif: centang,
});

// ---------------------------------------------------------------------
// Transaksi (PRD §7.8). Dikirim sebagai objek (bukan FormData) karena
// memuat banyak baris barang. Validasi per baris yang butuh satuan item
// (koli) dilakukan form & fungsi database.
// ---------------------------------------------------------------------
export const BATAS_BARIS_BARANG = 50;

const bayarAwal = z
  .string()
  .optional()
  .transform((s) => (s ?? "").trim().replace(/[.\s]/g, "") || "0")
  .pipe(
    z
      .string()
      .regex(/^\d+$/, { error: "Pembayaran awal harus bilangan bulat Rupiah minimal 0." })
      .transform(Number)
      .pipe(z.number().int().max(1_000_000_000_000, { error: "Pembayaran awal terlalu besar." })),
  );

export const skemaBarisBarang = z.object({
  id_item: z.uuid({ error: "Pilih jenis barang dari daftar." }),
  berat_kg: z
    .string({ error: "Berat wajib diisi." })
    .transform((s) => s.trim().replace(",", "."))
    .pipe(
      z
        .string()
        .min(1, { error: "Berat wajib diisi." })
        .regex(/^\d+(\.\d{1,3})?$/, { error: "Berat harus angka positif dengan maksimal 3 angka desimal." })
        .refine((v) => Number(v) > 0, { error: "Berat harus lebih dari 0 kg." }),
    ),
  koli: z
    .string()
    .optional()
    .transform((s) => {
      const t = (s ?? "").trim();
      return t === "" ? null : t;
    })
    .pipe(z.string().regex(/^[1-9]\d*$/, { error: "Jumlah koli harus bilangan bulat lebih dari 0." }).nullable()),
});

export const skemaTransaksi = z.object({
  id_pengirim: z.uuid({ error: "Pilih atau tambahkan pengirim." }),
  id_penerima: z.uuid({ error: "Pilih atau tambahkan penerima." }),
  detail: z
    .array(skemaBarisBarang)
    .min(1, { error: "Minimal satu baris barang wajib diisi." })
    .max(BATAS_BARIS_BARANG, { error: `Maksimal ${BATAS_BARIS_BARANG} baris barang per transaksi.` }),
  bayar_awal: bayarAwal,
  catatan: teksOpsional("Catatan", 500),
  konfirmasi_duplikat: z.boolean().optional().default(false),
});
export type InputTransaksi = z.input<typeof skemaTransaksi>;

export const skemaBatalTransaksi = z.object({
  no_resi: z.string().min(1, { error: "Nomor resi tidak valid." }).max(40),
  alasan: teks("Alasan pembatalan", 300),
});

// ---------------------------------------------------------------------
// Pembayaran (PRD §7.9)
// ---------------------------------------------------------------------
export const skemaCatatPembayaran = z.object({
  no_resi: z
    .string({ error: "Nomor resi wajib diisi." })
    .transform((s) => s.trim().toUpperCase())
    .pipe(z.string().min(1, { error: "Nomor resi wajib diisi." }).max(40, { error: "Nomor resi tidak valid." })),
  jumlah: rupiahPositif("Nominal pembayaran"),
  catatan: teksOpsional("Catatan", 300),
});

export const skemaBatalPembayaran = z.object({
  id_pembayaran: uuid,
  alasan: teks("Alasan pembatalan", 300),
});

// ---------------------------------------------------------------------
// Manifes, pengiriman & pengambilan (PRD §7.11–§7.13)
// ---------------------------------------------------------------------
const noResi = z
  .string({ error: "Nomor resi wajib diisi." })
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().min(1, { error: "Nomor resi wajib diisi." }).max(40, { error: "Nomor resi tidak valid." }));

export const skemaManifes = z.object({
  id_armada: z.uuid({ error: "Pilih armada." }),
  id_supir: z.uuid({ error: "Pilih supir." }),
  rute: teks("Rute", 200),
  catatan: teksOpsional("Catatan", 500),
});

export const skemaIdManifes = z.object({ id_manifes: uuid });

export const skemaKonfirmasiMuat = z.object({
  id_manifes: uuid,
  alasan_override: teksOpsional("Alasan override", 300),
});

export const skemaTiba = z.object({
  id_manifes: uuid,
  catatan: teksOpsional("Catatan", 300),
});

export const skemaBatalManifes = z.object({
  id_manifes: uuid,
  alasan: teks("Alasan pembatalan", 300),
});

export const skemaLepasResi = z.object({ id_manifes: uuid, no_resi: noResi });

export const skemaPindahResi = z.object({
  no_resi: noResi,
  id_manifes_tujuan: z.uuid({ error: "Pilih manifes tujuan." }),
  alasan: teks("Alasan pemindahan", 300),
});

export const skemaKendala = z.object({
  id_manifes: uuid,
  jenis: z.enum(["kerusakan", "keterlambatan", "lainnya"], { error: "Pilih jenis kendala." }),
  deskripsi: teks("Uraian kendala", 1000),
});

export const skemaSelesaikanKendala = z.object({
  id_kendala: uuid,
  catatan: teksOpsional("Catatan", 300),
});

export const skemaOverrideBelumLunas = z.object({
  no_resi: noResi,
  alasan: teks("Alasan override", 300),
});

export const skemaPengambilan = z.object({
  no_resi: noResi,
  // Checkbox wajib dicentang: memindai/mengetik resi saja tidak membuktikan identitas.
  identitas_terverifikasi: z
    .string()
    .optional()
    .refine((v) => v === "on", { error: "Centang konfirmasi bahwa identitas penerima sudah diperiksa." })
    .transform(() => true as const),
  catatan: teksOpsional("Catatan", 300),
});

/** Tanggal YYYY-MM-DD yang valid (untuk filter rentang). */
export function tanggalValid(s: string | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ---------------------------------------------------------------------
// Utilitas
// ---------------------------------------------------------------------
export type GalatField = Record<string, string>;

/** Pesan galat pertama per field (untuk ditampilkan di bawah input). */
export function galatPerField(error: z.ZodError): GalatField {
  const galat: GalatField = {};
  for (const isu of error.issues) {
    const kunci = String(isu.path[0] ?? "_");
    galat[kunci] ??= isu.message;
  }
  return galat;
}

/** Ambil field string dari FormData (field yang tidak ada → undefined). */
export function dataForm(formData: FormData): Record<string, string | undefined> {
  const hasil: Record<string, string | undefined> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") hasil[k] = v;
  return hasil;
}
