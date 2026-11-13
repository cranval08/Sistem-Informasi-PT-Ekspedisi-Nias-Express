import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { envPublik } from "./env";

/**
 * Klien Supabase untuk Server Component, Server Action, dan Route Handler.
 * Berjalan dengan sesi pengguna yang login — seluruh query tunduk pada RLS.
 */
export async function buatKlienServer() {
  // cookies() dulu: menandai render sebagai dinamis sehingga konfigurasi
  // diperiksa saat request, bukan saat build (build tidak butuh .env.local).
  const cookieStore = await cookies();
  const { url, publishableKey } = envPublik();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(daftar) {
        try {
          for (const { name, value, options } of daftar) cookieStore.set(name, value, options);
        } catch {
          // Dipanggil dari Server Component: cookie tidak dapat ditulis di sini.
          // Penyegaran sesi ditangani oleh proxy.
        }
      },
    },
  });
}
