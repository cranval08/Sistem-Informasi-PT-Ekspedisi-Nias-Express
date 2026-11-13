"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, idValid, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import { dataForm, skemaItem } from "@/lib/domain/skema";
import { buatKlienServer } from "@/lib/supabase/server";

/** Tambah / ubah jenis barang & tarif — hanya Pemilik (RLS juga menegakkan). */
export async function simpanItem(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();

  const idMentah = formData.get("id_item");
  const id = idMentah ? idValid(idMentah) : null;
  if (idMentah && !id) return gagal("Data jenis barang tidak valid. Muat ulang halaman.");

  const v = skemaItem.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  if (id) {
    const { data, error } = await supabase.from("data_item").update(v.data).eq("id_item", id).select("id_item");
    if (error) return gagalDb(error);
    if (!data?.length) return gagal("Jenis barang tidak ditemukan atau Anda tidak memiliki akses.");
    refresh();
    return berhasil(`${v.data.nama_item} diperbarui. Tarif baru hanya berlaku untuk transaksi berikutnya.`);
  }

  const { error } = await supabase.from("data_item").insert(v.data);
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`${v.data.nama_item} ditambahkan ke master jenis barang.`);
}

export async function ubahStatusItem(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const id = idValid(formData.get("id_item"));
  const aktif = formData.get("aktif");
  if (!id || (aktif !== "true" && aktif !== "false")) return gagal("Permintaan tidak valid. Muat ulang halaman.");

  const supabase = await buatKlienServer();
  const { data, error } = await supabase
    .from("data_item")
    .update({ is_active: aktif === "true" })
    .eq("id_item", id)
    .select("nama_item");
  if (error) return gagalDb(error);
  if (!data?.length) return gagal("Jenis barang tidak ditemukan atau Anda tidak memiliki akses.");
  refresh();
  return berhasil(`${data[0].nama_item} ${aktif === "true" ? "diaktifkan kembali" : "dinonaktifkan"}.`);
}
