import "server-only";
import { createClient } from "@supabase/supabase-js";
import { envPublik, kunciRahasiaServer } from "./env";

/**
 * Klien dengan secret key (sb_secret_…) — MELEWATI RLS. Hanya untuk
 * operasi administratif di server (mis. membuat akun Auth pengguna baru
 * oleh Pemilik), dan hanya setelah pemanggil diverifikasi berperan Pemilik.
 * `server-only` membuat build gagal bila modul ini diimpor dari komponen klien.
 */
export function buatKlienAdmin() {
  const { url } = envPublik();
  const { kunci } = kunciRahasiaServer();
  return createClient(url, kunci, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
