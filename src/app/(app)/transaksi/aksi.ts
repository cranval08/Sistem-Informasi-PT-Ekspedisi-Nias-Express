"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import { kataKunciAman, normalisasiTelepon, polaIlike } from "@/lib/domain/format";
import { dataForm, skemaBatalTransaksi, skemaOverrideBelumLunas, skemaPelanggan, skemaTransaksi, type InputTransaksi } from "@/lib/domain/skema";
import { buatKlienServer } from "@/lib/supabase/server";

const PERAN_LOKET = ["pemilik", "admin_loket"] as const;

export type PelangganPilihan = { id: string; nama: string; telepon: string };

/** Pencarian pelanggan aktif untuk form transaksi (nama atau telepon). */
export async function cariPelangganTransaksi(q: string): Promise<PelangganPilihan[]> {
  if (!(await profilUntukAksi(...PERAN_LOKET))) return [];
  const aman = kataKunciAman(q);
  if (aman.length < 2) return [];
  const digit = aman.replace(/\D/g, "");
  const filter = [`nama.ilike."${polaIlike(aman)}"`];
  if (digit.length >= 3) filter.push(`telepon.like."%${normalisasiTelepon(digit)}%"`);

  const supabase = await buatKlienServer();
  const { data } = await supabase
    .from("data_pelanggan")
    .select("id_pelanggan, nama, telepon")
    .eq("is_active", true)
    .or(filter.join(","))
    .order("nama")
    .limit(8);
  return (data ?? []).map((p) => ({ id: p.id_pelanggan, nama: p.nama, telepon: p.telepon }));
}

/**
 * Tambah pelanggan langsung dari form transaksi. Bila nomor sudah
 * terdaftar, pelanggan yang ada dikembalikan agar dipilih (tidak membuat
 * data ganda).
 */
export async function tambahPelangganCepat(
  input: { nama: string; telepon: string },
): Promise<HasilAksi<{ pelanggan: PelangganPilihan; sudahAda: boolean }>> {
  if (!(await profilUntukAksi(...PERAN_LOKET))) return gagalAkses();
  const v = skemaPelanggan.safeParse(input);
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { data: ada } = await supabase
    .from("data_pelanggan")
    .select("id_pelanggan, nama, telepon, is_active")
    .eq("telepon", v.data.telepon)
    .maybeSingle();
  if (ada) {
    if (!ada.is_active) {
      const p = `Nomor ini terdaftar atas nama "${ada.nama}" yang sudah nonaktif. Aktifkan kembali di menu Pelanggan.`;
      return gagal(p, { telepon: p });
    }
    return berhasil(`Nomor sudah terdaftar atas nama ${ada.nama}; data tersebut dipakai.`, {
      pelanggan: { id: ada.id_pelanggan, nama: ada.nama, telepon: ada.telepon },
      sudahAda: true,
    });
  }

  const { data, error } = await supabase
    .from("data_pelanggan")
    .insert(v.data)
    .select("id_pelanggan, nama, telepon")
    .single();
  if (error) return gagalDb(error);
  return berhasil(`Pelanggan ${data.nama} ditambahkan.`, {
    pelanggan: { id: data.id_pelanggan, nama: data.nama, telepon: data.telepon },
    sudahAda: false,
  });
}

export type Duplikat = { no_resi: string; waktu_transaksi: string; total_biaya: number };
export type HasilSimpanTransaksi = HasilAksi<{ resi?: string; duplikat?: Duplikat[] }>;

export async function simpanTransaksi(input: InputTransaksi): Promise<HasilSimpanTransaksi> {
  if (!(await profilUntukAksi(...PERAN_LOKET))) return gagalAkses();
  const v = skemaTransaksi.safeParse(input);
  if (!v.success) return gagalValidasi(v.error);
  const t = v.data;

  const supabase = await buatKlienServer();
  const { data: resi, error } = await supabase.rpc("buat_transaksi", {
    p_id_pengirim: t.id_pengirim,
    p_id_penerima: t.id_penerima,
    p_detail: t.detail.map((d) => ({ id_item: d.id_item, berat_kg: d.berat_kg, koli: d.koli })),
    p_bayar_awal: t.bayar_awal,
    p_catatan: t.catatan ?? undefined,
    p_konfirmasi_duplikat: t.konfirmasi_duplikat,
    p_alasan_belum_bayar: t.alasan_belum_bayar ?? undefined,
  });

  if (error?.code === "NX001") {
    // Catat bahwa peringatan duplikasi muncul (indikator PRD §3), walau
    // pengguna akhirnya membatalkan. RPC memeriksa ulang duplikatnya; galat
    // pencatatan tidak menghalangi alur konfirmasi.
    const beratGram = t.detail.reduce((n, d) => n + Math.round(Number(d.berat_kg) * 1000), 0);
    if (!t.konfirmasi_duplikat) {
      await supabase.rpc("catat_peringatan_duplikat", {
        p_id_pengirim: t.id_pengirim,
        p_id_penerima: t.id_penerima,
        p_total_berat_kg: beratGram / 1000,
      });
    }
    // HINT berisi daftar resi yang mirip (lihat buat_transaksi).
    const daftar = (error.hint ?? "").split(",").filter(Boolean);
    const { data: duplikat } = await supabase
      .from("data_transaksi")
      .select("no_resi, waktu_transaksi, total_biaya")
      .in("no_resi", daftar)
      .order("waktu_transaksi");
    return {
      ok: false,
      pesan: "Ditemukan transaksi hari ini dengan pengirim, penerima, dan total berat yang sama.",
      data: { duplikat: (duplikat ?? []).map((d) => ({ ...d, total_biaya: Number(d.total_biaya) })) },
      waktu: Date.now(),
    };
  }
  if (error) return gagalDb(error);

  refresh();
  return berhasil(`Transaksi ${resi} tersimpan.`, { resi: resi as string });
}

export async function batalkanTransaksi(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const v = skemaBatalTransaksi.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("batalkan_transaksi", { p_no_resi: v.data.no_resi, p_alasan: v.data.alasan });
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`Transaksi ${v.data.no_resi} dibatalkan.`);
}

/**
 * Override pemuatan barang belum lunas (PRD §7.8, §11 langkah 9). Hanya
 * Pemilik, hanya bila diizinkan di Pengaturan, wajib alasan — ditegakkan
 * juga oleh RPC override_belum_lunas dan tercatat di audit log.
 */
export async function overrideBelumLunas(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const v = skemaOverrideBelumLunas.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("override_belum_lunas", { p_no_resi: v.data.no_resi, p_alasan: v.data.alasan });
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`Override tercatat. Resi ${v.data.no_resi} dapat dimuat walau belum lunas.`);
}
