# Nias Express Operations Dashboard

Sistem informasi operasional PT. Ekspedisi Nias Express: transaksi & resi, pembayaran, manifes, armada, status pengiriman, dan dashboard. Kebutuhan lengkap ada di [`PRD.md`](PRD.md).

> **Status: Fase 1 (fondasi) selesai.** Autentikasi, hak akses per peran, skema database lengkap + RLS, layout, dan sistem desain sudah tersedia. Modul lain tampil sebagai halaman berlabel *"dijadwalkan pada Fase N"* dan belum terhubung ke database.

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
npm run db:push                            # menerapkan semua migrasi
```

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
```

Tes database (`tests/db/`) menjalankan seluruh migrasi di **PGlite** (Postgres dalam WASM) dengan shim skema `auth` Supabase, jadi tidak menyentuh database cloud dan tidak butuh Docker.

## 6. Deployment

1. Push repository ke GitHub, lalu import ke Vercel.
2. Isi environment variables di Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, dan `SUPABASE_SECRET_KEY` (tandai *Sensitive*; tanpa `DEMO_PASSWORD`).
3. Di Supabase: Authentication → URL Configuration → isi **Site URL** dengan domain Vercel (HTTPS).
4. Terapkan migrasi baru dengan `npm run db:push` sebelum deploy kode yang membutuhkannya.
5. Aktifkan backup database sesuai paket Supabase.

## Integrasi yang belum tersedia

Pelacakan GPS, WhatsApp, payment gateway, sinkronisasi Google Sheets, dan printer Bluetooth khusus **belum diintegrasikan** (di luar cakupan MVP, PRD §5.2). Cetak resi nanti memakai fungsi print browser.
