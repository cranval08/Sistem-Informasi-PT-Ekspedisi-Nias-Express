-- =====================================================================
-- Fase 5 — Operasional logistik: manifes, tonase & kapasitas, status
-- pengiriman, pengambilan, kendala perjalanan, data Supir, dan pelacakan
-- publik. PRD §7.10–§7.13, §11 langkah 9–20, §15 "Armada dan manifes" &
-- "Pengiriman".
--
-- Tabel manifes/manifes_detail/kendala tetap SELECT-only bagi klien;
-- semua penulisan lewat fungsi di bawah. Urutan status pengiriman tetap
-- dijaga trigger Fase 1 (maju satu langkah; mundur hanya dengan
-- app.koreksi_status = 'on') dan setiap perubahan tercatat di riwayat.
--
-- Aturan kapasitas:
--  * Muatan = Σ total_berat_kg resi aktif di manifes; kapasitas =
--    kapasitas_ton armada × 1000 (kg). Muatan = kapasitas boleh diproses;
--    muatan > kapasitas memblokir konfirmasi muat & keberangkatan.
--  * Override hanya Pemilik, hanya bila pengaturan mengizinkan, wajib
--    alasan, tercatat di audit log.
--  * Ambang peringatan (%) dari pengaturan hanya untuk tampilan; NULL =
--    belum diatur. Tidak ada nilai default karangan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Pengaturan: pelacakan publik (PRD §7.12 "jika diaktifkan"). Default
-- nonaktif — Pemilik yang memutuskan halaman ini dibuka untuk umum.
-- ---------------------------------------------------------------------
alter table public.pengaturan add column pelacakan_publik_aktif boolean not null default false;

-- Supir hanya boleh berada di satu perjalanan aktif (sama seperti armada).
create unique index manifes_satu_aktif_per_supir on public.manifes (id_supir)
  where status_manifes in ('draft', 'dimuat', 'berangkat');

-- Supir yang masih memiliki perjalanan aktif tidak boleh dinonaktifkan
-- atau dipindah peran (melengkapi pemeriksaan penugasan armada Fase 2).
create or replace function public.trg_jaga_supir_manifes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.peran = 'supir' and old.is_active
     and (new.peran <> 'supir' or not new.is_active)
     and exists (
       select 1 from public.manifes m
       where m.id_supir = old.id_pengguna and m.status_manifes in ('draft', 'dimuat', 'berangkat')
     ) then
    raise exception 'Supir ini masih memiliki perjalanan aktif. Selesaikan atau batalkan manifesnya terlebih dahulu.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger jaga_supir_manifes before update on public.data_pengguna
  for each row execute function public.trg_jaga_supir_manifes();
revoke execute on function public.trg_jaga_supir_manifes() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Helper internal
-- ---------------------------------------------------------------------

-- Total berat (kg) resi aktif pada manifes.
create or replace function public.muatan_manifes_kg(p_id_manifes uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(t.total_berat_kg), 0)
  from public.manifes_detail md
  join public.data_transaksi t on t.no_resi = md.no_resi
  where md.id_manifes = p_id_manifes and md.aktif
$$;

-- Label status untuk pesan galat (enum → teks Indonesia).
create or replace function public.label_status_kirim(s public.status_kirim)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'diterima_loket' then 'Diterima Loket'
    when 'dimuat' then 'Dimuat'
    when 'dalam_perjalanan' then 'Dalam Perjalanan'
    when 'tiba' then 'Tiba'
    when 'sudah_diambil' then 'Sudah Diambil'
  end
$$;

create or replace function public.label_status_manifes(s public.status_manifes)
returns text
language sql
immutable
set search_path = ''
as $$
  select case s
    when 'draft' then 'Draf'
    when 'dimuat' then 'Dimuat'
    when 'berangkat' then 'Berangkat'
    when 'tiba' then 'Tiba'
    when 'dibatalkan' then 'Dibatalkan'
  end
$$;

-- Format kg Indonesia untuk pesan ("1.234,5 kg").
create or replace function public.format_kg(n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(
    rtrim(rtrim(to_char(n, 'FM999,999,999,990.000'), '0'), '.'),
    ',', '#'), '.', ','), '#', '.') || ' kg'
$$;

-- Resi boleh dimuat bila: ada, tidak dibatalkan, masih Diterima Loket,
-- dan lunas atau memiliki override belum lunas resmi. Melempar galat
-- dengan pesan yang dapat ditindaklanjuti.
create or replace function public.periksa_resi_bisa_dimuat(t public.data_transaksi)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if t.status_void then
    raise exception 'Resi % sudah dibatalkan dan tidak dapat dimuat.', t.no_resi using errcode = '23514';
  end if;
  if t.status_kirim <> 'diterima_loket' then
    raise exception 'Resi % berstatus % dan tidak dapat dimuat ke manifes.', t.no_resi, public.label_status_kirim(t.status_kirim)
      using errcode = '23514';
  end if;
  if t.status_bayar <> 'lunas' and not t.override_belum_lunas then
    raise exception 'Resi % belum lunas. Barang belum lunas tidak dapat dimuat kecuali ada override resmi dari Pemilik.', t.no_resi
      using errcode = '23514';
  end if;
end;
$$;

-- Kunci manifes untuk diubah; Supir hanya manifes yang ditugaskan kepadanya.
create or replace function public.kunci_manifes(p_id_manifes uuid, p_peran public.peran_pengguna)
returns public.manifes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.manifes;
begin
  select * into v_m from public.manifes m where m.id_manifes = p_id_manifes for update;
  if not found or (p_peran = 'supir' and v_m.id_supir is distinct from auth.uid()) then
    raise exception 'Manifes tidak ditemukan atau tidak ditugaskan kepada Anda.' using errcode = '23514';
  end if;
  return v_m;
end;
$$;

-- ---------------------------------------------------------------------
-- buat_manifes — Pemilik & Staf Gudang. Armada aktif & Siaga tanpa
-- perjalanan aktif; supir aktif tanpa perjalanan aktif. Rute teks bebas.
-- ---------------------------------------------------------------------
create or replace function public.buat_manifes(
  p_id_armada uuid,
  p_id_supir uuid,
  p_rute text,
  p_catatan text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rute text := btrim(regexp_replace(coalesce(p_rute, ''), '\s+', ' ', 'g'));
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_armada public.data_armada;
  v_supir public.data_pengguna;
  v_plat_lain text;
  v_id uuid;
begin
  perform public.wajib_peran('pemilik', 'staf_gudang');

  if v_rute = '' then
    raise exception 'Rute wajib diisi.' using errcode = '23514';
  end if;
  if length(v_rute) > 200 then
    raise exception 'Rute maksimal 200 karakter.' using errcode = '23514';
  end if;
  if v_catatan is not null and length(v_catatan) > 500 then
    raise exception 'Catatan maksimal 500 karakter.' using errcode = '23514';
  end if;

  select * into v_armada from public.data_armada a where a.id_armada = p_id_armada for update;
  if not found or not v_armada.is_active then
    raise exception 'Armada tidak ditemukan atau nonaktif.' using errcode = '23514';
  end if;
  if v_armada.status in ('perbaikan', 'rusak') then
    raise exception 'Armada % berstatus % dan tidak dapat dipilih untuk manifes baru.', v_armada.plat_nomor, initcap(v_armada.status::text)
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.manifes m
    where m.id_armada = p_id_armada and m.status_manifes in ('draft', 'dimuat', 'berangkat')
  ) then
    raise exception 'Armada % masih memiliki perjalanan aktif. Selesaikan atau batalkan manifes tersebut terlebih dahulu.', v_armada.plat_nomor
      using errcode = '23514';
  end if;

  if p_id_supir is null then
    raise exception 'Supir wajib dipilih.' using errcode = '23514';
  end if;
  select * into v_supir from public.data_pengguna p where p.id_pengguna = p_id_supir for update;
  if not found or v_supir.peran <> 'supir' or not v_supir.is_active then
    raise exception 'Supir harus berasal dari pengguna aktif dengan peran Supir.' using errcode = '23514';
  end if;
  select a.plat_nomor into v_plat_lain
  from public.manifes m join public.data_armada a on a.id_armada = m.id_armada
  where m.id_supir = p_id_supir and m.status_manifes in ('draft', 'dimuat', 'berangkat')
  limit 1;
  if v_plat_lain is not null then
    raise exception 'Supir % sedang ditugaskan pada perjalanan aktif dengan armada %.', v_supir.nama_lengkap, v_plat_lain
      using errcode = '23514';
  end if;

  insert into public.manifes (id_armada, id_supir, rute, created_by, catatan)
  values (p_id_armada, p_id_supir, v_rute, auth.uid(), v_catatan)
  returning id_manifes into v_id;

  perform public.catat_audit('buat_manifes', 'manifes', v_id::text,
    jsonb_build_object('plat_nomor', v_armada.plat_nomor, 'kapasitas_ton', v_armada.kapasitas_ton,
                       'supir', v_supir.nama_lengkap, 'rute', v_rute));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- tambah_resi_manifes — hanya saat Draf. Melebihi kapasitas boleh di
-- tahap draf (ditampilkan sebagai peringatan); yang diblokir adalah
-- konfirmasi muat & keberangkatan.
-- ---------------------------------------------------------------------
create or replace function public.tambah_resi_manifes(p_id_manifes uuid, p_daftar_resi text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.manifes;
  v_t public.data_transaksi;
  v_daftar text[];
  v_resi text;
begin
  perform public.wajib_peran('pemilik', 'staf_gudang');
  v_m := public.kunci_manifes(p_id_manifes, 'staf_gudang');
  if v_m.status_manifes <> 'draft' then
    raise exception 'Resi hanya dapat ditambahkan saat manifes berstatus Draf (status sekarang %).', public.label_status_manifes(v_m.status_manifes)
      using errcode = '23514';
  end if;

  select array_agg(distinct upper(btrim(x))) into v_daftar
  from unnest(coalesce(p_daftar_resi, '{}'::text[])) x
  where btrim(x) <> '';
  if v_daftar is null then
    raise exception 'Pilih minimal satu resi.' using errcode = '23514';
  end if;
  if cardinality(v_daftar) > 200 then
    raise exception 'Maksimal 200 resi per penambahan.' using errcode = '23514';
  end if;

  foreach v_resi in array v_daftar loop
    select * into v_t from public.data_transaksi t where t.no_resi = v_resi for update;
    if not found then
      raise exception 'Resi % tidak ditemukan.', v_resi using errcode = '23514';
    end if;
    perform public.periksa_resi_bisa_dimuat(v_t);
    if exists (
      select 1 from public.manifes_detail md
      where md.no_resi = v_resi and md.aktif and md.id_manifes <> p_id_manifes
    ) then
      raise exception 'Resi % sudah tercantum di manifes aktif lain.', v_resi using errcode = '23514';
    end if;

    insert into public.manifes_detail as md (id_manifes, no_resi, ditambahkan_oleh)
    values (p_id_manifes, v_resi, auth.uid())
    on conflict (id_manifes, no_resi) do update
      set aktif = true, ditambahkan_oleh = excluded.ditambahkan_oleh, ditambahkan_pada = now(), dilepas_pada = null
      where not md.aktif;
  end loop;

  perform public.catat_audit('tambah_resi_manifes', 'manifes', p_id_manifes::text,
    jsonb_build_object('resi', to_jsonb(v_daftar), 'muatan_kg', public.muatan_manifes_kg(p_id_manifes)));
  return cardinality(v_daftar);
end;
$$;

-- lepas_resi_manifes — hanya saat Draf (setelah muat gunakan pindahkan_resi).
create or replace function public.lepas_resi_manifes(p_id_manifes uuid, p_no_resi text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.manifes;
begin
  perform public.wajib_peran('pemilik', 'staf_gudang');
  v_m := public.kunci_manifes(p_id_manifes, 'staf_gudang');
  if v_m.status_manifes <> 'draft' then
    raise exception 'Resi hanya dapat dilepas saat manifes berstatus Draf. Gunakan Pindahkan untuk manifes yang sudah dimuat.'
      using errcode = '23514';
  end if;
  update public.manifes_detail md
     set aktif = false, dilepas_pada = now()
   where md.id_manifes = p_id_manifes and md.no_resi = upper(btrim(p_no_resi)) and md.aktif;
  if not found then
    raise exception 'Resi tidak tercantum di manifes ini.' using errcode = '23514';
  end if;
  perform public.catat_audit('lepas_resi_manifes', 'manifes', p_id_manifes::text,
    jsonb_build_object('no_resi', upper(btrim(p_no_resi)), 'muatan_kg', public.muatan_manifes_kg(p_id_manifes)));
end;
$$;

-- ---------------------------------------------------------------------
-- Pemeriksaan kapasitas bersama untuk muat & berangkat. Mengembalikan
-- true bila muatan melebihi kapasitas.
-- ---------------------------------------------------------------------
create or replace function public.muatan_melebihi_kapasitas(p_id_manifes uuid, p_id_armada uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.muatan_manifes_kg(p_id_manifes) > a.kapasitas_ton * 1000
  from public.data_armada a where a.id_armada = p_id_armada
$$;

-- ---------------------------------------------------------------------
-- konfirmasi_muat — Draf → Dimuat. Semua resi → Dimuat. Diblokir bila
-- muatan > kapasitas kecuali override Pemilik yang diizinkan pengaturan.
-- ---------------------------------------------------------------------
create or replace function public.konfirmasi_muat(p_id_manifes uuid, p_alasan_override text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peran public.peran_pengguna;
  v_m public.manifes;
  v_armada public.data_armada;
  v_t public.data_transaksi;
  v_jumlah integer;
  v_muatan numeric;
  v_kapasitas numeric;
  v_alasan text := nullif(btrim(coalesce(p_alasan_override, '')), '');
  v_override boolean := false;
begin
  v_peran := public.wajib_peran('pemilik', 'staf_gudang');
  v_m := public.kunci_manifes(p_id_manifes, v_peran);
  if v_m.status_manifes <> 'draft' then
    raise exception 'Konfirmasi muat hanya untuk manifes berstatus Draf (status sekarang %).', public.label_status_manifes(v_m.status_manifes)
      using errcode = '23514';
  end if;
  select * into v_armada from public.data_armada a where a.id_armada = v_m.id_armada for update;

  -- Kunci & periksa ulang setiap resi (pembayaran bisa dibatalkan setelah resi ditambahkan).
  v_jumlah := 0;
  for v_t in
    select t.* from public.data_transaksi t
    join public.manifes_detail md on md.no_resi = t.no_resi and md.aktif
    where md.id_manifes = p_id_manifes
    order by t.no_resi
    for update of t
  loop
    perform public.periksa_resi_bisa_dimuat(v_t);
    v_jumlah := v_jumlah + 1;
  end loop;
  if v_jumlah = 0 then
    raise exception 'Manifes belum memiliki resi. Tambahkan minimal satu resi sebelum konfirmasi muat.' using errcode = '23514';
  end if;

  v_muatan := public.muatan_manifes_kg(p_id_manifes);
  v_kapasitas := v_armada.kapasitas_ton * 1000;
  if v_muatan > v_kapasitas then
    if v_alasan is null then
      raise exception 'Total muatan % melebihi kapasitas armada % (%). Konfirmasi muat diblokir.',
        public.format_kg(v_muatan), v_armada.plat_nomor, public.format_kg(v_kapasitas) using errcode = '23514';
    end if;
    if v_peran <> 'pemilik' then
      raise exception 'Muatan melebihi kapasitas. Hanya Pemilik yang dapat melakukan override.' using errcode = '42501';
    end if;
    if not coalesce((select s.izinkan_override_kapasitas from public.pengaturan s where s.id = 1), false) then
      raise exception 'Kebijakan perusahaan tidak mengizinkan override kapasitas. Kurangi muatan atau pindahkan resi ke armada lain.'
        using errcode = '23514';
    end if;
    if length(v_alasan) > 300 then
      raise exception 'Alasan override maksimal 300 karakter.' using errcode = '23514';
    end if;
    v_override := true;
  end if;

  update public.manifes m
     set status_manifes = 'dimuat', waktu_dimuat = now(),
         override_kapasitas = v_override,
         override_kapasitas_alasan = case when v_override then v_alasan end,
         override_kapasitas_oleh = case when v_override then auth.uid() end
   where m.id_manifes = p_id_manifes;

  perform set_config('app.catatan_status', 'Dimuat ke armada ' || v_armada.plat_nomor, true);
  update public.data_transaksi t
     set status_kirim = 'dimuat', id_armada = v_m.id_armada
   where t.no_resi in (select md.no_resi from public.manifes_detail md where md.id_manifes = p_id_manifes and md.aktif);
  perform set_config('app.catatan_status', '', true);

  if v_override then
    perform public.catat_audit('override_kapasitas', 'manifes', p_id_manifes::text,
      jsonb_build_object('plat_nomor', v_armada.plat_nomor, 'muatan_kg', v_muatan, 'kapasitas_kg', v_kapasitas), v_alasan);
  end if;
  perform public.catat_audit('konfirmasi_muat', 'manifes', p_id_manifes::text,
    jsonb_build_object('plat_nomor', v_armada.plat_nomor, 'jumlah_resi', v_jumlah, 'muatan_kg', v_muatan,
                       'kapasitas_kg', v_kapasitas, 'override_kapasitas', v_override));
end;
$$;

-- ---------------------------------------------------------------------
-- konfirmasi_berangkat — Dimuat → Berangkat. Resi → Dalam Perjalanan;
-- armada → Perjalanan. Supir hanya untuk manifes miliknya. Kapasitas
-- diperiksa ulang (kapasitas armada dapat diubah setelah muat).
-- ---------------------------------------------------------------------
create or replace function public.konfirmasi_berangkat(p_id_manifes uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peran public.peran_pengguna;
  v_m public.manifes;
  v_armada public.data_armada;
  v_jumlah integer;
begin
  v_peran := public.wajib_peran('pemilik', 'staf_gudang', 'supir');
  v_m := public.kunci_manifes(p_id_manifes, v_peran);
  if v_m.status_manifes <> 'dimuat' then
    raise exception 'Keberangkatan hanya dapat dikonfirmasi setelah muat dikonfirmasi (status sekarang %).', public.label_status_manifes(v_m.status_manifes)
      using errcode = '23514';
  end if;
  select * into v_armada from public.data_armada a where a.id_armada = v_m.id_armada for update;
  if v_armada.status <> 'siaga' or not v_armada.is_active then
    raise exception 'Armada % berstatus % dan tidak dapat diberangkatkan.', v_armada.plat_nomor, initcap(v_armada.status::text)
      using errcode = '23514';
  end if;
  select count(*) into v_jumlah from public.manifes_detail md where md.id_manifes = p_id_manifes and md.aktif;
  if v_jumlah = 0 then
    raise exception 'Manifes tidak memiliki resi. Batalkan manifes ini bila perjalanan tidak jadi dilakukan.' using errcode = '23514';
  end if;
  if public.muatan_melebihi_kapasitas(p_id_manifes, v_m.id_armada) and not v_m.override_kapasitas then
    raise exception 'Total muatan melebihi kapasitas armada %. Keberangkatan diblokir.', v_armada.plat_nomor using errcode = '23514';
  end if;

  update public.manifes m set status_manifes = 'berangkat', waktu_berangkat = now() where m.id_manifes = p_id_manifes;

  perform set_config('app.catatan_status', 'Berangkat dengan armada ' || v_armada.plat_nomor || ' — ' || v_m.rute, true);
  update public.data_transaksi t
     set status_kirim = 'dalam_perjalanan'
   where t.no_resi in (select md.no_resi from public.manifes_detail md where md.id_manifes = p_id_manifes and md.aktif);
  update public.data_armada a set status = 'perjalanan' where a.id_armada = v_m.id_armada;
  perform set_config('app.catatan_status', '', true);

  perform public.catat_audit('konfirmasi_berangkat', 'manifes', p_id_manifes::text,
    jsonb_build_object('plat_nomor', v_armada.plat_nomor, 'jumlah_resi', v_jumlah, 'rute', v_m.rute));
end;
$$;

-- ---------------------------------------------------------------------
-- konfirmasi_tiba — Berangkat → Tiba. Resi → Tiba; armada → Siaga.
-- ---------------------------------------------------------------------
create or replace function public.konfirmasi_tiba(p_id_manifes uuid, p_catatan text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peran public.peran_pengguna;
  v_m public.manifes;
  v_plat text;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  v_peran := public.wajib_peran('pemilik', 'staf_gudang', 'supir');
  v_m := public.kunci_manifes(p_id_manifes, v_peran);
  if v_m.status_manifes <> 'berangkat' then
    raise exception 'Kedatangan hanya dapat dikonfirmasi untuk manifes yang sudah berangkat (status sekarang %).', public.label_status_manifes(v_m.status_manifes)
      using errcode = '23514';
  end if;
  if v_catatan is not null and length(v_catatan) > 300 then
    raise exception 'Catatan maksimal 300 karakter.' using errcode = '23514';
  end if;
  select a.plat_nomor into v_plat from public.data_armada a where a.id_armada = v_m.id_armada for update;

  update public.manifes m set status_manifes = 'tiba', waktu_tiba = now() where m.id_manifes = p_id_manifes;

  perform set_config('app.catatan_status', coalesce(v_catatan, 'Tiba di tujuan dengan armada ' || v_plat), true);
  update public.data_transaksi t
     set status_kirim = 'tiba'
   where t.no_resi in (select md.no_resi from public.manifes_detail md where md.id_manifes = p_id_manifes and md.aktif)
     and t.status_kirim = 'dalam_perjalanan';
  perform set_config('app.catatan_status', 'Perjalanan selesai — ' || v_m.rute, true);
  update public.data_armada a set status = 'siaga' where a.id_armada = v_m.id_armada;
  perform set_config('app.catatan_status', '', true);

  perform public.catat_audit('konfirmasi_tiba', 'manifes', p_id_manifes::text,
    jsonb_build_object('plat_nomor', v_plat, 'rute', v_m.rute), v_catatan);
end;
$$;

-- ---------------------------------------------------------------------
-- pindahkan_resi — pindah ke manifes Draf lain (mis. armada cadangan)
-- sebelum berangkat. Bila sudah Dimuat, status resi dikoreksi mundur ke
-- Diterima Loket (tercatat di riwayat dengan alasan).
-- ---------------------------------------------------------------------
create or replace function public.pindahkan_resi(p_no_resi text, p_id_manifes_tujuan uuid, p_alasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resi text := upper(btrim(coalesce(p_no_resi, '')));
  v_alasan text := nullif(btrim(coalesce(p_alasan, '')), '');
  v_id_asal uuid;
  v_asal public.manifes;
  v_tujuan public.manifes;
  v_t public.data_transaksi;
  v_plat_tujuan text;
begin
  perform public.wajib_peran('pemilik', 'staf_gudang');
  if v_alasan is null then
    raise exception 'Alasan pemindahan wajib diisi.' using errcode = '23514';
  end if;
  if length(v_alasan) > 300 then
    raise exception 'Alasan maksimal 300 karakter.' using errcode = '23514';
  end if;

  select md.id_manifes into v_id_asal from public.manifes_detail md where md.no_resi = v_resi and md.aktif;
  if v_id_asal is null then
    raise exception 'Resi % tidak tercantum di manifes aktif mana pun.', v_resi using errcode = '23514';
  end if;
  if v_id_asal = p_id_manifes_tujuan then
    raise exception 'Manifes tujuan sama dengan manifes asal.' using errcode = '23514';
  end if;

  -- Kunci kedua manifes dengan urutan tetap agar tidak saling menunggu.
  perform 1 from public.manifes m where m.id_manifes in (v_id_asal, p_id_manifes_tujuan) order by m.id_manifes for update;
  select * into v_asal from public.manifes m where m.id_manifes = v_id_asal;
  select * into v_tujuan from public.manifes m where m.id_manifes = p_id_manifes_tujuan;
  if v_tujuan.id_manifes is null then
    raise exception 'Manifes tujuan tidak ditemukan.' using errcode = '23514';
  end if;
  if v_asal.status_manifes not in ('draft', 'dimuat') then
    raise exception 'Resi pada manifes berstatus % tidak dapat dipindahkan.', public.label_status_manifes(v_asal.status_manifes)
      using errcode = '23514';
  end if;
  if v_tujuan.status_manifes <> 'draft' then
    raise exception 'Manifes tujuan harus berstatus Draf.' using errcode = '23514';
  end if;

  -- Aturan pemuatan yang sama dengan penambahan resi (status Dimuat masih sah di sini).
  select * into v_t from public.data_transaksi t where t.no_resi = v_resi for update;
  if v_t.status_void then
    raise exception 'Resi % sudah dibatalkan dan tidak dapat dimuat.', v_resi using errcode = '23514';
  end if;
  if v_t.status_bayar <> 'lunas' and not v_t.override_belum_lunas then
    raise exception 'Resi % belum lunas. Barang belum lunas tidak dapat dimuat kecuali ada override resmi dari Pemilik.', v_resi
      using errcode = '23514';
  end if;

  update public.manifes_detail md
     set aktif = false, dilepas_pada = now()
   where md.id_manifes = v_id_asal and md.no_resi = v_resi and md.aktif;

  select a.plat_nomor into v_plat_tujuan from public.data_armada a where a.id_armada = v_tujuan.id_armada;
  if v_t.status_kirim = 'dimuat' then
    perform set_config('app.koreksi_status', 'on', true);
    perform set_config('app.catatan_status', 'Dipindahkan ke manifes armada ' || v_plat_tujuan || ': ' || v_alasan, true);
    update public.data_transaksi t set status_kirim = 'diterima_loket', id_armada = null where t.no_resi = v_resi;
    perform set_config('app.koreksi_status', '', true);
    perform set_config('app.catatan_status', '', true);
  end if;

  insert into public.manifes_detail as md (id_manifes, no_resi, ditambahkan_oleh)
  values (p_id_manifes_tujuan, v_resi, auth.uid())
  on conflict (id_manifes, no_resi) do update
    set aktif = true, ditambahkan_oleh = excluded.ditambahkan_oleh, ditambahkan_pada = now(), dilepas_pada = null;

  perform public.catat_audit('pindahkan_resi', 'data_transaksi', v_resi,
    jsonb_build_object('dari_manifes', v_id_asal, 'ke_manifes', p_id_manifes_tujuan, 'ke_armada', v_plat_tujuan,
                       'status_asal', v_asal.status_manifes), v_alasan);
end;
$$;

-- ---------------------------------------------------------------------
-- batalkan_manifes — hanya sebelum berangkat; alasan wajib. Resi yang
-- sudah Dimuat dikoreksi mundur ke Diterima Loket.
-- ---------------------------------------------------------------------
create or replace function public.batalkan_manifes(p_id_manifes uuid, p_alasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.manifes;
  v_alasan text := nullif(btrim(coalesce(p_alasan, '')), '');
  v_resi text[];
begin
  perform public.wajib_peran('pemilik', 'staf_gudang');
  if v_alasan is null then
    raise exception 'Alasan pembatalan manifes wajib diisi.' using errcode = '23514';
  end if;
  if length(v_alasan) > 300 then
    raise exception 'Alasan maksimal 300 karakter.' using errcode = '23514';
  end if;
  v_m := public.kunci_manifes(p_id_manifes, 'staf_gudang');
  if v_m.status_manifes not in ('draft', 'dimuat') then
    raise exception 'Manifes berstatus % tidak dapat dibatalkan.', public.label_status_manifes(v_m.status_manifes) using errcode = '23514';
  end if;

  select array_agg(md.no_resi order by md.no_resi) into v_resi
  from public.manifes_detail md where md.id_manifes = p_id_manifes and md.aktif;

  if v_m.status_manifes = 'dimuat' then
    perform set_config('app.koreksi_status', 'on', true);
    perform set_config('app.catatan_status', 'Manifes dibatalkan: ' || v_alasan, true);
    update public.data_transaksi t
       set status_kirim = 'diterima_loket', id_armada = null
     where t.no_resi = any (coalesce(v_resi, '{}')) and t.status_kirim = 'dimuat';
    perform set_config('app.koreksi_status', '', true);
    perform set_config('app.catatan_status', '', true);
  end if;

  update public.manifes_detail md set aktif = false, dilepas_pada = now()
   where md.id_manifes = p_id_manifes and md.aktif;
  update public.manifes m set status_manifes = 'dibatalkan', alasan_batal = v_alasan where m.id_manifes = p_id_manifes;

  perform public.catat_audit('batalkan_manifes', 'manifes', p_id_manifes::text,
    jsonb_build_object('status_sebelumnya', v_m.status_manifes, 'resi_dilepas', to_jsonb(coalesce(v_resi, '{}'))), v_alasan);
end;
$$;

-- ---------------------------------------------------------------------
-- override_belum_lunas — izinkan resi belum lunas dimuat. Hanya Pemilik,
-- hanya bila pengaturan mengizinkan, wajib alasan, tercatat di audit.
-- ---------------------------------------------------------------------
create or replace function public.override_belum_lunas(p_no_resi text, p_alasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.data_transaksi;
  v_alasan text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  perform public.wajib_peran('pemilik');
  if not coalesce((select s.izinkan_override_belum_lunas from public.pengaturan s where s.id = 1), false) then
    raise exception 'Kebijakan perusahaan tidak mengizinkan override pemuatan barang belum lunas.' using errcode = '23514';
  end if;
  if v_alasan is null then
    raise exception 'Alasan override wajib diisi.' using errcode = '23514';
  end if;
  if length(v_alasan) > 300 then
    raise exception 'Alasan maksimal 300 karakter.' using errcode = '23514';
  end if;

  select * into v_t from public.data_transaksi t where t.no_resi = upper(btrim(coalesce(p_no_resi, ''))) for update;
  if not found then
    raise exception 'Nomor resi tidak ditemukan.' using errcode = '23514';
  end if;
  if v_t.status_void then
    raise exception 'Transaksi sudah dibatalkan.' using errcode = '23514';
  end if;
  if v_t.status_bayar = 'lunas' then
    raise exception 'Transaksi sudah lunas; override tidak diperlukan.' using errcode = '23514';
  end if;
  if v_t.override_belum_lunas then
    raise exception 'Transaksi ini sudah memiliki override belum lunas.' using errcode = '23514';
  end if;
  if v_t.status_kirim <> 'diterima_loket' then
    raise exception 'Override hanya untuk barang yang belum dimuat.' using errcode = '23514';
  end if;

  update public.data_transaksi t
     set override_belum_lunas = true, override_belum_lunas_alasan = v_alasan, override_belum_lunas_oleh = auth.uid()
   where t.no_resi = v_t.no_resi;

  perform public.catat_audit('override_belum_lunas', 'data_transaksi', v_t.no_resi,
    jsonb_build_object('total_biaya', v_t.total_biaya, 'total_dibayar', v_t.total_dibayar,
                       'sisa', v_t.total_biaya - v_t.total_dibayar), v_alasan);
end;
$$;

-- ---------------------------------------------------------------------
-- konfirmasi_pengambilan — Tiba → Sudah Diambil, hanya dengan konfirmasi
-- eksplisit bahwa petugas telah memeriksa identitas penerima (PRD §7.13:
-- memindai resi saja tidak cukup).
-- ---------------------------------------------------------------------
create or replace function public.konfirmasi_pengambilan(
  p_no_resi text,
  p_identitas_terverifikasi boolean,
  p_catatan text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.data_transaksi;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  perform public.wajib_peran('pemilik', 'admin_loket', 'staf_gudang');
  if not coalesce(p_identitas_terverifikasi, false) then
    raise exception 'Verifikasi identitas penerima wajib dikonfirmasi sebelum pengambilan.' using errcode = '23514';
  end if;
  if v_catatan is not null and length(v_catatan) > 300 then
    raise exception 'Catatan maksimal 300 karakter.' using errcode = '23514';
  end if;

  select * into v_t from public.data_transaksi t where t.no_resi = upper(btrim(coalesce(p_no_resi, ''))) for update;
  if not found then
    raise exception 'Nomor resi tidak ditemukan.' using errcode = '23514';
  end if;
  if v_t.status_void then
    raise exception 'Transaksi sudah dibatalkan.' using errcode = '23514';
  end if;
  if v_t.status_kirim = 'sudah_diambil' then
    raise exception 'Barang dengan resi ini sudah diambil.' using errcode = '23514';
  end if;
  if v_t.status_kirim <> 'tiba' then
    raise exception 'Barang belum tiba di loket tujuan (status %). Pengambilan hanya untuk barang berstatus Tiba.', public.label_status_kirim(v_t.status_kirim)
      using errcode = '23514';
  end if;

  perform set_config('app.catatan_status',
    'Identitas penerima diverifikasi petugas' || coalesce('. ' || v_catatan, ''), true);
  update public.data_transaksi t
     set status_kirim = 'sudah_diambil', waktu_diambil = now(), diambil_diproses_oleh = auth.uid(),
         identitas_terverifikasi = true, catatan_pengambilan = v_catatan
   where t.no_resi = v_t.no_resi;
  perform set_config('app.catatan_status', '', true);

  perform public.catat_audit('konfirmasi_pengambilan', 'data_transaksi', v_t.no_resi,
    jsonb_build_object('identitas_terverifikasi', true, 'status_bayar', v_t.status_bayar), v_catatan);
end;
$$;

-- ---------------------------------------------------------------------
-- Kendala perjalanan (PRD §7.5). Laporan saja: status armada tidak
-- diubah otomatis; Pemilik menindaklanjuti lewat ubah_status_armada.
-- ---------------------------------------------------------------------
create or replace function public.laporkan_kendala(p_id_manifes uuid, p_jenis text, p_deskripsi text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peran public.peran_pengguna;
  v_m public.manifes;
  v_deskripsi text := nullif(btrim(coalesce(p_deskripsi, '')), '');
  v_id uuid;
begin
  v_peran := public.wajib_peran('pemilik', 'staf_gudang', 'supir');
  v_m := public.kunci_manifes(p_id_manifes, v_peran);
  if v_m.status_manifes not in ('draft', 'dimuat', 'berangkat') then
    raise exception 'Kendala hanya dapat dilaporkan untuk perjalanan yang masih aktif.' using errcode = '23514';
  end if;
  if p_jenis is null or p_jenis not in ('kerusakan', 'keterlambatan', 'lainnya') then
    raise exception 'Pilih jenis kendala.' using errcode = '23514';
  end if;
  if v_deskripsi is null then
    raise exception 'Uraian kendala wajib diisi.' using errcode = '23514';
  end if;
  if length(v_deskripsi) > 1000 then
    raise exception 'Uraian kendala maksimal 1000 karakter.' using errcode = '23514';
  end if;

  insert into public.kendala_perjalanan (id_manifes, id_armada, dilaporkan_oleh, jenis, deskripsi)
  values (p_id_manifes, v_m.id_armada, auth.uid(), p_jenis, v_deskripsi)
  returning id into v_id;

  perform public.catat_audit('laporkan_kendala', 'manifes', p_id_manifes::text,
    jsonb_build_object('id_kendala', v_id, 'jenis', p_jenis, 'deskripsi', v_deskripsi));
  return v_id;
end;
$$;

create or replace function public.selesaikan_kendala(p_id_kendala uuid, p_catatan text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_k public.kendala_perjalanan;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  perform public.wajib_peran('pemilik', 'staf_gudang');
  select * into v_k from public.kendala_perjalanan k where k.id = p_id_kendala for update;
  if not found then
    raise exception 'Laporan kendala tidak ditemukan.' using errcode = '23514';
  end if;
  if v_k.status = 'selesai' then
    raise exception 'Kendala ini sudah ditandai selesai.' using errcode = '23514';
  end if;
  if v_catatan is not null and length(v_catatan) > 300 then
    raise exception 'Catatan maksimal 300 karakter.' using errcode = '23514';
  end if;
  update public.kendala_perjalanan k
     set status = 'selesai', diselesaikan_oleh = auth.uid(), diselesaikan_pada = now()
   where k.id = p_id_kendala;
  perform public.catat_audit('selesaikan_kendala', 'manifes', v_k.id_manifes::text,
    jsonb_build_object('id_kendala', p_id_kendala, 'jenis', v_k.jenis), v_catatan);
end;
$$;

-- ---------------------------------------------------------------------
-- Data untuk Supir — hanya field non-finansial dan tanpa data pelanggan.
-- ---------------------------------------------------------------------
create or replace function public.perjalanan_saya()
returns table (
  id_manifes uuid,
  plat_nomor text,
  jenis_unit public.jenis_unit,
  kapasitas_ton numeric,
  rute text,
  status_manifes public.status_manifes,
  waktu_dibuat timestamptz,
  waktu_dimuat timestamptz,
  waktu_berangkat timestamptz,
  waktu_tiba timestamptz,
  catatan text,
  jumlah_resi integer,
  total_berat_kg numeric,
  kendala_terbuka integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wajib_peran('supir');
  return query
    select m.id_manifes, a.plat_nomor, a.jenis_unit, a.kapasitas_ton, m.rute, m.status_manifes,
           m.waktu_dibuat, m.waktu_dimuat, m.waktu_berangkat, m.waktu_tiba, m.catatan,
           (select count(*)::integer from public.manifes_detail md where md.id_manifes = m.id_manifes and md.aktif),
           public.muatan_manifes_kg(m.id_manifes),
           (select count(*)::integer from public.kendala_perjalanan k where k.id_manifes = m.id_manifes and k.status = 'terbuka')
    from public.manifes m
    join public.data_armada a on a.id_armada = m.id_armada
    where m.id_supir = auth.uid() and m.status_manifes <> 'dibatalkan'
    order by (m.status_manifes in ('draft', 'dimuat', 'berangkat')) desc, m.waktu_dibuat desc
    limit 10;
end;
$$;

create or replace function public.muatan_perjalanan(p_id_manifes uuid)
returns table (
  no_resi text,
  status_kirim public.status_kirim,
  total_berat_kg numeric,
  jumlah_baris integer,
  jumlah_koli numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wajib_peran('supir');
  if not exists (select 1 from public.manifes m where m.id_manifes = p_id_manifes and m.id_supir = auth.uid()) then
    raise exception 'Manifes tidak ditemukan atau tidak ditugaskan kepada Anda.' using errcode = '23514';
  end if;
  return query
    select t.no_resi, t.status_kirim, t.total_berat_kg,
           (select count(*)::integer from public.detail_transaksi d where d.no_resi = t.no_resi),
           (select coalesce(sum(d.jumlah), 0) from public.detail_transaksi d where d.no_resi = t.no_resi and d.satuan_saat_transaksi = 'koli')
    from public.manifes_detail md
    join public.data_transaksi t on t.no_resi = md.no_resi
    where md.id_manifes = p_id_manifes and md.aktif
    order by t.no_resi;
end;
$$;

-- ---------------------------------------------------------------------
-- Pelacakan publik — dapat dipanggil anon. Hanya nomor resi, status, dan
-- waktu; tanpa nama, telepon, biaya, armada, atau catatan. Tidak
-- mengembalikan apa pun bila fitur dinonaktifkan Pemilik.
-- ---------------------------------------------------------------------
create or replace function public.pelacakan_publik_aktif()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.pelacakan_publik_aktif from public.pengaturan s where s.id = 1), false)
$$;

create or replace function public.lacak_resi(p_no_resi text)
returns table (no_resi text, status text, waktu timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resi text := upper(btrim(coalesce(p_no_resi, '')));
  v_t public.data_transaksi;
begin
  if not public.pelacakan_publik_aktif() or length(v_resi) = 0 or length(v_resi) > 40 then
    return;
  end if;
  select * into v_t from public.data_transaksi t where t.no_resi = v_resi;
  if not found then
    return;
  end if;
  if v_t.status_void then
    return query select v_t.no_resi, 'dibatalkan'::text, v_t.void_pada;
    return;
  end if;
  return query
    select r.no_resi, r.status_baru::text, r.waktu_perubahan
    from public.riwayat_status_pengiriman r
    where r.no_resi = v_resi
    order by r.waktu_perubahan, r.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Grant. Supabase memberi EXECUTE ke anon secara default untuk fungsi
-- baru, jadi setiap fungsi dicabut dulu dari public & anon.
-- ---------------------------------------------------------------------
revoke execute on function public.muatan_manifes_kg(uuid) from public, anon, authenticated;
revoke execute on function public.label_status_kirim(public.status_kirim) from public, anon, authenticated;
revoke execute on function public.label_status_manifes(public.status_manifes) from public, anon, authenticated;
revoke execute on function public.format_kg(numeric) from public, anon, authenticated;
revoke execute on function public.periksa_resi_bisa_dimuat(public.data_transaksi) from public, anon, authenticated;
revoke execute on function public.kunci_manifes(uuid, public.peran_pengguna) from public, anon, authenticated;
revoke execute on function public.muatan_melebihi_kapasitas(uuid, uuid) from public, anon, authenticated;

revoke execute on function public.buat_manifes(uuid, uuid, text, text) from public, anon;
revoke execute on function public.tambah_resi_manifes(uuid, text[]) from public, anon;
revoke execute on function public.lepas_resi_manifes(uuid, text) from public, anon;
revoke execute on function public.konfirmasi_muat(uuid, text) from public, anon;
revoke execute on function public.konfirmasi_berangkat(uuid) from public, anon;
revoke execute on function public.konfirmasi_tiba(uuid, text) from public, anon;
revoke execute on function public.pindahkan_resi(text, uuid, text) from public, anon;
revoke execute on function public.batalkan_manifes(uuid, text) from public, anon;
revoke execute on function public.override_belum_lunas(text, text) from public, anon;
revoke execute on function public.konfirmasi_pengambilan(text, boolean, text) from public, anon;
revoke execute on function public.laporkan_kendala(uuid, text, text) from public, anon;
revoke execute on function public.selesaikan_kendala(uuid, text) from public, anon;
revoke execute on function public.perjalanan_saya() from public, anon;
revoke execute on function public.muatan_perjalanan(uuid) from public, anon;
revoke execute on function public.pelacakan_publik_aktif() from public;
revoke execute on function public.lacak_resi(text) from public;

grant execute on function public.buat_manifes(uuid, uuid, text, text) to authenticated;
grant execute on function public.tambah_resi_manifes(uuid, text[]) to authenticated;
grant execute on function public.lepas_resi_manifes(uuid, text) to authenticated;
grant execute on function public.konfirmasi_muat(uuid, text) to authenticated;
grant execute on function public.konfirmasi_berangkat(uuid) to authenticated;
grant execute on function public.konfirmasi_tiba(uuid, text) to authenticated;
grant execute on function public.pindahkan_resi(text, uuid, text) to authenticated;
grant execute on function public.batalkan_manifes(uuid, text) to authenticated;
grant execute on function public.override_belum_lunas(text, text) to authenticated;
grant execute on function public.konfirmasi_pengambilan(text, boolean, text) to authenticated;
grant execute on function public.laporkan_kendala(uuid, text, text) to authenticated;
grant execute on function public.selesaikan_kendala(uuid, text) to authenticated;
grant execute on function public.perjalanan_saya() to authenticated;
grant execute on function public.muatan_perjalanan(uuid) to authenticated;
grant execute on function public.pelacakan_publik_aktif() to anon, authenticated;
grant execute on function public.lacak_resi(text) to anon, authenticated;
