-- =====================================================================
-- Keputusan Fase 4 (disetujui 2026-11-14).
--
-- Keputusan 2 — pembayaran awal Rp0 tetap tidak membuat baris pembayaran
-- (tidak masuk riwayat pembayaran maupun rekap kas), tetapi alasannya
-- wajib dicatat di transaksi agar dapat dilacak Pemilik dan Admin Loket
-- lain. Alasan juga masuk audit log (tidak dapat diubah).
--
-- Keputusan 3 — Admin Loket boleh membatalkan pembayaran yang ia catat
-- sendiri pada tanggal operasional yang sama (zona pengaturan). Pembatalan
-- lainnya tetap hanya oleh Pemilik. Alasan tetap wajib.
-- =====================================================================

alter table public.data_transaksi
  add column alasan_belum_bayar text
    constraint data_transaksi_alasan_belum_bayar_panjang check (alasan_belum_bayar is null or length(alasan_belum_bayar) <= 300);

comment on column public.data_transaksi.alasan_belum_bayar is
  'Alasan pembayaran awal Rp0 saat transaksi dibuat (wajib sejak migrasi 0900; NULL untuk transaksi lama atau yang dibayar di awal).';

-- ---------------------------------------------------------------------
-- buat_transaksi — parameter baru p_alasan_belum_bayar. Overload lama
-- dihapus agar tidak ada jalur yang melewati aturan ini.
-- ---------------------------------------------------------------------
drop function public.buat_transaksi(uuid, uuid, jsonb, bigint, text, boolean);

create function public.buat_transaksi(
  p_id_pengirim uuid,
  p_id_penerima uuid,
  p_detail jsonb,
  p_bayar_awal bigint default 0,
  p_catatan text default null,
  p_konfirmasi_duplikat boolean default false,
  p_alasan_belum_bayar text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_resi text;
  v_baris jsonb;
  v_item public.data_item;
  v_berat numeric;
  v_koli numeric;
  v_jumlah numeric;
  v_total_berat numeric := 0;
  v_total_biaya bigint := 0;
  v_duplikat text[];
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
  v_alasan_belum_bayar text := nullif(btrim(coalesce(p_alasan_belum_bayar, '')), '');
  v_detail_audit jsonb := '[]'::jsonb;
begin
  perform public.wajib_peran('pemilik', 'admin_loket');

  -- Pengirim & penerima
  if p_id_pengirim is null then
    raise exception 'Pengirim wajib dipilih.' using errcode = '23514';
  end if;
  if p_id_penerima is null then
    raise exception 'Penerima wajib dipilih.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.data_pelanggan c where c.id_pelanggan = p_id_pengirim and c.is_active) then
    raise exception 'Pengirim tidak ditemukan atau nonaktif.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.data_pelanggan c where c.id_pelanggan = p_id_penerima and c.is_active) then
    raise exception 'Penerima tidak ditemukan atau nonaktif.' using errcode = '23514';
  end if;

  -- Detail barang: validasi seluruh baris sebelum menulis apa pun.
  if p_detail is null or jsonb_typeof(p_detail) <> 'array' or jsonb_array_length(p_detail) = 0 then
    raise exception 'Minimal satu baris barang wajib diisi.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_detail) > 50 then
    raise exception 'Maksimal 50 baris barang per transaksi.' using errcode = '23514';
  end if;

  for v_baris in select * from jsonb_array_elements(p_detail) loop
    begin
      select * into v_item from public.data_item i where i.id_item = (v_baris ->> 'id_item')::uuid;
    exception when invalid_text_representation then
      v_item := null;
    end;
    if v_item.id_item is null then
      raise exception 'Jenis barang tidak ada di master item.' using errcode = '23514';
    end if;
    if not v_item.is_active then
      raise exception 'Jenis barang "%" sudah nonaktif dan tidak dapat dipilih.', v_item.nama_item using errcode = '23514';
    end if;

    begin
      v_berat := (v_baris ->> 'berat_kg')::numeric;
      v_koli := nullif(v_baris ->> 'koli', '')::numeric;
    exception when invalid_text_representation then
      raise exception 'Berat atau jumlah koli untuk "%" bukan angka.', v_item.nama_item using errcode = '23514';
    end;
    if v_berat is null or v_berat <= 0 then
      raise exception 'Berat "%" wajib diisi dan harus lebih dari 0 kg.', v_item.nama_item using errcode = '23514';
    end if;
    if v_berat <> round(v_berat, 3) then
      raise exception 'Berat "%" maksimal 3 angka desimal.', v_item.nama_item using errcode = '23514';
    end if;
    if v_item.satuan = 'koli' and (v_koli is null or v_koli <= 0 or v_koli <> trunc(v_koli)) then
      raise exception 'Jumlah koli "%" wajib bilangan bulat lebih dari 0.', v_item.nama_item using errcode = '23514';
    end if;
    v_jumlah := public.jumlah_satuan(v_item.satuan, v_berat, v_koli);
    if v_jumlah <= 0 then
      raise exception 'Berat "%" terlalu kecil untuk satuan ton (minimal 0,5 kg).', v_item.nama_item using errcode = '23514';
    end if;

    v_total_berat := v_total_berat + v_berat;
    v_total_biaya := v_total_biaya + round(v_jumlah * v_item.tarif_per_satuan)::bigint;
  end loop;

  -- Pembayaran awal
  if p_bayar_awal is null or p_bayar_awal < 0 then
    raise exception 'Nominal pembayaran awal harus bilangan bulat minimal 0.' using errcode = '23514';
  end if;
  if p_bayar_awal > v_total_biaya then
    raise exception 'Pembayaran awal melebihi total biaya.' using errcode = '23514';
  end if;
  -- Alasan hanya relevan (dan wajib) bila ada biaya tetapi belum dibayar sama sekali.
  if p_bayar_awal > 0 or v_total_biaya = 0 then
    v_alasan_belum_bayar := null;
  elsif v_alasan_belum_bayar is null then
    raise exception 'Alasan belum bayar wajib diisi bila pembayaran awal Rp0.' using errcode = '23514';
  elsif length(v_alasan_belum_bayar) > 300 then
    raise exception 'Alasan belum bayar maksimal 300 karakter.' using errcode = '23514';
  end if;

  -- Deteksi duplikasi
  select array_agg(d.no_resi) into v_duplikat
  from public.cari_duplikat_transaksi(p_id_pengirim, p_id_penerima, v_total_berat) d;
  if v_duplikat is not null and not coalesce(p_konfirmasi_duplikat, false) then
    raise exception 'Kemungkinan transaksi ganda: %', array_to_string(v_duplikat, ', ')
      using errcode = 'NX001', hint = array_to_string(v_duplikat, ',');
  end if;

  -- Tulis
  v_resi := public.buat_nomor_resi();
  insert into public.data_transaksi (no_resi, tanggal_transaksi, id_pengirim, id_penerima, id_pengguna, total_berat_kg, total_biaya, catatan, alasan_belum_bayar)
  values (v_resi, public.tanggal_operasional(now()), p_id_pengirim, p_id_penerima, v_uid, v_total_berat, v_total_biaya, v_catatan, v_alasan_belum_bayar);

  for v_baris in select * from jsonb_array_elements(p_detail) loop
    select * into v_item from public.data_item i where i.id_item = (v_baris ->> 'id_item')::uuid;
    v_berat := (v_baris ->> 'berat_kg')::numeric;
    v_koli := nullif(v_baris ->> 'koli', '')::numeric;
    v_jumlah := public.jumlah_satuan(v_item.satuan, v_berat, v_koli);
    insert into public.detail_transaksi (no_resi, id_item, satuan_saat_transaksi, jumlah, berat_kg, tarif_saat_transaksi, subtotal)
    values (v_resi, v_item.id_item, v_item.satuan, v_jumlah, v_berat, v_item.tarif_per_satuan, round(v_jumlah * v_item.tarif_per_satuan));
    v_detail_audit := v_detail_audit || jsonb_build_object(
      'item', v_item.nama_item, 'satuan', v_item.satuan, 'jumlah', v_jumlah, 'berat_kg', v_berat, 'tarif', v_item.tarif_per_satuan);
  end loop;

  if p_bayar_awal > 0 then
    insert into public.pembayaran (no_resi, jumlah_bayar, id_pengguna_pencatat, catatan)
    values (v_resi, p_bayar_awal, v_uid, 'Pembayaran awal saat transaksi');
  end if;

  perform public.catat_audit(
    'buat_transaksi', 'data_transaksi', v_resi,
    jsonb_build_object(
      'total_biaya', v_total_biaya,
      'total_berat_kg', v_total_berat,
      'bayar_awal', p_bayar_awal,
      'alasan_belum_bayar', v_alasan_belum_bayar,
      'detail', v_detail_audit,
      'duplikat_dikonfirmasi', to_jsonb(v_duplikat)
    ),
    case when v_duplikat is not null then 'Dikonfirmasi bukan duplikat oleh pencatat.' end
  );
  return v_resi;
end;
$$;

revoke execute on function public.buat_transaksi(uuid, uuid, jsonb, bigint, text, boolean, text) from public, anon;
grant execute on function public.buat_transaksi(uuid, uuid, jsonb, bigint, text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- batalkan_pembayaran — Pemilik: semua pembayaran. Admin Loket: hanya
-- pembayaran yang ia catat sendiri pada tanggal operasional hari ini.
-- ---------------------------------------------------------------------
create or replace function public.batalkan_pembayaran(p_id_pembayaran uuid, p_alasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.pembayaran;
  v_peran public.peran_pengguna;
  v_alasan text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  perform public.wajib_peran('pemilik', 'admin_loket');
  v_peran := public.peran_saya();
  if v_alasan is null then
    raise exception 'Alasan pembatalan pembayaran wajib diisi.' using errcode = '23514';
  end if;
  if length(v_alasan) > 300 then
    raise exception 'Alasan maksimal 300 karakter.' using errcode = '23514';
  end if;

  select * into v_b from public.pembayaran b where b.id_pembayaran = p_id_pembayaran;
  if not found then
    raise exception 'Pembayaran tidak ditemukan.' using errcode = '23514';
  end if;
  -- Kunci transaksi dulu (urutan kunci sama dengan catat_pembayaran).
  perform 1 from public.data_transaksi t where t.no_resi = v_b.no_resi for update;
  select * into v_b from public.pembayaran b where b.id_pembayaran = p_id_pembayaran for update;
  if v_b.status_pembayaran_record = 'dibatalkan' then
    raise exception 'Pembayaran ini sudah dibatalkan.' using errcode = '23514';
  end if;

  if v_peran = 'admin_loket' then
    if v_b.id_pengguna_pencatat is distinct from auth.uid() then
      raise exception 'Admin Loket hanya dapat membatalkan pembayaran yang dicatatnya sendiri. Hubungi Pemilik untuk koreksi ini.'
        using errcode = '42501';
    end if;
    if public.tanggal_operasional(v_b.waktu_bayar) <> public.tanggal_operasional(now()) then
      raise exception 'Admin Loket hanya dapat membatalkan pembayaran pada hari yang sama saat dicatat. Hubungi Pemilik untuk koreksi ini.'
        using errcode = '42501';
    end if;
  end if;

  update public.pembayaran b
     set status_pembayaran_record = 'dibatalkan', catatan_koreksi = v_alasan, dibatalkan_oleh = auth.uid()
   where b.id_pembayaran = p_id_pembayaran;

  perform public.catat_audit('batalkan_pembayaran', 'pembayaran', p_id_pembayaran::text,
    jsonb_build_object('no_resi', v_b.no_resi, 'jumlah_bayar', v_b.jumlah_bayar, 'peran_pembatal', v_peran), v_alasan);
end;
$$;

revoke execute on function public.batalkan_pembayaran(uuid, text) from public, anon;
grant execute on function public.batalkan_pembayaran(uuid, text) to authenticated;
