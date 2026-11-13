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
