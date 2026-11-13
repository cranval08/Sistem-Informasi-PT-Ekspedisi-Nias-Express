"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import { dataForm, skemaPengaturan } from "@/lib/domain/skema";
import { buatKlienServer } from "@/lib/supabase/server";

export async function simpanPengaturan(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik"))) return gagalAkses();
  const v = skemaPengaturan.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { data, error } = await supabase.from("pengaturan").update(v.data).eq("id", 1).select("id");
  if (error) return gagalDb(error);
  if (!data?.length) return gagal("Pengaturan tidak dapat disimpan. Anda mungkin tidak memiliki akses.");
  refresh();
  return berhasil("Pengaturan perusahaan disimpan.");
}
