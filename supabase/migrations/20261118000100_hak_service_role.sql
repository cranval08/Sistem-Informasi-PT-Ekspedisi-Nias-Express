-- =====================================================================
-- Hak tabel untuk service_role (secret key) secara eksplisit.
--
-- Project Supabase yang lebih baru tidak lagi memberi hak bawaan pada
-- tabel buatan migrasi kepada role API (anon, authenticated,
-- service_role). anon & authenticated sudah diatur eksplisit di …0300,
-- tetapi service_role selama ini bergantung pada hak bawaan project lama,
-- sehingga di project baru seed:akun, seed:demo, dan verifikasi:remote
-- ditolak "permission denied".
--
-- Secret key hanya dipakai di scripts/ dan src/lib/supabase/admin.ts
-- (aplikasi memakainya untuk Auth admin saja, bukan tabel). Hak diberikan
-- seminimal kebutuhan itu:
--   * SELECT semua tabel (verifikasi & pemeriksaan seed),
--   * INSERT/UPDATE hanya tabel master yang diisi seed.
-- Tabel transaksional tetap hanya ditulis lewat RPC (dipanggil dengan
-- sesi pengguna), tidak ada DELETE/TRUNCATE, dan audit_log tetap ditulis
-- oleh trigger/fungsi SECURITY DEFINER saja.
-- =====================================================================

grant usage on schema public to service_role;

grant select on all tables in schema public to service_role;

grant insert, update on public.data_pengguna  to service_role;
grant insert, update on public.data_pelanggan to service_role;
grant insert, update on public.data_item      to service_role;
grant insert, update on public.data_armada    to service_role;
grant update         on public.pengaturan     to service_role;

-- Tabel baru di migrasi berikutnya otomatis dapat dibaca service_role;
-- hak tulis tetap harus diberikan eksplisit.
alter default privileges in schema public grant select on tables to service_role;
