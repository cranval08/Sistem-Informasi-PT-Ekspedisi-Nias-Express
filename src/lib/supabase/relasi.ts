/**
 * Relasi many-to-one dari PostgREST dikembalikan sebagai objek tunggal,
 * tetapi tipe supabase-js tanpa tipe database hasil generate menganggapnya
 * array. Helper ini menormalkan keduanya.
 */
export function relasiTunggal<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}
