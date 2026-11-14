import "server-only";
import { cache } from "react";
import { relasiTunggal } from "@/lib/supabase/relasi";
import { buatKlienServer } from "@/lib/supabase/server";

/** Pola nomor resi yang valid di URL (prefiks 1–6 karakter). */
const POLA_RESI = /^[A-Z0-9]{1,6}-\d{8}-\d{4,}$/;

export type TransaksiLengkap = NonNullable<Awaited<ReturnType<typeof ambilTransaksi>>>;

/**
 * Satu transaksi beserta pelanggan, rincian barang, dan pencatat. RLS
 * menentukan siapa yang dapat membacanya (Supir tidak). Di-cache per
 * request karena dipakai halaman detail & metadata.
 */
export const ambilTransaksi = cache(async (resiMentah: string) => {
  const resi = decodeURIComponent(resiMentah).toUpperCase();
  if (!POLA_RESI.test(resi)) return null;

  const supabase = await buatKlienServer();
  const { data: t } = await supabase
    .from("data_transaksi")
    .select(
      `no_resi, waktu_transaksi, status_kirim, total_berat_kg, total_biaya, total_dibayar, status_bayar, catatan,
       status_void, void_reason, void_pada, waktu_diambil,
       pengirim:data_pelanggan!id_pengirim(nama, telepon),
       penerima:data_pelanggan!id_penerima(nama, telepon),
       pencatat:data_pengguna!id_pengguna(nama_lengkap),
       pembatal:data_pengguna!void_oleh(nama_lengkap),
       detail:detail_transaksi(id_detail, satuan_saat_transaksi, jumlah, berat_kg, tarif_saat_transaksi, subtotal, item:data_item(nama_item))`,
    )
    .eq("no_resi", resi)
    .maybeSingle();
  if (!t) return null;

  return {
    noResi: t.no_resi,
    waktu: t.waktu_transaksi,
    statusKirim: t.status_kirim as string,
    statusBayar: t.status_bayar as string,
    totalBerat: Number(t.total_berat_kg),
    totalBiaya: Number(t.total_biaya),
    totalDibayar: Number(t.total_dibayar),
    catatan: t.catatan as string | null,
    void: t.status_void
      ? { alasan: t.void_reason as string, pada: t.void_pada as string, oleh: relasiTunggal(t.pembatal)?.nama_lengkap ?? "—" }
      : null,
    waktuDiambil: t.waktu_diambil as string | null,
    pengirim: relasiTunggal(t.pengirim) ?? { nama: "—", telepon: "—" },
    penerima: relasiTunggal(t.penerima) ?? { nama: "—", telepon: "—" },
    pencatat: relasiTunggal(t.pencatat)?.nama_lengkap ?? "—",
    detail: (t.detail ?? [])
      .map((d) => ({
        id: d.id_detail as string,
        nama: relasiTunggal(d.item)?.nama_item ?? "—",
        satuan: d.satuan_saat_transaksi as string,
        jumlah: Number(d.jumlah),
        berat: Number(d.berat_kg),
        tarif: Number(d.tarif_saat_transaksi),
        subtotal: Number(d.subtotal),
      }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id")),
  };
});
