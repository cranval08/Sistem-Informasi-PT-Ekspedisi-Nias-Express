-- =====================================================================
-- Fase 4 — Pembayaran & kas (PRD §7.9, §15 "Pembayaran").
-- Pembayaran ditulis hanya lewat fungsi ini; trigger dari Fase 1 tetap
-- menghitung ulang total_dibayar dengan row lock sebagai penjaga akhir.
-- =====================================================================

-- ---------------------------------------------------------------------
-- catat_pembayaran — Pemilik & Admin Loket. Nominal bilangan bulat > 0
-- dan tidak melebihi sisa biaya. (Pembayaran awal Rp0 saat transaksi
-- berarti "belum bayar"; mencatat baris Rp0 tidak menambah informasi.)
-- ---------------------------------------------------------------------
create or replace function public.catat_pembayaran(
  p_no_resi text,
  p_jumlah bigint,
  p_catatan text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.data_transaksi;
  v_sisa bigint;
  v_id uuid;
  v_catatan text := nullif(btrim(coalesce(p_catatan, '')), '');
begin
  perform public.wajib_peran('pemilik', 'admin_loket');

  -- Kunci transaksi agar dua pencatatan bersamaan tidak melampaui total.
  select * into v_t from public.data_transaksi t where t.no_resi = p_no_resi for update;
  if not found then
    raise exception 'Nomor resi tidak ditemukan.' using errcode = '23514';
  end if;
  if v_t.status_void then
    raise exception 'Transaksi sudah dibatalkan; pembayaran tidak dapat dicatat.' using errcode = '23514';
  end if;

  v_sisa := v_t.total_biaya - v_t.total_dibayar;
  if v_sisa <= 0 then
    raise exception 'Transaksi sudah lunas; tidak ada sisa yang perlu dibayar.' using errcode = '23514';
  end if;
  if p_jumlah is null or p_jumlah <= 0 then
    raise exception 'Nominal pembayaran harus bilangan bulat lebih dari Rp0.' using errcode = '23514';
  end if;
  if p_jumlah > v_sisa then
    raise exception 'Nominal pembayaran melebihi sisa biaya (sisa Rp%).',
      replace(to_char(v_sisa, 'FM999,999,999,990'), ',', '.') using errcode = '23514';
  end if;
  if v_catatan is not null and length(v_catatan) > 300 then
    raise exception 'Catatan maksimal 300 karakter.' using errcode = '23514';
  end if;

  insert into public.pembayaran (no_resi, jumlah_bayar, id_pengguna_pencatat, catatan)
  values (p_no_resi, p_jumlah, auth.uid(), v_catatan)
  returning id_pembayaran into v_id;

  perform public.catat_audit('catat_pembayaran', 'pembayaran', v_id::text,
    jsonb_build_object('no_resi', p_no_resi, 'jumlah_bayar', p_jumlah, 'sisa_sebelum', v_sisa, 'sisa_sesudah', v_sisa - p_jumlah));
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- batalkan_pembayaran — koreksi tanpa menghapus jejak. Hanya Pemilik,
-- wajib alasan. total_dibayar dihitung ulang oleh trigger.
-- ---------------------------------------------------------------------
create or replace function public.batalkan_pembayaran(p_id_pembayaran uuid, p_alasan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.pembayaran;
  v_alasan text := nullif(btrim(coalesce(p_alasan, '')), '');
begin
  perform public.wajib_peran('pemilik');
  if v_alasan is null then
    raise exception 'Alasan pembatalan pembayaran wajib diisi.' using errcode = '23514';
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

  update public.pembayaran b
     set status_pembayaran_record = 'dibatalkan', catatan_koreksi = v_alasan, dibatalkan_oleh = auth.uid()
   where b.id_pembayaran = p_id_pembayaran;

  perform public.catat_audit('batalkan_pembayaran', 'pembayaran', p_id_pembayaran::text,
    jsonb_build_object('no_resi', v_b.no_resi, 'jumlah_bayar', v_b.jumlah_bayar), v_alasan);
end;
$$;

-- ---------------------------------------------------------------------
-- rekap_kas — penerimaan per tanggal operasional (Asia/Jakarta) dan per
-- pencatat, dihitung dari baris pembayaran (bukan input total manual).
-- Pembayaran dibatalkan dilaporkan terpisah dan tidak masuk penerimaan.
-- ---------------------------------------------------------------------
create or replace function public.rekap_kas(p_dari date, p_sampai date)
returns table (
  tanggal date,
  id_pencatat uuid,
  nama_pencatat text,
  jumlah_pembayaran integer,
  total_diterima bigint,
  jumlah_dibatalkan integer,
  total_dibatalkan bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zona text := coalesce((select s.zona_waktu from public.pengaturan s where s.id = 1), 'Asia/Jakarta');
begin
  perform public.wajib_peran('pemilik', 'admin_loket');
  if p_dari is null or p_sampai is null or p_sampai < p_dari then
    raise exception 'Rentang tanggal tidak valid.' using errcode = '22023';
  end if;
  if p_sampai - p_dari > 366 then
    raise exception 'Rentang rekap maksimal 1 tahun.' using errcode = '22023';
  end if;

  return query
    select (b.waktu_bayar at time zone v_zona)::date as tanggal,
           b.id_pengguna_pencatat,
           p.nama_lengkap,
           (count(*) filter (where b.status_pembayaran_record = 'valid'))::integer,
           coalesce(sum(b.jumlah_bayar) filter (where b.status_pembayaran_record = 'valid'), 0)::bigint,
           (count(*) filter (where b.status_pembayaran_record = 'dibatalkan'))::integer,
           coalesce(sum(b.jumlah_bayar) filter (where b.status_pembayaran_record = 'dibatalkan'), 0)::bigint
    from public.pembayaran b
    join public.data_pengguna p on p.id_pengguna = b.id_pengguna_pencatat
    -- Batas waktu dalam zona operasional; memakai indeks waktu_bayar.
    where b.waktu_bayar >= (p_dari::timestamp at time zone v_zona)
      and b.waktu_bayar <  ((p_sampai + 1)::timestamp at time zone v_zona)
    group by 1, 2, 3
    order by 1 desc, 3;
end;
$$;

revoke execute on function public.catat_pembayaran(text, bigint, text) from public, anon;
revoke execute on function public.batalkan_pembayaran(uuid, text) from public, anon;
revoke execute on function public.rekap_kas(date, date) from public, anon;
grant execute on function public.catat_pembayaran(text, bigint, text) to authenticated;
grant execute on function public.batalkan_pembayaran(uuid, text) to authenticated;
grant execute on function public.rekap_kas(date, date) to authenticated;
