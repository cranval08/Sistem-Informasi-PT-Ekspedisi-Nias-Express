-- =====================================================================
-- Fase 3 — TPS transaksi: nomor resi, pembuatan transaksi atomik,
-- deteksi duplikasi, dan pembatalan (void). PRD §7.8, §8, §15 Transaksi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Nomor resi PREFIKS-YYYYMMDD-NNNN, berurutan per tanggal operasional
-- (Asia/Jakarta). Upsert pada penghitung_resi mengunci baris tanggal,
-- sehingga transaksi bersamaan tidak mendapat nomor yang sama.
-- Internal: hanya dipanggil buat_transaksi().
-- ---------------------------------------------------------------------
create or replace function public.buat_nomor_resi()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tanggal date := public.tanggal_operasional(now());
  v_prefiks text;
  v_nomor integer;
begin
  select s.prefiks_resi into v_prefiks from public.pengaturan s where s.id = 1;
  insert into public.penghitung_resi as p (tanggal, nomor_terakhir)
  values (v_tanggal, 1)
  on conflict (tanggal) do update set nomor_terakhir = p.nomor_terakhir + 1
  returning p.nomor_terakhir into v_nomor;
  return coalesce(v_prefiks, 'NX') || '-' || to_char(v_tanggal, 'YYYYMMDD') || '-' || lpad(v_nomor::text, 4, '0');
end;
$$;

-- ---------------------------------------------------------------------
-- Jumlah dalam satuan tarif. kg & ton diturunkan dari berat (agar admin
-- tidak mengisi data yang sama dua kali); koli diisi sebagai jumlah
-- bilangan bulat. Dipakai juga oleh tes untuk mencocokkan perhitungan UI.
-- ---------------------------------------------------------------------
create or replace function public.jumlah_satuan(p_satuan public.satuan_item, p_berat_kg numeric, p_koli numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case p_satuan
    when 'kg'   then p_berat_kg
    when 'ton'  then round(p_berat_kg / 1000, 3)
    when 'koli' then p_koli
  end
$$;

-- ---------------------------------------------------------------------
-- Transaksi lain (tidak dibatalkan) dengan pengirim + penerima + tanggal
-- operasional hari ini + total berat yang sama (PRD §7.8 aturan 3).
-- ---------------------------------------------------------------------
create or replace function public.cari_duplikat_transaksi(
  p_id_pengirim uuid,
  p_id_penerima uuid,
  p_total_berat_kg numeric
) returns table (no_resi text, waktu_transaksi timestamptz, total_biaya bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.wajib_peran('pemilik', 'admin_loket');
  return query
    select t.no_resi, t.waktu_transaksi, t.total_biaya
    from public.data_transaksi t
    where t.id_pengirim = p_id_pengirim
      and t.id_penerima = p_id_penerima
      and t.tanggal_transaksi = public.tanggal_operasional(now())
      and t.total_berat_kg = p_total_berat_kg
      and not t.status_void
    order by t.waktu_transaksi;
end;
$$;

-- ---------------------------------------------------------------------
-- buat_transaksi — satu transaksi database: resi, header, detail dengan
-- snapshot tarif, pembayaran awal, audit. p_detail = jsonb array:
--   [{ "id_item": uuid, "berat_kg": number, "koli": number|null }, ...]
-- Bila ada kemungkinan duplikat dan p_konfirmasi_duplikat = false, fungsi
-- menolak dengan SQLSTATE 'NX001' (pesan memuat daftar resi) sehingga UI
-- dapat meminta konfirmasi. Konfirmasi tercatat di audit log.
-- ---------------------------------------------------------------------
create or replace function public.buat_transaksi(
  p_id_pengirim uuid,
  p_id_penerima uuid,
  p_detail jsonb,
  p_bayar_awal bigint default 0,
  p_catatan text default null,
  p_konfirmasi_duplikat boolean default false
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

  -- Deteksi duplikasi
  select array_agg(d.no_resi) into v_duplikat
  from public.cari_duplikat_transaksi(p_id_pengirim, p_id_penerima, v_total_berat) d;
  if v_duplikat is not null and not coalesce(p_konfirmasi_duplikat, false) then
    raise exception 'Kemungkinan transaksi ganda: %', array_to_string(v_duplikat, ', ')
      using errcode = 'NX001', hint = array_to_string(v_duplikat, ',');
  end if;

  -- Tulis
  v_resi := public.buat_nomor_resi();
  insert into public.data_transaksi (no_resi, tanggal_transaksi, id_pengirim, id_penerima, id_pengguna, total_berat_kg, total_biaya, catatan)
  values (v_resi, public.tanggal_operasional(now()), p_id_pengirim, p_id_penerima, v_uid, v_total_berat, v_total_biaya, v_catatan);

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
      'detail', v_detail_audit,
      'duplikat_dikonfirmasi', to_jsonb(v_duplikat)
    ),
    case when v_duplikat is not null then 'Dikonfirmasi bukan duplikat oleh pencatat.' end
  );
  return v_resi;
end;
$$;

-- ---------------------------------------------------------------------
-- batalkan_transaksi — void dengan alasan (tidak ada hapus permanen).
-- Hanya Pemilik; hanya sebelum barang dimuat; transaksi yang sudah
-- memiliki pembayaran valid harus dibatalkan pembayarannya dulu (Fase 4).
-- ---------------------------------------------------------------------
create or replace function public.batalkan_transaksi(p_no_resi text, p_alasan text)
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
  if v_alasan is null then
    raise exception 'Alasan pembatalan wajib diisi.' using errcode = '23514';
  end if;

  select * into v_t from public.data_transaksi t where t.no_resi = p_no_resi for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan.' using errcode = '23514';
  end if;
  if v_t.status_void then
    raise exception 'Transaksi sudah dibatalkan.' using errcode = '23514';
  end if;
  if v_t.status_kirim <> 'diterima_loket' then
    raise exception 'Transaksi yang sudah dimuat atau dikirim tidak dapat dibatalkan.' using errcode = '23514';
  end if;
  if exists (select 1 from public.manifes_detail md where md.no_resi = p_no_resi and md.aktif) then
    raise exception 'Transaksi masih tercantum di manifes aktif.' using errcode = '23514';
  end if;
  if v_t.total_dibayar > 0 then
    raise exception 'Transaksi sudah memiliki pembayaran. Batalkan pembayarannya terlebih dahulu.' using errcode = '23514';
  end if;

  update public.data_transaksi t
     set status_void = true, void_reason = v_alasan, void_oleh = auth.uid(), void_pada = now()
   where t.no_resi = p_no_resi;

  perform public.catat_audit('batalkan_transaksi', 'data_transaksi', p_no_resi,
    jsonb_build_object('total_biaya', v_t.total_biaya), v_alasan);
end;
$$;

-- ---------------------------------------------------------------------
-- Grant
-- ---------------------------------------------------------------------
revoke execute on function public.buat_nomor_resi() from public, anon, authenticated;
revoke execute on function public.cari_duplikat_transaksi(uuid, uuid, numeric) from public, anon;
revoke execute on function public.buat_transaksi(uuid, uuid, jsonb, bigint, text, boolean) from public, anon;
revoke execute on function public.batalkan_transaksi(text, text) from public, anon;
grant execute on function public.cari_duplikat_transaksi(uuid, uuid, numeric) to authenticated;
grant execute on function public.buat_transaksi(uuid, uuid, jsonb, bigint, text, boolean) to authenticated;
grant execute on function public.batalkan_transaksi(text, text) to authenticated;
