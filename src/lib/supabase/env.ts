/**
 * Pembacaan & validasi kunci Supabase — satu-satunya tempat nama variabel
 * environment ditentukan. Mendukung format kunci baru (sb_publishable_ /
 * sb_secret_) dan nama variabel lama (anon / service_role) sebagai cadangan.
 *
 * ATURAN: pesan galat di sini hanya boleh menyebut NAMA variabel, tidak
 * pernah nilainya.
 *
 * Modul ini sengaja tidak memakai `server-only` agar bisa dipakai script
 * Node (seed). Kode aplikasi mengakses kunci rahasia hanya lewat
 * `admin.ts` yang bertanda `server-only`.
 */

type Env = Record<string, string | undefined>;

const AWALAN_PUBLISHABLE = "sb_publishable_";
const AWALAN_SECRET = "sb_secret_";

export class GalatKonfigurasi extends Error {
  name = "GalatKonfigurasi";
}

function isi(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** Variabel publik dibaca secara literal agar Next.js dapat menyisipkannya saat build. */
function envPublikMentah(): Env {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** Kunci rahasia tidak boleh pernah berada di variabel ber-awalan NEXT_PUBLIC_. */
function tolakRahasiaDiVariabelPublik(env: Env) {
  for (const [nama, nilai] of Object.entries(env)) {
    if (nama.startsWith("NEXT_PUBLIC_") && nilai?.trim().startsWith(AWALAN_SECRET)) {
      throw new GalatKonfigurasi(
        `${nama} berisi secret key (sb_secret_…). Secret key tidak boleh memakai awalan NEXT_PUBLIC_ karena akan terkirim ke browser. Pindahkan ke SUPABASE_SECRET_KEY.`,
      );
    }
  }
}

/**
 * Normalisasi URL proyek Supabase ke bentuk dasar `https://<ref>.supabase.co`.
 * Akhiran `/rest/v1` (alamat "API URL" yang sering tersalin dari dashboard)
 * dan garis miring di akhir dibuang karena klien menambahkan path sendiri.
 * Path lain ditolak. Pesan galat tidak memuat nilai URL.
 */
export function normalisasiUrlSupabase(mentah: string): { url: string; dinormalisasi: boolean } {
  let u: URL;
  try {
    u = new URL(mentah);
  } catch {
    throw new GalatKonfigurasi("NEXT_PUBLIC_SUPABASE_URL bukan URL yang valid. Contoh: https://<project-ref>.supabase.co");
  }
  if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
    throw new GalatKonfigurasi("NEXT_PUBLIC_SUPABASE_URL harus memakai https://");
  }
  const path = u.pathname.replace(/\/+$/, "");
  if (path !== "" && path !== "/rest/v1") {
    throw new GalatKonfigurasi(
      "NEXT_PUBLIC_SUPABASE_URL harus berupa URL dasar proyek tanpa path, contoh: https://<project-ref>.supabase.co",
    );
  }
  if (u.search || u.hash) {
    throw new GalatKonfigurasi("NEXT_PUBLIC_SUPABASE_URL tidak boleh memuat query (?…) atau fragmen (#…).");
  }
  return { url: u.origin, dinormalisasi: u.origin !== mentah };
}

/**
 * URL & kunci publik (aman di browser, dibatasi RLS).
 * Urutan: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY → NEXT_PUBLIC_SUPABASE_ANON_KEY (lama).
 */
export function envPublik(env: Env = envPublikMentah()) {
  tolakRahasiaDiVariabelPublik(env);
  const urlMentah = isi(env.NEXT_PUBLIC_SUPABASE_URL);
  const url = urlMentah ? normalisasiUrlSupabase(urlMentah).url : undefined;
  const publishableKey = isi(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? isi(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !publishableKey) {
    throw new GalatKonfigurasi(
      "Konfigurasi Supabase belum lengkap: isi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY di .env.local.",
    );
  }
  return { url, publishableKey };
}

/**
 * Kunci rahasia khusus server (melewati RLS).
 * Urutan: SUPABASE_SECRET_KEY → SUPABASE_SERVICE_ROLE_KEY (lama).
 * Mengembalikan juga nama variabel sumbernya (bukan nilainya) untuk log.
 */
export function kunciRahasiaServer(env: Env = process.env): { kunci: string; sumber: string } {
  if (typeof window !== "undefined") {
    throw new GalatKonfigurasi("Secret key Supabase tidak boleh diakses dari browser.");
  }
  tolakRahasiaDiVariabelPublik(env);

  const sumber = isi(env.SUPABASE_SECRET_KEY)
    ? "SUPABASE_SECRET_KEY"
    : isi(env.SUPABASE_SERVICE_ROLE_KEY)
      ? "SUPABASE_SERVICE_ROLE_KEY"
      : null;
  if (!sumber) {
    throw new GalatKonfigurasi(
      "SUPABASE_SECRET_KEY belum diisi di .env.local (secret key sb_secret_…, khusus server, tanpa awalan NEXT_PUBLIC_).",
    );
  }
  const kunci = isi(env[sumber])!;
  if (kunci.startsWith(AWALAN_PUBLISHABLE)) {
    throw new GalatKonfigurasi(
      `${sumber} berisi publishable key (sb_publishable_…), bukan secret key. Salin secret key (sb_secret_…) dari Project Settings → API Keys.`,
    );
  }
  return { kunci, sumber };
}
