import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { buatKlienServer } from "@/lib/supabase/server";
import { bolehAkses, isPeran, type KunciRute, type Peran } from "@/lib/domain/peran";

export type Profil = {
  id: string;
  namaLengkap: string;
  peran: Peran;
  email: string;
};

export type Pengaturan = {
  namaPerusahaan: string;
  zonaWaktu: string;
  modeDemo: boolean;
};

/**
 * Profil pengguna yang login (di-cache per request). Mengembalikan null
 * bila belum login, tidak terdaftar di data_pengguna, atau nonaktif —
 * RLS menyembunyikan baris pengguna nonaktif sehingga cukup satu query.
 */
export const ambilProfil = cache(async (): Promise<Profil | null> => {
  const supabase = await buatKlienServer();
  const { data: klaim } = await supabase.auth.getClaims();
  const uid = klaim?.claims?.sub;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("data_pengguna")
    .select("id_pengguna, nama_lengkap, peran, email, is_active")
    .eq("id_pengguna", uid)
    .maybeSingle();

  if (error || !data || !data.is_active || !isPeran(data.peran)) return null;
  return { id: data.id_pengguna, namaLengkap: data.nama_lengkap, peran: data.peran, email: data.email };
});

export const ambilPengaturan = cache(async (): Promise<Pengaturan> => {
  const supabase = await buatKlienServer();
  const { data } = await supabase.from("pengaturan").select("nama_perusahaan, zona_waktu, mode_demo").maybeSingle();
  return {
    namaPerusahaan: data?.nama_perusahaan ?? "PT. Ekspedisi Nias Express",
    zonaWaktu: data?.zona_waktu ?? "Asia/Jakarta",
    // Bila gagal dibaca, tetap tandai sebagai demo (pilihan aman).
    modeDemo: data?.mode_demo ?? true,
  };
});

/** Wajib login dengan akun aktif; jika tidak, arahkan ke halaman login. */
export async function wajibLogin(): Promise<Profil> {
  const profil = await ambilProfil();
  // Login tetapi tidak terdaftar/nonaktif: akhiri sesi dulu agar tidak terjadi loop redirect.
  if (!profil) redirect("/keluar?alasan=nonaktif");
  return profil;
}

/**
 * Wajib login dan peran diizinkan untuk rute. Panggil di awal setiap
 * page.tsx internal (layout tidak dirender ulang saat navigasi klien).
 */
export async function wajibAksesRute(rute: KunciRute): Promise<Profil> {
  const profil = await wajibLogin();
  if (!bolehAkses(profil.peran, rute)) redirect("/akses-ditolak");
  return profil;
}
