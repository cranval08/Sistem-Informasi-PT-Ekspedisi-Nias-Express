# PRODUCT REQUIREMENTS DOCUMENT (PRD)

# Sistem Informasi Operasional & Dashboard PT. Ekspedisi Nias Express

**Nama Produk:** Nias Express Operations Dashboard\
**Dokumen:** `PRD.md`\
**Versi:** 1.0\
**Status:** Siap digunakan sebagai prompt implementasi untuk Claude
Code\
**Bahasa aplikasi:** Bahasa Indonesia\
**Target platform:** Web responsif (desktop, tablet, dan smartphone)

------------------------------------------------------------------------

## 1. Instruksi Utama untuk Claude

Bertindaklah sebagai **Senior Product Engineer, UI/UX Designer, dan
Full-Stack Developer**. Bangun aplikasi web dashboard operasional untuk
PT. Ekspedisi Nias Express berdasarkan kebutuhan dan aturan bisnis pada
dokumen ini.

Jangan hanya membuat mockup atau halaman statis. Buat aplikasi yang
memiliki alur kerja nyata: autentikasi, role-based access, CRUD,
validasi, perhitungan otomatis, penyimpanan data, dashboard, pencarian,
filter, dan perubahan status.

### Cara bekerja

1.  Periksa struktur proyek dan teknologi yang sudah tersedia sebelum
    mengubah file.
2.  Jika proyek sudah memiliki stack, pertahankan stack tersebut kecuali
    ada alasan teknis kuat.
3.  Jika proyek masih kosong, gunakan stack yang direkomendasikan pada
    bagian 12.
4.  Bangun fitur secara bertahap, tetapi pastikan setiap fitur terhubung
    dengan data dan dapat diuji.
5.  Jangan mengarang data operasional sebagai data perusahaan. Data demo
    harus diberi label **Data Demo**.
6.  Jangan mengarang tarif, kapasitas truk, atau batas toleransi
    overload. Buat nilai tersebut dapat dikonfigurasi oleh pemilik.
7.  Jika integrasi perangkat keras, GPS, WhatsApp, atau printer belum
    tersedia, sediakan antarmuka dan status integrasi yang jelas; jangan
    berpura-pura integrasi telah berjalan.
8.  Prioritaskan kemudahan penggunaan oleh staf yang sebelumnya terbiasa
    bekerja secara manual.
9.  Gunakan Bahasa Indonesia untuk seluruh label, tombol, pesan
    validasi, status, dan notifikasi.
10. Setelah implementasi, jalankan pemeriksaan/build/test yang tersedia
    dan perbaiki error sebelum menyatakan pekerjaan selesai.

**Output akhir yang diharapkan:** aplikasi web yang berjalan, source
code rapi, skema database/migrasi, akun demo per role, serta README
berisi cara instalasi dan menjalankan aplikasi.

------------------------------------------------------------------------

## 2. Latar Belakang dan Masalah Bisnis

PT. Ekspedisi Nias Express menjalankan layanan ekspedisi dengan proses
operasional yang melibatkan penerimaan barang di loket, pencatatan
transaksi, pembayaran, pemuatan barang ke truk, perjalanan sekitar 360
km, pembongkaran di loket tujuan, dan pengambilan barang oleh penerima.

Kondisi berjalan (*As-Is*) memiliki beberapa kendala:

-   Data pengirim, penerima, dan barang dicatat pada nota kertas secara
    manual.
-   Tulisan nota terkadang tidak terbaca dan data transaksi berpotensi
    tercatat ganda.
-   Admin harus melakukan cross-check data sebanyak 2--3 kali.
-   Rekapitulasi nota dan kas dilakukan manual sehingga rawan selisih.
-   Tidak tersedia rekap manifes dan tonase truk secara real-time.
-   Pemilik kesulitan mengetahui kapasitas muatan dan status armada.
-   Truk cadangan dapat dipanggil secara mendadak ketika kapasitas tidak
    mencukupi.
-   Kerusakan atau keterlambatan armada di perjalanan dapat terlambat
    diketahui.
-   Validasi identitas penerima masih dilakukan dengan mencocokkan nota
    secara manual.

### Tujuan bisnis

1.  **Operational Excellence:** mengurangi proses manual, input
    berulang, dan human error.
2.  **Improved Decision Making:** menyediakan visibilitas transaksi,
    kas, tonase, dan status armada.
3.  **Low-Cost Leadership:** membantu mengoptimalkan kapasitas truk dan
    mengurangi biaya operasional yang tidak perlu.

### Prinsip solusi

Sistem merupakan **Transaction Processing System (TPS)** terintegrasi.
Data transaksi menjadi sumber utama untuk resi, pembayaran, manifes,
status pengiriman, dan laporan. Pengguna tidak perlu memasukkan data
yang sama berulang kali pada modul berbeda.

------------------------------------------------------------------------

## 3. Sasaran Produk dan Indikator Keberhasilan

### Sasaran utama

-   Digitalisasi pencatatan transaksi dan penerbitan resi.
-   Mengurangi duplikasi data melalui validasi otomatis.
-   Menyediakan perhitungan biaya dan status pembayaran yang konsisten.
-   Menyediakan monitoring kapasitas dan status armada.
-   Menyediakan dashboard ringkas untuk pemilik.
-   Mempercepat proses serah-terima barang melalui pemindaian/pencarian
    resi dan verifikasi identitas.

### Indikator keberhasilan yang harus dapat diukur

Sediakan data atau laporan agar perusahaan dapat mengevaluasi: - Jumlah
transaksi yang berhasil dibuat tanpa input ulang. - Jumlah peringatan
duplikasi. - Jumlah transaksi lunas dan belum lunas. - Jumlah pengiriman
berdasarkan status. - Total berat dan utilisasi kapasitas setiap
armada. - Jumlah peringatan kapasitas berlebih. - Total penerimaan
pembayaran per periode. - Selisih atau anomali rekap transaksi dan
pembayaran.

Jangan menetapkan target persentase atau angka peningkatan yang tidak
disebutkan dalam sumber. Buat metrik aktual yang dapat dibandingkan dari
waktu ke waktu.

------------------------------------------------------------------------

## 4. Pengguna, Role, dan Hak Akses

Implementasikan autentikasi dan **Role-Based Access Control (RBAC)**.
Setiap akun memiliki satu role utama.

  -----------------------------------------------------------------------
  Role                                Kebutuhan dan hak akses
  ----------------------------------- -----------------------------------
  Pemilik                             Akses seluruh dashboard, laporan,
                                      transaksi, pembayaran, armada,
                                      master data, pengguna, konfigurasi
                                      tarif dan kapasitas. Dapat melihat
                                      seluruh data dan melakukan
                                      persetujuan/perubahan
                                      administratif.

  Admin Loket                         Membuat transaksi, mengelola data
                                      pengirim/penerima, menimbang dan
                                      memasukkan barang, membuat resi,
                                      mencatat pembayaran, melihat
                                      transaksi yang diperlukan, dan
                                      melakukan pencarian resi.

  Staf Gudang                         Melihat daftar barang yang siap
                                      dimuat, mengelola proses
                                      muat/bongkar, mengelola manifes
                                      sesuai penugasan, serta memperbarui
                                      status operasional yang diizinkan.

  Supir                               Melihat penugasan armada/perjalanan
                                      miliknya dan memperbarui status
                                      perjalanan yang diizinkan, misalnya
                                      dalam perjalanan, tiba, atau
                                      kendala. Tidak boleh melihat
                                      seluruh data keuangan.
  -----------------------------------------------------------------------

### Aturan akses

-   Pemilik memiliki akses penuh.
-   Admin loket tidak dapat mengubah konfigurasi kapasitas armada atau
    master tarif kecuali diberi izin khusus.
-   Staf gudang tidak dapat mengubah nominal pembayaran.
-   Supir hanya dapat melihat penugasan yang terkait dengannya.
-   Semua perubahan penting harus mencatat pengguna dan waktu perubahan.
-   Jangan hanya menyembunyikan tombol di frontend. Terapkan pemeriksaan
    role pada backend/database rules juga.

### Pengguna pelanggan

Dalam versi awal, pelanggan tidak harus memiliki akun. Pelanggan
menerima nomor resi yang dapat digunakan untuk melihat informasi
pelacakan melalui halaman publik terbatas (jika modul pelacakan publik
diaktifkan). Jangan tampilkan nomor telepon, alamat, atau informasi
pribadi pelanggan pada halaman publik.

------------------------------------------------------------------------

## 5. Ruang Lingkup Produk

### 5.1 Fitur wajib (MVP)

1.  Login, logout, dan pengelolaan sesi.
2.  Dashboard berbeda sesuai role.
3.  Manajemen pelanggan/pengirim/penerima.
4.  Master jenis barang dan tarif.
5.  Pembuatan transaksi dan resi otomatis.
6.  Validasi input dan deteksi transaksi ganda.
7.  Pencatatan pembayaran dan status lunas.
8.  Manajemen armada, supir, dan kapasitas.
9.  Manifes/pemuatan barang ke armada.
10. Monitoring status pengiriman.
11. Penerimaan dan pengambilan barang dengan verifikasi resi serta
    identitas.
12. Laporan transaksi, pembayaran, dan operasional.
13. Riwayat aktivitas/audit log.
14. Pengaturan dasar perusahaan.

### 5.2 Di luar cakupan MVP

Fitur berikut tidak boleh dianggap telah tersedia tanpa integrasi dan
persetujuan lanjutan: - Pelacakan GPS kendaraan secara real-time. -
Integrasi otomatis dengan WhatsApp. - Payment gateway atau pembayaran
online. - Sinkronisasi otomatis dengan Google Sheets. - Aplikasi native
Android/iOS. - Prediksi waktu tiba berbasis machine learning.

Struktur aplikasi boleh disiapkan agar fitur tersebut dapat ditambahkan
kemudian.

------------------------------------------------------------------------

## 6. Struktur Navigasi dan Halaman

Gunakan sidebar pada desktop dan navigasi yang nyaman pada layar kecil.

### Menu utama

1.  **Dashboard**
2.  **Transaksi & Resi**
    -   Daftar transaksi
    -   Buat transaksi
    -   Detail transaksi
3.  **Pelanggan**
    -   Daftar pelanggan
    -   Tambah pelanggan
4.  **Manifes & Pengiriman**
    -   Daftar manifes
    -   Buat manifes
    -   Detail perjalanan
5.  **Armada**
    -   Daftar armada
    -   Detail armada
    -   Status armada
6.  **Pembayaran & Kas**
    -   Daftar pembayaran
    -   Rekap kas
7.  **Laporan**
    -   Laporan transaksi
    -   Laporan pengiriman
    -   Laporan armada dan tonase
    -   Laporan pembayaran
8.  **Master Data**
    -   Jenis barang dan tarif
    -   Data pengguna
9.  **Pengaturan**
10. **Audit Log**

Menu harus tampil sesuai role. Jangan tampilkan menu yang tidak relevan
kepada supir atau staf gudang.

------------------------------------------------------------------------

## 7. Kebutuhan Fungsional per Modul

### 7.1 Autentikasi dan manajemen pengguna

**Fungsi:** - Login menggunakan nomor telepon/email/username dan
password, menyesuaikan sistem autentikasi yang dipilih. - Logout. -
Pengelolaan akun oleh pemilik. - Aktivasi/nonaktif akun. - Pengaturan
role. - Perubahan password. - Proteksi halaman berdasarkan sesi dan
role.

**Kriteria penerimaan:** - Pengguna yang belum login tidak dapat membuka
halaman internal. - Pengguna dengan role terbatas tidak dapat mengakses
endpoint atau data role lain. - Akun nonaktif tidak dapat login. -
Password disimpan menggunakan mekanisme hashing aman dari penyedia
autentikasi, bukan plaintext.

### 7.2 Dashboard pemilik

Tampilkan ringkasan operasional dalam satu layar.

**Kartu KPI:** - Total transaksi pada periode terpilih. - Total
penerimaan pembayaran pada periode terpilih. - Total transaksi belum
lunas. - Barang diterima di loket. - Barang dimuat. - Pengiriman dalam
perjalanan. - Barang tiba. - Barang sudah diambil.

**Visualisasi:** - Grafik jumlah transaksi per hari/minggu/bulan. -
Grafik penerimaan pembayaran per periode. - Distribusi status
pengiriman. - Daftar armada beserta status dan utilisasi tonase. -
Peringatan kapasitas truk. - Aktivitas transaksi terbaru.

**Filter:** - Hari ini. - 7 hari terakhir. - Bulan ini. - Rentang
tanggal khusus.

**Aturan:** - Angka harus berasal dari database, bukan angka statis. -
Semua kartu dan grafik mengikuti filter tanggal. - Tampilkan empty state
bila belum ada data. - Tampilkan waktu pembaruan data. - Jangan menyebut
data sebagai real-time jika implementasinya hanya melakukan refresh
berkala atau saat halaman dibuka.

### 7.3 Dashboard admin loket

Tampilkan: - Tombol utama **Buat Transaksi Baru**. - Jumlah transaksi
hari ini. - Jumlah transaksi belum lunas. - Daftar transaksi terbaru. -
Pencarian nomor resi/nama pelanggan. - Peringatan data yang perlu
diperiksa.

### 7.4 Dashboard staf gudang

Tampilkan: - Daftar barang yang siap dimuat. - Daftar manifes aktif. -
Armada yang ditugaskan. - Total berat muatan per truk. - Peringatan
kapasitas. - Barang yang perlu dibongkar atau diproses di loket tujuan.

### 7.5 Dashboard supir

Tampilkan hanya: - Identitas armada dan plat nomor yang ditugaskan. -
Informasi perjalanan/rute. - Ringkasan muatan yang diperlukan untuk
tugas. - Status perjalanan. - Tombol pembaruan status. - Form pelaporan
kendala/kerusakan.

Jangan tampilkan nominal pembayaran atau laporan kas.

### 7.6 Manajemen pelanggan

Data pelanggan minimal: - ID pelanggan (otomatis). - Nama. - Nomor
telepon. - Waktu pertama dicatat.

**Fungsi:** - Tambah, lihat, ubah, dan nonaktifkan data pelanggan. -
Pencarian berdasarkan nama atau nomor telepon. - Gunakan data pelanggan
yang sudah ada ketika membuat transaksi. - Hindari pelanggan ganda
melalui pemeriksaan nomor telepon dan konfirmasi pengguna.

**Validasi:** - Nama wajib diisi. - Nomor telepon hanya angka setelah
normalisasi. - Panjang nomor 10--13 digit. - Normalisasi ke format
standar yang disepakati, misalnya `08xx` atau `62xx`. - Nomor telepon
unik sesuai kebijakan data pelanggan.

Catatan: data pengirim dan penerima dapat merujuk pada entitas pelanggan
yang sama.

### 7.7 Master jenis barang dan tarif

Data: - ID item. - Nama item baku. - Satuan (kg, ton, atau koli sesuai
kebutuhan). - Tarif per satuan (Rupiah). - Status aktif/nonaktif.

**Aturan:** - Admin memilih jenis barang dari dropdown master item,
bukan mengetik nama bebas. - Penambahan jenis barang baru hanya dapat
dilakukan pemilik. - Tarif dapat diubah pemilik. - Simpan
`tarif_saat_transaksi` pada detail transaksi agar perubahan tarif di
masa depan tidak mengubah transaksi lama. - Perubahan master item/tarif
dicatat di audit log.

### 7.8 Pembuatan transaksi dan resi

Buat alur transaksi yang ringkas dan jelas.

**Form transaksi:**

A. Informasi pengirim: - Pilih pelanggan yang sudah ada atau tambah
pelanggan baru. - Nama pengirim. - Nomor telepon pengirim.

B. Informasi penerima: - Pilih pelanggan yang sudah ada atau tambah
pelanggan baru. - Nama penerima. - Nomor telepon penerima.

C. Informasi barang: - Satu atau lebih baris detail barang. - Jenis
barang dari dropdown master item. - Berat/jumlah. - Satuan. - Tarif per
satuan ditampilkan otomatis. - Subtotal per item dihitung otomatis.

D. Ringkasan: - Total biaya. - Nominal pembayaran awal. - Sisa
pembayaran. - Status pembayaran otomatis. - Catatan opsional yang tidak
menggantikan field wajib.

E. Aksi: - Simpan transaksi. - Simpan dan cetak resi. - Batalkan input.

**Aturan bisnis:** 1. Waktu transaksi dihasilkan oleh server dan tidak
dapat diedit oleh staf. 2. Nomor resi dibuat otomatis, unik, dan
berurutan atau menggunakan format unik yang dijamin tidak bentrok. 3.
Sistem memeriksa kemungkinan duplikasi berdasarkan kombinasi pengirim +
penerima + tanggal + berat. Jika ditemukan kemiripan, tampilkan
peringatan dan minta konfirmasi sesuai kewenangan; jangan diam-diam
membuat data ganda. 4. Jenis barang harus berasal dari master item. 5.
Berat harus angka positif dengan maksimal 3 angka desimal. 6. Total
biaya dihitung otomatis dari berat/jumlah × tarif item. 7. Nominal
pembayaran harus angka bulat dan minimal 0. 8. Nominal pembayaran tidak
boleh melebihi total biaya. 9. Status pembayaran dihitung otomatis: -
`Belum Lunas` jika jumlah pembayaran = 0. - `Belum Lunas` jika jumlah
pembayaran kurang dari total biaya. - `Lunas` jika jumlah pembayaran
sama dengan total biaya. 10. Jangan mengizinkan barang dimuat jika
status pembayaran belum lunas, kecuali pemilik memberikan mekanisme
override yang tercatat pada audit log. 11. Simpan snapshot tarif saat
transaksi dibuat. 12. Transaksi yang sudah memiliki pembayaran tidak
boleh dihapus permanen. Gunakan pembatalan/void dengan alasan dan audit
log.

**Format resi:** - Nomor resi. - Tanggal dan jam transaksi. - Nama dan
telepon pengirim. - Nama dan telepon penerima. - Rincian barang. -
Berat/jumlah dan satuan. - Total biaya. - Jumlah dibayar dan sisa
pembayaran. - Status pembayaran. - Status pengiriman. - Identitas
perusahaan.

Sediakan tampilan resi yang siap dicetak dan mendukung printer thermal
Bluetooth melalui fungsi print browser bila perangkat mendukung. Jangan
mengklaim koneksi Bluetooth khusus sudah tersedia tanpa implementasi
nyata.

### 7.9 Pembayaran dan kas

**Fungsi:** - Catat pembayaran untuk suatu nomor resi. - Mendukung
pembayaran bertahap selama total pembayaran tidak melebihi total
biaya. - Tampilkan riwayat pembayaran. - Tampilkan waktu pembayaran
otomatis dari server. - Rekap penerimaan per hari dan rentang tanggal. -
Filter berdasarkan nomor resi, pelanggan, dan tanggal. - Ekspor laporan
CSV bila memungkinkan.

**Data pembayaran:** - ID pembayaran. - Nomor resi. - Waktu bayar. -
Jumlah bayar.

**Aturan:** - Nominal berupa angka bulat ≥ 0. - Total seluruh pembayaran
tidak boleh melebihi total biaya transaksi. - Status lunas dihitung dari
akumulasi pembayaran. - Setiap pembayaran harus memiliki pengguna
pencatat. - Pembayaran yang salah tidak dihapus tanpa jejak. Gunakan
mekanisme pembatalan/koreksi dengan alasan dan catatan audit. - Rekap
kas dihitung dari data pembayaran yang valid, bukan dari input total
manual.

### 7.10 Manajemen armada

**Data armada:** - ID armada. - Plat nomor (unik). - Jenis unit:
kecil/besar. - Kapasitas ton. - ID supir. - Status. - Waktu terakhir
status berubah.

**Status armada:** - Siaga. - Perjalanan. - Perbaikan. - Rusak.

**Fungsi:** - Tambah, lihat, ubah, dan nonaktifkan armada. - Assign
supir. - Perbarui status. - Lihat manifes dan total tonase yang sedang
ditugaskan. - Riwayat perubahan status.

**Aturan:** - Plat nomor wajib dan unik. - Kapasitas harus angka
positif. - Supir harus berasal dari data pengguna dengan role supir. -
Armada berstatus perbaikan/rusak tidak dapat dipilih untuk manifes
baru. - Armada yang masih memiliki perjalanan aktif tidak boleh
ditugaskan ke perjalanan lain tanpa penyelesaian atau pembatalan
perjalanan sebelumnya.

### 7.11 Manifes dan pemuatan barang

**Tujuan:** menghubungkan transaksi yang siap dikirim dengan armada dan
supir.

**Fungsi:** - Buat manifes/perjalanan. - Pilih armada yang tersedia. -
Pilih supir. - Tambahkan transaksi yang status pembayarannya memenuhi
aturan. - Tampilkan total tonase muatan. - Tampilkan kapasitas maksimal
dan persentase utilisasi. - Simpan manifes. - Proses muat dan konfirmasi
keberangkatan. - Pindahkan barang ke armada cadangan melalui proses yang
tercatat.

**Aturan kapasitas:** - Total tonase dihitung otomatis dari seluruh
detail barang pada manifes. - Normalisasikan satuan berat ke kilogram
atau ton sebelum perhitungan. - Kapasitas armada berasal dari master
armada. - Berikan peringatan sebelum kapasitas tercapai. - Jika total
muatan melebihi kapasitas, blokir konfirmasi muat/keberangkatan secara
default. - Hanya pemilik yang dapat melakukan override jika kebijakan
bisnis mengizinkan, dan override wajib memiliki alasan serta audit
log. - Jangan menggunakan nilai kapasitas default yang tidak diketahui.
Pemilik harus mengisi kapasitas setiap armada. - Jika muatan tidak
mencukupi kapasitas, sistem boleh menyarankan armada cadangan yang
tersedia, tetapi keputusan akhir dilakukan petugas.

### 7.12 Status pengiriman dan pelacakan

Gunakan status pengiriman yang konsisten dengan alur bisnis:

1.  **Diterima Loket**
2.  **Dimuat**
3.  **Dalam Perjalanan**
4.  **Tiba**
5.  **Sudah Diambil**

Alur normal:
`Diterima Loket → Dimuat → Dalam Perjalanan → Tiba → Sudah Diambil`

**Aturan:** - Perubahan status harus mengikuti urutan yang valid. -
Setiap perubahan status menyimpan waktu, pengguna, dan catatan
opsional. - Status `Sudah Diambil` hanya dapat diberikan setelah
verifikasi resi dan identitas penerima. - Status `Dalam Perjalanan`
terkait dengan manifes/armada yang aktif. - Sediakan riwayat pelacakan
berdasarkan nomor resi. - Halaman pelacakan publik, jika diaktifkan,
hanya menampilkan nomor resi, status, dan waktu pembaruan yang aman;
jangan tampilkan data pribadi lengkap.

**Catatan penting:** GPS real-time tidak termasuk MVP. Status perjalanan
diperbarui oleh pengguna yang berwenang.

### 7.13 Penerimaan dan pengambilan barang

Di loket tujuan: - Staf mencari atau memindai nomor resi. - Sistem
menampilkan ringkasan transaksi dan nama penerima. - Staf memeriksa
identitas penerima secara fisik. - Staf mengonfirmasi pengambilan. -
Sistem mencatat waktu pengambilan dan pengguna yang memproses. - Status
berubah menjadi `Sudah Diambil`.

Jangan menganggap pemindaian resi saja cukup untuk membuktikan
identitas. Verifikasi identitas tetap dilakukan petugas sesuai prosedur
perusahaan.

### 7.14 Laporan

Sediakan laporan yang dapat difilter berdasarkan tanggal dan status.

**Laporan transaksi:** - Nomor resi. - Waktu transaksi. - Pengirim. -
Penerima. - Rincian barang. - Total biaya. - Total pembayaran. - Sisa
pembayaran. - Status pembayaran. - Status pengiriman.

**Laporan pembayaran/kas:** - Waktu pembayaran. - Nomor resi. - Jumlah
pembayaran. - Pengguna pencatat. - Total penerimaan dalam periode.

**Laporan armada:** - Plat nomor. - Jenis unit. - Kapasitas. - Total
muatan. - Persentase utilisasi. - Supir. - Status armada.

**Laporan pengiriman:** - Jumlah barang berdasarkan status. - Daftar
barang dalam perjalanan. - Daftar barang tiba tetapi belum diambil. -
Riwayat perubahan status.

Fitur ekspor CSV/Excel dapat disediakan. Pastikan ekspor mengikuti
filter yang sedang dipilih dan hanya tersedia untuk role yang berwenang.

### 7.15 Audit log

Catat minimal: - Login/logout (opsional sesuai kebijakan keamanan). -
Pembuatan transaksi. - Perubahan data transaksi. - Pencatatan/koreksi
pembayaran. - Perubahan tarif. - Perubahan data armada dan kapasitas. -
Perubahan manifes. - Override kapasitas atau pembayaran. - Perubahan
status pengiriman. - Pembatalan transaksi.

Setiap log memiliki: - ID. - Pengguna. - Jenis aksi. - Entitas dan ID
entitas. - Waktu server. - Ringkasan perubahan. - Alasan, bila aksi
memerlukan alasan.

Audit log tidak boleh dapat diubah oleh pengguna operasional biasa.

------------------------------------------------------------------------

## 8. Aturan Validasi dan Kualitas Data

Implementasikan validasi frontend dan backend. Validasi backend adalah
sumber kebenaran.

  -----------------------------------------------------------------------
  Field                               Aturan
  ----------------------------------- -----------------------------------
  Jenis barang                        Wajib dipilih dari master item;
                                      input bebas tidak diperbolehkan.

  Berat                               Angka positif, maksimal 3 desimal,
                                      wajib diisi.

  Nama pengirim/penerima              Wajib diisi.

  Telepon                             Angka 10--13 digit setelah
                                      normalisasi ke format standar.

  Tanggal dan jam transaksi           Otomatis dari server, tidak dapat
                                      diubah staf.

  Nomor resi                          Otomatis, unik, tidak boleh kosong.

  Total biaya                         Dihitung otomatis dari berat/jumlah
                                      × tarif.

  Nominal bayar                       Angka bulat ≥ 0 dan tidak melebihi
                                      sisa biaya.

  Status pembayaran                   Dihitung otomatis dari total
                                      pembayaran.

  Plat nomor dan supir                Dipilih dari master
                                      armada/pengguna, bukan input bebas.

  Duplikasi transaksi                 Peringatan jika kombinasi
                                      pengirim + penerima + tanggal +
                                      berat sama.

  Muatan truk                         Total tonase otomatis; peringatan
                                      dan blokir jika melebihi kapasitas.
  -----------------------------------------------------------------------

### Pembersihan dan migrasi data awal

Jika data lama akan diimpor: 1. Kumpulkan nama barang dari nota lama dan
seragamkan menjadi master item. 2. Normalisasi nomor telepon pelanggan.
3. Identifikasi dan gabungkan pelanggan ganda setelah verifikasi. 4.
Prioritaskan migrasi data aktif/periode terbaru, misalnya 3 bulan
terakhir sebagaimana usulan laporan. 5. Simpan arsip nota lama secara
fisik. 6. Minta admin dan pemilik meninjau hasil sebelum data
dimasukkan. 7. Sediakan template impor dan laporan baris yang gagal
divalidasi.

Jangan otomatis menggabungkan data pelanggan hanya karena nama mirip.
Gunakan nomor telepon dan verifikasi manusia.

------------------------------------------------------------------------

## 9. Model Data dan Struktur Database

Gunakan relasi yang menjaga konsistensi transaksi. Nama tabel dan field
berikut mengikuti kamus data sederhana dalam laporan; field tambahan
boleh ditambahkan untuk mendukung audit, keamanan, dan operasional.

### 9.1 `data_pengguna`

  Field           Tipe konseptual   Aturan
  --------------- ----------------- ------------------------------------------
  id_pengguna     string/UUID       Primary key
  nama_lengkap    string            Wajib
  peran           enum/string       Admin Loket, Staf Gudang, Supir, Pemilik
  nomor_telepon   string            Unik, 10--13 digit
  waktu_dibuat    timestamp         Server-generated

Tambahan teknis yang disarankan: `auth_user_id`, `is_active`,
`updated_at`.

### 9.2 `data_pelanggan`

  Field          Tipe konseptual   Aturan
  -------------- ----------------- -----------------------
  id_pelanggan   string/UUID       Primary key
  nama           string            Wajib
  telepon        string            Unik sesuai kebijakan
  waktu_dibuat   timestamp         Server-generated

Tambahan: `updated_at`, `is_active`.

### 9.3 `data_item`

  Field              Tipe konseptual   Aturan
  ------------------ ----------------- -----------------
  id_item            string/UUID       Primary key
  nama_item          string            Nama baku
  satuan             enum/string       kg / ton / koli
  tarif_per_satuan   decimal/integer   Rupiah

Tambahan: `is_active`, `updated_at`.

### 9.4 `data_armada`

  Field                 Tipe konseptual   Aturan
  --------------------- ----------------- ----------------------------------------
  id_armada             string/UUID       Primary key
  plat_nomor            string            Unik
  jenis_unit            string/enum       Kecil / Besar
  kapasitas_ton         decimal           Positif
  id_supir              string/UUID       Foreign key ke data_pengguna
  status                enum/string       Siaga / Perjalanan / Perbaikan / Rusak
  waktu_status_diubah   timestamp         Server-generated

### 9.5 `data_transaksi`

  -----------------------------------------------------------------------
  Field                   Tipe konseptual         Aturan
  ----------------------- ----------------------- -----------------------
  no_resi                 string                  Primary key, unik

  waktu_transaksi         timestamp               Server-generated

  id_pengirim             string/UUID             FK data_pelanggan

  id_penerima             string/UUID             FK data_pelanggan

  id_armada               string/UUID             FK data_armada,
                                                  nullable sebelum
                                                  penugasan

  id_pengguna             string/UUID             FK data_pengguna, admin
                                                  pencatat

  status_kirim            enum/string             Diterima Loket / Dimuat
                                                  / Dalam Perjalanan /
                                                  Tiba / Sudah Diambil

  waktu_diambil           timestamp               Nullable sebelum
                                                  diambil
  -----------------------------------------------------------------------

Tambahan yang disarankan: `total_biaya`, `total_dibayar` (bisa dihitung
dari pembayaran), `catatan`, `status_void`, `void_reason`, `created_at`,
`updated_at`.

### 9.6 `detail_transaksi`

Gunakan primary key komposit (`no_resi`, `id_item`) hanya jika satu item
per resi tidak boleh muncul lebih dari satu kali. Jika satu jenis barang
dapat muncul beberapa baris, gunakan `id_detail` sebagai primary key dan
tetap simpan FK.

  Field                  Tipe konseptual   Aturan
  ---------------------- ----------------- -------------------
  no_resi                string            FK data_transaksi
  id_item                string/UUID       FK data_item
  berat_kg               decimal           Positif
  tarif_saat_transaksi   decimal/integer   Snapshot tarif
  subtotal               decimal/integer   Dihitung otomatis

### 9.7 `pembayaran`

  Field           Tipe konseptual   Aturan
  --------------- ----------------- -------------------
  id_pembayaran   string/UUID       Primary key
  no_resi         string            FK data_transaksi
  waktu_bayar     timestamp         Server-generated
  jumlah_bayar    integer/decimal   Rupiah, ≥ 0

Tambahan: `id_pengguna_pencatat`, `status_pembayaran_record`,
`catatan_koreksi`, `created_at`.

### 9.8 Tabel tambahan yang direkomendasikan

**`manifes`** - `id_manifes` - `id_armada` - `id_supir` - `rute` -
`status_manifes` - `waktu_dibuat` - `waktu_berangkat` - `waktu_tiba` -
`created_by`

**`manifes_detail`** - `id` - `id_manifes` - `no_resi`

**`riwayat_status_pengiriman`** - `id` - `no_resi` -
`status_sebelumnya` - `status_baru` - `waktu_perubahan` -
`id_pengguna` - `catatan`

**`audit_log`** - `id` - `id_pengguna` - `aksi` - `entitas` -
`entitas_id` - `detail_perubahan` - `alasan` - `waktu`

**Relasi utama:** - Satu pelanggan dapat menjadi pengirim atau penerima
di banyak transaksi. - Satu transaksi memiliki satu atau lebih detail
barang. - Satu transaksi dapat memiliki beberapa catatan pembayaran. -
Satu armada dapat digunakan pada banyak manifes sepanjang tidak ada
konflik perjalanan aktif. - Satu manifes memiliki satu armada dan satu
atau lebih transaksi. - Satu transaksi memiliki banyak riwayat status.

Gunakan foreign key, indeks untuk pencarian nomor
resi/telepon/tanggal/status, serta transaksi database untuk operasi yang
harus atomik (misalnya membuat resi dan detail transaksi).

------------------------------------------------------------------------

## 10. UI/UX dan Design System

### Arah visual

Buat dashboard yang profesional, modern, bersih, dan mudah dipahami staf
operasional. Hindari tampilan terlalu ramai atau dekoratif.

**Karakter visual:** - Latar utama: abu-abu sangat muda atau putih. -
Sidebar: navy/dark blue. - Warna aksen: biru untuk aksi utama. - Hijau:
lunas/berhasil/siaga. - Kuning/oranye: menunggu/peringatan. - Merah:
gagal/overload/rusak. - Abu-abu: nonaktif atau informasi sekunder.

Warna harus tetap memiliki kontras yang baik dan tidak hanya
mengandalkan warna untuk menunjukkan status; sertakan teks/badge.

### Komponen UI

-   Sidebar responsif.
-   Topbar dengan judul halaman, breadcrumb, profil, dan logout.
-   KPI cards.
-   Tabel dengan pencarian, filter, sorting, pagination.
-   Form dengan label dan helper text.
-   Status badges.
-   Modal konfirmasi untuk aksi penting.
-   Toast sukses/gagal.
-   Empty state.
-   Skeleton/loading state.
-   Error state dan tombol coba lagi.
-   Dialog konfirmasi untuk pembatalan, override, atau perubahan
    sensitif.

### Prinsip pengalaman pengguna

-   Form transaksi dibuat bertahap atau dikelompokkan agar mudah diisi.
-   Gunakan dropdown untuk master data.
-   Tampilkan total biaya dan sisa pembayaran secara langsung saat input
    berubah.
-   Berikan pesan validasi yang menjelaskan cara memperbaiki kesalahan.
-   Hindari input berulang.
-   Tabel harus tetap mudah digunakan di layar smartphone, misalnya
    dengan tampilan kartu atau kolom prioritas.
-   Tombol aksi utama harus jelas.
-   Jangan menghapus data tanpa konfirmasi.
-   Sediakan tampilan cetak resi yang rapi dan hemat tinta.

### Halaman penting yang perlu dirancang dengan perhatian khusus

1.  Dashboard pemilik.
2.  Form transaksi baru.
3.  Detail transaksi/resi.
4.  Detail manifes dan indikator tonase.
5.  Daftar armada.
6.  Halaman pembayaran.
7.  Halaman verifikasi pengambilan barang.

------------------------------------------------------------------------

## 11. Alur Bisnis End-to-End (To-Be)

Implementasikan alur berikut:

1.  Pelanggan menyerahkan barang ke admin loket.
2.  Admin memilih atau membuat data pengirim dan penerima.
3.  Admin memilih jenis barang dari master item dan memasukkan berat.
4.  Sistem memvalidasi format data dan memeriksa kemungkinan duplikasi.
5.  Sistem menghitung total biaya dari berat × tarif.
6.  Sistem membuat nomor resi unik dan menyimpan transaksi.
7.  Resi dapat ditampilkan, dicetak, atau diberikan kepada pelanggan.
8.  Admin mencatat pembayaran.
9.  Jika belum lunas, transaksi tetap berstatus belum lunas dan barang
    tidak dapat dimuat kecuali ada override resmi.
10. Jika lunas, transaksi masuk daftar barang siap dimuat.
11. Staf gudang membuat manifes dan memilih armada serta supir.
12. Sistem menghitung total tonase dan membandingkannya dengan kapasitas
    armada.
13. Jika kapasitas terlampaui, sistem memberi peringatan dan memblokir
    proses muat/keberangkatan secara default.
14. Jika kapasitas aman, staf mengonfirmasi pemuatan.
15. Status transaksi berubah menjadi `Dimuat`.
16. Ketika berangkat, status berubah menjadi `Dalam Perjalanan` dan
    status armada menjadi `Perjalanan`.
17. Ketika sampai di loket tujuan, status berubah menjadi `Tiba`.
18. Penerima menunjukkan identitas dan nomor resi.
19. Staf mencari/memindai resi, mencocokkan identitas, lalu
    mengonfirmasi pengambilan.
20. Sistem mencatat waktu pengambilan dan mengubah status menjadi
    `Sudah Diambil`.
21. Dashboard dan laporan diperbarui dari data transaksi yang sama.

------------------------------------------------------------------------

## 12. Rekomendasi Teknologi

Jika belum ada stack yang ditentukan, gunakan pilihan berikut sebagai
rekomendasi implementasi:

-   **Frontend:** Next.js + TypeScript.
-   **Styling:** Tailwind CSS.
-   **Komponen UI:** shadcn/ui atau komponen reusable yang konsisten.
-   **Database dan backend:** Supabase (PostgreSQL, Auth, Row Level
    Security).
-   **Chart:** Recharts.
-   **Form validation:** React Hook Form + Zod.
-   **Ikon:** Lucide.
-   **Hosting:** Vercel untuk frontend dan Supabase untuk
    backend/database.
-   **Ekspor:** CSV terlebih dahulu; XLSX bila diperlukan.
-   **Cetak resi:** CSS print layout dan browser print.

Stack tersebut merupakan rekomendasi teknis, bukan fakta dari laporan.
Laporan menyebut opsi Firebase/MySQL via Google Workspace dan hosting
seperti Vercel. Claude boleh memilih implementasi lain jika proyek sudah
memiliki stack atau ada alasan teknis yang jelas.

### Ketentuan implementasi

-   Gunakan TypeScript secara konsisten.
-   Pisahkan komponen UI, business logic, dan akses data.
-   Gunakan environment variables untuk secret.
-   Jangan menaruh service role key atau secret di frontend.
-   Terapkan RLS/pemeriksaan akses di database.
-   Gunakan server-side validation untuk operasi penting.
-   Gunakan database transaction untuk pembuatan
    transaksi/pembayaran/manifes yang saling terkait.
-   Format mata uang menggunakan Rupiah (`id-ID`, `IDR`).
-   Format tanggal menggunakan zona waktu `Asia/Jakarta` atau zona waktu
    operasional yang dikonfigurasi. Pastikan waktu disimpan konsisten di
    database.
-   Tampilkan pesan error yang ramah dan jangan bocorkan stack trace
    kepada pengguna.

------------------------------------------------------------------------

## 13. Keamanan, Privasi, dan Keandalan

1.  Autentikasi wajib untuk seluruh modul internal.
2.  Terapkan RBAC pada frontend dan backend.
3.  Terapkan kebijakan akses database per role.
4.  Data pelanggan hanya dapat diakses oleh role yang memiliki kebutuhan
    operasional.
5.  Halaman pelacakan publik tidak menampilkan data pribadi lengkap.
6.  Validasi dan sanitasi seluruh input.
7.  Lindungi operasi pembayaran dan perubahan status dari request tidak
    sah.
8.  Catat perubahan data penting.
9.  Sediakan backup database sesuai kemampuan platform.
10. Gunakan HTTPS pada deployment.
11. Gunakan environment variables untuk kredensial.
12. Tangani kegagalan jaringan dan tampilkan status penyimpanan.
13. Cegah double-submit pada pembuatan transaksi dan pembayaran.
14. Gunakan constraint database untuk menjaga nomor resi dan plat nomor
    tetap unik.
15. Hindari penghapusan permanen pada data transaksi yang sudah memiliki
    pembayaran atau riwayat operasional.

------------------------------------------------------------------------

## 14. Acceptance Criteria Global

Aplikasi dapat dianggap memenuhi MVP apabila:

-   [ ] Pengguna dapat login dan diarahkan ke dashboard sesuai role.
-   [ ] Pengguna tidak dapat mengakses fitur di luar haknya, termasuk
    melalui URL/API langsung.
-   [ ] Admin dapat membuat pelanggan dan transaksi.
-   [ ] Sistem membuat nomor resi unik secara otomatis.
-   [ ] Sistem menolak field wajib yang kosong atau tidak valid.
-   [ ] Sistem memberi peringatan pada transaksi yang berpotensi
    duplikat.
-   [ ] Total biaya dihitung otomatis dan dapat diverifikasi.
-   [ ] Tarif lama tetap tersimpan pada transaksi lama setelah master
    tarif berubah.
-   [ ] Pembayaran bertahap dapat dicatat dan status lunas dihitung
    otomatis.
-   [ ] Transaksi belum lunas tidak dapat dimuat tanpa override resmi.
-   [ ] Pemilik dapat mengelola master item, tarif, armada, kapasitas,
    dan pengguna.
-   [ ] Staf dapat membuat manifes dan sistem menghitung total tonase.
-   [ ] Sistem memperingatkan dan memblokir muatan yang melebihi
    kapasitas secara default.
-   [ ] Status pengiriman dapat diperbarui sesuai urutan yang valid.
-   [ ] Pengambilan barang mencatat waktu dan pengguna setelah
    verifikasi identitas.
-   [ ] Dashboard menampilkan data aktual dari database dan dapat
    difilter.
-   [ ] Laporan dapat dicari dan difilter.
-   [ ] Perubahan penting tercatat pada audit log.
-   [ ] Tampilan responsif di desktop dan smartphone.
-   [ ] Loading, empty, success, dan error states tersedia.
-   [ ] README menjelaskan instalasi, konfigurasi, migrasi, dan akun
    demo.

------------------------------------------------------------------------

## 15. Skenario Pengujian Minimum

Claude harus membuat atau menjalankan pengujian untuk skenario berikut.

### Transaksi

1.  Membuat transaksi dengan data lengkap → berhasil dan nomor resi
    terbentuk.
2.  Nama pengirim kosong → ditolak dengan pesan yang jelas.
3.  Berat 0 atau negatif → ditolak.
4.  Berat lebih dari 3 desimal → ditolak atau dinormalisasi sesuai
    aturan yang konsisten.
5.  Jenis barang tidak ada di master → tidak dapat disimpan.
6.  Transaksi dengan kombinasi data mirip → peringatan duplikasi muncul.
7.  Tarif master berubah → tarif transaksi lama tidak berubah.

### Pembayaran

1.  Pembayaran 0 → status belum lunas.
2.  Pembayaran sebagian → status belum lunas dan sisa biaya benar.
3.  Akumulasi pembayaran sama dengan total biaya → status lunas.
4.  Pembayaran melebihi sisa biaya → ditolak.
5.  Pengguna gudang mencoba mencatat pembayaran → ditolak.

### Armada dan manifes

1.  Total tonase di bawah kapasitas → dapat diproses.
2.  Total tonase sama dengan kapasitas → dapat diproses sesuai aturan
    kapasitas.
3.  Total tonase melebihi kapasitas → peringatan dan proses diblokir.
4.  Armada rusak/perbaikan → tidak dapat dipilih untuk manifes baru.
5.  Armada sudah memiliki perjalanan aktif → tidak dapat ditugaskan ke
    perjalanan konflik.

### Pengiriman

1.  Status normal dapat berubah berurutan.
2.  Status melompat dari `Diterima Loket` ke `Sudah Diambil` → ditolak.
3.  Pengambilan tanpa verifikasi identitas → tidak dapat dikonfirmasi.
4.  Setelah pengambilan dikonfirmasi → waktu diambil dan riwayat status
    tersimpan.

### Hak akses

1.  Supir mencoba membuka laporan keuangan → ditolak.
2.  Admin mencoba mengubah tarif tanpa izin → ditolak.
3.  Pengguna belum login membuka halaman internal → diarahkan ke login.

------------------------------------------------------------------------

## 16. Data Demo dan Seed

Sediakan data demo yang realistis untuk mendemonstrasikan alur aplikasi,
tetapi beri penanda bahwa seluruh data tersebut bukan data aktual
perusahaan.

Buat akun demo untuk: - Pemilik. - Admin Loket. - Staf Gudang. - Supir.

Sediakan beberapa: - Pelanggan demo. - Jenis barang demo dengan tarif
yang jelas diberi label contoh. - Armada demo dengan kapasitas contoh. -
Transaksi dengan status pembayaran berbeda. - Manifes dan riwayat
status.

Jangan menggunakan nama, nomor telepon, atau data pribadi nyata dari
laporan sebagai data demo. Jangan mengasumsikan tarif atau kapasitas
aktual perusahaan.

------------------------------------------------------------------------

## 17. Deliverables yang Harus Dihasilkan Claude

1.  Source code aplikasi web.
2.  Struktur folder yang rapi dan mudah dipelihara.
3.  Database schema dan migration/SQL setup.
4.  Kebijakan akses/RLS atau mekanisme authorization yang setara.
5.  Seed data demo.
6.  Implementasi halaman dan modul MVP.
7.  Komponen UI reusable.
8.  Validasi frontend dan backend.
9.  Pengujian untuk business rules penting.
10. File `.env.example` tanpa secret.
11. README yang menjelaskan:
    -   Persyaratan sistem.
    -   Instalasi dependency.
    -   Setup environment variables.
    -   Setup database dan migration.
    -   Seed akun demo.
    -   Menjalankan aplikasi lokal.
    -   Menjalankan test/build.
    -   Deployment.
12. Ringkasan fitur yang selesai dan fitur yang belum diintegrasikan.

------------------------------------------------------------------------

## 18. Urutan Pengerjaan yang Disarankan

Kerjakan dalam fase berikut agar implementasi terarah:

### Fase 1 --- Fondasi

-   Setup project dan design system.
-   Setup database dan autentikasi.
-   RBAC dan layout navigasi.
-   Seed akun demo.

### Fase 2 --- Data inti

-   Pelanggan.
-   Master item dan tarif.
-   Armada dan pengguna.

### Fase 3 --- TPS transaksi

-   Form transaksi.
-   Validasi dan deteksi duplikasi.
-   Nomor resi.
-   Cetak resi.

### Fase 4 --- Pembayaran

-   Pencatatan pembayaran.
-   Status lunas.
-   Rekap kas.

### Fase 5 --- Operasional logistik

-   Manifes.
-   Perhitungan tonase.
-   Monitoring armada.
-   Status pengiriman.
-   Verifikasi pengambilan.

### Fase 6 --- Dashboard dan laporan

-   Dashboard per role.
-   Grafik dan KPI.
-   Laporan dan ekspor.
-   Audit log.

### Fase 7 --- Quality assurance

-   Uji business rules.
-   Uji hak akses.
-   Uji responsivitas.
-   Perbaikan bug.
-   Dokumentasi dan deployment.

Jangan membuat seluruh halaman hanya dengan data hardcoded. Setiap modul
yang dinyatakan selesai harus terhubung ke database atau diberi label
jelas sebagai prototype yang belum terhubung.

------------------------------------------------------------------------

## 19. Instruksi Penutup untuk Claude

Mulailah dengan memeriksa repository, lalu jelaskan secara singkat
rencana implementasi dan asumsi teknis yang diperlukan. Setelah itu,
implementasikan aplikasi berdasarkan PRD ini.

Prioritas tertinggi: 1. Akurasi transaksi dan resi. 2. Konsistensi
perhitungan pembayaran. 3. Validasi kapasitas armada dan tonase. 4.
Kejelasan status pengiriman. 5. Hak akses dan keamanan data. 6.
Dashboard pemilik yang mudah dipahami. 7. UI responsif dan mudah
digunakan staf.

Jika ada detail bisnis yang belum ditentukan (misalnya tarif aktual,
kapasitas masing-masing truk, format nomor resi, atau kebijakan
override), jangan mengarang nilainya. Buat konfigurasi yang dapat diatur
pemilik dan tandai sebagai data yang perlu dilengkapi.

**Hasil akhir harus berupa aplikasi operasional yang konsisten dengan
alur To-Be PT. Ekspedisi Nias Express, bukan sekadar template dashboard
generik.**

------------------------------------------------------------------------

## 20. Dasar Penyusunan dan Batasan Informasi

PRD ini disusun berdasarkan dokumen **Laporan Ujian Tengah Semester --
Studi Kasus PT. Ekspedisi Nias Express, Kelompok 5, Universitas Pelita
Harapan Medan, 2026**, terutama: - Bab I: Value Chain dan Strategic
Objectives. - Bab II: BPMN 2.0 As-Is dan To-Be. - Bab III: Infrastruktur
TI, audit kualitas data, aturan validasi, dan data dictionary.

Detail seperti rekomendasi Next.js/Supabase, audit log, RBAC teknis,
tabel manifes tambahan, dan skenario pengujian merupakan elaborasi
kebutuhan implementasi agar sistem dapat dibangun secara utuh. Detail
tersebut bukan klaim bahwa perusahaan saat ini telah menggunakan
teknologi tersebut.
