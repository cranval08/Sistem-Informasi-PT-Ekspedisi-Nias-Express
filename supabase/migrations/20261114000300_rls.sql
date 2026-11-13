-- =====================================================================
-- Row Level Security & hak akses per peran.
--
-- Prinsip:
--  * anon tidak memiliki akses tabel apa pun (pelacakan publik nanti via
--    fungsi khusus yang hanya mengembalikan data aman).
--  * Tabel master (pelanggan, item, armada, pengaturan, pengguna) boleh
--    ditulis langsung sesuai policy; perubahan dicatat trigger audit.
--  * Tabel transaksional (transaksi, detail, pembayaran, manifes, riwayat,
--    audit) TIDAK boleh ditulis langsung oleh klien — hanya lewat fungsi
--    RPC SECURITY DEFINER yang memvalidasi aturan bisnis.
--  * Supir tidak membaca tabel keuangan sama sekali.
-- =====================================================================

-- Aktifkan RLS di semua tabel public.
alter table public.pengaturan                enable row level security;
alter table public.data_pengguna             enable row level security;
alter table public.data_pelanggan            enable row level security;
alter table public.data_item                 enable row level security;
alter table public.data_armada               enable row level security;
alter table public.data_transaksi            enable row level security;
alter table public.detail_transaksi          enable row level security;
alter table public.pembayaran                enable row level security;
alter table public.penghitung_resi           enable row level security;
alter table public.manifes                   enable row level security;
alter table public.manifes_detail            enable row level security;
alter table public.riwayat_status_pengiriman enable row level security;
alter table public.riwayat_status_armada     enable row level security;
alter table public.kendala_perjalanan        enable row level security;
alter table public.audit_log                 enable row level security;

-- ---------------------------------------------------------------------
-- Grant tingkat tabel (lapisan pertama; RLS adalah lapisan kedua)
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on all tables in schema public to authenticated;
revoke select on public.penghitung_resi from authenticated;

grant insert, update on public.data_pelanggan to authenticated;
grant insert, update on public.data_item      to authenticated;
grant insert, update on public.data_armada    to authenticated;
-- Email & id terikat ke akun Auth; hanya diubah lewat server.
grant update (nama_lengkap, peran, nomor_telepon, is_active) on public.data_pengguna to authenticated;
grant update         on public.pengaturan     to authenticated;

-- Fungsi internal tidak boleh dipanggil langsung oleh klien.
revoke execute on function public.catat_audit(text, text, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.wajib_peran(public.peran_pengguna[]) from public, anon;
revoke execute on function public.peran_saya() from public, anon;
revoke execute on function public.punya_peran(public.peran_pengguna[]) from public, anon;
grant execute on function public.peran_saya() to authenticated;
grant execute on function public.punya_peran(public.peran_pengguna[]) to authenticated;
grant execute on function public.wajib_peran(public.peran_pengguna[]) to authenticated;

-- ---------------------------------------------------------------------
-- pengaturan: semua pengguna aktif dapat membaca (identitas di resi);
-- hanya pemilik yang mengubah.
-- ---------------------------------------------------------------------
create policy pengaturan_baca on public.pengaturan
  for select to authenticated
  using ((select public.peran_saya()) is not null);

create policy pengaturan_ubah on public.pengaturan
  for update to authenticated
  using ((select public.punya_peran('pemilik')))
  with check ((select public.punya_peran('pemilik')));

-- ---------------------------------------------------------------------
-- data_pengguna
--  * pemilik: semua; admin & gudang: semua (nama pencatat / pilih supir);
--  * supir: hanya dirinya sendiri; pengguna nonaktif: tidak ada.
--  * Ubah: hanya pemilik. Tambah akun via server (service role) karena
--    perlu membuat akun Auth.
-- ---------------------------------------------------------------------
create policy pengguna_baca on public.data_pengguna
  for select to authenticated
  using (
    (select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang'))
    or (id_pengguna = (select auth.uid()) and (select public.peran_saya()) is not null)
  );

create policy pengguna_ubah on public.data_pengguna
  for update to authenticated
  using ((select public.punya_peran('pemilik')))
  with check ((select public.punya_peran('pemilik')));

-- ---------------------------------------------------------------------
-- data_pelanggan: pemilik & admin kelola; gudang baca (verifikasi
-- pengambilan). Supir tidak punya akses. Tidak ada DELETE (nonaktifkan).
-- ---------------------------------------------------------------------
create policy pelanggan_baca on public.data_pelanggan
  for select to authenticated
  using ((select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang')));

create policy pelanggan_tambah on public.data_pelanggan
  for insert to authenticated
  with check ((select public.punya_peran('pemilik', 'admin_loket')));

create policy pelanggan_ubah on public.data_pelanggan
  for update to authenticated
  using ((select public.punya_peran('pemilik', 'admin_loket')))
  with check ((select public.punya_peran('pemilik', 'admin_loket')));

-- ---------------------------------------------------------------------
-- data_item: semua staf baca; hanya pemilik tambah/ubah (tarif).
-- ---------------------------------------------------------------------
create policy item_baca on public.data_item
  for select to authenticated
  using ((select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang')));

create policy item_tambah on public.data_item
  for insert to authenticated
  with check ((select public.punya_peran('pemilik')));

create policy item_ubah on public.data_item
  for update to authenticated
  using ((select public.punya_peran('pemilik')))
  with check ((select public.punya_peran('pemilik')));

-- ---------------------------------------------------------------------
-- data_armada: staf baca semua; supir hanya armada miliknya.
-- Tambah/ubah (termasuk kapasitas) hanya pemilik. Perubahan status oleh
-- gudang/supir akan disediakan lewat RPC (Fase 5).
-- ---------------------------------------------------------------------
create policy armada_baca on public.data_armada
  for select to authenticated
  using (
    (select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang'))
    or (id_supir = (select auth.uid()) and (select public.punya_peran('supir')))
  );

create policy armada_tambah on public.data_armada
  for insert to authenticated
  with check ((select public.punya_peran('pemilik')));

create policy armada_ubah on public.data_armada
  for update to authenticated
  using ((select public.punya_peran('pemilik')))
  with check ((select public.punya_peran('pemilik')));

-- ---------------------------------------------------------------------
-- Tabel transaksional: hanya SELECT; tulis lewat RPC.
-- ---------------------------------------------------------------------
create policy transaksi_baca on public.data_transaksi
  for select to authenticated
  using ((select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang')));

create policy detail_baca on public.detail_transaksi
  for select to authenticated
  using ((select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang')));

-- Pembayaran: hanya pemilik & admin loket.
create policy pembayaran_baca on public.pembayaran
  for select to authenticated
  using ((select public.punya_peran('pemilik', 'admin_loket')));

create policy riwayat_kirim_baca on public.riwayat_status_pengiriman
  for select to authenticated
  using ((select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang')));

-- Manifes: staf semua; supir hanya manifes yang ditugaskan kepadanya.
create policy manifes_baca on public.manifes
  for select to authenticated
  using (
    (select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang'))
    or (id_supir = (select auth.uid()) and (select public.punya_peran('supir')))
  );

create policy manifes_detail_baca on public.manifes_detail
  for select to authenticated
  using (
    (select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang'))
    or exists (
      select 1 from public.manifes m
      where m.id_manifes = manifes_detail.id_manifes
        and m.id_supir = (select auth.uid())
        and (select public.punya_peran('supir'))
    )
  );

create policy riwayat_armada_baca on public.riwayat_status_armada
  for select to authenticated
  using (
    (select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang'))
    or exists (
      select 1 from public.data_armada a
      where a.id_armada = riwayat_status_armada.id_armada
        and a.id_supir = (select auth.uid())
        and (select public.punya_peran('supir'))
    )
  );

create policy kendala_baca on public.kendala_perjalanan
  for select to authenticated
  using (
    (select public.punya_peran('pemilik', 'admin_loket', 'staf_gudang'))
    or (dilaporkan_oleh = (select auth.uid()) and (select public.punya_peran('supir')))
  );

-- Audit log: hanya pemilik yang membaca. Tidak ada yang menulis langsung.
create policy audit_baca on public.audit_log
  for select to authenticated
  using ((select public.punya_peran('pemilik')));

-- penghitung_resi: tanpa policy = tertutup untuk klien.
