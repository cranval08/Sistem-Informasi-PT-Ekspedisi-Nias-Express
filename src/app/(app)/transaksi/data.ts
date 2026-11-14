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
  // Hint embed memakai nama constraint FK: data_transaksi punya beberapa FK
  // ke tabel yang sama, dan hint nama kolom bisa ambigu (PGRST201).
  const { data: t, error } = await supabase
    .from("data_transaksi")
    .select(
      `no_resi, waktu_transaksi, status_kirim, total_berat_kg, total_biaya, total_dibayar, status_bayar, catatan,
       status_void, void_reason, void_pada, waktu_diambil, catatan_pengambilan,
       override_belum_lunas, override_belum_lunas_alasan,
       petugasAmbil:data_pengguna!data_transaksi_diambil_diproses_oleh_fkey(nama_lengkap),
       pengoverride:data_pengguna!data_transaksi_override_belum_lunas_oleh_fkey(nama_lengkap),
       manifes:manifes_detail!manifes_detail_no_resi_fkey(aktif, ditambahkan_pada,
         m:manifes!manifes_detail_id_manifes_fkey(id_manifes, status_manifes, rute, armada:data_armada!manifes_id_armada_fkey(plat_nomor))),
       pengirim:data_pelanggan!data_transaksi_id_pengirim_fkey(nama, telepon),
       penerima:data_pelanggan!data_transaksi_id_penerima_fkey(nama, telepon),
       pencatat:data_pengguna!data_transaksi_id_pengguna_fkey(nama_lengkap),
       pembatal:data_pengguna!data_transaksi_void_oleh_fkey(nama_lengkap),
       detail:detail_transaksi(id_detail, satuan_saat_transaksi, jumlah, berat_kg, tarif_saat_transaksi, subtotal, item:data_item(nama_item))`,
    )
    .eq("no_resi", resi)
    .maybeSingle();
  // Galat query bukan "tidak ditemukan": lempar agar tidak tersamar sebagai 404.
  if (error) throw new Error(`Transaksi gagal dimuat (${error.code ?? "tanpa kode"}).`);
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
    pengambilan: t.waktu_diambil
      ? {
          waktu: t.waktu_diambil as string,
          petugas: relasiTunggal(t.petugasAmbil)?.nama_lengkap ?? "—",
          catatan: t.catatan_pengambilan as string | null,
        }
      : null,
    overrideBelumLunas: t.override_belum_lunas
      ? { alasan: t.override_belum_lunas_alasan as string, oleh: relasiTunggal(t.pengoverride)?.nama_lengkap ?? "—" }
      : null,
    /** Manifes yang memuat resi ini (aktif dulu, lalu riwayat pindah/batal). */
    manifes: (t.manifes ?? [])
      .map((d) => {
        const m = relasiTunggal(d.m);
        return {
          id: m?.id_manifes as string,
          status: (m?.status_manifes ?? "") as string,
          rute: (m?.rute ?? "") as string,
          plat: relasiTunggal(m?.armada)?.plat_nomor ?? "—",
          aktif: d.aktif as boolean,
          ditambahkan: d.ditambahkan_pada as string,
        };
      })
      .sort((a, b) => Number(b.aktif) - Number(a.aktif) || b.ditambahkan.localeCompare(a.ditambahkan)),
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
