/**
 * Utilitas laporan & dashboard (PRD §7.2, §7.14). Murni (tanpa I/O) agar
 * dapat diuji unit dan dipakai bersama halaman laporan & ekspor CSV.
 */

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------

/**
 * Kolom CSV. `nilai` mengembalikan string/angka mentah; angka ditulis
 * dengan koma desimal agar dibaca sebagai angka oleh Excel ber-locale
 * Indonesia (pemisah kolom titik koma, sesuai locale tersebut).
 */
export type KolomCsv<T> = { judul: string; nilai: (baris: T) => string | number | boolean | null | undefined };

const PEMISAH = ";";

/** Sel yang diawali karakter rumus dinetralkan (CSV/formula injection). */
function selAman(teks: string): string {
  return /^[=+\-@\t\r]/.test(teks) ? `'${teks}` : teks;
}

export function selCsv(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  let teks: string;
  if (typeof v === "number") teks = Number.isFinite(v) ? String(v).replace(".", ",") : "";
  else if (typeof v === "boolean") teks = v ? "Ya" : "Tidak";
  else teks = selAman(v);
  return /["\r\n;]/.test(teks) ? `"${teks.replace(/"/g, '""')}"` : teks;
}

/** CSV lengkap dengan BOM UTF-8 (agar Excel membaca huruf non-ASCII dengan benar). */
export function keCsv<T>(kolom: KolomCsv<T>[], baris: T[]): string {
  const kepala = kolom.map((k) => selCsv(k.judul)).join(PEMISAH);
  const isi = baris.map((b) => kolom.map((k) => selCsv(k.nilai(b))).join(PEMISAH));
  return `﻿${[kepala, ...isi].join("\r\n")}\r\n`;
}

export function namaBerkasCsv(jenis: string, dari: string, sampai: string): string {
  return dari === sampai ? `laporan-${jenis}-${dari}.csv` : `laporan-${jenis}-${dari}_${sampai}.csv`;
}

// ---------------------------------------------------------------------
// Grafik
// ---------------------------------------------------------------------
export const SATUAN_GRAFIK = ["hari", "minggu", "bulan"] as const;
export type SatuanGrafik = (typeof SATUAN_GRAFIK)[number];

export const LABEL_SATUAN_GRAFIK: Record<SatuanGrafik, string> = { hari: "Per hari", minggu: "Per minggu", bulan: "Per bulan" };

/** Selisih hari kalender (inklusif) antara dua tanggal YYYY-MM-DD. */
export function jumlahHari(dari: string, sampai: string): number {
  return Math.round((Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * Satuan grafik: pilihan pengguna bila valid, selain itu otomatis agar
 * jumlah batang tetap terbaca (≤ 31 hari → harian, ≤ 120 hari → mingguan).
 */
export function satuanGrafik(dari: string, sampai: string, pilihan?: string): SatuanGrafik {
  if (pilihan && (SATUAN_GRAFIK as readonly string[]).includes(pilihan)) return pilihan as SatuanGrafik;
  const n = jumlahHari(dari, sampai);
  return n <= 31 ? "hari" : n <= 120 ? "minggu" : "bulan";
}

/** Batas atas sumbu yang "bulat" (1, 2, 2,5, 5 × 10ⁿ) dan langkah tick-nya. */
export function skalaSumbu(maks: number, jumlahTick = 4): { atas: number; langkah: number } {
  if (!(maks > 0)) return { atas: jumlahTick, langkah: 1 };
  const kasar = maks / jumlahTick;
  const pangkat = 10 ** Math.floor(Math.log10(kasar));
  const langkah = [1, 2, 2.5, 5, 10].map((m) => m * pangkat).find((s) => s >= kasar) ?? 10 * pangkat;
  // Nilai bulat (jumlah transaksi) tidak boleh punya langkah pecahan.
  const langkahBulat = Math.max(1, Math.ceil(langkah));
  return { atas: Math.ceil(maks / langkahBulat) * langkahBulat, langkah: langkahBulat };
}

/** Angka ringkas untuk sumbu: 1.500 → "1,5 rb", 2.000.000 → "2 jt". */
export function angkaRingkas(n: number): string {
  const f = (x: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(x);
  const a = Math.abs(n);
  if (a >= 1e9) return `${f(n / 1e9)} M`;
  if (a >= 1e6) return `${f(n / 1e6)} jt`;
  if (a >= 1e4) return `${f(n / 1e3)} rb`;
  return f(n);
}

// ---------------------------------------------------------------------
// Label tanggal (tanggal kalender YYYY-MM-DD, tanpa konversi zona)
// ---------------------------------------------------------------------
const tgl = (s: string, opsi: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("id-ID", { ...opsi, timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`));

/** Label ember grafik: singkat untuk sumbu, panjang untuk tooltip & tabel. */
export function labelEmber(awal: string, akhir: string, satuan: SatuanGrafik): { label: string; labelPanjang: string } {
  if (satuan === "bulan") return { label: tgl(awal, { month: "short" }), labelPanjang: tgl(awal, { month: "long", year: "numeric" }) };
  if (satuan === "minggu" && awal !== akhir) {
    return { label: tgl(awal, { day: "numeric", month: "short" }), labelPanjang: `${tgl(awal, { day: "numeric", month: "short" })} – ${tgl(akhir, { day: "numeric", month: "short", year: "numeric" })}` };
  }
  return { label: tgl(awal, { day: "numeric", month: "short" }), labelPanjang: tgl(awal, { weekday: "short", day: "numeric", month: "long", year: "numeric" }) };
}

/** "14 November 2026" atau "1 – 14 November 2026". */
export function labelRentang(dari: string, sampai: string): string {
  if (dari === sampai) return tgl(dari, { day: "numeric", month: "long", year: "numeric" });
  return `${tgl(dari, { day: "numeric", month: "long", year: "numeric" })} – ${tgl(sampai, { day: "numeric", month: "long", year: "numeric" })}`;
}
