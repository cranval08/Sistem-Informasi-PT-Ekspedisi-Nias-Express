/**
 * Label Bahasa Indonesia & nada warna untuk setiap status (PRD §7.10,
 * §7.12, §10). Nilai kunci = nilai enum di database.
 */
export type Nada = "success" | "warning" | "danger" | "info" | "neutral";

type Definisi = { label: string; nada: Nada };

export const STATUS_KIRIM = {
  diterima_loket: { label: "Diterima Loket", nada: "neutral" },
  dimuat: { label: "Dimuat", nada: "info" },
  dalam_perjalanan: { label: "Dalam Perjalanan", nada: "warning" },
  tiba: { label: "Tiba", nada: "info" },
  sudah_diambil: { label: "Sudah Diambil", nada: "success" },
} as const satisfies Record<string, Definisi>;

export const STATUS_BAYAR = {
  lunas: { label: "Lunas", nada: "success" },
  belum_lunas: { label: "Belum Lunas", nada: "warning" },
} as const satisfies Record<string, Definisi>;

export const STATUS_ARMADA = {
  siaga: { label: "Siaga", nada: "success" },
  perjalanan: { label: "Perjalanan", nada: "info" },
  perbaikan: { label: "Perbaikan", nada: "warning" },
  rusak: { label: "Rusak", nada: "danger" },
} as const satisfies Record<string, Definisi>;

export const STATUS_MANIFES = {
  draft: { label: "Draf", nada: "neutral" },
  dimuat: { label: "Dimuat", nada: "info" },
  berangkat: { label: "Berangkat", nada: "warning" },
  tiba: { label: "Tiba", nada: "success" },
  dibatalkan: { label: "Dibatalkan", nada: "danger" },
} as const satisfies Record<string, Definisi>;

export const STATUS_KENDALA = {
  terbuka: { label: "Terbuka", nada: "danger" },
  selesai: { label: "Selesai", nada: "success" },
} as const satisfies Record<string, Definisi>;

export const STATUS_AKUN = {
  aktif: { label: "Aktif", nada: "success" },
  nonaktif: { label: "Nonaktif", nada: "neutral" },
} as const satisfies Record<string, Definisi>;

export const JENIS_STATUS = {
  kirim: STATUS_KIRIM,
  bayar: STATUS_BAYAR,
  armada: STATUS_ARMADA,
  manifes: STATUS_MANIFES,
  kendala: STATUS_KENDALA,
  akun: STATUS_AKUN,
} as const;

export type JenisStatus = keyof typeof JENIS_STATUS;

export function definisiStatus(jenis: JenisStatus, nilai: string): Definisi {
  const peta = JENIS_STATUS[jenis] as Record<string, Definisi>;
  return peta[nilai] ?? { label: nilai, nada: "neutral" };
}
