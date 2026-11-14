"use server";

import { refresh } from "next/cache";
import { berhasil, gagal, gagalAkses, gagalDb, gagalValidasi, type HasilAksi } from "@/lib/aksi/hasil";
import { profilUntukAksi } from "@/lib/auth/sesi";
import { dataForm, skemaPengambilan } from "@/lib/domain/skema";
import { buatKlienServer } from "@/lib/supabase/server";

/** Konfirmasi pengambilan di loket tujuan (PRD §7.13) — wajib verifikasi identitas eksplisit. */
export async function konfirmasiPengambilan(formData: FormData): Promise<HasilAksi> {
  if (!(await profilUntukAksi("pemilik", "admin_loket", "staf_gudang"))) return gagalAkses();
  const v = skemaPengambilan.safeParse(dataForm(formData));
  if (!v.success) return gagalValidasi(v.error);

  const supabase = await buatKlienServer();
  const { error } = await supabase.rpc("konfirmasi_pengambilan", {
    p_no_resi: v.data.no_resi,
    p_identitas_terverifikasi: v.data.identitas_terverifikasi,
    p_catatan: v.data.catatan ?? undefined,
  });
  if (error) {
    const h = gagalDb(error);
    if (/identitas/i.test(h.pesan ?? "")) return gagal(h.pesan!, { identitas_terverifikasi: h.pesan! });
    return h;
  }
  refresh();
  return berhasil(`Pengambilan ${v.data.no_resi} dikonfirmasi. Status menjadi Sudah Diambil.`);
}
