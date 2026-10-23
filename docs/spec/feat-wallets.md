# Spec: Dompet Pribadi & Sharing

**Penulis:** PM / System Analyst · **Tanggal:** 2026-10-08 · **Status:** Spec Ready
**PRD:** `docs/PRD.md#fitur-6-dompet-pribadi-sharing`
**Desain:** `docs/design/06-wallets.md` (PM UX sign-off 2026-10-08; design-only)
**AC yang di-cover:** AC-F6-1 s.d. AC-F6-12

| PRD acceptance criterion | Spec detail |
|---|---|
| AC-F6-1 | AC-F6-1 |
| AC-F6-2 | AC-F6-2, AC-F6-11 |
| AC-F6-3 | AC-F6-3 |
| AC-F6-4 | AC-F6-4 |
| AC-F6-5 | AC-F6-5 |
| AC-F6-6 | AC-F6-6 |
| AC-F6-7 | AC-F6-7 |
| AC-F6-8 | AC-F6-8 |
| AC-F6-9 | AC-F6-9 |
| AC-F6-10 | AC-F6-10 |
| AC-F6-11 | AC-F6-11 |
| AC-F6-12 | AC-F6-12 |

## Overview

Wallet merepresentasikan dompet atau rekening aktual. Pengguna dapat mencatat uang
masuk/keluar ke wallet tertentu, memindahkan uang antar-wallet, serta membedakan wallet
Pribadi dari Sharing. Saldo dan transaksi Pribadi tidak boleh terlihat oleh anggota lain.
Household tetap memiliki ringkasan dan budget bersama yang hanya menghitung wallet
Sharing.

Dokumen ini menetapkan perilaku produk. Bentuk schema, kontrak API, query ACL, dan
strategi migrasi teknis ditetapkan dalam amendment architecture/ERD dan Dev Plan sebelum
implementasi.

## User Flow

1. Pengguna approved membuka Beranda dan melihat ringkasan saldo Sharing, ringkasan total
   wallet Pribadinya, serta kartu per-wallet yang dapat digeser untuk melihat wallet.
2. Pengguna membuat wallet dari area wallet di Beranda atau dari pemilih wallet pada
   formulir transaksi. Scope default adalah Pribadi; pengguna dapat memilih Sharing.
3. Pengguna mengisi nama, tujuan penggunaan opsional, dan saldo awal opsional. Saldo awal
   kosong berarti Rp0.
4. Saat mencatat uang masuk atau keluar, pengguna memilih wallet tujuan atau sumber.
   Untuk OCR, wallet dipilih pengguna saat memeriksa draft, bukan ditebak oleh AI.
5. Untuk transfer, pengguna memilih wallet sumber dan tujuan, memasukkan jumlah sekali,
   lalu menyimpan. Transfer dapat dilakukan lintas scope.
6. Pengguna mengubah detail wallet yang berhak dikelola atau mengarsipkan wallet yang
   berhak diarsipkan. Wallet Sharing dapat dipulihkan dari Arsip.
7. Pengguna melihat transaksi yang dapat diaksesnya. Transfer lintas scope memiliki
   tampilan umum pada aktivitas Sharing, tanpa mengungkap rincian wallet Pribadi.

## Behavior Detail

### AC-F6-1: Buat dan kelola wallet

- **Kondisi:** anggota household berstatus APPROVED membuat wallet.
- **Yang terjadi:** semua anggota approved dapat membuat wallet Pribadi maupun Sharing.
  Nama wallet wajib; tujuan penggunaan opsional dan ditentukan pengguna, termasuk
  "Tabungan". Nama dan tujuan maksimal 80 karakter. Saldo awal opsional; nilai kosong
  diperlakukan sebagai Rp0. Scope awal
  form adalah Pribadi, dan pengguna dapat memilih Sharing. Saldo awal dapat dikoreksi
  sebelum transaksi pertama tercatat pada wallet tersebut; setelah transaksi pertama
  (termasuk satu kaki transfer atau transaksi yang kemudian di-trash) tercatat, nilainya
  tidak dapat diubah langsung.
- **Yang tidak boleh terjadi:** member PENDING/DECLINED/REVOKED membuat wallet; scope
  default atau tujuan wallet dianggap sebagai jenis rekening; saldo awal kosong dianggap
  sebagai nilai yang tidak diketahui; saldo awal negatif; saldo awal diubah langsung
  setelah transaksi pertama tercatat.

### AC-F6-2: Isolasi wallet Pribadi dan akses wallet Sharing

- **Kondisi:** pengguna membaca atau mengubah wallet, transaksi, attachment, atau agregat.
- **Yang terjadi:** wallet Pribadi beserta transaksi dan receipt terkait hanya terlihat
  dan dapat digunakan oleh pemiliknya. Wallet Sharing terlihat dan dapat digunakan oleh
  semua anggota household APPROVED. Server-side enforcement pada seluruh endpoint
  ditetapkan terpisah di AC-F6-11.
- **Yang tidak boleh terjadi:** nama, saldo, transaksi, note, receipt, draft OCR, atau
  riwayat wallet Pribadi anggota lain bocor lewat list, detail, pencarian, trash, restore,
  dashboard, budget, advisor, response duplikat OCR, atau akses langsung berdasarkan ID.
  UI menyembunyikan data bukan pengganti otorisasi server.

### AC-F6-3: Perubahan detail dan arsip wallet

- **Kondisi:** anggota mengubah atau mengarsipkan wallet.
- **Yang terjadi:** semua anggota approved boleh mengubah nama dan tujuan wallet Sharing.
  Wallet Sharing hanya dapat diarsipkan/dipulihkan oleh pembuat wallet atau Owner. Wallet
  Pribadi hanya dapat diubah/diarsipkan/dipulihkan pemiliknya. Scope Pribadi/Bersama tidak
  dapat diubah setelah wallet dibuat (C-31); jika pengguna membutuhkan scope lain, buat
  wallet baru dan pindahkan dana melalui transfer. Arsip bersifat non-destruktif; saldo wallet
  terarsip tetap termasuk ringkasan total dan riwayat transaksi tetap tersimpan. Transaksi
  MONEY_OUT aktif pada wallet Sharing yang diarsipkan tetap masuk perhitungan pengeluaran
  household; arsip tidak mengubah status transaksi.
- **Yang tidak boleh terjadi:** hard-delete wallet atau transaksinya; wallet terarsip
  tersedia untuk pencatatan/transfer baru; pengguna tanpa hak dapat mengarsipkan wallet.
  Wallet terarsip tidak muncul pada carousel aktif, tetapi saldonya tetap dihitung; scope
  wallet diubah sehingga riwayat yang sebelumnya privat terbuka ke household atau
  sebaliknya.

### AC-F6-4: Uang masuk dan keluar terikat ke wallet

- **Kondisi:** pengguna mencatat MONEY_IN atau MONEY_OUT manual.
- **Yang terjadi:** MONEY_IN wajib memilih wallet penerima; MONEY_OUT wajib memilih wallet
  sumber. Saldo wallet dihitung sebagai `openingBalance + MONEY_IN aktif − MONEY_OUT aktif`
  pada wallet tersebut; opening balance bukan pemasukan atau aktivitas, dan baris trashed
  tidak memengaruhi saldo. Hanya wallet Sharing dan wallet Pribadi milik pengguna yang
  tersedia sebagai pilihan.
- **Yang tidak boleh terjadi:** transaksi uang masuk/keluar tersimpan tanpa wallet; wallet
  anggota lain atau household lain dapat dipilih; transaksi ter-trash ikut dihitung.

### AC-F6-5: Transfer antar-wallet

- **Kondisi:** pengguna membuat transfer antara dua wallet yang boleh diaksesnya.
- **Yang terjadi:** pengguna memilih sumber dan tujuan yang berbeda dan memasukkan jumlah
  sekali. Transfer dapat dilakukan Pribadi↔Pribadi, Sharing↔Sharing, atau lintas scope
  selama pengguna berhak atas kedua sisi. Kedua sisi dibuat atomik dengan jumlah dan
  tanggal yang konsisten; transfer netral terhadap gabungan saldo, tetapi mengubah saldo
  masing-masing wallet. Trash/restore berlaku atomik pada kedua sisi. Untuk transfer
  Sharing↔Sharing, semua anggota approved yang dapat mengakses wallet Sharing tetap dapat
  trash/restore pasangan sesuai perilaku transaksi household saat ini. Transfer
  Pribadi↔Pribadi hanya dapat dikelola pemilik wallet. Untuk transfer lintas scope, hanya
  pembuat transfer atau Owner yang dapat trash/restore pasangan; anggota lain dapat melihat
  aktivitas umum pada sisi Sharing, tetapi tidak dapat mengubah transfer itu.
- **Yang tidak boleh terjadi:** transfer ke wallet Pribadi anggota lain, lintas-household,
  ke wallet yang sama, atau ke wallet terarsip; hanya satu sisi tersimpan; transfer
  dihitung sebagai pengeluaran budget household.

### AC-F6-6: Privasi transfer lintas scope

- **Kondisi:** transfer melibatkan wallet Pribadi dan Sharing.
- **Yang terjadi:** pemilik wallet Pribadi dapat melihat rincian kedua sisi yang menjadi
  haknya. Anggota lain hanya melihat sisi Sharing sebagai aktivitas umum dengan nominal
  dan tanggal yang diperlukan untuk menjelaskan perubahan saldo, tanpa nama/ID wallet
  Pribadi, note, atau riwayat wallet Pribadi.
- **Yang tidak boleh terjadi:** response API atau UI anggota lain mengandung metadata
  privat yang hanya disembunyikan melalui styling; hubungan dua sisi transfer dapat
  digunakan untuk menelusuri aktivitas Pribadi.

### AC-F6-7: Dashboard dan agregat

- **Kondisi:** dashboard, aktivitas, grafik, dan ringkasan dimuat.
- **Yang terjadi:** dashboard menampilkan ringkasan saldo wallet Sharing dan total wallet
  Pribadi milik pengguna sebagai dua nilai terpisah. Kartu per-wallet menampilkan wallet
  yang boleh diakses, dengan penanda scope, dalam carousel untuk browse. Saldo wallet
  aktif maupun terarsip masuk ringkasan sesuai scope. Karena kartu carousel hanya memuat
  wallet aktif, ringkasan memberi keterangan bahwa total juga mencakup wallet di Arsip.
  Semua agregat dihitung server-side.
- **Yang tidak boleh terjadi:** saldo Pribadi anggota lain tampil; angka Sharing dan
  Pribadi dijumlahkan menjadi satu ringkasan; wallet terarsip diam-diam mengurangi total.

### AC-F6-8: Budget dan pengeluaran household

- **Kondisi:** budget, total pengeluaran household, atau grafik pengeluaran memakai data
  transaksi.
- **Yang terjadi:** pengeluaran household, budget spent/remaining, grafik, dan data yang
  terkait hanya menggunakan MONEY_OUT aktif wallet Sharing, termasuk wallet Sharing yang
  sudah diarsipkan. Transfer tidak dihitung sebagai pengeluaran.
- **Yang tidak boleh terjadi:** transaksi wallet Pribadi berkontribusi pada angka
  pengeluaran household.

### AC-F6-9: Migrasi transaksi sebelum wallet

- **Kondisi:** sistem mengaktifkan fitur wallet pada household yang telah memiliki
  transaksi.
- **Yang terjadi:** satu wallet Sharing default dibuat untuk setiap household lama dan
  transaksi pre-wallet household tersebut ditautkan kepadanya. Saldo awal wallet hasil
  migrasi Rp0 agar transaksi historis tidak dihitung dua kali. Proses migrasi dapat
  diulang tanpa membuat wallet/tautan duplikat. Nama wallet default migrasi = **"Dompet
  Keluarga"** dan dapat diubah setelah wallet dibuat.
- **Yang tidak boleh terjadi:** transaksi lama hilang, saldo lama terduplikasi, transfer
  lama kehilangan pasangan, atau transaksi household A ditautkan ke wallet household B.

### AC-F6-10: OCR dan receipt

- **Kondisi:** pengguna mengunggah receipt, meninjau draft OCR, dan mengonfirmasi transaksi.
- **Yang terjadi:** wallet tidak ditebak oleh OCR. Pengguna memilih dan mengonfirmasi
  wallet saat review sebelum simpan. Draft yang belum disimpan hanya dapat diakses
  pengunggah. Sebelum konfirmasi pada wallet Sharing, UI memberi tahu bahwa anggota
  household approved dapat melihat gambar receipt. Setelah transaksi disimpan, akses
  **gambar receipt** mengikuti visibilitas seluruh transaksi yang tertaut: tautan
  Pribadi saja → pemilik; jika ada tautan Sharing → seluruh household approved. Receipt
  yang sama boleh mendukung lebih dari satu transaksi sesuai AC-F3-6; transaksi Pribadi
  tetap tersembunyi meskipun gambar receipt sudah dibagikan melalui transaksi Sharing.
  Pengguna yang berhak dapat membuka gambar melalui aksi `Lihat struk` pada detail
  transaksi; byte hanya disajikan melalui jalur server terautentikasi, bukan URL Blob
  publik. **Job dan draft OCR tetap hanya dapat dibaca pengunggah**, sebelum maupun sesudah
  save.
  Jika receipt sama diunggah anggota lain, respons duplikat bersifat umum dan tidak
  mengembalikan job, draft, uploader, atau detail receipt lama.
- **Yang tidak boleh terjadi:** transaksi OCR tersimpan tanpa konfirmasi/wallet; receipt
  atau draft transaksi Pribadi dapat dibaca anggota lain melalui route receipt, job,
  deduplication, atau payload transaksi; byte gambar dapat dibaca lewat URL Blob publik
  atau endpoint tanpa otorisasi.

### AC-F6-11: Otorisasi server-side lintas wallet

- **Kondisi:** request membaca atau memutasi wallet, transaksi, receipt, trash/restore,
  dashboard, budget, atau advisor.
- **Yang terjadi:** server memvalidasi membership APPROVED, household aktif, scope, dan
  kepemilikan wallet pada setiap jalur. Agregat household/advisor hanya menggunakan
  Sharing; ringkasan Pribadi hanya menghitung wallet milik caller. Untuk transfer pasangan,
  hak akses kedua sisi diperiksa tanpa mengirim metadata sisi Pribadi ke anggota lain.
  Respons lintas-household atau wallet Pribadi pengguna lain tidak membocorkan keberadaan
  resource.
- **Yang tidak boleh terjadi:** kontrol akses hanya di UI; request dapat menebak ID untuk
  membaca/mengubah data Pribadi; cache advisor household menyajikan data Pribadi.

### AC-F6-12: UX state dan aksesibilitas

- **Kondisi:** halaman wallet, pemilih, formulir, atau operasi gagal/berhasil.
- **Yang terjadi:** loading, empty, error, submitting, selected, dan success state
  tersedia; kegagalan mempertahankan input agar pengguna dapat memperbaiki atau mencoba
  lagi. Kartu/picker dapat digunakan dengan keyboard dan pembaca layar, scope tidak
  dibedakan melalui warna saja, dan layout tidak overflow pada 390px.
- **Yang tidak boleh terjadi:** aksi tanpa hasil, label scope tidak terbaca, saldo error
  ditampilkan sebagai nol, atau jalur transaksi buntu saat belum ada wallet yang dapat
  dipilih.

## Edge Case

- Opening balance kosong → Rp0; opening balance yang dimasukkan tidak membuat aktivitas
  transaksi atau budget spending.
- Opening balance dapat dikoreksi sampai row transaksi pertama di wallet dibuat. Row tetap
  mengunci opening balance setelah ditrash; satu kaki transfer juga dihitung sebagai
  transaksi pertama untuk wallet yang dirujuk kaki tersebut.
- Wallet Sharing diarsipkan saat terbuka di form anggota lain → submit baru ditolak,
  input transaksi tetap terjaga, pengguna diminta memilih wallet aktif lain.
- Restore wallet Sharing dari Arsip hanya dapat dilakukan pembuat wallet atau Owner;
  restore wallet Pribadi hanya dapat dilakukan pemiliknya.
- Saldo wallet terarsip bukan nol → tetap masuk ringkasan total tetapi tidak tersedia
  pada picker/carousel aktif; keterangan ringkasan menjelaskan saldo terarsip termasuk.
- Transfer Pribadi→Sharing → pemilik melihat kedua sisi; anggota lain hanya melihat
  aktivitas generik pada sisi Sharing.
- Transfer Sharing→Pribadi → anggota lain melihat aktivitas generik sisi Sharing; data
  wallet Pribadi tujuan tetap privat.
- Transfer dibuat bersamaan dengan trash/restore pada sisi yang sama → operasi harus
  tetap atomik dan tidak meninggalkan satu kaki aktif.
- Request wallet ID tak dikenal, wallet anggota lain, atau household lain → respons
  aman tanpa mengonfirmasi keberadaan resource.
- Household lama memiliki nol atau banyak transaksi, termasuk transfer → migrasi tetap
  membuat satu wallet default Sharing dan mempertahankan saldo hasil ledger.
- Pengguna belum memiliki wallet aktif (mis. household baru) → empty state menjelaskan
  pembuatan wallet; transaksi tidak dapat disimpan tanpa pemilihan wallet.
- OCR duplikat milik uploader lain hanya mengembalikan pesan duplikat umum tanpa job,
  draft, uploader, atau detail receipt lama. Retry duplikat oleh uploader yang sama boleh
  mengikuti perilaku dedup OCR yang sudah ada.
- Jika satu receipt tertaut pada transaksi Pribadi dan Sharing, anggota household dapat
  melihat receipt melalui transaksi Sharing tetapi tidak dapat melihat detail transaksi
  Pribadi. Job/draft OCR tetap uploader-only. Pemilihan Sharing harus menampilkan disclosure
  sebelum konfirmasi.
- Pengguna yang kehilangan status APPROVED tidak dapat melanjutkan akses ke wallet
  household melalui endpoint terlindungi.

## Constraint Bisnis

- Semua nilai uang adalah integer IDR; dashboard, budget, dan saldo wallet bersumber dari
  perhitungan server.
- Wallet Pribadi dan data terkait dimiliki satu user dalam household; Sharing dimiliki
  household dan dapat digunakan anggota approved.
- Tujuan penggunaan wallet tidak otomatis menjadi SavingsGoal dan tidak memperbarui
  `savedAmount` goal.
- Tidak ada sinkronisasi bank; pengguna mencatat transaksi dan saldo awal secara manual.
- Saldo wallet terarsip tetap masuk ringkasan total; kartu aktif/picker hanya memuat
  wallet aktif.
- Transfer lintas scope tetap mematuhi privacy boundary pada kedua sisi, termasuk
  receipt, aktivitas, trash, dashboard, budget, advisor, dan response API.
- Migrasi harus mempertahankan data dan saldo existing serta dapat diverifikasi pada
  database kosong dan database berisi data.

## Out of Scope

- Sinkronisasi rekening bank, impor transaksi otomatis, recurring transactions, dan
  multi-currency.
- Menghubungkan wallet Tabungan secara otomatis ke SavingsGoal atau membuat kontribusi
  goal sebagai transaksi.
- Edit transaksi historis, rekonsiliasi, saldo negatif/overdraft, dan pencatatan utang.
- Mengatur ulang urutan kartu wallet; carousel hanya untuk melihat kartu.
- Mengubah scope wallet setelah dibuat; pengguna membuat wallet baru dan memindahkan dana
  melalui transfer bila diperlukan (C-31).
- Notifikasi, interest, dan saran AI per wallet.
- Menambah item navigasi utama khusus Wallet.

## PM Review & Approval

- **PM approval:** 2026-10-08 — requirements F6-1..12 disetujui sebagai baseline produk
  setelah UX sign-off dan QA requirement review `PASS`.
- **PM amendment:** 2026-10-09 — scope wallet dikunci setelah dibuat; perubahan scope hanya
  melalui wallet baru dan transfer (C-31), selaras dengan PRD AC-F6-3 dan design 06.
- **PM amendments:** 2026-10-09 — gambar receipt yang terkait transaksi dapat dibuka
  melalui jalur server terautentikasi oleh pengguna yang berhak (C-30); job/draft OCR tetap
  uploader-only (C-29). Gambar tidak memakai Blob URL publik.
- **Gate berikutnya:** Developer Dev Plan approval. Amendment arsitektur A-36..A-50 telah
  diratifikasi PM pada 2026-10-09. Approval ini tidak menyatakan implementasi telah dimulai
  atau tes telah dijalankan.
- **QA sign-off + PM approval implementasi:** 2026-10-09 — T-009 diimplementasikan dan
  diverifikasi QA independen **PASS** (AC-F6-1..11 Pass, AC-F6-10 Pass WITH RISK untuk
  authorized image byte path vs Vercel Blob live, AC-F6-12 Pass di 390/768/1280;
  BUG-1..BUG-5 tertutup). Bukti: `docs/qa/t009-f6-qa-report.md`, matriks F6, journey
  W1..W15. PM menerima hasil; T-009 → `done`. Rilis MVP tetap menunggu T-008 dan blocker
  AC-F4-5 yang terpisah.
- **Residual:** authorized receipt-image bytes vs Vercel Blob live, OCR Gemini live, advisor
  live, sesi screen-reader AT, `financial_planner_t003` belum dimigrasi, dan target sentuh
  lama T-006 (`WO-009`).
