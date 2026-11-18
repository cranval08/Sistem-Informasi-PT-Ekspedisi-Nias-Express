# Uji manual — Fase 7 (seluruh MVP)

Uji otomatis (lihat [`kesiapan-mvp.md`](kesiapan-mvp.md)) memastikan aturan bisnis, hak akses, dan setiap halaman terbuka tanpa galat. Uji manual ini memastikan **alur kerja nyata nyaman, angka masuk akal, dan tampilan terbaca** oleh orang.

## Persiapan

1. `npm run dev`, buka `http://localhost:3000` (atau domain deployment).
2. Akun demo (password = nilai `DEMO_PASSWORD` di `.env.local`): `demo.pemilik@example.com`, `demo.admin@example.com`, `demo.gudang@example.com`, `demo.supir@example.com`.
3. Pakai dua jendela browser (biasa + *incognito*) agar dapat login sebagai dua peran sekaligus.
4. Data uji tersimpan di cloud dan tidak dapat dihapus permanen. Pakai pelanggan **[Demo]**; batalkan transaksi uji dengan alasan "Uji manual" bila perlu.
5. Sebagian langkah memerlukan armada **Siaga** dengan supir. Bila armada demo pertama berstatus Rusak, Pemilik dapat mengubah statusnya di **Armada** (atau memakai armada lain dan menugaskan Demo Supir).

Tandai setiap baris ✅ / ❌ dan catat temuannya (mis. "D4 ❌ pesan tidak menyebut kapasitas").

---

## A. Login & navigasi

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| A1 | Login sebagai tiap peran bergantian. | Masuk ke **Dashboard** sesuai peran; sidebar hanya menampilkan menu yang diizinkan (Supir: Dashboard & Perjalanan Saya saja). |
| A2 | Password salah. | Pesan galat berbahasa Indonesia; tidak menyebut apakah email terdaftar. |
| A3 | Klik menu di sidebar pada koneksi lambat (DevTools → Network → Slow 4G). | Muncul ikon memuat kecil di samping menu yang diklik sampai halaman tampil. |
| A4 | Logout dari menu pengguna, lalu tekan tombol Back browser dan muat ulang (F5). | Berakhir di halaman login; tidak ada data yang dapat dibuka atau diubah tanpa login. |

## B. Transaksi & resi (Admin Loket)

Bagian ini juga tersedia sebagai uji otomatis di peramban: `npm run uji:alur-transaksi` (server harus berjalan). Uji itu **menulis** transaksi & pelanggan [Demo] ke cloud, mengubah tarif demo sementara lalu mengembalikannya, dan menyimpan tangkapan layar `alur-*.png` di `.uji-responsif/`.


| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| B1 | **Pelanggan** → tambah pelanggan baru dengan telepon `+62 812-…`; lalu tambah lagi dengan nomor yang sama. | Telepon tersimpan sebagai `08…`; yang kedua ditolak "sudah terdaftar". |
| B2 | **Buat Transaksi**: pilih pengirim & penerima, dua baris barang (mis. satu kg, satu koli), bayar lunas → **Simpan & Cetak Resi**. | Total biaya di ringkasan = jumlah subtotal; resi berformat `NX-YYYYMMDD-NNNN`; halaman cetak terbuka dan dialog cetak browser muncul otomatis satu kali (memuat ulang halaman tidak memunculkannya lagi). |
| B3 | Coba simpan dengan pengirim kosong, berat `0`, berat `1,2345`, dan pembayaran melebihi total. | Masing-masing ditolak dengan pesan jelas di field terkait; tidak ada transaksi tersimpan. |
| B4 | Ulangi B2 dengan pengirim, penerima, dan berat total yang **sama persis** hari ini. | Dialog "Kemungkinan transaksi ganda" menampilkan resi yang mirip; **Periksa lagi** membatalkan, **tetap simpan** menyimpan. |
| B5 | Klik **Simpan Transaksi** dua kali cepat. | Hanya satu transaksi tersimpan (tombol berubah "Menyimpan…"). |
| B5b | Setelah transaksi tersimpan, kembali ke **Buat Transaksi** lewat menu, lalu lewat tombol Back browser, dan buat transaksi berikutnya. | Form kosong; validasi dan tombol Simpan berfungsi; transaksi kedua tersimpan. |
| B5c | Cari pelanggan dengan mengetik nama lengkap yang mengandung tanda baca (mis. "[Demo] CV Contoh Makmur" atau "PT. …"). | Pelanggan tetap ditemukan. |
| B6 | Pemilik → **Jenis Barang & Tarif** → ubah tarif barang yang dipakai di B2. Buka lagi detail resi B2. | Tarif & total resi lama tidak berubah; transaksi baru memakai tarif baru. |
| B7 | Cetak resi: coba format **Standar (A5)**, **Thermal 80 mm**, dan **Thermal 58 mm** (pratinjau cetak browser). | Isi terbaca, tidak terpotong; tanpa sidebar/banner. |
| B8 | Pemilik membatalkan transaksi tanpa pembayaran (wajib alasan). | Status "Dibatalkan" dengan alasan; transaksi yang sudah dibayar tidak dapat dibatalkan. |

## C. Pembayaran & kas

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| C1 | Admin membuat transaksi dengan pembayaran awal kosong tanpa alasan, lalu dengan alasan. | Tanpa alasan ditolak; dengan alasan tersimpan sebagai **Belum Lunas**, alasan tampil di detail; tidak muncul di Riwayat Pembayaran/Rekap Kas. |
| C2 | **Catat Pembayaran** sebagian pada resi C1. | Status tetap Belum Lunas; sisa = total − dibayar. |
| C3 | Bayar sisanya; lalu coba bayar Rp1 lagi. | Status **Lunas**; pembayaran berikutnya ditolak. |
| C4 | Admin membatalkan pembayaran yang **ia catat hari ini** (wajib alasan). | Berhasil; status bayar dihitung ulang. Tombol Batalkan tidak muncul untuk pembayaran yang dicatat Pemilik atau dari hari sebelumnya. |
| C5 | **Rekap Kas** hari ini. | Total per tanggal & per pencatat cocok dengan pembayaran valid; pembayaran dibatalkan dilaporkan terpisah. |

## D. Manifes, kapasitas & perjalanan (Staf Gudang, Supir)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| D1 | Gudang → **Buat Manifes**: pilih armada Siaga, supir, isi rute. | Manifes Draf terbentuk. Armada Rusak/Perbaikan dan armada yang sedang punya manifes aktif tidak dapat dipilih. |
| D2 | Tambahkan resi lunas dari B2/C3. | Total tonase & persentase utilisasi bertambah; meter muatan berwarna sesuai tingkat. |
| D3 | Coba tambahkan resi **belum lunas**. | Ditolak. Pemilik dapat memberi override di detail transaksi (hanya bila diizinkan di Pengaturan, wajib alasan). |
| D4 | Bila memungkinkan, buat muatan **melebihi kapasitas** (Pemilik menurunkan kapasitas armada sementara) lalu **Konfirmasi Muat**. | Diblokir dengan pesan berisi muatan & kapasitas. Muatan **tepat sama** dengan kapasitas tetap boleh. Kembalikan kapasitas sesudahnya. |
| D5 | Konfirmasi muat → Supir login → **Perjalanan Saya** → **Berangkat**. | Resi menjadi Dalam Perjalanan; armada Perjalanan. Supir tidak melihat nominal maupun data pelanggan. |
| D6 | Supir **Laporkan kendala**, lalu **Tiba**. Gudang menandai kendala selesai. | Resi menjadi Tiba; armada kembali Siaga; kendala tercatat. |
| D7 | Sebelum berangkat: lepas resi / pindahkan resi ke manifes Draf armada cadangan / batalkan manifes (wajib alasan). | Resi kembali Diterima Loket dan tercatat di riwayat status. |

## E. Pengambilan barang

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| E1 | **Pengambilan**: cari resi Tiba yang lunas, konfirmasi **tanpa** mencentang verifikasi identitas. | Ditolak. |
| E2 | Centang verifikasi identitas → konfirmasi. | Status **Sudah Diambil**; waktu & petugas tercatat di detail resi dan riwayat status. |
| E3 | Resi Tiba yang **belum lunas**. | Form konfirmasi tidak muncul; tampil sisa tagihan dan tombol **Catat pelunasan** (Admin/Pemilik). Setelah lunas, pengambilan dapat dikonfirmasi. |
| E4 | Pemilik mengaktifkan pelacakan publik di **Pengaturan**; buka `/lacak` tanpa login, masukkan resi. | Hanya nomor resi, status, dan waktu — tanpa nama, telepon, maupun nominal. Saat dinonaktifkan, pelacakan tidak menampilkan data. |

## F. Dashboard, laporan & audit log (Pemilik)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| F1 | **Dashboard** (bawaan 7 hari terakhir). | Kartu KPI, indikator kontrol, grafik transaksi & penerimaan, distribusi status, armada & utilisasi, transaksi terbaru, data perlu diperiksa. Teks "Data diambil … saat halaman dibuka (bukan pembaruan otomatis)". |
| F2 | Buat transaksi di jendela Admin, lalu **Muat ulang data** di Pemilik. | Total transaksi +1 dan penerimaan bertambah sesuai nominal. |
| F3 | Ganti periode (Hari ini / Bulan ini / rentang khusus) dan satuan grafik (hari/minggu/bulan). | Semua angka & grafik mengikuti; minggu dimulai Senin. |
| F4 | Arahkan kursor ke batang grafik, lalu fokus dengan **Tab**; buka **Lihat sebagai tabel**. | Tooltip muncul dengan mouse & keyboard; tabel cocok dengan tooltip. |
| F5 | Laporan **Transaksi / Pembayaran & Kas / Armada & Tonase / Pengiriman**: ubah filter. | Tabel & ringkasan berubah; paginasi mempertahankan filter. Total penerimaan laporan pembayaran = Rekap Kas periode yang sama. |
| F6 | **Ekspor CSV** dengan filter aktif → buka di **Excel** (klik dua kali). | Kolom terpisah (tidak menumpuk di kolom A), karakter "→"/"–" benar, angka Rupiah & berat dikenali sebagai angka; jumlah baris = baris di layar (seluruh halaman). |
| F7 | Buka CSV yang sama di Google Sheets (File → Impor, pemisah titik koma). | Data terbaca sama. |
| F8 | Dashboard Admin, Gudang, Supir. | Admin: transaksi hari ini, belum lunas, pencarian. Gudang: siap dimuat, manifes aktif & muatan per truk, tiba belum diambil. Supir: hanya penugasannya. Tidak ada grafik keuangan Pemilik. |
| F9 | **Audit Log**: filter aksi (mis. "Pembayaran dibatalkan"), pengguna, ID resi; buka "Detail lengkap"; ekspor. | Setiap aksi B–E tercatat dengan pengguna, waktu server, alasan; filter menyempitkan hasil. |

## G. Master data & pengaturan (Pemilik)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| G1 | **Jenis Barang & Tarif**: tambah, ubah, nonaktifkan. Tambah nama yang sama dengan huruf/spasi berbeda. | Nama ganda ditolak; item nonaktif tidak muncul di Buat Transaksi. |
| G2 | **Armada**: tambah armada (plat `bk 1234 ab`), ubah status ke Perbaikan tanpa catatan, lalu dengan catatan. | Plat dinormalisasi `BK 1234 AB`; Perbaikan tanpa catatan ditolak; status Perjalanan tidak dapat dipilih manual. |
| G3 | **Data Pengguna**: tambah akun Admin baru, login dengannya, lalu nonaktifkan dari akun Pemilik. | Akun baru dapat login; setelah dinonaktifkan sesi berikutnya ditolak. Pemilik tidak dapat menonaktifkan akunnya sendiri. |
| G4 | **Pengaturan**: isi ambang kapasitas (mis. 85), alamat & telepon perusahaan; coba ambang 150. | Tersimpan & tercatat di audit; 150 ditolak. Kotak "Data yang perlu dilengkapi" di dashboard berkurang. |

## H. Hak akses lewat URL langsung

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| H1 | Sebagai Supir, ketik `/laporan/transaksi`, `/transaksi`, `/pembayaran` di address bar. | Langsung ke **Akses ditolak** (tanpa sempat melihat isi halaman). |
| H2 | Sebagai Admin, buka `/master/item`, `/pengaturan`, `/audit-log`, `/manifes`. | Akses ditolak. |
| H3 | Sebagai Admin, buka `/laporan/ekspor/transaksi`. | Teks "Anda tidak memiliki hak akses…", tidak ada berkas terunduh. |
| H4 | Logout, lalu buka `/dashboard` dan `/transaksi/<resi>`. | Diarahkan ke halaman login; setelah login kembali ke halaman yang dituju. |

## I. Tampilan, state & ketahanan

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| I1 | Buka aplikasi di **ponsel sungguhan** (atau DevTools 375 px): Buat Transaksi, Pembayaran, Pengambilan, Perjalanan Saya, Dashboard. | Tidak ada scroll horizontal halaman (tabel boleh digeser di dalam kotaknya); tombol mudah disentuh; menu lewat ikon ☰. Tangkapan layar otomatis: `npm run uji:responsif` → `.uji-responsif/`. |
| I2 | Daftar dengan filter yang tidak menghasilkan data (mis. pencarian "zzz"). | Empty state dengan penjelasan, bukan tabel kosong. |
| I3 | Matikan internet (DevTools → Offline), lalu simpan pembayaran. | Pesan bahwa koneksi terputus dan hasil belum dapat dipastikan; isian form tidak hilang. Nyalakan lagi, muat ulang, periksa apakah sudah tersimpan sebelum mengulang. |
| I4 | Buka `/transaksi/NX-19000101-0001` dan `/halaman-tidak-ada` saat login. | Halaman "Data tidak ditemukan" / "Halaman tidak ditemukan" berbahasa Indonesia dengan tautan kembali ke Dashboard. |
