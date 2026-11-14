# Uji manual — Fase 6 (dashboard, laporan, audit log)

Langkah ini melengkapi uji otomatis (`npm run check`, `npm run test:remote`, `npm run test:halaman`). Uji otomatis memastikan setiap halaman terbuka tanpa galat dan hak akses benar; uji manual memastikan **angka masuk akal, tampilan terbaca, dan alur kerja nyaman**.

**Persiapan**

1. `npm run dev`, buka `http://localhost:3000`.
2. Login memakai akun demo (password = nilai `DEMO_PASSWORD` di `.env.local`):
   `demo.pemilik@example.com`, `demo.admin@example.com`, `demo.gudang@example.com`, `demo.supir@example.com`.
3. Gunakan dua jendela browser (mis. satu biasa, satu *incognito*) agar dapat login sebagai dua peran sekaligus.
4. Semua data uji di bawah memakai pelanggan **[Demo]**. Transaksi yang dibuat untuk uji tetap tersimpan di cloud (tidak ada hapus permanen) — batalkan dengan alasan "Uji manual" bila perlu.

Tandai setiap baris ✅ / ❌ dan catat temuan.

---

## A. Dashboard Pemilik

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| A1 | Login sebagai Pemilik, buka **Dashboard**. | Filter bawaan **7 hari terakhir**. Tampil 8 kartu KPI, baris "Indikator kontrol", dua grafik (jumlah transaksi & penerimaan), distribusi status, armada & utilisasi, transaksi terbaru, dan "Data yang perlu diperiksa". Tidak ada angka "NaN"/kosong aneh. |
| A2 | Perhatikan teks waktu di kanan atas. | "Data diambil … saat halaman dibuka (bukan pembaruan otomatis)". Tidak ada kata "real-time". |
| A3 | Catat angka **Total transaksi**. Di jendela lain, login Admin → **Buat Transaksi** (pengirim & penerima [Demo], 1 barang, bayar lunas). Kembali ke Pemilik, klik **Muat ulang data**. | Total transaksi **+1**, Penerimaan pembayaran bertambah sebesar nominal, Barang diterima di loket **+1**, transaksi muncul paling atas di "Aktivitas transaksi terbaru". Waktu "Data diambil" ikut berubah. |
| A4 | Klik **Hari ini**, lalu **Bulan ini**, lalu isi rentang khusus (mis. 1 bulan lalu s.d. hari ini) → **Terapkan**. | Semua kartu & grafik berubah mengikuti periode; teks "Periode: …" sesuai. URL memuat `periode=` atau `dari=&sampai=`. |
| A5 | Pada "Tren periode", pilih **Per hari / Per minggu / Per bulan**. | Jumlah batang berubah; minggu dimulai Senin; filter periode tetap. |
| A6 | Arahkan kursor ke sebuah batang grafik; lalu tekan **Tab** sampai fokus masuk ke grafik. | Tooltip menampilkan periode lengkap dan nilainya (Rupiah untuk penerimaan). Tooltip juga muncul saat fokus keyboard. |
| A7 | Klik **Lihat sebagai tabel** di bawah grafik. | Tabel periode → nilai, cocok dengan tooltip. |
| A8 | Pilih periode tanpa transaksi (mis. rentang khusus tahun lalu). | Grafik menampilkan "Belum ada data pada periode ini"; kartu bernilai 0; tidak ada galat. |
| A9 | Lihat indikator **Peringatan kapasitas**. | Bila ambang di Pengaturan belum diisi: "—" dengan tautan "Ambang perlu dilengkapi" → membuka Pengaturan. |
| A10 | Lihat "Armada & utilisasi tonase". | Setiap armada aktif tampil dengan status; armada dengan manifes aktif menampilkan meter muatan (warna + teks persen). Bila ada manifes di atas ambang/melebihi, muncul kotak "Peringatan kapasitas truk" dengan tautan ke manifes. |
| A11 | Ubah lebar browser ke ukuran ponsel (DevTools → 375 px). | Kartu tersusun satu kolom, grafik tetap terbaca, tidak ada scroll horizontal di halaman (tabel boleh scroll di dalam kotaknya). |
| A12 | Aktifkan mode gelap (menu pengguna / tema sistem). | Teks, batang grafik, garis bantu, dan tooltip tetap kontras dan terbaca. |

## B. Indikator kontrol (peringatan duplikasi & override)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| B1 | Sebagai Admin, buat transaksi dengan **pengirim, penerima, dan berat yang sama persis** dengan transaksi hari ini. | Muncul dialog "Kemungkinan transaksi ganda". Klik **Periksa lagi** (batal). |
| B2 | Pemilik → Dashboard (Hari ini) → Muat ulang. | **Peringatan duplikasi +1**, "0 tetap disimpan" tidak bertambah. |
| B3 | Ulangi B1, kali ini klik **Bukan duplikat, tetap simpan**. | Peringatan duplikasi +1 lagi dan "… tetap disimpan" +1. |
| B4 | Pemilik → **Audit Log**, filter Aksi = "Peringatan duplikasi". | Tercatat dengan pengguna Admin, ID = resi yang mirip; "Detail lengkap" memuat daftar `resi_mirip`. |

## C. Dashboard Admin Loket

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| C1 | Login Admin → Dashboard. | Tombol **Buat Transaksi Baru**, kartu Transaksi hari ini, Transaksi belum lunas, Data perlu diperiksa; kotak pencarian; transaksi terbaru. **Tidak ada** filter periode dan grafik keuangan Pemilik. |
| C2 | Ketik sebagian nomor resi atau nama pelanggan [Demo] → **Cari**. | Pindah ke Daftar Transaksi dengan hasil pencarian. |
| C3 | Buat transaksi Rp0 (belum bayar, isi alasan). | Kartu "Transaksi belum lunas" +1 setelah kembali ke dashboard. |
| C4 | Bila ada barang **Tiba** yang belum lunas: | Muncul di "Data yang perlu diperiksa" dengan label "Tiba, belum lunas" dan tautan ke transaksi. Bila tidak ada data bermasalah: "Tidak ada data yang perlu diperiksa." |

## D. Dashboard Staf Gudang

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| D1 | Login Gudang → Dashboard. | Kartu Siap dimuat, Manifes aktif, Tiba belum diambil; daftar manifes aktif dengan meter muatan per truk; daftar barang siap dimuat; daftar barang perlu diproses di loket tujuan. **Tidak ada nominal Rupiah.** |
| D2 | Buat transaksi lunas (sebagai Admin), lalu muat ulang dashboard Gudang. | "Siap dimuat" +1 dan resi muncul di daftar. Transaksi belum lunas tanpa override **tidak** masuk daftar, tetapi tercatat sebagai "… resi tertahan: belum lunas". |
| D3 | Tambahkan resi itu ke manifes Draf. | Resi hilang dari "Siap dimuat"; meter muatan manifes bertambah. |

## E. Dashboard Supir

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| E1 | Login Supir → Dashboard. | Hanya armada yang ditugaskan & perjalanan aktif. **Tidak ada** nominal, data pelanggan, grafik, atau menu Laporan/Audit Log. |

## F. Laporan (Pemilik) & ekspor CSV

Untuk setiap laporan: **Transaksi**, **Pembayaran & Kas**, **Armada & Tonase**, **Pengiriman**.

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| F1 | Buka laporan, ganti periode dan filter status (mis. Transaksi → "Belum lunas", Pengiriman → status "Tiba"). | Tabel dan ringkasan di atas tabel berubah; paginasi muncul bila > 50 baris dan mempertahankan filter saat pindah halaman. |
| F2 | Laporan Transaksi: bandingkan **Total biaya / Total dibayar / Sisa** di ringkasan dengan beberapa baris. | Angka konsisten; "Sertakan dibatalkan" menampilkan transaksi void tetapi tidak menambah total biaya. |
| F3 | Laporan Pembayaran: bandingkan **Total penerimaan** dengan **Rekap Kas** pada periode yang sama. | Sama persis. Pembayaran dibatalkan tidak masuk total (tampil dicoret dengan alasan). |
| F4 | Klik **Ekspor CSV** dengan filter aktif. | Berkas `laporan-<jenis>-<tanggal>.csv` terunduh. |
| F5 | Buka CSV di **Excel** (klik dua kali). | Kolom terpisah dengan benar (tidak menumpuk di kolom A), huruf/simbol (mis. "→", "–") tampil benar, angka Rupiah & berat dikenali sebagai angka (rata kanan, bisa dijumlah). Isi baris = baris di layar untuk filter yang sama (bukan hanya halaman pertama). |
| F6 | Buka CSV yang sama di Google Sheets (File → Impor, pemisah titik koma). | Data terbaca sama. |
| F7 | Laporan Armada: cocokkan "Perjalanan" & "Utilisasi rata-rata" dengan manifes yang berangkat pada periode itu. | Utilisasi = muatan ÷ kapasitas armada saat ini. Armada tanpa perjalanan menampilkan "—". |
| F8 | Laporan Pengiriman: cek "Dalam perjalanan" dan "Tiba, belum diambil". | Hanya status terkini (tidak mengikuti periode); riwayat perubahan status mengikuti periode dan filter status. |

## G. Audit Log (Pemilik)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| G1 | Buka **Audit Log** (bawaan 7 hari). | Daftar aksi terbaru: waktu server, pengguna + peran, aksi, entitas, ID (bertaut ke transaksi/manifes/armada bila ada), ringkasan perubahan, alasan. |
| G2 | Filter Aksi = "Pembayaran dibatalkan", lalu Pengguna = Admin, lalu isi ID entitas dengan sebuah nomor resi. | Hasil menyempit sesuai filter; **Atur ulang** mengembalikan semua. |
| G3 | Buka "Detail lengkap" pada sebuah catatan. | JSON detail tampil rapi. |
| G4 | **Ekspor CSV** dengan filter aktif dan buka di Excel. | Kolom ringkasan & detail JSON terbaca; jumlah baris = jumlah catatan pada filter. |

## H. Hak akses (dicoba langsung lewat URL)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| H1 | Sebagai Admin, Gudang, dan Supir: buka `/laporan/transaksi` dan `/audit-log`. | Diarahkan ke **Akses ditolak**; menu Laporan & Audit Log tidak tampil di sidebar. |
| H2 | Sebagai Admin: buka `/laporan/ekspor/transaksi` langsung di address bar. | Teks "Anda tidak memiliki hak akses…" (HTTP 403), **tidak** ada berkas terunduh. |
| H3 | Logout, lalu buka `/laporan/ekspor/transaksi`. | Diarahkan ke halaman login. |

## I. Keputusan Fase 4–5 yang ikut diperiksa

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| I1 | Admin membuat transaksi dengan pembayaran awal kosong/Rp0 tanpa alasan. | Ditolak: "Alasan belum bayar wajib diisi…". Setelah diisi, alasan tampil di detail transaksi; transaksi tidak muncul di Riwayat Pembayaran / Rekap Kas. |
| I2 | Admin membatalkan pembayaran yang **ia catat hari ini**. | Berhasil (wajib alasan). Tombol **Batalkan** tidak muncul untuk pembayaran yang dicatat Pemilik atau dari hari sebelumnya. |
| I3 | Barang **Tiba** yang belum lunas dibuka di **Pengambilan**. | Form konfirmasi tidak muncul; tampil peringatan sisa tagihan dan tombol **Catat pelunasan** (Admin/Pemilik). Setelah lunas, pengambilan dapat dikonfirmasi. |
