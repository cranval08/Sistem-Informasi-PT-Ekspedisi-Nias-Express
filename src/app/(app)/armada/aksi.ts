"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, idValid, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import { dataForm, skemaArmada, skemaStatusArmada } from "@/lib/domain/skema";
import { STATUS_ARMADA } from "@/lib/domain/status";
import { buatKlienServer } from "@/lib/supabase/server";

/** Tambah / ubah armada (plat, jenis, kapasitas, supir) — hanya Pemilik. */
export async function simpanArmada(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();

  const idMentah = formData.get("id_armada");
  const id = idMentah ? idValid(idMentah) : null;
  if (idMentah && !id) return gagal("Data armada tidak valid. Muat ulang halaman.");

  const v = skemaArmada.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  if (id) {
    const { data, error } = await supabase.from("data_armada").update(v.data).eq("id_armada", id).select("id_armada");
    if (error) return gagalDb(error);
    if (!data?.length) return gagal("Armada tidak ditemukan atau Anda tidak memiliki akses.");
    refresh();
    return berhasil(`Armada ${v.data.plat_nomor} diperbarui.`);
  }

  const { error } = await supabase.from("data_armada").insert(v.data);
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`Armada ${v.data.plat_nomor} ditambahkan dengan status Siaga.`);
}

/** Ubah status armada lewat RPC (aturan & catatan riwayat di database). */
export async function ubahStatusArmada(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const v = skemaStatusArmada.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { data, error } = await supabase
    .rpc("ubah_status_armada", { p_id_armada: v.data.id_armada, p_status: v.data.status, p_catatan: v.data.catatan ?? undefined })
    .single<{ plat_nomor: string }>();
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`Status ${data.plat_nomor} diubah menjadi ${STATUS_ARMADA[v.data.status].label}.`);
}

export async function ubahKeaktifanArmada(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const id = idValid(formData.get("id_armada"));
  const aktif = formData.get("aktif");
  if (!id || (aktif !== "true" && aktif !== "false")) return gagal("Permintaan tidak valid. Muat ulang halaman.");

  const supabase = await buatKlienServer();
  const { data, error } = await supabase
    .from("data_armada")
    .update({ is_active: aktif === "true" })
    .eq("id_armada", id)
    .select("plat_nomor");
  if (error) return gagalDb(error);
  if (!data?.length) return gagal("Armada tidak ditemukan atau Anda tidak memiliki akses.");
  refresh();
  return berhasil(`Armada ${data[0].plat_nomor} ${aktif === "true" ? "diaktifkan kembali" : "dinonaktifkan"}.`);
}
