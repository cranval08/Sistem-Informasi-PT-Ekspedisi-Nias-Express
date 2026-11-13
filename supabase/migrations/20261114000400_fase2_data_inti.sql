-- =====================================================================
-- Fase 2 — Data inti: pelanggan, master item & tarif, armada, pengguna,
-- pengaturan. Aturan tambahan & RPC yang dibutuhkan UI Fase 2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pengguna: tidak boleh menonaktifkan atau mengubah peran akunnya
-- sendiri; supir yang masih ditugaskan ke armada aktif tidak boleh
-- dinonaktifkan atau dipindah peran (lepaskan dari armada dulu).
-- ---------------------------------------------------------------------
create or replace function public.trg_jaga_akun_pengguna()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plat text;
begin
  if old.id_pengguna = auth.uid() then
    if old.is_active and not new.is_active then
      raise exception 'Anda tidak dapat menonaktifkan akun Anda sendiri.' using errcode = '42501';
    end if;
    if new.peran is distinct from old.peran then
      raise exception 'Anda tidak dapat mengubah peran akun Anda sendiri.' using errcode = '42501';
    end if;
  end if;

  if old.peran = 'supir' and old.is_active
     and (new.peran <> 'supir' or not new.is_active) then
    select a.plat_nomor into v_plat
    from public.data_armada a
    where a.id_supir = old.id_pengguna and a.is_active
    limit 1;
    if v_plat is not null then
      raise exception 'Supir ini masih ditugaskan ke armada %. Lepaskan atau ganti supir armada tersebut terlebih dahulu.', v_plat
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger jaga_akun_pengguna before update on public.data_pengguna
  for each row execute function public.trg_jaga_akun_pengguna();

-- ---------------------------------------------------------------------
-- daftarkan_pengguna — dipanggil server action Pemilik SETELAH akun Auth
-- dibuat dengan secret key. Dijalankan dengan sesi Pemilik sehingga
-- audit log mencatat siapa yang membuat akun.
-- ---------------------------------------------------------------------
create or replace function public.daftarkan_pengguna(
  p_id uuid,
  p_nama_lengkap text,
  p_peran public.peran_pengguna,
  p_nomor_telepon text,
  p_email text
) returns public.data_pengguna
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_baris public.data_pengguna;
begin
  perform public.wajib_peran('pemilik');

  if not exists (select 1 from auth.users u where u.id = p_id and lower(u.email) = v_email) then
    raise exception 'Akun autentikasi tidak ditemukan atau email tidak cocok.' using errcode = '23514';
  end if;
  if exists (select 1 from public.data_pengguna p where p.id_pengguna = p_id) then
    raise exception 'Akun ini sudah terdaftar sebagai pengguna.' using errcode = '23505';
  end if;

  insert into public.data_pengguna (id_pengguna, nama_lengkap, peran, nomor_telepon, email, is_active)
  values (p_id, p_nama_lengkap, p_peran, p_nomor_telepon, v_email, true)
  returning * into v_baris;
  -- Audit "tambah" dicatat oleh trigger audit pada data_pengguna.
  return v_baris;
end;
$$;

-- Catat aksi akun yang terjadi di Supabase Auth (bukan di tabel public),
-- mis. reset password oleh Pemilik. Nilai password tidak pernah dicatat.
create or replace function public.catat_aksi_akun(p_id uuid, p_aksi text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wajib_peran('pemilik');
  if p_aksi not in ('atur_ulang_password') then
    raise exception 'Aksi akun tidak dikenal.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.data_pengguna p where p.id_pengguna = p_id) then
    raise exception 'Pengguna tidak ditemukan.' using errcode = '23514';
  end if;
  perform public.catat_audit(p_aksi, 'data_pengguna', p_id::text, null, null);
end;
$$;

-- ---------------------------------------------------------------------
-- Status armada dengan catatan. Status "perjalanan" hanya diatur oleh
-- alur manifes (Fase 5), bukan diubah manual.
-- ---------------------------------------------------------------------
create or replace function public.ubah_status_armada(
  p_id_armada uuid,
  p_status public.status_armada,
  p_catatan text default null
) returns public.data_armada
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_armada public.data_armada;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  perform public.wajib_peran('pemilik');

  select * into v_armada from public.data_armada a where a.id_armada = p_id_armada for update;
  if not found then
    raise exception 'Armada tidak ditemukan.' using errcode = '23514';
  end if;
  if p_status = 'perjalanan' then
    raise exception 'Status Perjalanan diatur otomatis dari manifes, tidak dapat diubah manual.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.manifes m
    where m.id_armada = p_id_armada and m.status_manifes in ('draft', 'dimuat', 'berangkat')
  ) then
    raise exception 'Armada sedang memiliki manifes aktif. Selesaikan atau batalkan manifes terlebih dahulu.' using errcode = '23514';
  end if;
  if v_armada.status = p_status then
    raise exception 'Status armada sudah %.', p_status using errcode = '23514';
  end if;
  if p_status in ('perbaikan', 'rusak') and v_catatan is null then
    raise exception 'Catatan wajib diisi saat armada ditandai perbaikan atau rusak.' using errcode = '23514';
  end if;

  perform set_config('app.catatan_status', coalesce(v_catatan, ''), true);
  update public.data_armada a set status = p_status where a.id_armada = p_id_armada
  returning * into v_armada;
  perform set_config('app.catatan_status', '', true);
  return v_armada;
end;
$$;

-- Armada yang masih memiliki manifes aktif tidak boleh dinonaktifkan.
create or replace function public.trg_jaga_armada_aktif()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_active and not new.is_active and exists (
    select 1 from public.manifes m
    where m.id_armada = old.id_armada and m.status_manifes in ('draft', 'dimuat', 'berangkat')
  ) then
    raise exception 'Armada masih memiliki manifes aktif dan tidak dapat dinonaktifkan.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger jaga_armada_aktif before update on public.data_armada
  for each row execute function public.trg_jaga_armada_aktif();

-- Status armada hanya berubah lewat ubah_status_armada (agar aturan &
-- catatan riwayat selalu berlaku); kolom lain tetap boleh diubah Pemilik
-- sesuai policy RLS.
revoke update on public.data_armada from authenticated;
grant update (plat_nomor, jenis_unit, kapasitas_ton, id_supir, is_active, catatan) on public.data_armada to authenticated;

-- ---------------------------------------------------------------------
-- Grant
-- ---------------------------------------------------------------------
revoke execute on function public.daftarkan_pengguna(uuid, text, public.peran_pengguna, text, text) from public, anon;
revoke execute on function public.catat_aksi_akun(uuid, text) from public, anon;
revoke execute on function public.ubah_status_armada(uuid, public.status_armada, text) from public, anon;
grant execute on function public.daftarkan_pengguna(uuid, text, public.peran_pengguna, text, text) to authenticated;
grant execute on function public.catat_aksi_akun(uuid, text) to authenticated;
grant execute on function public.ubah_status_armada(uuid, public.status_armada, text) to authenticated;
revoke execute on function public.trg_jaga_akun_pengguna() from public, anon, authenticated;
revoke execute on function public.trg_jaga_armada_aktif() from public, anon, authenticated;
