# Nias Express Operations Dashboard

Sistem informasi operasional PT. Ekspedisi Nias Express: transaksi & resi, pembayaran, manifes, armada, status pengiriman, dan dashboard. Kebutuhan lengkap ada di [`PRD.md`](PRD.md).

> **Status: Fase 2 (data inti) selesai.** Selain fondasi Fase 1 (autentikasi, hak akses per peran, skema database + RLS, layout, sistem desain), modul berikut sudah terhubung ke database:
>
> - **Pelanggan** (Pemilik, Admin Loket): cari nama/telepon, paginasi, tambah/ubah, nonaktif/aktifkan, peringatan nomor telepon ganda.
> - **Jenis barang & tarif** (Pemilik): tambah/ubah tarif, nonaktifkan, riwayat perubahan (nilai lama → baru) dari audit log.
> - **Armada** (Pemilik kelola, Staf Gudang lihat): plat, jenis, kapasitas wajib, supir dari pengguna berperan Supir, ubah status dengan catatan, riwayat status.
> - **Pengguna** (Pemilik): buat akun login, ubah nama/telepon/peran, nonaktif/aktifkan (sekaligus blokir login), atur ulang password.
> - **Pengaturan** (Pemilik): identitas perusahaan, prefiks resi, ambang peringatan kapasitas, kebijakan override, mode demo.
>
> Modul lain (transaksi, pembayaran, manifes, laporan, audit log) masih tampil sebagai halaman berlabel *"dijadwalkan pada Fase N"*.

## Teknologi

Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · shadcn/ui · Supabase (PostgreSQL, Auth, Row Level Security) · Zod · Vitest + PGlite.

## Persyaratan

- Node.js 22 LTS atau lebih baru (`.nvmrc` = 22)
- Project Supabase Cloud

## 1. Instalasi

```bash
npm install
cp .env.example .env.local   # lalu isi nilainya
```

| Variabel | Lokasi di Supabase | Catatan |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API (Project URL) | Publik |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key (`sb_publishable_…`) | Publik, dibatasi RLS |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys → Secret key (`sb_secret_…`) | **Rahasia, khusus server.** Jangan pernah beri awalan `NEXT_PUBLIC_` |
| `DEMO_PASSWORD` | — | Password untuk semua akun demo (min. 8 karakter) |

Nama variabel lama (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) masih diterima sebagai cadangan; nama baru diutamakan bila keduanya terisi. Aplikasi menolak berjalan jika secret key ditemukan di variabel `NEXT_PUBLIC_*` atau jika publishable key salah diletakkan di `SUPABASE_SECRET_KEY`.

Periksa konfigurasi tanpa menampilkan nilai kunci dan tanpa koneksi ke Supabase:

```bash
npm run cek:env
```

`.env.local` sudah masuk `.gitignore` dan tidak boleh di-commit.

## 2. Setup database (migrasi)

Migrasi ada di `supabase/migrations/`. Terapkan ke project cloud dengan Supabase CLI (sudah terpasang sebagai dev dependency):

```bash
npx supabase login                         # sekali, membuka browser
npx supabase link --project-ref <project-ref>   # akan meminta password database
npm run db:push                            # menerapkan migrasi ke project cloud (supabase db push --remote)
npm run verifikasi:remote                  # cek read-only: tabel, pengaturan, akun demo, penolakan anon
```

Supabase CLI v3 menargetkan database lokal secara default; `npm run db:push` sudah memakai `--remote`.

Alternatif tanpa CLI: jalankan isi setiap berkas di `supabase/migrations/` secara berurutan di **SQL Editor** Supabase.

**Wajib di Dashboard Supabase:** Authentication → Sign In / Providers → matikan **"Allow new users to sign up"**. Akun hanya dibuat oleh Pemilik.

## 3. Seed akun demo

```bash
npm run seed:akun
```

| Peran | Email | Password |
|---|---|---|
| Pemilik | `demo.pemilik@example.com` | nilai `DEMO_PASSWORD` |
| Admin Loket | `demo.admin@example.com` | nilai `DEMO_PASSWORD` |
| Staf Gudang | `demo.gudang@example.com` | nilai `DEMO_PASSWORD` |
| Supir | `demo.supir@example.com` | nilai `DEMO_PASSWORD` |

Lalu, opsional, isi data contoh Fase 2 (pelanggan, jenis barang dengan **tarif contoh**, armada dengan **kapasitas contoh**):

```bash
npm run seed:demo
```

Idempoten (baris yang sudah ada dilewati, tidak ditimpa) dan menolak berjalan bila `mode_demo` sudah dimatikan. Semua nama diawali `[Demo]`, nomor telepon fiktif, plat memakai kode wilayah fiktif `XX`. Tarif dan kapasitas **bukan** nilai aktual perusahaan dan harus diganti Pemilik.

Semua akun dan data demo diberi label **Data Demo** dan bukan data aktual perusahaan. Banner "Data Demo" dikendalikan oleh `pengaturan.mode_demo`.

## 4. Menjalankan

```bash
npm run dev        # http://localhost:3000
```

## 5. Pengujian & pemeriksaan

```bash
npm test                                  # semua tes (Vitest)
npx vitest run tests/db/rls.test.ts       # satu berkas
npx vitest run -t "Supir"                 # tes yang namanya cocok
npm run typecheck
npm run lint
npm run build
npm run check                             # semua di atas berurutan
npm run test:remote                       # uji RLS ke Supabase Cloud dengan akun demo (butuh seed)
npm run test:halaman                      # buka semua halaman sebagai tiap peran (butuh `npm run dev` berjalan)
```

`npm run test:halaman` login sebagai keempat akun demo, membuka setiap rute pada server yang sedang berjalan (default `http://localhost:3000`, ubah dengan `UJI_APP_URL`), dan memastikan halaman yang diizinkan merespons 200 sedangkan halaman lain dialihkan ke `/akses-ditolak`. Uji ini menangkap galat render server yang tidak terdeteksi oleh `npm run build`.

`npm run test:remote` login sebagai keempat akun demo memakai publishable key dan memastikan RLS menolak akses yang tidak sah. Uji ini hanya membaca atau mencoba menulis yang harus ditolak, sehingga tidak mengubah data.

Tes database (`tests/db/`) menjalankan seluruh migrasi di **PGlite** (Postgres dalam WASM) dengan shim skema `auth` Supabase, jadi tidak menyentuh database cloud dan tidak butuh Docker.

## 6. Deployment

1. Push repository ke GitHub, lalu import ke Vercel.
2. Isi environment variables di Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan `SUPABASE_SECRET_KEY` (tandai *Sensitive*; tanpa `DEMO_PASSWORD`).
3. Di Supabase: Authentication → URL Configuration → isi **Site URL** dengan domain Vercel (HTTPS).
4. Terapkan migrasi baru dengan `npm run db:push` sebelum deploy kode yang membutuhkannya.
   `SUPABASE_SECRET_KEY` dibutuhkan di server untuk membuat akun, menonaktifkan login, dan mengatur ulang password dari menu Data Pengguna.
5. Aktifkan backup database sesuai paket Supabase.

## Integrasi yang belum tersedia

Pelacakan GPS, WhatsApp, payment gateway, sinkronisasi Google Sheets, dan printer Bluetooth khusus **belum diintegrasikan** (di luar cakupan MVP, PRD §5.2). Cetak resi nanti memakai fungsi print browser.
