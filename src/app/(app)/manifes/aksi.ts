"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, idValid, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import {
  dataForm,
  skemaBatalManifes,
  skemaIdManifes,
  skemaKendala,
  skemaKonfirmasiMuat,
  skemaLepasResi,
  skemaManifes,
  skemaPindahResi,
  skemaSelesaikanKendala,
  skemaTiba,
} from "@/lib/domain/skema";
import { buatKlienServer } from "@/lib/supabase/server";

/** Pengelola manifes (PRD §4: Staf Gudang mengelola manifes). */
const PENGELOLA = ["pemilik", "staf_gudang"] as const;
/** Pembaruan status perjalanan: pengelola + Supir untuk manifes miliknya (diperiksa RPC). */
const PERJALANAN = ["pemilik", "staf_gudang", "supir"] as const;

export async function buatManifes(formData: FormData): Promise<HasilAksi<{ id: string }>> {
  if (!(await profilUntukAksi(...PENGELOLA))) return gagalAkses();
  const v = skemaManifes.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { data, error } = await supabase.rpc("buat_manifes", {
    p_id_armada: v.data.id_armada,
    p_id_supir: v.data.id_supir,
    p_rute: v.data.rute,
    p_catatan: v.data.catatan ?? undefined,
  });
  if (error) {
    const h = gagalDb<{ id: string }>(error);
    if (/Armada/.test(h.pesan ?? "")) return gagal(h.pesan!, { id_armada: h.pesan! });
    if (/Supir/.test(h.pesan ?? "")) return gagal(h.pesan!, { id_supir: h.pesan! });
    return h;
  }
  refresh();
  return berhasil("Manifes dibuat dengan status Draf. Tambahkan resi yang siap dimuat.", { id: data as string });
}

/** Tambah beberapa resi sekaligus (checkbox `resi` bernilai ganda). */
export async function tambahResiManifes(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PENGELOLA))) return gagalAkses();
  const id = idValid(formData.get("id_manifes"));
  if (!id) return gagal("Data manifes tidak valid. Muat ulang halaman.");
  const resi = formData
    .getAll("resi")
    .filter((r): r is string => typeof r === "string" && r.trim() !== "")
    .map((r) => r.trim().toUpperCase());
  if (!resi.length) return gagal("Pilih minimal satu resi.");
  if (resi.length > 200) return gagal("Maksimal 200 resi per penambahan.");

  const supabase = await buatKlienServer();
  const { data, error } = await supabase.rpc("tambah_resi_manifes", { p_id_manifes: id, p_daftar_resi: resi });
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`${data} resi ditambahkan ke manifes.`);
}

export async function lepasResiManifes(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PENGELOLA))) return gagalAkses();
  const v = skemaLepasResi.safeParse(dataForm(formData));
  if (!v.success) return gagal("Permintaan tidak valid. Muat ulang halaman.");

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("lepas_resi_manifes", { p_id_manifes: v.data.id_manifes, p_no_resi: v.data.no_resi });
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`Resi ${v.data.no_resi} dilepas dari manifes.`);
}

export async function konfirmasiMuat(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PENGELOLA))) return gagalAkses();
  const v = skemaKonfirmasiMuat.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("konfirmasi_muat", {
    p_id_manifes: v.data.id_manifes,
    p_alasan_override: v.data.alasan_override ?? undefined,
  });
  if (error) {
    const h = gagalDb(error);
    if (/override|Alasan/i.test(h.pesan ?? "") && v.data.alasan_override) return gagal(h.pesan!, { alasan_override: h.pesan! });
    return h;
  }
  refresh();
  return berhasil(
    v.data.alasan_override ? "Muat dikonfirmasi dengan override kapasitas (tercatat di audit log)." : "Muat dikonfirmasi. Status resi menjadi Dimuat.",
  );
}

export async function konfirmasiBerangkat(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PERJALANAN))) return gagalAkses();
  const v = skemaIdManifes.safeParse(dataForm(formData));
  if (!v.success) return gagal("Permintaan tidak valid. Muat ulang halaman.");

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("konfirmasi_berangkat", { p_id_manifes: v.data.id_manifes });
  if (error) return gagalDb(error);
  refresh();
  return berhasil("Keberangkatan dikonfirmasi. Resi menjadi Dalam Perjalanan dan armada berstatus Perjalanan.");
}

export async function konfirmasiTiba(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PERJALANAN))) return gagalAkses();
  const v = skemaTiba.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("konfirmasi_tiba", { p_id_manifes: v.data.id_manifes, p_catatan: v.data.catatan ?? undefined });
  if (error) return gagalDb(error);
  refresh();
  return berhasil("Kedatangan dikonfirmasi. Resi menjadi Tiba dan armada kembali Siaga.");
}

export async function batalkanManifes(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PENGELOLA))) return gagalAkses();
  const v = skemaBatalManifes.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("batalkan_manifes", { p_id_manifes: v.data.id_manifes, p_alasan: v.data.alasan });
  if (error) return gagalDb(error);
  refresh();
  return berhasil("Manifes dibatalkan. Resi di dalamnya kembali ke daftar siap dimuat.");
}

export async function pindahkanResi(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PENGELOLA))) return gagalAkses();
  const v = skemaPindahResi.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("pindahkan_resi", {
    p_no_resi: v.data.no_resi,
    p_id_manifes_tujuan: v.data.id_manifes_tujuan,
    p_alasan: v.data.alasan,
  });
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`Resi ${v.data.no_resi} dipindahkan. Pemindahan tercatat di riwayat dan audit log.`);
}

export async function laporkanKendala(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PERJALANAN))) return gagalAkses();
  const v = skemaKendala.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("laporkan_kendala", {
    p_id_manifes: v.data.id_manifes,
    p_jenis: v.data.jenis,
    p_deskripsi: v.data.deskripsi,
  });
  if (error) return gagalDb(error);
  refresh();
  return berhasil("Laporan kendala tercatat dan tampil di detail manifes untuk Staf Gudang dan Pemilik.");
}

export async function selesaikanKendala(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PENGELOLA))) return gagalAkses();
  const v = skemaSelesaikanKendala.safeParse(dataForm(formData));
  if (!v.success) return gagal("Permintaan tidak valid. Muat ulang halaman.");

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("selesaikan_kendala", { p_id_kendala: v.data.id_kendala, p_catatan: v.data.catatan ?? undefined });
  if (error) return gagalDb(error);
  refresh();
  return berhasil("Kendala ditandai selesai.");
}
