/**
 * Bentuk hasil server action dan penerjemahan galat database ke pesan
 * Bahasa Indonesia yang dapat ditindaklanjuti pengguna.
 */
import type { z } from "zod";
import { galatPerField, type GalatField } from "@/lib/domain/skema";

export type HasilAksi<D = undefined> = {
  ok?: boolean;
  /** Pesan umum (sukses atau galat) untuk ditampilkan di atas form / toast. */
  pesan?: string;
  galat?: GalatField;
  data?: D;
  /** Penanda unik setiap pengiriman agar klien dapat bereaksi sekali per hasil. */
  waktu?: number;
};

export function berhasil<D>(pesan: string, data?: D): HasilAksi<D> {
  return { ok: true, pesan, data, waktu: Date.now() };
}

export function gagal<D = undefined>(pesan: string, galat?: GalatField): HasilAksi<D> {
  return { ok: false, pesan, galat, waktu: Date.now() };
}

export function gagalValidasi<D = undefined>(error: z.ZodError): HasilAksi<D> {
  return gagal("Periksa kembali isian yang ditandai.", galatPerField(error));
}

/** Pesan untuk pelanggaran unique constraint, per nama constraint. */
const PESAN_UNIK: Record<string, { field?: string; pesan: string }> = {
  data_pelanggan_telepon_key: { field: "telepon", pesan: "Nomor telepon sudah terdaftar untuk pelanggan lain." },
  data_item_nama_unik: { field: "nama_item", pesan: "Jenis barang dengan nama ini sudah ada." },
  data_armada_plat_unik: { field: "plat_nomor", pesan: "Plat nomor ini sudah terdaftar." },
  data_pengguna_nomor_telepon_key: { field: "nomor_telepon", pesan: "Nomor telepon sudah dipakai pengguna lain." },
  data_pengguna_email_key: { field: "email", pesan: "Email sudah dipakai pengguna lain." },
};

type GalatDb = { code?: string; message?: string } | null | undefined;

/**
 * Terjemahkan galat Postgres/PostgREST. Pesan dari `raise exception` di
 * fungsi & trigger kita sudah berbahasa Indonesia dan diteruskan apa
 * adanya; pesan teknis bawaan Postgres diganti pesan umum.
 */
export function gagalDb<D = undefined>(e: GalatDb): HasilAksi<D> {
  const pesan = e?.message ?? "";
  if (e?.code === "23505") {
    const kunci = Object.keys(PESAN_UNIK).find((k) => pesan.includes(k));
    if (kunci) {
      const { field, pesan: p } = PESAN_UNIK[kunci];
      return gagal(p, field ? { [field]: p } : undefined);
    }
    return gagal("Data yang sama sudah ada.");
  }
  if (/permission denied|row-level security/i.test(pesan)) {
    return gagal("Anda tidak memiliki hak akses untuk aksi ini.");
  }
  if (/violates|invalid input|null value/i.test(pesan)) {
    return gagal("Data tidak memenuhi aturan validasi. Periksa kembali isian Anda.");
  }
  if ((e?.code === "23514" || e?.code === "42501" || e?.code === "P0001" || e?.code === "22023") && pesan) {
    return gagal(pesan);
  }
  return gagal("Terjadi kesalahan saat menyimpan data. Periksa koneksi lalu coba lagi.");
}

export const PESAN_TANPA_AKSES = "Sesi Anda berakhir atau Anda tidak memiliki hak akses untuk aksi ini. Muat ulang halaman lalu coba lagi.";

export function gagalAkses<D = undefined>(): HasilAksi<D> {
  return gagal(PESAN_TANPA_AKSES);
}

/** Validasi UUID dari FormData (id baris yang diubah). */
export function idValid(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}
