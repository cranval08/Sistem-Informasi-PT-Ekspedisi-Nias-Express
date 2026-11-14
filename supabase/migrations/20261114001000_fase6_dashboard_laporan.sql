-- =====================================================================
-- Fase 6 — Dashboard & laporan (PRD §3 indikator, §7.2–§7.4, §7.14).
--
-- PostgREST tidak menyediakan GROUP BY untuk klien, jadi agregasi dibuat
-- sebagai fungsi SECURITY DEFINER yang hanya membaca (stable), memeriksa
-- peran, dan menghitung langsung dari tabel transaksi — tidak ada angka
-- yang disimpan terpisah atau diinput manual.
--
-- Periode selalu berupa tanggal kalender di zona waktu operasional
-- (pengaturan.zona_waktu): transaksi memakai tanggal_transaksi; pembayaran,
-- audit, dan manifes memakai batas timestamptz zona tersebut. Maksimal 1 tahun.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal: validasi rentang & batas waktu.
-- ---------------------------------------------------------------------
create or replace function public.batas_periode(p_dari date, p_sampai date)
returns table (awal timestamptz, akhir timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zona text := coalesce((select s.zona_waktu from public.pengaturan s where s.id = 1), 'Asia/Jakarta');
begin
  if p_dari is null or p_sampai is null or p_sampai < p_dari then
    raise exception 'Rentang tanggal tidak valid.' using errcode = '22023';
  end if;
  if p_sampai - p_dari > 366 then
    raise exception 'Rentang laporan maksimal 1 tahun.' using errcode = '22023';
  end if;
  return query select (p_dari::timestamp at time zone v_zona), ((p_sampai + 1)::timestamp at time zone v_zona);
end;
$$;

-- ---------------------------------------------------------------------
-- ringkasan_operasional — kartu KPI dashboard Pemilik & indikator PRD §3.
-- Semua angka mengikuti periode.
-- ---------------------------------------------------------------------
create or replace function public.ringkasan_operasional(p_dari date, p_sampai date)
returns table (
  jumlah_transaksi integer,
  total_biaya bigint,
  total_berat_kg numeric,
  jumlah_lunas integer,
  jumlah_belum_lunas integer,
  sisa_tagihan bigint,
  jumlah_diterima_loket integer,
  jumlah_dimuat integer,
  jumlah_dalam_perjalanan integer,
  jumlah_tiba integer,
  jumlah_sudah_diambil integer,
  jumlah_void integer,
  total_diterima bigint,
  jumlah_pembayaran integer,
  total_dibatalkan bigint,
  jumlah_pembayaran_dibatalkan integer,
  peringatan_duplikat integer,
  duplikat_dikonfirmasi integer,
  override_kapasitas integer,
  override_belum_lunas integer,
  peringatan_kapasitas integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_awal timestamptz;
  v_akhir timestamptz;
  v_ambang numeric := (select s.ambang_peringatan_kapasitas_persen from public.pengaturan s where s.id = 1);
begin
  perform public.wajib_peran('pemilik');
  select b.awal, b.akhir into v_awal, v_akhir from public.batas_periode(p_dari, p_sampai) b;

  return query
  with t as (
    select * from public.data_transaksi x where x.tanggal_transaksi between p_dari and p_sampai
  ),
  b as (
    select * from public.pembayaran y where y.waktu_bayar >= v_awal and y.waktu_bayar < v_akhir
  ),
  a as (
    select * from public.audit_log z where z.waktu >= v_awal and z.waktu < v_akhir
  ),
  m as (
    -- Manifes yang dikonfirmasi muat dalam periode (belum/tidak dibatalkan).
    select mm.*, public.muatan_manifes_kg(mm.id_manifes) muatan_kg, ar.kapasitas_ton
    from public.manifes mm join public.data_armada ar on ar.id_armada = mm.id_armada
    where mm.waktu_dimuat >= v_awal and mm.waktu_dimuat < v_akhir and mm.status_manifes <> 'dibatalkan'
  )
  select
    (select count(*) from t where not t.status_void)::integer,
    (select coalesce(sum(t.total_biaya), 0) from t where not t.status_void)::bigint,
    (select coalesce(sum(t.total_berat_kg), 0) from t where not t.status_void),
    (select count(*) from t where not t.status_void and t.status_bayar = 'lunas')::integer,
    (select count(*) from t where not t.status_void and t.status_bayar <> 'lunas')::integer,
    (select coalesce(sum(t.total_biaya - t.total_dibayar), 0) from t where not t.status_void)::bigint,
    (select count(*) from t where not t.status_void and t.status_kirim = 'diterima_loket')::integer,
    (select count(*) from t where not t.status_void and t.status_kirim = 'dimuat')::integer,
    (select count(*) from t where not t.status_void and t.status_kirim = 'dalam_perjalanan')::integer,
    (select count(*) from t where not t.status_void and t.status_kirim = 'tiba')::integer,
    (select count(*) from t where not t.status_void and t.status_kirim = 'sudah_diambil')::integer,
    (select count(*) from t where t.status_void)::integer,
    (select coalesce(sum(b.jumlah_bayar), 0) from b where b.status_pembayaran_record = 'valid')::bigint,
    (select count(*) from b where b.status_pembayaran_record = 'valid')::integer,
    (select coalesce(sum(b.jumlah_bayar), 0) from b where b.status_pembayaran_record = 'dibatalkan')::bigint,
    (select count(*) from b where b.status_pembayaran_record = 'dibatalkan')::integer,
    (select count(*) from a where a.aksi = 'peringatan_duplikat')::integer,
    (select count(*) from a where a.aksi = 'buat_transaksi'
       and coalesce(a.detail_perubahan -> 'duplikat_dikonfirmasi', 'null'::jsonb) <> 'null'::jsonb)::integer,
    (select count(*) from m where m.override_kapasitas)::integer,
    (select count(*) from a where a.aksi = 'override_belum_lunas')::integer,
    -- NULL bila ambang belum diisi Pemilik ("perlu dilengkapi").
    case when v_ambang is null then null
         else (select count(*) from m where m.muatan_kg * 100 >= v_ambang * m.kapasitas_ton * 1000)::integer end;
end;
$$;

-- ---------------------------------------------------------------------
-- tren_operasional — grafik per hari/minggu (Senin)/bulan. Setiap ember
-- dalam periode selalu muncul (nilai 0 bila kosong).
-- ---------------------------------------------------------------------
create or replace function public.tren_operasional(p_dari date, p_sampai date, p_satuan text default 'hari')
returns table (awal date, akhir date, jumlah_transaksi integer, total_biaya bigint, total_diterima bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zona text := coalesce((select s.zona_waktu from public.pengaturan s where s.id = 1), 'Asia/Jakarta');
  v_unit text;
  v_langkah interval;
begin
  perform public.wajib_peran('pemilik');
  perform public.batas_periode(p_dari, p_sampai);
  case p_satuan
    when 'hari' then v_unit := 'day'; v_langkah := interval '1 day';
    when 'minggu' then v_unit := 'week'; v_langkah := interval '7 days';
    when 'bulan' then v_unit := 'month'; v_langkah := interval '1 month';
    else raise exception 'Satuan grafik harus hari, minggu, atau bulan.' using errcode = '22023';
  end case;

  return query
  with ember as (
    select g::date mulai, (g + v_langkah)::date - 1 selesai
    from generate_series(date_trunc(v_unit, p_dari::timestamp), p_sampai::timestamp, v_langkah) g
  )
  select greatest(e.mulai, p_dari),
         least(e.selesai, p_sampai),
         (select count(*) from public.data_transaksi t
           where not t.status_void and t.tanggal_transaksi between greatest(e.mulai, p_dari) and least(e.selesai, p_sampai))::integer,
         (select coalesce(sum(t.total_biaya), 0) from public.data_transaksi t
           where not t.status_void and t.tanggal_transaksi between greatest(e.mulai, p_dari) and least(e.selesai, p_sampai))::bigint,
         (select coalesce(sum(b.jumlah_bayar), 0) from public.pembayaran b
           where b.status_pembayaran_record = 'valid'
             and b.waktu_bayar >= (greatest(e.mulai, p_dari)::timestamp at time zone v_zona)
             and b.waktu_bayar < ((least(e.selesai, p_sampai) + 1)::timestamp at time zone v_zona))::bigint
  from ember e
  order by e.mulai;
end;
$$;

-- ---------------------------------------------------------------------
-- laporan_armada — status terkini, muatan manifes aktif, dan utilisasi
-- perjalanan yang berangkat dalam periode (kapasitas terkini armada).
-- ---------------------------------------------------------------------
create or replace function public.laporan_armada(p_dari date, p_sampai date)
returns table (
  id_armada uuid,
  plat_nomor text,
  jenis_unit text,
  kapasitas_ton numeric,
  status text,
  is_active boolean,
  supir text,
  id_manifes_aktif uuid,
  status_manifes_aktif text,
  rute_aktif text,
  muatan_aktif_kg numeric,
  jumlah_perjalanan integer,
  total_muatan_kg numeric,
  rata_utilisasi_persen numeric,
  maks_utilisasi_persen numeric,
  jumlah_override integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_awal timestamptz;
  v_akhir timestamptz;
begin
  perform public.wajib_peran('pemilik');
  select b.awal, b.akhir into v_awal, v_akhir from public.batas_periode(p_dari, p_sampai) b;

  return query
  select a.id_armada, a.plat_nomor, a.jenis_unit::text, a.kapasitas_ton, a.status::text, a.is_active,
         ps.nama_lengkap,
         ak.id_manifes, ak.status_manifes::text, ak.rute, ak.muatan_kg,
         coalesce(p.jumlah, 0)::integer, coalesce(p.total_kg, 0), p.rata, p.maks, coalesce(p.override, 0)::integer
  from public.data_armada a
  left join public.data_pengguna ps on ps.id_pengguna = a.id_supir
  left join lateral (
    select m.id_manifes, m.status_manifes, m.rute, public.muatan_manifes_kg(m.id_manifes) muatan_kg
    from public.manifes m
    where m.id_armada = a.id_armada and m.status_manifes in ('draft', 'dimuat', 'berangkat')
    limit 1
  ) ak on true
  left join lateral (
    select count(*) jumlah, sum(x.kg) total_kg,
           round(avg(x.kg * 100 / (a.kapasitas_ton * 1000)), 1) rata,
           round(max(x.kg * 100 / (a.kapasitas_ton * 1000)), 1) maks,
           count(*) filter (where x.override_kapasitas) override
    from (
      select public.muatan_manifes_kg(m.id_manifes) kg, m.override_kapasitas
      from public.manifes m
      where m.id_armada = a.id_armada and m.status_manifes in ('berangkat', 'tiba')
        and m.waktu_berangkat >= v_awal and m.waktu_berangkat < v_akhir
    ) x
  ) p on true
  where a.is_active or coalesce(p.jumlah, 0) > 0
  order by a.is_active desc, a.plat_nomor;
end;
$$;

-- ---------------------------------------------------------------------
-- peringatan_data — "data yang perlu diperiksa" (PRD §3 anomali, §7.3).
-- Pemeriksaan konsistensi; seharusnya kosong bila trigger bekerja, kecuali
-- 'tiba_belum_lunas' yang merupakan pekerjaan operasional.
-- ---------------------------------------------------------------------
create or replace function public.peringatan_data()
returns table (jenis text, no_resi text, keterangan text, waktu timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wajib_peran('pemilik', 'admin_loket');
  return query
  select * from (
    select 'selisih_pembayaran'::text, t.no_resi,
           format('Total dibayar tercatat Rp%s, jumlah pembayaran valid Rp%s.', t.total_dibayar, coalesce(s.jml, 0)),
           t.updated_at
    from public.data_transaksi t
    left join (select b.no_resi, sum(b.jumlah_bayar) jml from public.pembayaran b
               where b.status_pembayaran_record = 'valid' group by b.no_resi) s on s.no_resi = t.no_resi
    where t.total_dibayar <> coalesce(s.jml, 0)
    union all
    select 'void_berpembayaran', t.no_resi, 'Transaksi dibatalkan tetapi masih memiliki pembayaran valid.', t.void_pada
    from public.data_transaksi t
    where t.status_void and exists (select 1 from public.pembayaran b where b.no_resi = t.no_resi and b.status_pembayaran_record = 'valid')
    union all
    select 'diambil_belum_lunas', t.no_resi, 'Barang sudah diambil tetapi pembayaran belum lunas.', t.waktu_diambil
    from public.data_transaksi t
    where not t.status_void and t.status_kirim = 'sudah_diambil' and t.status_bayar <> 'lunas'
    union all
    select 'status_tanpa_manifes', t.no_resi, 'Status Dimuat/Dalam Perjalanan tanpa manifes aktif.', t.updated_at
    from public.data_transaksi t
    where not t.status_void and t.status_kirim in ('dimuat', 'dalam_perjalanan')
      and not exists (select 1 from public.manifes_detail md where md.no_resi = t.no_resi and md.aktif)
    union all
    select 'tiba_belum_lunas', t.no_resi, 'Barang sudah tiba; catat pelunasan sebelum diserahkan.', t.updated_at
    from public.data_transaksi t
    where not t.status_void and t.status_kirim = 'tiba' and t.status_bayar <> 'lunas'
  ) x (jenis, no_resi, keterangan, waktu)
  order by x.waktu desc nulls last
  limit 200;
end;
$$;

-- ---------------------------------------------------------------------
-- catat_peringatan_duplikat — dipanggil aplikasi saat buat_transaksi
-- menolak dengan NX001, agar jumlah peringatan duplikasi (PRD §3) dapat
-- diukur walau pengguna akhirnya tidak menyimpan. Fungsi memeriksa ulang
-- bahwa duplikat memang ada; tidak dapat dipakai menulis audit bebas.
-- ---------------------------------------------------------------------
create or replace function public.catat_peringatan_duplikat(p_id_pengirim uuid, p_id_penerima uuid, p_total_berat_kg numeric)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resi text[];
begin
  perform public.wajib_peran('pemilik', 'admin_loket');
  select array_agg(d.no_resi) into v_resi
  from public.cari_duplikat_transaksi(p_id_pengirim, p_id_penerima, p_total_berat_kg) d;
  if v_resi is null then
    return 0;
  end if;
  perform public.catat_audit('peringatan_duplikat', 'data_transaksi', v_resi[1],
    jsonb_build_object('resi_mirip', to_jsonb(v_resi), 'total_berat_kg', p_total_berat_kg), null);
  return coalesce(array_length(v_resi, 1), 0);
end;
$$;

revoke execute on function public.batas_periode(date, date) from public, anon, authenticated;
revoke execute on function public.ringkasan_operasional(date, date) from public, anon;
revoke execute on function public.tren_operasional(date, date, text) from public, anon;
revoke execute on function public.laporan_armada(date, date) from public, anon;
revoke execute on function public.peringatan_data() from public, anon;
revoke execute on function public.catat_peringatan_duplikat(uuid, uuid, numeric) from public, anon;
grant execute on function public.ringkasan_operasional(date, date) to authenticated;
grant execute on function public.tren_operasional(date, date, text) to authenticated;
grant execute on function public.laporan_armada(date, date) to authenticated;
grant execute on function public.peringatan_data() to authenticated;
grant execute on function public.catat_peringatan_duplikat(uuid, uuid, numeric) to authenticated;

-- Indeks pendukung filter periode laporan.
create index if not exists data_transaksi_tanggal_idx on public.data_transaksi (tanggal_transaksi);
create index if not exists audit_log_waktu_idx on public.audit_log (waktu);
create index if not exists riwayat_status_waktu_idx on public.riwayat_status_pengiriman (waktu_perubahan);
