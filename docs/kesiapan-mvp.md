# Kesiapan MVP — hasil Fase 7 (quality assurance)

Dokumen ini memetakan kriteria penerimaan PRD §14 dan skenario uji PRD §15 ke bukti pengujian, mencatat batasan yang diketahui, dan daftar periksa deployment. Langkah uji manual ada di [`uji-manual.md`](uji-manual.md).

## 1. Lapisan pengujian

| Perintah | Isi | Menyentuh cloud? |
|---|---|---|
| `npm test` | Tes database di PGlite (seluruh migrasi + fixture), unit domain (perhitungan biaya, kapasitas, CSV, tanggal Jakarta), dan uji arsitektur statis (`tests/arsitektur.test.ts`) | Tidak |
| `npm run test:remote` | RLS & RPC di Supabase Cloud sebagai 4 akun demo (hanya membaca / mencoba menulis yang harus ditolak) | Ya, baca saja |
| `npm run test:halaman` | Setiap rute × setiap peran pada server yang berjalan: 200 / 307 ke `/akses-ditolak` / 307 ke `/login`, nilai rusak (NaN, Invalid Date), ekspor CSV per peran | Ya, baca saja |
| `npm run uji:responsif` | Chrome/Edge headless: setiap halaman per peran pada 375, 768, dan 1280 px; mendeteksi scroll horizontal, galat JavaScript, dan menyimpan tangkapan layar ke `.uji-responsif/` | Ya, baca saja |
| `npm run check` | typecheck + lint + `npm test` + build | Tidak |

`test:halaman` dan `uji:responsif` dijalankan terhadap **server dev dan build produksi** (`npm run build && npx next start -p 3100`, lalu `UJI_APP_URL=http://localhost:3100`).

## 2. Kriteria penerimaan PRD §14

| Kriteria | Bukti otomatis | Uji manual |
|---|---|---|
| Login & diarahkan ke dashboard sesuai peran | `rls-remote` (peran_saya), `test:halaman` | A1 |
| Tidak dapat mengakses fitur di luar hak, termasuk URL/API langsung | `rls.test.ts`, `fase*.test.ts` (RPC menolak), `test:halaman` (307 untuk setiap rute terlarang; ekspor 403), `arsitektur.test.ts` (setiap halaman & server action memeriksa peran) | H1–H4 |
| Admin membuat pelanggan & transaksi | `fase2`, `fase3` | B1, B2 |
| Nomor resi unik otomatis | `fase3` (format & penghitung), constraint unik | B2 |
| Field wajib kosong/tidak valid ditolak | `fase3` validasi, `skema.test.ts`, `transaksi.test.ts` | B3 |
| Peringatan transaksi duplikat | `fase3` duplikasi, `fase6` catat_peringatan_duplikat | B4 |
| Total biaya otomatis & dapat diverifikasi | `transaksi.test.ts`, `fase3` (UI = Postgres) | B2 |
| Tarif lama tetap pada transaksi lama | `fase3` snapshot tarif | B6 |
| Pembayaran bertahap, lunas otomatis | `fase4`, `invarian` | C1–C3 |
| Belum lunas tidak dapat dimuat tanpa override | `fase5` | D3 |
| Pemilik mengelola item, tarif, armada, kapasitas, pengguna | `fase2` | G1–G4 |
| Staf membuat manifes, total tonase dihitung | `fase5`, `manifes.test.ts` | D1–D2 |
| Muatan melebihi kapasitas diperingatkan & diblokir | `fase5` (di bawah / sama / melebihi / kapasitas diturunkan) | D4 |
| Status pengiriman berurutan | `invarian`, `fase5` | D5–D6 |
| Pengambilan mencatat waktu & petugas setelah verifikasi identitas | `fase5`, `invarian` | E1–E3 |
| Dashboard dari database & dapat difilter | `fase6`, `test:halaman` (varian filter) | F1–F4 |
| Laporan dapat dicari & difilter | `test:halaman` (varian filter & ekspor) | F5–F8 |
| Perubahan penting tercatat di audit log | `fase2`–`fase6` (setiap RPC memeriksa audit), `invarian` (audit tidak dapat diubah) | F9 |
| Responsif desktop & smartphone | `uji:responsif` (129 tampilan, 0 masalah) | I1 |
| Loading, empty, success, error state | Tombol "Menyimpan…" & penjaga double-submit; indikator memuat pada menu; `EmptyState` di setiap daftar; toast sukses; `error.tsx` & `not-found.tsx` (diuji `test:halaman`) | I2–I4 |
| README: instalasi, konfigurasi, migrasi, akun demo | README §1–§6 | — |

## 3. Skenario uji minimum PRD §15

Semua skenario sudah otomatis. Nama tes memuat nomor skenarionya:

- **Transaksi 1–7**: `tests/db/fase3.test.ts` (1, 2–5 sekaligus, 6, 7) dan `tests/db/invarian.test.ts`.
- **Pembayaran 1–5**: `tests/db/fase4.test.ts` ("1." … "4.", hak akses 5).
- **Armada & manifes 1–5**: `tests/db/fase5.test.ts` ("1." … "5.").
- **Pengiriman 1–4**: `tests/db/fase5.test.ts` ("1 & 4.", "2.", "3.").
- **Hak akses 1–3**: `domain.test.ts` & `fase6` (Supir → laporan keuangan), `fase2` & `rls.test.ts` (Admin → tarif), `test:halaman` ("belum login: … → /login").

## 4. Perbaikan selama Fase 7

1. **Hak akses di build produksi.** Dengan Cache Components, redirect dari `page.tsx` baru terjadi setelah respons 200 mulai dikirim; peran tanpa akses dialihkan lewat skrip browser (tidak ada data yang bocor, tetapi tanpa JavaScript halaman shell tetap tampil). Sekarang `proxy.ts` memeriksa peran (`peran_saya()`) sebelum rendering sehingga responsnya HTTP 307 yang sesungguhnya. Pemeriksaan di halaman dan RLS tetap berlaku sebagai lapisan berikutnya.
2. **Error & not-found state.** Ditambahkan `src/app/(app)/error.tsx` (tampil di dalam aplikasi dengan tombol "Coba lagi" dan kode rujukan), `global-error.tsx`, dan halaman 404 berbahasa Indonesia; sebelumnya tampil layar galat bawaan Next.js berbahasa Inggris.
3. **Loading state navigasi.** Menu samping menampilkan indikator memuat saat halaman tujuan sedang diambil. `loading.tsx` sengaja tidak dipakai karena akan membuat redirect & 404 kehilangan status HTTP-nya.
4. **Double-submit.** Formulir transaksi, pembayaran, dan dialog konfirmasi kini dikunci secara sinkron sejak klik pertama (bukan hanya tombol yang dinonaktifkan setelah render ulang).
5. **Pesan koneksi putus jujur.** Bila respons server hilang, aplikasi tidak lagi menyatakan "belum tersimpan" (bisa saja sudah tersimpan); pengguna diminta memeriksa data terbaru. Transaksi yang dikirim ulang akan memicu peringatan duplikasi, bukan tersimpan ganda diam-diam.

## 5. Batasan yang diketahui

- **Status 404 di produksi.** Detail resi/manifes/armada yang tidak ada menampilkan halaman "Data tidak ditemukan" (dengan `noindex`), tetapi status HTTP-nya 200 di build produksi (di dev 404). Penyebabnya sama dengan butir 4.1; dampaknya hanya pada kode status, bukan isi atau keamanan.
- **Tanpa mode gelap.** PRD tidak memintanya; aplikasi memakai tema terang.
- **Data cloud saat ini** belum memiliki manifes (armada demo pertama berstatus Rusak), sehingga halaman detail manifes belum diperiksa tangkapan layarnya; tercakup tes database dan uji manual D1–D6.
- **Belum diintegrasikan** (di luar MVP, PRD §5.2): GPS, WhatsApp, payment gateway, Google Sheets, printer Bluetooth.
- **Nilai bisnis yang perlu dilengkapi Pemilik** (tidak dikarang): tarif aktual, kapasitas aktual tiap truk, ambang peringatan kapasitas, kebijakan override, alamat & telepon perusahaan untuk resi.

## 6. Daftar periksa deployment (Vercel + Supabase)

1. Semua migrasi sudah diterapkan ke project cloud (`npm run db:push`; terakhir `…1000`). Fase 7 **tidak** menambah migrasi.
2. `npm run check` lulus; `test:remote`, `test:halaman`, dan `uji:responsif` lulus terhadap build produksi lokal.
3. Push repository ke GitHub, import ke Vercel (framework Next.js terdeteksi otomatis).
4. Environment variables di Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` (tandai *Sensitive*). Jangan isi `DEMO_PASSWORD` di Vercel.
5. Supabase → Authentication → URL Configuration: **Site URL** = domain Vercel (HTTPS).
6. Supabase → Authentication → Sign In / Providers: "Allow new users to sign up" **mati**.
7. Setelah deploy: jalankan `UJI_APP_URL=https://<domain> npm run test:halaman` dari komputer lokal.
8. Sebelum dipakai untuk data nyata: Pemilik melengkapi Pengaturan, tarif, dan kapasitas aktual; matikan `mode_demo`; nonaktifkan atau ganti password akun demo; aktifkan backup database sesuai paket Supabase.
