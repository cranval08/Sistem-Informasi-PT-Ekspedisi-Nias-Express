import { tanggalOperasional } from "./format";
import type { Peran } from "./peran";

/**
 * Siapa yang boleh membatalkan sebuah pembayaran (keputusan Fase 4 no. 3).
 * Cerminan aturan RPC `batalkan_pembayaran` (migrasi 0900) — hanya untuk
 * menampilkan tombol; database tetap menjadi penegak aturan.
 * - Pemilik: semua pembayaran valid.
 * - Admin Loket: pembayaran yang ia catat sendiri pada tanggal operasional
 *   hari ini (zona pengaturan).
 */
export function bolehBatalkanPembayaran(
  pengguna: { id: string; peran: Peran },
  pembayaran: { id_pengguna_pencatat: string; waktu_bayar: string; status_pembayaran_record: string },
  zonaWaktu: string,
  sekarang: Date = new Date(),
): boolean {
  if (pembayaran.status_pembayaran_record !== "valid") return false;
  if (pengguna.peran === "pemilik") return true;
  return (
    pengguna.peran === "admin_loket" &&
    pembayaran.id_pengguna_pencatat === pengguna.id &&
    tanggalOperasional(zonaWaktu, 0, new Date(pembayaran.waktu_bayar)) === tanggalOperasional(zonaWaktu, 0, sekarang)
  );
}
