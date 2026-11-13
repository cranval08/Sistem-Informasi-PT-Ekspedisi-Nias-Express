-- =====================================================================
-- Fungsi bantu, audit log, dan trigger invarian data.
-- Semua fungsi SECURITY DEFINER memakai search_path kosong dan nama
-- objek berkualifikasi penuh.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Identitas & peran pengguna yang sedang login
-- ---------------------------------------------------------------------

-- Peran pengguna aktif saat ini; NULL bila belum login, tidak terdaftar,
-- atau akun nonaktif (sehingga seluruh policy RLS menolak).
create or replace function public.peran_saya()
returns public.peran_pengguna
language sql
stable
security definer
set search_path = ''
as $$
  select p.peran
  from public.data_pengguna p
  where p.id_pengguna = auth.uid()
    and p.is_active
$$;

create or replace function public.punya_peran(variadic daftar public.peran_pengguna[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.peran_saya() = any (daftar), false)
$$;

-- Fungsi yang membatalkan aksi bila peran tidak sesuai (dipakai RPC).
create or replace function public.wajib_peran(variadic daftar public.peran_pengguna[])
returns public.peran_pengguna
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_peran public.peran_pengguna := public.peran_saya();
begin
  if v_peran is null then
    raise exception 'Sesi tidak valid atau akun nonaktif.' using errcode = '42501';
  end if;
  if not (v_peran = any (daftar)) then
    raise exception 'Anda tidak memiliki hak akses untuk aksi ini.' using errcode = '42501';
  end if;
  return v_peran;
end;
$$;

-- Tanggal kalender di zona waktu operasional.
create or replace function public.tanggal_operasional(ts timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (ts at time zone coalesce(
    (select s.zona_waktu from public.pengaturan s where s.id = 1), 'Asia/Jakarta'))::date
$$;

-- ---------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------
create or replace function public.catat_audit(
  p_aksi text,
  p_entitas text,
  p_entitas_id text,
  p_detail jsonb default null,
  p_alasan text default null
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (id_pengguna, aksi, entitas, entitas_id, detail_perubahan, alasan)
  values (
    (select p.id_pengguna from public.data_pengguna p where p.id_pengguna = auth.uid()),
    p_aksi, p_entitas, p_entitas_id, p_detail, p_alasan
  )
$$;

-- Trigger audit generik untuk tabel master. TG_ARGV[0] = nama kolom PK.
create or replace function public.trg_audit_perubahan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lama jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_baru jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_id   text  := coalesce(v_baru, v_lama) ->> tg_argv[0];
  v_diff jsonb;
  v_kunci text;
begin
  if tg_op = 'UPDATE' then
    v_diff := '{}'::jsonb;
    for v_kunci in select jsonb_object_keys(v_baru) loop
      if v_kunci <> 'updated_at' and (v_lama -> v_kunci) is distinct from (v_baru -> v_kunci) then
        v_diff := v_diff || jsonb_build_object(v_kunci, jsonb_build_object('lama', v_lama -> v_kunci, 'baru', v_baru -> v_kunci));
      end if;
    end loop;
    if v_diff = '{}'::jsonb then
      return new;
    end if;
  end if;

  perform public.catat_audit(
    case tg_op when 'INSERT' then 'tambah' when 'UPDATE' then 'ubah' else 'hapus' end,
    tg_table_name,
    v_id,
    case tg_op when 'INSERT' then v_baru when 'UPDATE' then v_diff else v_lama end
  );
  return coalesce(new, old);
end;
$$;

-- audit_log tidak dapat diubah atau dihapus oleh siapa pun.
create or replace function public.trg_audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit log tidak dapat diubah atau dihapus.' using errcode = '42501';
end;
$$;

create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function public.trg_audit_log_immutable();

-- ---------------------------------------------------------------------
-- Kolom yang dikelola server (waktu dibuat tetap, updated_at otomatis)
-- ---------------------------------------------------------------------
create or replace function public.trg_kolom_server()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if tg_table_name in ('data_pengguna', 'data_pelanggan', 'data_item', 'data_armada') then
      new.waktu_dibuat := now();
    end if;
  else
    if tg_table_name in ('data_pengguna', 'data_pelanggan', 'data_item', 'data_armada') then
      new.waktu_dibuat := old.waktu_dibuat;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger kolom_server before insert or update on public.data_pengguna  for each row execute function public.trg_kolom_server();
create trigger kolom_server before insert or update on public.data_pelanggan for each row execute function public.trg_kolom_server();
create trigger kolom_server before insert or update on public.data_item      for each row execute function public.trg_kolom_server();
create trigger kolom_server before insert or update on public.data_armada    for each row execute function public.trg_kolom_server();
create trigger kolom_server before insert or update on public.manifes        for each row execute function public.trg_kolom_server();

create or replace function public.trg_pengaturan_diubah()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger pengaturan_diubah before update on public.pengaturan
  for each row execute function public.trg_pengaturan_diubah();

-- ---------------------------------------------------------------------
-- Normalisasi data master
-- ---------------------------------------------------------------------

-- Normalisasi nomor telepon Indonesia ke format 08xx (hanya angka).
-- '+62 812-3456-7890' -> '081234567890'. Mengembalikan input yang sudah
-- dibersihkan; validasi panjang dilakukan constraint CHECK.
create or replace function public.normalisasi_telepon(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d is null or d = '' then d
    when d like '62%' then '0' || substr(d, 3)
    when d like '8%'  then '0' || d
    else d
  end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) s
$$;

create or replace function public.trg_normalisasi_pelanggan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nama := btrim(regexp_replace(new.nama, '\s+', ' ', 'g'));
  new.telepon := public.normalisasi_telepon(new.telepon);
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
create trigger normalisasi before insert or update on public.data_pelanggan
  for each row execute function public.trg_normalisasi_pelanggan();

create or replace function public.trg_normalisasi_pengguna()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nama_lengkap := btrim(regexp_replace(new.nama_lengkap, '\s+', ' ', 'g'));
  new.nomor_telepon := public.normalisasi_telepon(new.nomor_telepon);
  new.email := lower(btrim(new.email));
  if tg_op = 'UPDATE' then
    new.id_pengguna := old.id_pengguna;
  end if;
  return new;
end;
$$;
create trigger normalisasi before insert or update on public.data_pengguna
  for each row execute function public.trg_normalisasi_pengguna();

-- Minimal harus selalu ada satu pemilik aktif (mencegah terkunci dari sistem).
create or replace function public.trg_jaga_pemilik_terakhir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.peran = 'pemilik' and old.is_active
     and (new.peran <> 'pemilik' or not new.is_active)
     and not exists (
       select 1 from public.data_pengguna p
       where p.peran = 'pemilik' and p.is_active and p.id_pengguna <> old.id_pengguna
     ) then
    raise exception 'Harus ada minimal satu akun Pemilik yang aktif.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger jaga_pemilik_terakhir before update on public.data_pengguna
  for each row execute function public.trg_jaga_pemilik_terakhir();

create or replace function public.trg_normalisasi_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nama_item := btrim(regexp_replace(new.nama_item, '\s+', ' ', 'g'));
  return new;
end;
$$;
create trigger normalisasi before insert or update on public.data_item
  for each row execute function public.trg_normalisasi_item();

-- Plat nomor: huruf besar, spasi tunggal. Supir wajib pengguna aktif berperan supir.
-- Perubahan status armada dicatat ke riwayat_status_armada.
create or replace function public.trg_armada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.plat_nomor := upper(btrim(regexp_replace(new.plat_nomor, '\s+', ' ', 'g')));

  if new.id_supir is not null
     and (tg_op = 'INSERT' or new.id_supir is distinct from old.id_supir)
     and not exists (
       select 1 from public.data_pengguna p
       where p.id_pengguna = new.id_supir and p.peran = 'supir' and p.is_active
     ) then
    raise exception 'Supir harus berasal dari pengguna aktif dengan peran Supir.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    new.waktu_status_diubah := now();
  elsif new.status is distinct from old.status then
    new.waktu_status_diubah := now();
  else
    new.waktu_status_diubah := old.waktu_status_diubah;
  end if;
  return new;
end;
$$;
create trigger armada before insert or update on public.data_armada
  for each row execute function public.trg_armada();

create or replace function public.trg_riwayat_status_armada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.riwayat_status_armada (id_armada, status_sebelumnya, status_baru, id_pengguna, catatan)
    values (
      new.id_armada,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      (select p.id_pengguna from public.data_pengguna p where p.id_pengguna = auth.uid()),
      nullif(current_setting('app.catatan_status', true), '')
    );
  end if;
  return null;
end;
$$;
create trigger riwayat_status_armada after insert or update on public.data_armada
  for each row execute function public.trg_riwayat_status_armada();

-- ---------------------------------------------------------------------
-- Invarian transaksi
-- ---------------------------------------------------------------------
create or replace function public.urutan_status_kirim(s public.status_kirim)
returns integer
language sql
immutable
set search_path = ''
as $$
  select array_position(enum_range(null::public.status_kirim), s)
$$;

create or replace function public.trg_transaksi_sebelum()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lama integer;
  v_baru integer;
begin
  if tg_op = 'INSERT' then
    -- Waktu transaksi selalu dari server; status awal selalu Diterima Loket.
    new.waktu_transaksi := now();
    new.tanggal_transaksi := public.tanggal_operasional(new.waktu_transaksi);
    new.status_kirim := 'diterima_loket';
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  -- UPDATE: kolom identitas & waktu tidak boleh diubah.
  if new.no_resi <> old.no_resi
     or new.waktu_transaksi <> old.waktu_transaksi
     or new.tanggal_transaksi <> old.tanggal_transaksi
     or new.created_at <> old.created_at
     or new.id_pengguna <> old.id_pengguna then
    raise exception 'Nomor resi, waktu transaksi, dan pencatat tidak dapat diubah.' using errcode = '42501';
  end if;

  if old.status_void and new.status_void and new.status_kirim <> old.status_kirim then
    raise exception 'Transaksi yang dibatalkan tidak dapat diubah statusnya.' using errcode = '23514';
  end if;
  if old.status_void and not new.status_void then
    raise exception 'Pembatalan transaksi tidak dapat dibatalkan.' using errcode = '23514';
  end if;

  if new.status_kirim <> old.status_kirim then
    v_lama := public.urutan_status_kirim(old.status_kirim);
    v_baru := public.urutan_status_kirim(new.status_kirim);
    -- Maju hanya satu langkah. Mundur hanya oleh fungsi koreksi resmi
    -- (mis. pembatalan manifes sebelum berangkat) yang menyetel app.koreksi_status.
    if v_baru = v_lama + 1 then
      null;
    elsif v_baru < v_lama and current_setting('app.koreksi_status', true) = 'on' then
      null;
    else
      raise exception 'Perubahan status pengiriman tidak valid: % → %.', old.status_kirim, new.status_kirim
        using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
create trigger transaksi_sebelum before insert or update on public.data_transaksi
  for each row execute function public.trg_transaksi_sebelum();

-- Setiap perubahan status pengiriman tercatat di riwayat.
create or replace function public.trg_transaksi_riwayat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status_kirim is distinct from old.status_kirim then
    insert into public.riwayat_status_pengiriman (no_resi, status_sebelumnya, status_baru, id_pengguna, catatan)
    values (
      new.no_resi,
      case when tg_op = 'UPDATE' then old.status_kirim end,
      new.status_kirim,
      (select p.id_pengguna from public.data_pengguna p where p.id_pengguna = auth.uid()),
      nullif(current_setting('app.catatan_status', true), '')
    );
  end if;
  return null;
end;
$$;
create trigger transaksi_riwayat after insert or update on public.data_transaksi
  for each row execute function public.trg_transaksi_riwayat();

-- ---------------------------------------------------------------------
-- Invarian pembayaran: waktu dari server, tidak ada hapus, jumlah tidak
-- dapat diubah (koreksi = batalkan + catat ulang). total_dibayar pada
-- transaksi dihitung ulang dari pembayaran valid dengan row lock.
-- ---------------------------------------------------------------------
create or replace function public.trg_pembayaran_sebelum()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.waktu_bayar := now();
    new.created_at := now();
    new.status_pembayaran_record := 'valid';
    new.dibatalkan_oleh := null;
    new.dibatalkan_pada := null;
    return new;
  end if;

  if new.no_resi <> old.no_resi
     or new.jumlah_bayar <> old.jumlah_bayar
     or new.waktu_bayar <> old.waktu_bayar
     or new.id_pengguna_pencatat <> old.id_pengguna_pencatat then
    raise exception 'Data pembayaran tidak dapat diubah. Batalkan lalu catat ulang pembayaran yang benar.'
      using errcode = '42501';
  end if;
  if old.status_pembayaran_record = 'dibatalkan' then
    raise exception 'Pembayaran yang sudah dibatalkan tidak dapat diubah.' using errcode = '23514';
  end if;
  if new.status_pembayaran_record = 'dibatalkan' then
    new.dibatalkan_pada := now();
  end if;
  return new;
end;
$$;
create trigger pembayaran_sebelum before insert or update on public.pembayaran
  for each row execute function public.trg_pembayaran_sebelum();

create or replace function public.trg_tolak_hapus()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Data % tidak dapat dihapus permanen. Gunakan pembatalan dengan alasan.', tg_table_name
    using errcode = '42501';
end;
$$;
create trigger tolak_hapus before delete on public.pembayaran       for each row execute function public.trg_tolak_hapus();
create trigger tolak_hapus before delete on public.data_transaksi   for each row execute function public.trg_tolak_hapus();
create trigger tolak_hapus before delete on public.detail_transaksi for each row execute function public.trg_tolak_hapus();
create trigger tolak_hapus before delete on public.riwayat_status_pengiriman for each row execute function public.trg_tolak_hapus();

create or replace function public.trg_pembayaran_rekap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Kunci baris transaksi dulu, lalu hitung ulang pada snapshot baru
  -- agar pembayaran bersamaan tidak lolos melebihi total biaya.
  perform 1 from public.data_transaksi t where t.no_resi = new.no_resi for update;

  update public.data_transaksi t
     set total_dibayar = (
       select coalesce(sum(b.jumlah_bayar), 0)
       from public.pembayaran b
       where b.no_resi = new.no_resi and b.status_pembayaran_record = 'valid'
     )
   where t.no_resi = new.no_resi;
  return null;
exception
  when check_violation then
    raise exception 'Total pembayaran melebihi total biaya transaksi.' using errcode = '23514';
end;
$$;
create trigger pembayaran_rekap after insert or update on public.pembayaran
  for each row execute function public.trg_pembayaran_rekap();

-- ---------------------------------------------------------------------
-- Invarian manifes: armada harus aktif & berstatus Siaga saat manifes
-- dibuat; supir harus pengguna aktif berperan supir.
-- ---------------------------------------------------------------------
create or replace function public.trg_manifes_baru()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_armada public.data_armada;
begin
  select * into v_armada from public.data_armada a where a.id_armada = new.id_armada;
  if not found or not v_armada.is_active then
    raise exception 'Armada tidak ditemukan atau nonaktif.' using errcode = '23514';
  end if;
  if v_armada.status in ('perbaikan', 'rusak') then
    raise exception 'Armada berstatus % tidak dapat dipilih untuk manifes baru.', v_armada.status using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.data_pengguna p
    where p.id_pengguna = new.id_supir and p.peran = 'supir' and p.is_active
  ) then
    raise exception 'Supir harus berasal dari pengguna aktif dengan peran Supir.' using errcode = '23514';
  end if;
  new.waktu_dibuat := now();
  new.status_manifes := 'draft';
  return new;
end;
$$;
create trigger manifes_baru before insert on public.manifes
  for each row execute function public.trg_manifes_baru();

-- ---------------------------------------------------------------------
-- Pasang audit pada tabel master
-- ---------------------------------------------------------------------
create trigger audit after insert or update or delete on public.data_pengguna  for each row execute function public.trg_audit_perubahan('id_pengguna');
create trigger audit after insert or update or delete on public.data_pelanggan for each row execute function public.trg_audit_perubahan('id_pelanggan');
create trigger audit after insert or update or delete on public.data_item      for each row execute function public.trg_audit_perubahan('id_item');
create trigger audit after insert or update or delete on public.data_armada    for each row execute function public.trg_audit_perubahan('id_armada');
create trigger audit after update on public.pengaturan                          for each row execute function public.trg_audit_perubahan('id');
