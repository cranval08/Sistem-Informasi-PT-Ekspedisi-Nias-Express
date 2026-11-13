/**
 * Ringkasan perubahan dari `audit_log.detail_perubahan` untuk ditampilkan
 * pada riwayat master data. Format detail dibuat trigger
 * `trg_audit_perubahan`: INSERT = baris baru; UPDATE = {kolom: {lama, baru}}.
 */
import { formatAngka, formatRupiah } from "./format";
import { definisiStatus, type JenisStatus } from "./status";

type Format = (v: unknown) => string;

const teks: Format = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
const rupiah: Format = (v) => formatRupiah(v as number);
const aktif: Format = (v) => (v ? "Aktif" : "Nonaktif");
const status = (jenis: JenisStatus): Format => (v) => definisiStatus(jenis, String(v)).label;

/** Kolom yang ditampilkan per tabel beserta label & formatnya. */
export const KOLOM_AUDIT: Record<string, Record<string, { label: string; format?: Format }>> = {
  data_item: {
    nama_item: { label: "Nama" },
    satuan: { label: "Satuan" },
    tarif_per_satuan: { label: "Tarif", format: rupiah },
    is_active: { label: "Status", format: aktif },
  },
  data_armada: {
    plat_nomor: { label: "Plat" },
    jenis_unit: { label: "Jenis unit" },
    kapasitas_ton: { label: "Kapasitas (ton)", format: (v) => formatAngka(v as number) },
    status: { label: "Status", format: status("armada") },
    is_active: { label: "Keaktifan", format: aktif },
    catatan: { label: "Catatan" },
  },
};

export type Perubahan = { label: string; lama?: string; baru: string };

export function ringkasPerubahan(entitas: string, aksi: string, detail: unknown): Perubahan[] {
  const kolom = KOLOM_AUDIT[entitas] ?? {};
  if (!detail || typeof detail !== "object") return [];
  const d = detail as Record<string, unknown>;
  const hasil: Perubahan[] = [];
  for (const [k, def] of Object.entries(kolom)) {
    if (!(k in d)) continue;
    const f = def.format ?? teks;
    if (aksi === "ubah") {
      const { lama, baru } = (d[k] ?? {}) as { lama?: unknown; baru?: unknown };
      hasil.push({ label: def.label, lama: f(lama), baru: f(baru) });
    } else {
      hasil.push({ label: def.label, baru: f(d[k]) });
    }
  }
  return hasil;
}

export const LABEL_AKSI_AUDIT: Record<string, string> = {
  tambah: "Ditambahkan",
  ubah: "Diubah",
  hapus: "Dihapus",
  atur_ulang_password: "Password diatur ulang",
};
