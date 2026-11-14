"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import { dataForm, skemaBatalPembayaran, skemaCatatPembayaran } from "@/lib/domain/skema";
import { formatRupiah } from "@/lib/domain/format";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";

const PERAN_KASIR = ["pemilik", "admin_loket"] as const;

export type InfoTagihan = {
  noResi: string;
  pengirim: string;
  penerima: string;
  total: number;
  dibayar: number;
  sisa: number;
  dibatalkan: boolean;
};

/** Ringkasan tagihan untuk form pembayaran (setelah nomor resi diisi). */
export async function infoTagihan(resiMentah: string): Promise<InfoTagihan | null> {
  if (!(await profilUntukAksi(...PERAN_KASIR))) return null;
  const resi = resiMentah.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}-\d{8}-\d{4,}$/.test(resi)) return null;

  const supabase = await buatKlienServer();
  const { data: t } = await supabase
    .from("data_transaksi")
    .select(
      `no_resi, total_biaya, total_dibayar, status_void,
       pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama),
       penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama)`,
    )
    .eq("no_resi", resi)
    .maybeSingle();
  if (!t) return null;
  const total = Number(t.total_biaya);
  const dibayar = Number(t.total_dibayar);
  return {
    noResi: t.no_resi,
    pengirim: relasiTunggal(t.pengirim)?.nama ?? "—",
    penerima: relasiTunggal(t.penerima)?.nama ?? "—",
    total,
    dibayar,
    sisa: total - dibayar,
    dibatalkan: t.status_void,
  };
}

export async function catatPembayaran(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PERAN_KASIR))) return gagalAkses();
  const v = skemaCatatPembayaran.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("catat_pembayaran", {
    p_no_resi: v.data.no_resi,
    p_jumlah: v.data.jumlah,
    p_catatan: v.data.catatan ?? undefined,
  });
  if (error) {
    const h = gagalDb(error);
    // Galat nominal ditampilkan di bawah field nominal; galat resi di bawah field resi.
    if (/Nominal|lunas/.test(h.pesan ?? "")) return gagal(h.pesan!, { jumlah: h.pesan! });
    if (/resi|dibatalkan/.test(h.pesan ?? "")) return gagal(h.pesan!, { no_resi: h.pesan! });
    return h;
  }
  refresh();
  return berhasil(`Pembayaran ${formatRupiah(v.data.jumlah)} untuk ${v.data.no_resi} tercatat.`);
}

export async function batalkanPembayaran(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const v = skemaBatalPembayaran.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("batalkan_pembayaran", { p_id_pembayaran: v.data.id_pembayaran, p_alasan: v.data.alasan });
  if (error) return gagalDb(error);
  refresh();
  return berhasil("Pembayaran dibatalkan. Total dibayar dan status lunas dihitung ulang.");
}
