import "server-only";
import { createClient } from "@supabase/supabase-js";
import { envPublik } from "./env";

/**
 * Klien service role — MELEWATI RLS. Hanya untuk operasi administratif
 * di server (mis. membuat akun Auth pengguna baru oleh Pemilik), dan
 * hanya setelah pemanggil diverifikasi berperan Pemilik.
 * Jangan pernah diimpor dari komponen klien.
 */
export function buatKlienAdmin() {
  const { url } = envPublik();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diisi di .env.local (khusus server).");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
