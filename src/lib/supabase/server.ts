import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { envPublik } from "./env";

/**
 * Klien Supabase untuk Server Component, Server Action, dan Route Handler.
 * Berjalan dengan sesi pengguna yang login — seluruh query tunduk pada RLS.
 */
export async function buatKlienServer() {
  const { url, anonKey } = envPublik();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
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
