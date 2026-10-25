# Spec: Laporan Bulanan (Ringkasan)

**Penulis:** PM / System Analyst · **Tanggal:** 2026-10-25 · **Status:** Spec Ready (Termasuk Extension F7.1: ekspor print, 2026-10-25)
**PRD:** `docs/PRD.md#fitur-7-laporan-bulanan-ringkasan`
**AC yang di-cover:** AC-F7-1 s.d. AC-F7-18
**Referensi desain:** `docs/design/08-reporting.md` (PM-approved 2026-10-25)
**Referensi visual:** komposisi kartu grup + satu kartu dominan (bukan salinan; lihat §Arahan Desain)
**Bergantung pada:** `feat-dashboard.md` (definisi saldo & scope), `feat-wallets.md` (A-44, dompet arsip), `feat-transactions-ocr.md` (transfer, tanggal)

## Overview

Tab ketiga di halaman Aktivitas yang menjawab satu pertanyaan: **pada bulan ini, berapa uang masuk, berapa uang keluar, dari mana asalnya, dan berapa sisanya**, untuk satu cakupan dompet.

Laporan ini bukan dashboard baru. Ia memakai periode dan data yang sudah dimiliki halaman Aktivitas, lalu menyajikannya sebagai ringkasan yang bisa diaudit: saldo awal, pergerakan, dan saldo akhir harus bisa dijumlahkan ulang oleh pengguna.

Prinsip yang mengikat seluruh fitur ini: **server adalah satu-satunya sumber angka**. Client tidak pernah menjumlahkan baris transaksi untuk menghasilkan ringkasan.

## User Flow

1. Anggota APPROVED membuka `/transactions`.
2. User memilih tab `Ringkasan` (deep link `?view=ringkasan&month=YYYY-MM`).
3. Laporan memuat bulan yang sama dengan tab Transaksi, cakupan default `Bersama`, dompet `Semua dompet`.
4. User membaca kartu utama (sisa), lalu jejak saldo, lalu rincian pemasukan dan pengeluaran.
5. User mengganti bulan lewat kontrol bulan yang sama dengan tab Transaksi.
6. User mengganti cakupan `Pribadi`/`Bersama`, lalu mempersempit ke satu dompet bila perlu.
7. User menekan `Lihat semua pengeluaran` untuk pindah ke tab Transaksi dengan bulan dan filter yang sama.
8. Selama memuat tampil skeleton; gagal tampil error dengan retry; belum ada data tampil empty state; cakupan tanpa dompet tampil sebagai pilihan nonaktif, bukan laporan kosong.

## Behavior Detail

### AC-F7-1: Penempatan, akses, dan deep link

- Kondisi: user membuka halaman Aktivitas.
- Yang terjadi: tersedia tiga tab berurutan `Transaksi | Ringkasan | Trash`. Tab Ringkasan adalah `?view=ringkasan` dan menyertakan `?month=YYYY-MM` pada URL. Refresh, back/forward, dan tautan yang dibagikan memulihkan tab dan bulan yang sama.
- Yang tidak boleh terjadi: item navigasi baru di bottom nav atau top nav; tab Ringkasan tampil untuk state Trash; pindah tab mengubah bulan yang sedang dipilih; tab Ringkasan dapat diakses tanpa sesi APPROVED.

### AC-F7-2: Satu periode milik halaman

- Kondisi: user mengganti bulan dari tab Transaksi atau tab Ringkasan.
- Yang terjadi: kontrol bulan (label bulan, panah sebelumnya/berikutnya, modal pilih bulan) adalah satu state milik halaman. Perubahan bulan berlaku untuk kedua tab dan ditulis ke URL sekali.
- Yang tidak boleh terjadi: picker bulan kedua di dalam tab Ringkasan; bulan tab Transaksi dan tab Ringkasan berbeda; modal picker baru yang menulis state terpisah.
- Filter tanggal (`dari`/`sampai`) **tidak dirender** di tab Ringkasan. Filter itu tetap milik tab Transaksi. Alasannya: saldo awal dan saldo akhir adalah konsep batas bulan, dan rentang parsial membuat label "sisa bulan ini" menyesatkan.
- Pindah bulan **mempertahankan** cakupan dan dompet yang dipilih.

### AC-F7-3: Kartu utama (sisa)

- Kondisi: laporan berhasil dimuat untuk satu bulan dan satu cakupan.
- Yang terjadi: kartu dominan menampilkan **saldo akhir periode** dalam rupiah penuh, dengan label adaptif:
  - bulan berjalan → `Sisa bulan ini`
  - bulan lampau → `Sisa akhir {Nama Bulan}`
- Di bawah angka utama terdapat satu baris delta terhadap bulan sebelumnya (AC-F7-10) dan satu baris penjelas `Setelah seluruh pengeluaran tercatat`.
- Yang tidak boleh terjadi: kartu menampilkan saldo gabungan Bersama + Pribadi; kartu menampilkan `Rp0` ketika data gagal dimuat; label bulan berjalan dipakai untuk bulan lampau.

### AC-F7-4: Jejak saldo dan invarian aritmetika

- Kondisi: laporan dimuat, termasuk bulan tanpa transaksi.
- Yang terjadi: jejak saldo dibaca dari atas ke bawah sebagai urutan hitung: `Saldo awal`, penambahan kondisional `Saldo awal dompet baru`, `Masuk`, `Transfer masuk`, pengurangan `Keluar`, `Transfer keluar`, lalu `Saldo akhir` sebagai hasil yang ditegaskan di bagian bawah. Baris penambahan memakai awalan `+`, baris pengurangan memakai awalan `−`; baris transfer dan dompet baru hanya tampil bila nominalnya bukan nol. Invarian berikut harus tepat untuk setiap kombinasi bulan, cakupan, dan dompet:

  ```
  saldo akhir = saldo awal + masuk − keluar + transfer masuk − transfer keluar + penyesuaian dompet baru
  ```

- Kaki transfer yang relevan adalah kaki transaksi `TRANSFER` milik dompet di dalam cakupan atau dompet terpilih: kaki `MONEY_IN` dihitung sebagai `transfer masuk`, kaki `MONEY_OUT` sebagai `transfer keluar`. Transfer antar cakupan hanya menyumbang kaki sisi cakupannya; kaki cakupan pasangan tidak pernah ikut.
- Catatan di bawah jejak saldo menjelaskan konteks baris transfer: untuk `Semua dompet`, transfer antardompet di cakupan yang sama menampilkan kedua sisi yang saling meniadakan, sedangkan transfer ke cakupan lain hanya menampilkan sisi cakupan aktif; untuk satu dompet terpilih, hanya sisi dompet itu yang tampil.
- Karena itu, transfer antar dua dompet di dalam cakupan yang sama menampilkan `Transfer masuk` dan `Transfer keluar` dengan nominal yang sama; itu bukan duplikasi, melainkan dua arah yang saling meniadakan pada `Saldo akhir`.
- Definisi `saldo awal` untuk satu periode: jumlah, atas dompet yang termasuk dalam cakupan **dan dihitung pada periode itu**, dari `openingBalanceMinor` untuk dompet yang sudah ada sebelum awal periode, ditambah seluruh transaksi aktif dengan `occurredAt` **sebelum** awal periode pada dompet yang dihitung itu, termasuk pada dompet yang dibuat di dalam periode (transaksi backdate tetap menghitung saldo awal supaya angkanya adalah saldo nyata). Dompet yang dibuat di dalam periode tidak menyumbang `openingBalanceMinor` ke `saldo awal`; saldo awalnya masuk lewat baris penyesuaian.
- Saldo awal maupun penyesuaian tidak pernah menghitung satu transaksi dua kali.
- Dompet yang dihitung pada satu periode adalah dompet dalam cakupan yang `createdAt`-nya sebelum akhir periode, **ditambah** dompet yang dibuat setelahnya tetapi memiliki minimal satu transaksi aktif di periode itu.
- `penyesuaian dompet baru` = jumlah `openingBalanceMinor` dari dompet yang dihitung dan `createdAt`-nya **pada atau setelah** awal periode. Dompet seperti itu memberi kontribusi 0 pada `saldo awal`. Baris ini hanya tampil bila nilainya bukan nol, dan diberi label `Saldo awal dompet baru`.
- Transaksi bertanggal mundur (backdate) pada dompet yang baru dibuat tetap masuk `Masuk`/`Keluar` periode tersebut bila `occurredAt`-nya di dalam periode, dan masuk `saldo awal` bila `occurredAt`-nya sebelum periode. Dompetnya terhitung lewat aturan dompet yang dihitung di atas. Ini disebutkan pada catatan kaki bila terjadi (`hasBackdatedNewWallet`).
- Yang tidak boleh terjadi: invarian gagal karena dompet baru membawa saldo awal; kaki transfer disembunyikan dari jejak saldo sehingga invarian jebol; saldo awal periode lampau ikut menghitung dompet yang belum ada saat itu dan tidak punya aktivitas pada periode itu; transaksi pada dompet yang dibuat belakangan hilang dari laporan sehingga total tidak cocok dengan daftar Aktivitas; kaki transfer cakupan pasangan ikut terhitung; selisih antara `saldo akhir` dan `saldo awal + masuk − keluar + transfer masuk − transfer keluar + penyesuaian dompet baru` dibiarkan tanpa penjelasan.

### AC-F7-5: Rincian pemasukan

- Kondisi: ada minimal satu transaksi `MONEY_IN` aktif pada periode, cakupan, dan dompet terpilih.
- Yang terjadi: kartu `Pemasukan` menampilkan total dan maksimal empat kategori terbesar beserta nominalnya. Kategori kosong digabung ke baris `Tanpa kategori`. Sisa kategori digabung ke baris `Lainnya (n)` yang memuat nominal gabungan kategori tersebut. Baris subtotal di dasar kartu **harus sama** dengan total kartu.
- Yang tidak boleh terjadi: total kartu berbeda dari jumlah baris rincian; transaksi `category = null` disembunyikan; kategori dikarang ketika data tidak ada; lebih dari empat baris rincian ditampilkan sebelum pengguna meminta rincian.

### AC-F7-6: Rincian pengeluaran dan tautan tindakan

- Kondisi: sama seperti AC-F7-5 untuk `MONEY_OUT`.
- Yang terjadi: kartu `Pengeluaran` menampilkan total, maksimal empat kategori terbesar, baris `Tanpa kategori` bila relevan, dan baris `Lainnya (n)` berisi nominal gabungan kategori yang tidak ditampilkan. Aksi `Lihat semua pengeluaran` membuka URL `?view=active&month=...&filter=out` (parameter `filter` bernilai `all|in|out|transfer`, default `all`, hanya berlaku pada view aktif).
- Yang tidak boleh terjadi: aksi menuju tujuan yang tidak ada; janji filter kategori pada halaman Aktivitas (fitur itu tidak ada); tombol tanpa perilaku; tautan yang mereset bulan atau dompet.

### AC-F7-7: Cakupan Bersama dan Pribadi

- Kondisi: user memilih cakupan.
- Yang terjadi: dua pilihan `Bersama` (default) dan `Pribadi`. `Bersama` menjumlahkan dompet `SHARING`; `Pribadi` hanya dompet `PERSONAL` milik user yang sedang login. Tidak ada opsi ketiga yang menggabungkan keduanya.
- Bila user tidak memiliki dompet pribadi: pilihan `Pribadi` tampil nonaktif dengan alasan tertulis, dan laporan tidak dimuat untuk cakupan itu.
- Yang tidak boleh terjadi: satu angka yang menjumlahkan Bersama dan Pribadi di mana pun pada laporan ini; dompet pribadi anggota lain masuk ke cakupan Pribadi; owner dapat melihat laporan pribadi anggota lain.

### AC-F7-8: Filter dompet

- Kondisi: user memilih satu dompet di dalam cakupan aktif.
- Yang terjadi: pilihan `Dompet` berisi `Semua dompet ({n})` sebagai default, lalu daftar dompet pada cakupan tersebut termasuk dompet yang diarsipkan. Memilih satu dompet mempersempit seluruh laporan: kartu utama, jejak saldo, rincian kategori, grafik, dan catatan kaki.
- Mengganti cakupan mereset pilihan dompet ke `Semua dompet`.
- Yang tidak boleh terjadi: daftar dompet mencampur cakupan; memilih dompet dari cakupan lain menghasilkan laporan kosong tanpa penjelasan; dompet arsip hilang dari daftar sehingga laporan tidak bisa direkonsiliasi; pilihan dompet hilang saat bulan diganti.

### AC-F7-9: Rekonsiliasi dengan Beranda

- Kondisi: bulan yang dipilih adalah bulan berjalan, cakupan `Bersama`, dompet `Semua dompet`.
- Yang terjadi: `Saldo akhir` harus sama persis dengan `sharedBalanceMinor` pada `GET /api/dashboard`. Untuk cakupan `Pribadi`, harus sama dengan `personalBalanceMinor`.
- Untuk bulan lampau, kesamaan itu tidak berlaku; yang berlaku adalah invarian AC-F7-4.
- Yang tidak boleh terjadi: dua angka saldo berbeda antara Beranda dan Ringkasan untuk kondisi yang sama; selisih yang dijelaskan sebagai pembulatan.

### AC-F7-10: Delta terhadap bulan sebelumnya

- Kondisi: laporan dimuat, dan bulan sebelumnya memiliki data pada cakupan dan dompet yang sama.
- Yang terjadi: ditampilkan delta nominal absolut untuk saldo akhir, total pemasukan, dan total pengeluaran, dengan kata `Naik` atau `Turun`, contoh `Naik Rp350.000 dari bulan lalu`.
- Bila bulan sebelumnya tidak memiliki data sama sekali: seluruh delta disembunyikan. Tidak ada `+Rp0`, tidak ada `Baru`, tidak ada persentase.
- Yang tidak boleh terjadi: persentase delta; delta dihitung dari bulan yang berbeda cakupan atau dompet; delta ditampilkan saat pembanding tidak ada; delta negatif dibalut eufemisme.

### AC-F7-11: Grafik pergerakan saldo harian

- Kondisi: laporan dimuat untuk satu periode.
- Yang terjadi: grafik garis/area menampilkan saldo akhir setiap hari dalam periode, termasuk hari tanpa transaksi (nilai tetap, tidak putus). Lima garis bantu horizontal dan label sumbu nominal ringkas membantu membandingkan saldo; tooltip menampilkan tanggal dan nominal persis.
- Grafik harus dapat dioperasikan keyboard, memiliki alternatif teks untuk pembaca layar, dan tidak menimbulkan scroll horizontal pada 390px, 768px, dan 1280px.
- Yang tidak boleh terjadi: hari tanpa transaksi dihilangkan dari sumbu; grafik menghitung ulang dari baris yang termuat di client; label terpotong atau keluar kartu; jumlah titik berubah antar breakpoint.

### AC-F7-18 (amendemen PM-approved 2026-10-25): Grafik komposisi kategori

- Kondisi: laporan bulanan berhasil dimuat.
- Yang terjadi: kartu Pemasukan dan Pengeluaran masing-masing menampilkan grafik donat komposisi kategori beserta legenda nama kategori, persentase, dan nominal. Grafik memakai breakdown server yang sama dengan kartu: empat kategori terbesar, gabungan `Lainnya (n)`, dan `Tanpa kategori` bila ada. Nilai nominal tetap penuh, bukan angka ringkas.
- Kondisi tanpa pemasukan atau pengeluaran: tampilkan teks empty state yang sudah ada; donat kosong tidak ditampilkan.
- Grafik tersedia untuk cakupan dan filter dompet aktif; transfer tidak masuk dalam komposisi.
- Yang tidak boleh terjadi: client menjumlahkan transaksi mentah, kategori hilang dari subtotal/legenda, grafik donat tanpa label, atau angka yang berbeda dari total kartu.

### AC-F7-12: Perlakuan transfer

- Kondisi: periode berisi transaksi `TRANSFER`.
- Yang terjadi: kaki transfer **tidak** dihitung pada `Masuk` dan `Keluar`. Namun transfer tetap mempengaruhi saldo dompet yang terlibat, sehingga diperhitungkan dalam `Saldo akhir` dan pada grafik.
- Transfer antar cakupan (Pribadi ke Bersama atau sebaliknya) hanya mengubah saldo dompet pada cakupannya masing-masing; laporan satu cakupan tidak boleh menampilkan sisi cakupan lain.
- Catatan kaki wajib menyebutkan `Transfer antar dompet tidak dihitung sebagai pemasukan atau pengeluaran`.
- Yang tidak boleh terjadi: transfer dihitung ganda sebagai pemasukan dan pengeluaran; transfer menghilang dari pergerakan saldo; sisi cakupan lain bocor ke laporan Pribadi pengguna lain.

### AC-F7-13: State lengkap

- Kondisi: berbagai keadaan data dan jaringan.
- Yang terjadi:
  - **loading**: skeleton dengan ukuran kartu yang sama, tanpa layout shift.
  - **empty**: belum ada transaksi pada periode dan cakupan tersebut, dengan penjelasan bahasa awam dan aksi menuju tambah transaksi.
  - **error**: satu state error penuh dengan tombol `Coba lagi`. Tidak ada kartu parsial.
  - **tanpa pembanding**: halaman tetap tampil, hanya blok delta yang tidak dirender.
  - **cakupan nonaktif**: pilihan Pribadi nonaktif dengan alasan.
  - **dompet terpilih tanpa data**: empty state khusus yang menyebut nama dompetnya.
- Yang tidak boleh terjadi: layar kosong tanpa penjelasan; spinner tanpa akhir; angka 0 yang menyamar sebagai data; sebagian kartu tampil sementara sebagian gagal.

### AC-F7-14: Satu sumber angka

- Kondisi: laporan dirender.
- Yang terjadi: seluruh angka berasal dari satu respons server untuk kombinasi bulan, cakupan, dan dompet yang aktif. Perubahan salah satu filter memicu satu permintaan baru.
- Blok `Ringkasan aktivitas` lama pada tab Transaksi (`ActivityView.tsx`, dihitung dari baris yang termuat) **dihentikan** dan diganti tautan `Lihat ringkasan bulan ini`.
- Yang tidak boleh terjadi: dua angka `Uang masuk` berbeda pada dua tab yang bersebelahan; client menjumlahkan `rows`; ringkasan dihitung dari halaman pertama pagination; angka berubah saat pengguna menekan `Muat lagi`.

### AC-F7-15: Kejujuran angka dan bahasa

- Kondisi: seluruh tampilan laporan.
- Yang terjadi: catatan kaki menampilkan jumlah transaksi penyusun, rentang tanggal periode, pengecualian transfer, dan cakupan aktif. Bahasa mengikuti aturan proyek: tanpa jargon akuntansi, tanpa em dash pada teks UI.
- Yang tidak boleh terjadi: baris `Potongan` (skema tidak memiliki konsep potongan sebelum bersih); baris `Tabungan` yang diambil dari `SavingsGoal` (tidak terhubung ke transaksi dan tidak mengurangi saldo dompet); kategori `Tanpa kategori` disembunyikan sehingga subtotal tidak cocok dengan total; angka pembanding yang dikarang.

## Edge Case

- Bulan tanpa transaksi sama sekali → `Masuk` dan `Keluar` = Rp0, `Saldo akhir` = `Saldo awal`, grafik datar, empty state pada dua kartu rincian.
- Hanya ada transfer pada periode → `Masuk`/`Keluar` = Rp0, pergerakan saldo tetap terlihat pada dompet yang terlibat.
- Dompet baru dibuat di tengah periode dengan saldo awal > 0 → baris `Saldo awal dompet baru` muncul, invarian AC-F7-4 tetap tepat.
- Dompet dibuat setelah periode berakhir tetapi memiliki transaksi backdate di periode itu → dompet ikut dihitung, transaksinya muncul di `Masuk`/`Keluar`, penyesuaian saldo awal muncul, dan catatan kaki menyebutkannya.
- Dompet dibuat setelah periode berakhir dan tidak punya aktivitas pada periode itu → tidak dihitung sama sekali, sehingga periode lampau tidak ikut terisi saldo dompet baru.
- Dompet diarsipkan di tengah periode → tetap dihitung pada `Semua dompet`; saldo tidak berubah karena arsip bukan penghapusan.
- User menghapus semua transaksi satu-satunya di periode → laporan turun ke empty state; tidak ada angka negatif sisa.
- Satu dompet dipilih lalu diarsipkan di tab lain → laporan tetap dapat dimuat; bila dompet tidak lagi dalam cakupan, pilihan direset ke `Semua dompet` dengan pemberitahuan.
- Cakupan Pribadi dipilih lalu user tidak punya dompet pribadi → pilihan nonaktif, bukan laporan kosong.
- Nominal agregat melebihi int32 → tetap benar (agregasi Postgres bigint, tidak di-cast ke int32 di aplikasi).
- `occurredAt` tepat di batas bulan (`2026-10-31T17:00:00Z` = 1 Nov 00:00 WIB) → masuk November, bukan Oktober.
- Kategori transaksi null pada sebagian besar baris → baris `Tanpa kategori` dapat mendominasi; itu ditampilkan apa adanya, bukan disembunyikan.
- Nama dompet atau kategori sangat panjang / mengandung emoji → wrap tanpa overflow dan tanpa memotong nominal.
- Sesi kedaluwarsa saat berpindah tab atau bulan → 401 → login → kembali ke tab dan bulan yang sama.

## Constraint Bisnis

- Nilai uang disimpan sebagai PostgreSQL `NUMERIC(18,2)` dan dapat memiliki dua angka desimal. Agregasi SQL tetap menggunakan `NUMERIC`; hasil API dihitung dalam rupiah dengan pembulatan konsisten hingga dua desimal.
- Batas bulan memakai kalender Asia/Jakarta (D-7), bukan timezone proses server dan bukan timezone perangkat.
- Transaksi soft-deleted tidak pernah dihitung.
- Transaksi bertanggal masa depan tidak mungkin ada (AC-F3-1), sehingga tidak ada aturan khusus untuk itu.
- Cakupan Bersama dan Pribadi tidak boleh dijumlahkan (A-44). Larangan ini berlaku juga pada delta dan grafik.
- Laporan tidak boleh memuat data household lain, dan cakupan Pribadi tidak boleh memuat dompet milik user lain, termasuk bagi Owner.
- Dompet terarsip tetap dihitung pada saldo karena arsip bukan penghapusan.
- Fitur ini tidak menambah tabel, kolom, atau migrasi. Seluruh angka diturunkan dari `transaction` dan `wallet`.

## Arahan Desain (untuk UI/UX)

Urutan kartu pada mobile, dari atas:

1. Header tab dan kontrol periode (warisan halaman).
2. Baris kontrol: `Cakupan` (segmented) dan `Dompet` (dropdown).
3. Kartu dominan `Sisa`, surface `navy`, satu-satunya permukaan paling kuat di layar.
4. Strip `Jejak saldo` (saldo awal, masuk, keluar, saldo akhir) dalam grid 2x2 di mobile dan 4 kolom di desktop.
5. Dua kartu grup `Pemasukan` dan `Pengeluaran`, bertumpuk di mobile, berdampingan di desktop.
6. Kartu grafik pergerakan saldo harian.
7. Catatan kaki kecil.

Yang perlu dijaga:

- Palet memakai token proyek: `#166534` untuk uang masuk, `#14273F` untuk penekanan, `#DCEBFA`/`#DCFCE7` untuk aksen. Tidak ada gradient pada kartu.
- Nominal memakai format `Rp1.250.000`, bukan notasi kurung akuntansi.
- Baris rincian bukan elemen interaktif. Satu-satunya tautan di kartu grup adalah `Lihat semua pengeluaran`.
- Tiga tab pada 390px harus diverifikasi tidak meluap; bila perlu, kurangi padding horizontal pill dan uji pada 360px.
- Energi visual rendah: satu kartu dominan, sisanya tenang. Ini laporan, bukan promosi.

## Out of Scope

- Ekspor CSV, ekspor PDF di jalur server, gambar yang bisa dibagikan (share/PNG), dan halaman `/reports` mandiri. Ekspor via print ke PDF tercakup AC-F7-16.
- Rentang tanggal bebas atau lintas bulan, dan perbandingan lebih dari satu bulan ke belakang.
- Filter atau rincian per kategori pada halaman Aktivitas.
- Integrasi tabungan (`SavingsGoal`) ke dalam laporan.
- Konsep potongan pemasukan (BPJS, PPh) dan pemasukan bersih.
- Rincian per anggota keluarga.
- Budget vs realisasi, multi-currency, dan proyeksi.
- Halaman `/reports` mandiri dan item navigasi baru.

## Extension F7.1: Ekspor ke PDF via print (PM-approved 2026-10-25)

Yang dibuka dari out-of-scope asli adalah **ekspor melalui dialog print native** (Cetak lalu Simpan sebagai PDF), bukan pembangkit PDF di server atau library client.

### AC-F7-16: Tombol `Cetak atau simpan PDF`

- Kondisi: tab Ringkasan dalam state data terisi. State `loading`, `error`, `empty`, dan dompet tanpa data tidak menampilkan tombol.
- Yang terjadi: satu tombol berlabel `Cetak atau simpan PDF` memanggil dialog print native pada isi laporan yang sedang tampil. Sebelum dialog terbuka, `document.title` ditimpa sementara menjadi `Laporan {Bulan Tahun}`, lalu kembali seperti semula setelah dialog ditutup.
- Print stylesheet `@media print` menyembunyikan seluruh cangkang aplikasi: navigasi bottom, navigasi top, bar tab, kontrol bulan, kontrol cakupan dan dompet, tombol aksi, toast, dan blok error; yang tercetak hanya isi laporan: judul laporan, kartu Sisa, Jejak saldo termasuk baris kondisional, dua kartu grup, grafik, dan catatan kaki.
- Kertas cetak menggunakan A4 portrait. Seluruh ringkasan harus muat pada halaman pertama; rincian transaksi dimulai di halaman kedua dan berlanjut sampai selesai.
- Perlekatan warna wajib tercetak: permukaan `navy` dan badge aksen tetap muncul, grafik SVG dirender penuh memenuhi lebar halaman.
- Semua angka tercetak identik dengan yang tampil di layar. Tidak ada perhitungan baru saat print.
- Yang tidak boleh terjadi: tombol tampil pada state non-data; layout kedua khusus PDF yang bisa slip dari angka layar; pembangkit PDF berupa dependency baru; tampilan layar berubah oleh print stylesheet; cangkang aplikasi ikut tercetak; nominal berbeda antara layar dan hasil cetak; halaman terpotong tengah kartu tanpa perlekatan yang jelas.

### AC-F7-17: Halaman detail transaksi pada hasil cetak (PM-approved 2026-10-25)

- Kondisi: pengguna menekan `Cetak atau simpan PDF`.
- Yang terjadi: baris transaksi bulan (bulan, cakupan, dompet yang sama) diambil dari endpoint list yang ada (`GET /api/transactions`, loop cursor sampai `nextCursor` null) sebelum dialog print dibuka. Selama persiapan, tombol tampil `Menyiapkan detail...` dan tidak dapat ditekan dua kali. Bila pengambilan gagal, ada pesan jujur dengan tombol `Coba lagi`, dan dialog tidak dibuka.
- Hasil cetak menambah bagian detail **setelah** halaman ringkasan, dimulai pada halaman baru: `Rincian transaksi {Bulan Tahun}`, tiga bagian berurutan `Uang masuk`, `Uang keluar`, `Transfer`.
- Setiap bagian menampilkan subtotal yang **diambil dari angka server** (bukan dihitung ulang client) dan harus cocok dengan kartu grup dan Jejak saldo: subtotal `Uang masuk` = `Masuk`, subtotal `Uang keluar` = `Keluar`, subtotal `Transfer` = `Transfer masuk + Transfer keluar`.
- Baris detail: tanggal kalender (Asia/Jakarta), deskripsi (`merchant`/`note`/kategori, perdana `Transfer` berlabel), dan nominal. Urutan tanggal menurun, tanggal sama diurutkan stabil (id sebagai tiebreaker). Kaki transfer tampil sebagai dua baris berlabel `Transfer`.
- Bulan tanpa transaksi: bagian detail tidak dicetak sama sekali (halaman ringkasan tetap lengkap). Bagian yang kosong (mis. ter-Transfer nol) dihilangkan, bukan dicetak kosong.
- Yang tidak boleh terjadi: print mengambil baris di luar bulan/cakupan/dompet aktif; bagian rincian mencampur tipe; angka dihasilkan perputaran aritmetika client yang bisa slip dari server; halaman pemisah hilang (ringkasan dan detail bertengger); kolom saldo berjalan baru muncul tanpa PM amandemen.
