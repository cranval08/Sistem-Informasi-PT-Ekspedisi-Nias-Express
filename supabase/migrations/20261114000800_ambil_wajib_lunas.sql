-- =====================================================================
-- Pengambilan barang wajib lunas (keputusan Fase 5 no. 4, opsi B,
-- disetujui 2026-11-14).
--
-- Barang berstatus Tiba yang masih memiliki sisa tagihan tidak dapat
-- diserahkan. Petugas mencatat pelunasan lewat catat_pembayaran
-- (Pemilik/Admin Loket) lalu mengonfirmasi pengambilan. Tidak ada override:
-- override_belum_lunas hanya berlaku untuk pemuatan, bukan penyerahan.
--
-- Kasus yang tercakup: resi dimuat dengan override belum lunas, atau
-- pembayaran dibatalkan (batalkan_pembayaran) setelah resi dimuat.
-- Pemeriksaan dilakukan setelah baris transaksi dikunci (for update),
-- sehingga tidak bisa didahului pembatalan pembayaran yang berjalan
-- bersamaan (batalkan_pembayaran juga mengunci baris yang sama).
-- =====================================================================

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
  v_sisa bigint;
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
  if v_t.status_bayar <> 'lunas' then
    v_sisa := v_t.total_biaya - v_t.total_dibayar;
    raise exception 'Pembayaran belum lunas (sisa Rp%). Catat pelunasan terlebih dahulu sebelum barang diserahkan.',
      replace(to_char(v_sisa, 'FM999,999,999,990'), ',', '.') using errcode = '23514';
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

-- create or replace mempertahankan hak akses, tetapi dinyatakan ulang agar
-- migrasi ini berdiri sendiri.
revoke execute on function public.konfirmasi_pengambilan(text, boolean, text) from public, anon;
grant execute on function public.konfirmasi_pengambilan(text, boolean, text) to authenticated;
