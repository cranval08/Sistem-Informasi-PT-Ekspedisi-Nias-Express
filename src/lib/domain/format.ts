/** Format tampilan sesuai PRD §12: Rupiah id-ID dan zona waktu operasional. */

export const ZONA_WAKTU_DEFAULT = "Asia/Jakarta";

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export function formatRupiah(nilai: number | bigint | string | null | undefined): string {
  if (nilai === null || nilai === undefined || nilai === "") return "—";
  const n = typeof nilai === "string" ? Number(nilai) : nilai;
  return rupiah.format(n);
}

export function formatAngka(nilai: number | string, desimal = 3): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: desimal }).format(Number(nilai));
}

export function formatTanggalWaktu(
  waktu: string | Date | null | undefined,
  zonaWaktu: string = ZONA_WAKTU_DEFAULT,
): string {
  if (!waktu) return "—";
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: zonaWaktu,
  }).format(new Date(waktu));
}

export function formatTanggal(waktu: string | Date | null | undefined, zonaWaktu: string = ZONA_WAKTU_DEFAULT): string {
  if (!waktu) return "—";
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: zonaWaktu }).format(new Date(waktu));
}

/**
 * Normalisasi nomor telepon ke format 08xx — cerminan fungsi SQL
 * `public.normalisasi_telepon` (database tetap sumber kebenaran).
 */
export function normalisasiTelepon(input: string): string {
  const d = input.replace(/\D/g, "");
  if (d.startsWith("62")) return "0" + d.slice(2);
  if (d.startsWith("8")) return "0" + d;
  return d;
}

export const POLA_TELEPON = /^0\d{9,12}$/;

export function teleponValid(input: string): boolean {
  return POLA_TELEPON.test(normalisasiTelepon(input));
}

/** Bersihkan kata kunci untuk filter PostgREST `or(...)` (hindari karakter sintaks). */
export function kataKunciAman(q: string | undefined): string {
  return (q ?? "").replace(/[^\p{L}\p{N} '\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

/** Tanggal kalender (YYYY-MM-DD) di zona waktu operasional, digeser `hari`. */
export function tanggalOperasional(zonaWaktu: string = ZONA_WAKTU_DEFAULT, hari = 0, dari: Date = new Date()): string {
  const d = new Date(dari.getTime() + hari * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: zonaWaktu, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * Awal hari (00:00) sebuah tanggal kalender di zona operasional sebagai
 * ISO dengan offset, mis. "2026-11-14T00:00:00+07:00" — untuk filter
 * kolom timestamptz per tanggal operasional.
 */
export function awalHariIso(tanggal: string, zonaWaktu: string = ZONA_WAKTU_DEFAULT): string {
  const bagian = new Intl.DateTimeFormat("en-US", { timeZone: zonaWaktu, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${tanggal}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  const offset = bagian && bagian !== "GMT" ? bagian.replace("GMT", "") : "+00:00";
  return `${tanggal}T00:00:00${offset}`;
}

/** Tanggal YYYY-MM-DD ditambah `hari` (kalender, tanpa zona). */
export function tambahHari(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}
