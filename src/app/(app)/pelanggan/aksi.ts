"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, idValid, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import { normalisasiTelepon } from "@/lib/domain/format";
import { dataForm, skemaPelanggan } from "@/lib/domain/skema";
import { buatKlienServer } from "@/lib/supabase/server";

const PERAN_KELOLA = ["pemilik", "admin_loket"] as const;

export type PelangganTerdaftar = { id: string; nama: string; aktif: boolean };

/** Cari pelanggan lain dengan nomor telepon yang sama (setelah normalisasi). */
async function cariTelepon(telepon: string, kecuali?: string | null): Promise<PelangganTerdaftar | null> {
  const supabase = await buatKlienServer();
  const { data } = await supabase
    .from("data_pelanggan")
    .select("id_pelanggan, nama, is_active")
    .eq("telepon", telepon)
    .maybeSingle();
  if (!data || data.id_pelanggan === kecuali) return null;
  return { id: data.id_pelanggan, nama: data.nama, aktif: data.is_active };
}

function pesanGanda(p: PelangganTerdaftar) {
  return `Nomor ini sudah terdaftar atas nama "${p.nama}"${p.aktif ? "" : " (nonaktif)"}. Gunakan data pelanggan tersebut, bukan membuat data baru.`;
}

/** Peringatan dini saat nomor telepon diisi (dipanggil dari form). */
export async function cekTeleponPelanggan(telepon: string, kecuali?: string): Promise<string | null> {
  if (!(await profilUntukAksi(...PERAN_KELOLA))) return null;
  const t = normalisasiTelepon(telepon);
  if (!/^0\d{9,12}$/.test(t)) return null;
  const ada = await cariTelepon(t, kecuali ?? null);
  return ada ? pesanGanda(ada) : null;
}

export async function simpanPelanggan(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PERAN_KELOLA))) return gagalAkses();

  const idMentah = formData.get("id_pelanggan");
  const id = idMentah ? idValid(idMentah) : null;
  if (idMentah && !id) return gagal("Data pelanggan tidak valid. Muat ulang halaman.");

  const v = skemaPelanggan.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const ada = await cariTelepon(v.data.telepon, id);
  if (ada) {
    const p = pesanGanda(ada);
    return gagal("Nomor telepon sudah terdaftar.", { telepon: p });
  }

  const supabase = await buatKlienServer();
  if (id) {
    const { data, error } = await supabase
      .from("data_pelanggan")
      .update({ nama: v.data.nama, telepon: v.data.telepon })
      .eq("id_pelanggan", id)
      .select("id_pelanggan");
    if (error) return gagalDb(error);
    if (!data?.length) return gagal("Pelanggan tidak ditemukan atau Anda tidak memiliki akses.");
    refresh();
    return berhasil(`Data pelanggan ${v.data.nama} diperbarui.`);
  }

  const { error } = await supabase.from("data_pelanggan").insert({ nama: v.data.nama, telepon: v.data.telepon });
  if (error) return gagalDb(error);
  refresh();
  return berhasil(`Pelanggan ${v.data.nama} ditambahkan.`);
}

export async function ubahStatusPelanggan(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi(...PERAN_KELOLA))) return gagalAkses();
  const id = idValid(formData.get("id_pelanggan"));
  const aktif = formData.get("aktif");
  if (!id || (aktif !== "true" && aktif !== "false")) return gagal("Permintaan tidak valid. Muat ulang halaman.");

  const supabase = await buatKlienServer();
  const { data, error } = await supabase
    .from("data_pelanggan")
    .update({ is_active: aktif === "true" })
    .eq("id_pelanggan", id)
    .select("nama");
  if (error) return gagalDb(error);
  if (!data?.length) return gagal("Pelanggan tidak ditemukan atau Anda tidak memiliki akses.");
  refresh();
  return berhasil(`Pelanggan ${data[0].nama} ${aktif === "true" ? "diaktifkan kembali" : "dinonaktifkan"}.`);
}
