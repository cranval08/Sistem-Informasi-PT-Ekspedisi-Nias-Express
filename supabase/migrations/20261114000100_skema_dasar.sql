-- =====================================================================
-- Nias Express Operations Dashboard — skema dasar
-- Nama tabel & field mengikuti kamus data PRD §9 (Bahasa Indonesia).
-- Uang: bigint Rupiah. Berat: numeric(12,3) kilogram. Waktu: timestamptz
-- yang diisi server. Nilai bisnis (tarif, kapasitas, ambang) TIDAK diberi
-- default karangan — wajib diisi pemilik.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------
create type public.peran_pengguna as enum ('pemilik', 'admin_loket', 'staf_gudang', 'supir');
create type public.satuan_item    as enum ('kg', 'ton', 'koli');
create type public.jenis_unit     as enum ('kecil', 'besar');
create type public.status_armada  as enum ('siaga', 'perjalanan', 'perbaikan', 'rusak');
create type public.status_kirim   as enum ('diterima_loket', 'dimuat', 'dalam_perjalanan', 'tiba', 'sudah_diambil');
create type public.status_manifes as enum ('draft', 'dimuat', 'berangkat', 'tiba', 'dibatalkan');
create type public.status_record_pembayaran as enum ('valid', 'dibatalkan');
create type public.status_kendala as enum ('terbuka', 'selesai');

-- ---------------------------------------------------------------------
-- Pengaturan perusahaan (satu baris). Nilai bisnis yang belum diketahui
-- dibiarkan NULL = "perlu dilengkapi pemilik".
-- ---------------------------------------------------------------------
create table public.pengaturan (
  id                                  smallint primary key default 1 check (id = 1),
  nama_perusahaan                     text not null,
  alamat                              text,
  telepon                             text,
  prefiks_resi                        text not null check (prefiks_resi ~ '^[A-Z0-9]{1,6}$'),
  zona_waktu                          text not null default 'Asia/Jakarta',
  -- Persentase utilisasi ketika peringatan kapasitas mulai muncul. NULL = belum diatur.
  ambang_peringatan_kapasitas_persen  numeric(5,2) check (ambang_peringatan_kapasitas_persen > 0 and ambang_peringatan_kapasitas_persen <= 100),
  -- Kebijakan override (PRD §7.8 aturan 10, §7.11). Default paling aman: tidak diizinkan.
  izinkan_override_kapasitas          boolean not null default false,
  izinkan_override_belum_lunas        boolean not null default false,
  -- Tampilkan label "Data Demo" di seluruh aplikasi.
  mode_demo                           boolean not null default true,
  updated_at                          timestamptz not null default now(),
  updated_by                          uuid
);

-- ---------------------------------------------------------------------
-- data_pengguna — id_pengguna = auth.users.id
-- ---------------------------------------------------------------------
create table public.data_pengguna (
  id_pengguna    uuid primary key references auth.users (id) on delete restrict,
  nama_lengkap   text not null check (length(btrim(nama_lengkap)) > 0),
  peran          public.peran_pengguna not null,
  nomor_telepon  text not null unique check (nomor_telepon ~ '^0[0-9]{9,12}$'),
  email          text not null unique,
  is_active      boolean not null default true,
  waktu_dibuat   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index data_pengguna_peran_idx on public.data_pengguna (peran) where is_active;

-- ---------------------------------------------------------------------
-- data_pelanggan — pengirim & penerima merujuk entitas yang sama
-- ---------------------------------------------------------------------
create table public.data_pelanggan (
  id_pelanggan  uuid primary key default gen_random_uuid(),
  nama          text not null check (length(btrim(nama)) > 0),
  telepon       text not null unique check (telepon ~ '^0[0-9]{9,12}$'),
  is_active     boolean not null default true,
  waktu_dibuat  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references public.data_pengguna (id_pengguna)
);
create index data_pelanggan_nama_trgm_idx on public.data_pelanggan using gin (nama extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------
-- data_item — master jenis barang & tarif
-- ---------------------------------------------------------------------
create table public.data_item (
  id_item           uuid primary key default gen_random_uuid(),
  nama_item         text not null check (length(btrim(nama_item)) > 0),
  satuan            public.satuan_item not null,
  tarif_per_satuan  bigint not null check (tarif_per_satuan > 0),
  is_active         boolean not null default true,
  waktu_dibuat      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index data_item_nama_unik on public.data_item (lower(btrim(nama_item)));

-- ---------------------------------------------------------------------
-- data_armada
-- ---------------------------------------------------------------------
create table public.data_armada (
  id_armada            uuid primary key default gen_random_uuid(),
  plat_nomor           text not null check (plat_nomor ~ '^[A-Z]{1,2} [0-9]{1,4}( [A-Z]{1,3})?$'),
  jenis_unit           public.jenis_unit not null,
  kapasitas_ton        numeric(8,3) not null check (kapasitas_ton > 0),
  id_supir             uuid references public.data_pengguna (id_pengguna),
  status               public.status_armada not null default 'siaga',
  waktu_status_diubah  timestamptz not null default now(),
  is_active            boolean not null default true,
  catatan              text,
  waktu_dibuat         timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index data_armada_plat_unik on public.data_armada (plat_nomor);

-- ---------------------------------------------------------------------
-- data_transaksi
-- ---------------------------------------------------------------------
create table public.data_transaksi (
  no_resi                  text primary key check (length(no_resi) > 0),
  waktu_transaksi          timestamptz not null default now(),
  -- Tanggal kalender di zona waktu operasional; diisi trigger (dipakai deteksi duplikasi & laporan).
  tanggal_transaksi        date not null,
  id_pengirim              uuid not null references public.data_pelanggan (id_pelanggan),
  id_penerima              uuid not null references public.data_pelanggan (id_pelanggan),
  id_armada                uuid references public.data_armada (id_armada),
  id_pengguna              uuid not null references public.data_pengguna (id_pengguna),
  status_kirim             public.status_kirim not null default 'diterima_loket',
  total_berat_kg           numeric(12,3) not null default 0 check (total_berat_kg >= 0),
  total_biaya              bigint not null default 0 check (total_biaya >= 0),
  -- Dipelihara trigger dari pembayaran berstatus valid.
  total_dibayar            bigint not null default 0,
  status_bayar             text generated always as (
                             case when total_biaya > 0 and total_dibayar = total_biaya
                                  then 'lunas' else 'belum_lunas' end
                           ) stored,
  catatan                  text,
  -- Override muat walau belum lunas (hanya pemilik, wajib alasan).
  override_belum_lunas     boolean not null default false,
  override_belum_lunas_alasan text,
  override_belum_lunas_oleh   uuid references public.data_pengguna (id_pengguna),
  -- Pengambilan barang
  waktu_diambil            timestamptz,
  diambil_diproses_oleh    uuid references public.data_pengguna (id_pengguna),
  identitas_terverifikasi  boolean not null default false,
  catatan_pengambilan      text,
  -- Pembatalan (void) — tidak ada hapus permanen
  status_void              boolean not null default false,
  void_reason              text,
  void_oleh                uuid references public.data_pengguna (id_pengguna),
  void_pada                timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint total_dibayar_valid check (total_dibayar >= 0 and total_dibayar <= total_biaya),
  constraint void_wajib_alasan check (not status_void or length(btrim(coalesce(void_reason, ''))) > 0),
  constraint override_wajib_alasan check (not override_belum_lunas or length(btrim(coalesce(override_belum_lunas_alasan, ''))) > 0),
  constraint pengambilan_lengkap check (
    status_kirim <> 'sudah_diambil'
    or (waktu_diambil is not null and diambil_diproses_oleh is not null and identitas_terverifikasi)
  )
);
create index data_transaksi_waktu_idx    on public.data_transaksi (waktu_transaksi desc);
create index data_transaksi_status_idx   on public.data_transaksi (status_kirim) where not status_void;
create index data_transaksi_bayar_idx    on public.data_transaksi (status_bayar) where not status_void;
create index data_transaksi_duplikat_idx on public.data_transaksi (id_pengirim, id_penerima, tanggal_transaksi);
create index data_transaksi_penerima_idx on public.data_transaksi (id_penerima);

-- ---------------------------------------------------------------------
-- detail_transaksi — satu jenis barang boleh muncul di beberapa baris
-- jumlah  : kuantitas dalam satuan tarif (kg / ton / koli)
-- berat_kg: berat aktual, selalu wajib (dasar perhitungan tonase)
-- ---------------------------------------------------------------------
create table public.detail_transaksi (
  id_detail              uuid primary key default gen_random_uuid(),
  no_resi                text not null references public.data_transaksi (no_resi),
  id_item                uuid not null references public.data_item (id_item),
  satuan_saat_transaksi  public.satuan_item not null,
  jumlah                 numeric(12,3) not null check (jumlah > 0),
  berat_kg               numeric(12,3) not null check (berat_kg > 0),
  tarif_saat_transaksi   bigint not null check (tarif_saat_transaksi > 0),
  subtotal               bigint not null,
  constraint subtotal_konsisten check (subtotal = round(jumlah * tarif_saat_transaksi))
);
create index detail_transaksi_resi_idx on public.detail_transaksi (no_resi);

-- ---------------------------------------------------------------------
-- pembayaran — tidak dihapus; koreksi lewat status 'dibatalkan' + alasan
-- ---------------------------------------------------------------------
create table public.pembayaran (
  id_pembayaran         uuid primary key default gen_random_uuid(),
  no_resi               text not null references public.data_transaksi (no_resi),
  waktu_bayar           timestamptz not null default now(),
  jumlah_bayar          bigint not null check (jumlah_bayar >= 0),
  id_pengguna_pencatat  uuid not null references public.data_pengguna (id_pengguna),
  status_pembayaran_record public.status_record_pembayaran not null default 'valid',
  catatan               text,
  catatan_koreksi       text,
  dibatalkan_oleh       uuid references public.data_pengguna (id_pengguna),
  dibatalkan_pada       timestamptz,
  created_at            timestamptz not null default now(),
  constraint batal_wajib_alasan check (
    status_pembayaran_record = 'valid' or length(btrim(coalesce(catatan_koreksi, ''))) > 0
  )
);
create index pembayaran_resi_idx  on public.pembayaran (no_resi);
create index pembayaran_waktu_idx on public.pembayaran (waktu_bayar desc);

-- ---------------------------------------------------------------------
-- penghitung_resi — nomor urut per hari (dipakai fungsi pembuat resi)
-- ---------------------------------------------------------------------
create table public.penghitung_resi (
  tanggal         date primary key,
  nomor_terakhir  integer not null default 0
);

-- ---------------------------------------------------------------------
-- manifes & manifes_detail
-- ---------------------------------------------------------------------
create table public.manifes (
  id_manifes          uuid primary key default gen_random_uuid(),
  id_armada           uuid not null references public.data_armada (id_armada),
  id_supir            uuid not null references public.data_pengguna (id_pengguna),
  rute                text not null check (length(btrim(rute)) > 0),
  status_manifes      public.status_manifes not null default 'draft',
  waktu_dibuat        timestamptz not null default now(),
  waktu_dimuat        timestamptz,
  waktu_berangkat     timestamptz,
  waktu_tiba          timestamptz,
  created_by          uuid not null references public.data_pengguna (id_pengguna),
  override_kapasitas  boolean not null default false,
  override_kapasitas_alasan text,
  override_kapasitas_oleh   uuid references public.data_pengguna (id_pengguna),
  alasan_batal        text,
  catatan             text,
  updated_at          timestamptz not null default now(),
  constraint override_kapasitas_wajib_alasan check (
    not override_kapasitas or length(btrim(coalesce(override_kapasitas_alasan, ''))) > 0
  ),
  constraint batal_manifes_wajib_alasan check (
    status_manifes <> 'dibatalkan' or length(btrim(coalesce(alasan_batal, ''))) > 0
  )
);
-- Satu armada hanya boleh punya satu perjalanan aktif.
create unique index manifes_satu_aktif_per_armada on public.manifes (id_armada)
  where status_manifes in ('draft', 'dimuat', 'berangkat');
create index manifes_supir_idx on public.manifes (id_supir);

create table public.manifes_detail (
  id                 uuid primary key default gen_random_uuid(),
  id_manifes         uuid not null references public.manifes (id_manifes),
  no_resi            text not null references public.data_transaksi (no_resi),
  aktif              boolean not null default true,  -- false bila dipindah / manifes dibatalkan
  ditambahkan_oleh   uuid not null references public.data_pengguna (id_pengguna),
  ditambahkan_pada   timestamptz not null default now(),
  dilepas_pada       timestamptz,
  unique (id_manifes, no_resi)
);
-- Satu resi hanya boleh berada di satu manifes aktif.
create unique index manifes_detail_resi_aktif on public.manifes_detail (no_resi) where aktif;

-- ---------------------------------------------------------------------
-- Riwayat & kendala
-- ---------------------------------------------------------------------
create table public.riwayat_status_pengiriman (
  id                 bigint generated always as identity primary key,
  no_resi            text not null references public.data_transaksi (no_resi),
  status_sebelumnya  public.status_kirim,
  status_baru        public.status_kirim not null,
  waktu_perubahan    timestamptz not null default now(),
  id_pengguna        uuid references public.data_pengguna (id_pengguna),
  catatan            text
);
create index riwayat_status_resi_idx on public.riwayat_status_pengiriman (no_resi, waktu_perubahan);

create table public.riwayat_status_armada (
  id                 bigint generated always as identity primary key,
  id_armada          uuid not null references public.data_armada (id_armada),
  status_sebelumnya  public.status_armada,
  status_baru        public.status_armada not null,
  waktu_perubahan    timestamptz not null default now(),
  id_pengguna        uuid references public.data_pengguna (id_pengguna),
  catatan            text
);
create index riwayat_status_armada_idx on public.riwayat_status_armada (id_armada, waktu_perubahan);

create table public.kendala_perjalanan (
  id               uuid primary key default gen_random_uuid(),
  id_manifes       uuid references public.manifes (id_manifes),
  id_armada        uuid not null references public.data_armada (id_armada),
  dilaporkan_oleh  uuid not null references public.data_pengguna (id_pengguna),
  waktu_lapor      timestamptz not null default now(),
  jenis            text not null check (jenis in ('kerusakan', 'keterlambatan', 'lainnya')),
  deskripsi        text not null check (length(btrim(deskripsi)) > 0),
  status           public.status_kendala not null default 'terbuka',
  diselesaikan_oleh uuid references public.data_pengguna (id_pengguna),
  diselesaikan_pada timestamptz
);
create index kendala_armada_idx on public.kendala_perjalanan (id_armada, waktu_lapor desc);

-- ---------------------------------------------------------------------
-- audit_log — append-only
-- ---------------------------------------------------------------------
create table public.audit_log (
  id                bigint generated always as identity primary key,
  id_pengguna       uuid references public.data_pengguna (id_pengguna),
  aksi              text not null,
  entitas           text not null,
  entitas_id        text,
  detail_perubahan  jsonb,
  alasan            text,
  waktu             timestamptz not null default now()
);
create index audit_log_waktu_idx   on public.audit_log (waktu desc);
create index audit_log_entitas_idx on public.audit_log (entitas, entitas_id);

-- ---------------------------------------------------------------------
-- Baris pengaturan awal. Nama perusahaan berasal dari PRD; prefiks resi
-- "NX" adalah default yang disetujui dan dapat diubah pemilik. Ambang
-- peringatan kapasitas sengaja NULL (perlu dilengkapi).
-- ---------------------------------------------------------------------
insert into public.pengaturan (id, nama_perusahaan, prefiks_resi)
values (1, 'PT. Ekspedisi Nias Express', 'NX');
