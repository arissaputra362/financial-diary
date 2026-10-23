# Spec: Katalog Bank Resmi & Quick Add Institusi Pribadi

**Penulis:** PM / System Analyst · **Tanggal:** 2026-10-20 · **Revisi keputusan:** 2026-10-21 · **Status:** `Spec Ready / PM-approved 2026-10-21`
**Fitur slug:** `bank-institutions` · **Ticket:** T-011 (ticket internal; tanpa key Jira)
**Spec terkait:** `docs/spec/feat-wallets.md` (Spec Ready, tidak diubah oleh dokumen ini)
**Desain kanonik:** `docs/design/07-bank-institutions.md` (PM-approved 2026-10-21); aturan kartu wallet di `docs/design/06-wallets.md`
**Sumber katalog resmi:** https://ojk.go.id/id/kanal/perbankan/data-dan-statistik/Pages/Daftar-Alamat-Kantor-Pusat-Bank-Umum-Dan-Syariah.aspx

## Status Dokumen

Dokumen ini berstatus **Spec Ready / PM-approved 2026-10-21**. Keputusan produk Q1 sampai Q9 sudah dijawab PM pada 2026-10-21 dan dicatat di bagian `Definition of Ready`.

- Ini adalah gate DDD, bukan implementasi. Tidak ada kode aplikasi, schema Prisma, migrasi, API, fixture, atau seed yang dibuat/diubah.
- Spec wallet yang sudah ada (`docs/spec/feat-wallets.md`) dan Dev Plan wallet yang sudah Approved (`docs/dev-plan/feat-wallets.md`) tidak diubah. Fitur ini adalah perluasan terpisah yang merujuk wallet.
- Amendment arsitektur A-52 sampai A-59 berstatus **Accepted by PM 2026-10-21** di `docs/architecture-decisions.md`. Amendment tersebut tidak mengubah A-36 sampai A-51 yang sudah accepted.
- PM menyetujui arah produk dan schema tingkat tinggi: katalog resmi global read-only, daftar pribadi per user, dan Wallet merujuk paling banyak satu entri. Nama endpoint, tipe kolom, index, constraint, error code, dan detail migrasi adalah **implementation contract** yang dibahas di Dev Plan dan amendment, bukan keputusan produk PM.
- **T-011 Ready for Development / Implementation in Progress** setelah Spec, arsitektur, desain UX, dan Dev Plan disetujui PM pada 2026-10-21. Ini bukan klaim implementasi selesai atau QA Passed.
- `docs/design/07-bank-institutions.md` adalah desain UX kanonik dan sudah PM-approved 2026-10-21. Artefak di `docs/design/audit-2026-10-visual-refresh/` hanya bukti statis dan **bukan approval kanonik**. `docs/design/06-wallets.md` adalah milik UI/UX Designer dan tidak diubah oleh fitur ini.
- Istilah "Quick Add" dipakai sebagai nama internal alur. Label yang tampil di UI ditentukan oleh desain kanonik, bukan oleh dokumen ini.

## Overview

Wallet saat ini hanya memiliki `name`, `purpose`, `scope`, dan `openingBalanceMinor`. Pengguna ingin menandai wallet dengan bank atau penyedia yang sesuai, memilih dari daftar bank Indonesia, dan tetap dapat membuat wallet manual tanpa bank.

Fitur ini menambahkan dua hal:

1. **Katalog bank resmi** yang bersumber dari daftar publik OJK, hanya dapat dibaca pengguna, dan diisi lewat seeder statis yang diverifikasi saat implementasi. Tidak ada sinkronisasi runtime, external, atau otomatis.
2. **Quick Add institusi pribadi** untuk bank atau penyedia yang belum ada di katalog resmi. Entri Quick Add disimpan di daftar pribadi milik user yang menambahkannya, bukan di katalog bersama.

Institusi adalah **label atau atribut teks wallet**, bukan integrasi bank. Tidak ada nomor rekening, logo bank, nomor kartu, verifikasi rekening, pengambilan saldo, atau tautan ke layanan bank.

## Tujuan

- Memberi pilihan bank Indonesia yang jelas saat membuat wallet, tanpa memaksa pengguna memakai salah satu bank.
- Menyediakan jalur alternatif yang selalu tersedia: dompet manual atau bank/penyedia lain.
- Memungkinkan pengguna menambahkan bank/penyedia yang belum ada tanpa mencemari katalog bersama.
- Menjaga privasi daftar pribadi: user lain tidak dapat melihat, mencari, atau menghitung entri pribadi seseorang.
- Menampilkan label institusi pada wallet Bersama hanya sebagai metadata wallet kepada anggota yang berhak melihat wallet tersebut.
- Menjaga kompatibilitas wallet lama: wallet tanpa institusi tetap valid dan tidak di-backfill.

## Scope

**In scope (PM-approved 2026-10-21):**

- Katalog bank resmi dari daftar OJK, read-only bagi user, dengan sumber, versi seed, dan periode sumber (`YYYY-MM`, bukan hari yang dikarang).
- Seeder statis dan versioned untuk katalog resmi. Perubahan katalog hanya lewat update seed/data terkontrol.
- Daftar entri institusi pribadi per user untuk Quick Add.
- Pencarian dan pemilihan institusi pada form Buat/Edit dompet.
- Jalur manual tanpa institusi yang selalu tersedia.
- Referensi opsional wallet ke satu institusi resmi atau satu entri pribadi.
- Label institusi pada detail/kartu wallet, termasuk label pada wallet Bersama bagi anggota yang berhak.
- Otorisasi server-side, arsip entri pribadi, dan kompatibilitas wallet existing.
- Pengelolaan data katalog di luar runtime aplikasi lewat seed terkontrol.

**Out of scope:** lihat bagian `## Out of Scope` di bawah. Ringkasnya: integrasi bank, rekening/logo/kartu, admin UI, katalog komunitas, lebih dari satu institusi per wallet, klasifikasi Quick Add, rename/hard delete entri pribadi, sinkronisasi otomatis, dan perubahan pada modul transaksi, budget, goal, OCR, dashboard, atau advisor.

## Aktor

| Aktor | Peran dalam fitur ini |
|---|---|
| Anggota household berstatus APPROVED | Melihat katalog resmi, memilih institusi, menambah/mengelola entri pribadi, membuat wallet. |
| Pemilik wallet Pribadi | Satu-satunya yang dapat melihat dan mengubah wallet Pribadi, termasuk label institusinya. |
| Pembuat wallet Bersama / Owner household | Tetap mengikuti aturan wallet existing untuk arsip/restore. Untuk perubahan institusi, anggota APPROVED yang boleh mengedit detail wallet Bersama dapat mengubah label. |
| Anggota APPROVED lain pada wallet Bersama | Dapat melihat label institusi sebagai metadata wallet. Akses ke daftar pribadi pembuat tidak diberikan. |
| Anggota PENDING, DECLINED, atau REVOKED | Tidak memiliki akses ke katalog, entri pribadi, atau wallet melalui endpoint terlindungi. |
| Operator seed katalog (Developer/ops) | Menjalankan update seed katalog di luar aplikasi. Bukan role aplikasi dan tidak memiliki UI admin pada fitur ini. |

## Keputusan Terkonfirmasi

Keputusan berikut disetujui PM pada 2026-10-21 dan menjadi dasar Spec ini.

| Item | Status | Catatan |
|---|---|---|
| Cakupan katalog resmi: Bank Umum dan Bank Umum Syariah dari direktori OJK | Confirmed PM 2026-10-21 | Bukan seluruh penyedia jasa keuangan dan bukan daftar bank umum saja. |
| Seeder statis dan versioned, bukan sinkronisasi runtime | Confirmed PM 2026-10-21 | Katalog di database adalah snapshot lokal dari seed. Tidak ada runtime, external, atau automatic synchronization ke OJK. |
| Perubahan katalog hanya lewat update seed/data terkontrol | Confirmed PM 2026-10-21 | Tidak ada admin UI, cron, job, atau tombol sync. |
| Bank/penyedia di luar katalog masuk lewat Quick Add atau jalur manual | Confirmed PM 2026-10-21 | Termasuk non-bank provider dan institusi yang tidak terdaftar. |
| Katalog resmi bersifat read-only bagi user | Confirmed PM 2026-10-21 | Hanya proses seed/data terkontrol yang menulis katalog. |
| Institusi hanya label, bukan integrasi bank | Confirmed PM 2026-10-21 | Tidak ada rekening, logo, nomor kartu, saldo, atau verifikasi. |
| Quick Add memakai satu field nama tanpa field kategori | Confirmed PM 2026-10-21 | Batas nama 80 karakter, sama dengan nama wallet. |
| Normalisasi duplikat: trim, collapse whitespace, case-insensitive | Confirmed PM 2026-10-21 | Berlaku untuk nama resmi dan nama pribadi. |
| Duplikat nama resmi mengarahkan user ke baris resmi | Confirmed PM 2026-10-21 | Entri pribadi dengan nama resmi aktif tidak dibuat. |
| Duplikat nama pribadi aktif memakai entri existing atau memblokir entri baru | Confirmed PM 2026-10-21 | Daftar pribadi tetap per user dan tidak pernah dibagikan. |
| Arsip entri pribadi bersifat soft archive, tanpa hard delete | Confirmed PM 2026-10-21 | Wallet lama yang merujuk entri arsip tetap menampilkan label. |
| Re-add nama ternormalisasi sama mengaktifkan kembali entri arsip | Confirmed PM 2026-10-21 | Bukan membuat baris aktif kedua. |
| Quick Add langsung tersimpan walau pembuatan wallet dibatalkan | Confirmed PM 2026-10-21 | Entri berdiri sendiri di daftar pribadi user. |
| Label institusi pada wallet Bersama terlihat oleh anggota yang berhak melihat wallet | Confirmed PM 2026-10-21 | Daftar pribadi pembuat tetap tidak diekspos. |
| Edit institusi pada Wallet update adalah field metadata opsional | Confirmed PM 2026-10-21 | Mengikuti izin edit wallet existing. Scope tetap immutable. |
| Wallet Pribadi: edit institusi hanya oleh pemilik | Confirmed PM 2026-10-21 | Tidak ada hak akses baru. |
| Wallet Bersama: editor APPROVED dapat preserve, clear, pilih resmi, atau pilih entri sendiri | Confirmed PM 2026-10-21 | Editor tidak dapat melihat, mengenumerasi, atau memakai daftar pribadi anggota lain. |
| Label wallet mengikuti row katalog lokal atau row custom lokal | Confirmed PM 2026-10-21 | Tidak ada external live sync. Nama custom tidak dapat di-rename pada v1. |
| Dua tabel: `BankInstitution` global read-only dan `UserCustomInstitution` per user | Confirmed PM 2026-10-21 (schema tingkat tinggi) | Wallet merujuk paling banyak satu entri. Manual berarti tidak merujuk keduanya. |
| Tidak ada field klasifikasi pada entri custom | Confirmed PM 2026-10-21 | Quick Add hanya satu nama. |
| Penempatan PRD: extension ke F6 (Dompet) | Confirmed PM 2026-10-21 | Tidak menambah fitur PRD baru. |
| Batas nama custom 80 karakter | Confirmed PM 2026-10-21 | Default yang disetujui, sama dengan batas nama wallet. |
| Jalur "Dompet manual / bank lain" selalu tersedia | Confirmed PM 2026-10-21 | Wallet tanpa institusi tetap valid. |

## Proposed / Implementation Contract (bukan keputusan produk PM)

Detail teknis berikut belum ditetapkan oleh PM. Developer membawanya ke Dev Plan dan amendment arsitektur untuk review. Tidak ada yang boleh dibaca sebagai keputusan PM.

| Item | Status | Arah awal |
|---|---|---|
| Nama endpoint dan bentuk request/response | Implementation contract, proposed | Diusulkan di Dev Plan dan A-57. |
| Tipe kolom, index, FK, CHECK, dan partial unique index | Implementation contract, proposed | Diusulkan di Dev Plan dan A-53 sampai A-55. |
| Error code duplikat dan institusi tidak tersedia | Implementation contract, proposed | Diusulkan di Dev Plan dan A-57. |
| Bentuk DTO dan aturan `id = null` untuk non-pemilik | Implementation contract, proposed | Diusulkan di Dev Plan dan A-56. |
| Prosedur dan format parsing workbook OJK | Implementation task | Diverifikasi developer saat implementasi, termasuk struktur file, field nama, dan validasi baris. Bukan keputusan produk. |
| Versi dan isi seed awal | Implementation task | Seed diberi versi, URL/file hash, dan periode sumber level bulan. Isi diverifikasi terhadap file resmi terbaru saat implementasi. |

## User Flow

1. Pengguna APPROVED membuka sheet **Buat dompet** dari Beranda atau dari picker wallet.
2. Pengguna melihat field opsional **Bank atau penyedia** dengan dua grup: **Bank resmi (daftar publik OJK)** yang read-only, lalu **Bank/penyedia pribadiku**.
3. Pengguna mencari dan memilih bank resmi. Nama wallet tetap wajib dan bebas; memilih bank tidak menimpa nama wallet.
4. Bila bank/penyedia tidak ditemukan, pengguna dapat:
   - membuka **Quick Add**, mengisi satu nama, lalu menyimpan; entri masuk daftar pribadi dan langsung terpilih; atau
   - memakai jalur **Dompet manual / bank lain** dan membuat wallet tanpa institusi.
5. Pengguna melengkapi nama, tujuan opsional, scope, dan saldo awal, lalu menyimpan wallet.
6. Wallet menampilkan label institusi pada detail dan, bila desain mengizinkan, pada kartu wallet.
7. Pada wallet Bersama, anggota APPROVED yang berhak melihat wallet dapat melihat label institusi sebagai metadata. Mereka tidak dapat membuka daftar pribadi pembuat atau melihat entri pribadi lain.
8. Saat mengedit wallet, pengguna dapat mempertahankan, mengganti, atau menghapus label sesuai izin yang disetujui. Entri pribadi hanya dapat dipilih oleh pemiliknya.
9. Pengguna dapat mengarsipkan entri pribadi lewat aksi `Arsipkan` di grup pribadi picker. Entri tidak muncul lagi sebagai pilihan, tetapi tampil di toggle `Arsip` dan dapat dipulihkan lewat `Pulihkan`. Wallet yang sudah merujuk entri tersebut tetap menampilkan labelnya.
10. Katalog resmi diperbarui di luar aplikasi lewat update seed/data terkontrol. Pengguna tidak dapat menambah, mengubah, atau menghapus katalog resmi.

## Behavior Detail

Status pada setiap AC menunjukkan tingkat kepastian requirement. Seluruh AC di bawah sudah **Confirmed** berdasarkan keputusan PM 2026-10-21 dan aturan project existing, kecuali bagian yang secara eksplisit menyebut detail implementasi. Bentuk schema/API final tetap mengikuti Dev Plan yang belum disetujui.

### AC-BI-1 (Confirmed): Katalog bank resmi read-only

- **Kondisi:** anggota APPROVED membuka pemilih institusi atau mencari bank.
- **Yang terjadi:** server mengembalikan bank resmi yang aktif dari katalog lokal. Pengguna dapat mencari berdasarkan nama. Katalog dapat kosong bila seed belum dijalankan atau belum ada data aktif.
- **Yang tidak boleh terjadi:** anggota PENDING/DECLINED/REVOKED membaca katalog melalui endpoint terlindungi; user biasa menambah, mengubah, menghapus, atau menonaktifkan bank resmi; nama contoh di mockup dianggap sebagai daftar lengkap; katalog diperbarui otomatis dari OJK.

### AC-BI-2 (Confirmed): Jalur dompet manual selalu tersedia

- **Kondisi:** pengguna membuat atau mengedit wallet.
- **Yang terjadi:** institusi bersifat opsional. Wallet dapat disimpan tanpa institusi (manual). Wallet lama yang belum memiliki institusi tetap valid dan tidak di-backfill.
- **Yang tidak boleh terjadi:** institusi menjadi field wajib; wallet manual ditolak atau dianggap error; wallet lama kehilangan data atau dipaksa memilih bank.

### AC-BI-3 (Confirmed): Quick Add masuk daftar pribadi

- **Kondisi:** anggota APPROVED menambahkan bank/penyedia yang tidak ada di katalog resmi.
- **Yang terjadi:** entri disimpan dengan pemilik user yang sedang login dan hanya muncul di daftar pribadi user tersebut. Entri dapat langsung dipilih pada wallet yang sedang dibuat. Entri tidak masuk katalog resmi dan tidak menjadi data household.
- **Yang tidak boleh terjadi:** entri Quick Add muncul di daftar user lain; entri Quick Add masuk katalog bersama; entri Quick Add menjadi data yang dapat dibaca semua anggota household; user lain dapat mengubah atau mengarsipkan entri tersebut.

### AC-BI-4 (Confirmed): Satu field nama, maksimal 80 karakter

- **Kondisi:** pengguna membuka Quick Add.
- **Yang terjadi:** hanya ada satu field wajib untuk nama bank/penyedia. Tidak ada field kategori atau jenis bank. Nilai di-trim. Batas panjang 80 karakter, sama dengan nama wallet.
- **Yang tidak boleh terjadi:** field kategori wajib; nama kosong atau hanya spasi diterima; nama melebihi 80 karakter diterima; nama Quick Add menimpa nama wallet secara otomatis.

### AC-BI-5 (Confirmed): Duplikat nama ternormalisasi

- **Kondisi:** pengguna menyimpan entri pribadi yang namanya sama dengan entri pribadi aktif lain atau dengan bank resmi aktif, setelah trim, collapse whitespace, dan perbandingan tanpa membedakan huruf besar/kecil.
- **Yang terjadi:** server menolak pembuatan baris aktif kedua. Untuk duplikat pribadi aktif, pengguna memakai kembali entri yang sudah ada atau entri baru diblokir. Untuk duplikat bank resmi, pengguna diarahkan memilih baris katalog resmi. Pesan menjelaskan nama yang sudah ada dan pilihan yang tersedia.
- **Yang tidak boleh terjadi:** dua entri pribadi aktif dengan nama ternormalisasi sama; duplikat hanya dicegah di UI tetapi lolos di API; entri baru dibuat diam-diam dengan nama berbeda; data user lain bocor saat menjelaskan duplikat.

### AC-BI-6 (Confirmed): Privasi label pada wallet Bersama

- **Kondisi:** wallet Bersama memiliki label institusi, termasuk entri pribadi milik salah satu anggota.
- **Yang terjadi:** label ditampilkan sebagai metadata wallet kepada anggota APPROVED yang berhak melihat wallet tersebut. Response wallet hanya memuat jenis dan nama label yang diperlukan. Daftar pribadi pemilik entri tidak pernah dikembalikan ke anggota lain.
- **Yang tidak boleh terjadi:** anggota lain dapat mengenumerasi daftar pribadi; identitas pemilik entri pribadi diekspos; ID entri pribadi orang lain dikirim ke client yang tidak berhak; label dipakai untuk menelusuri wallet Pribadi atau data lain.

### AC-BI-7 (Confirmed): Izin mengubah institusi pada wallet Pribadi dan Bersama

- **Kondisi:** pengguna mengedit wallet Pribadi, atau anggota APPROVED mengedit detail wallet Bersama yang sudah memiliki label institusi.
- **Yang terjadi:** field institusi adalah metadata opsional pada update wallet dan mengikuti izin edit wallet existing.
  - Wallet Pribadi: hanya pemilik yang dapat mempertahankan, mengganti, atau menghapus label.
  - Wallet Bersama: anggota APPROVED yang boleh mengedit detail wallet dapat mempertahankan label yang ada, menghapusnya, memilih bank resmi, atau memilih entri pribadinya sendiri. Ia tidak menerima daftar pribadi anggota lain dan tidak dapat memilih entri pribadi anggota lain.
  - Scope wallet tetap immutable. Perubahan label tidak mengubah visibilitas wallet, saldo, atau riwayat transaksi.
- **Yang tidak boleh terjadi:** editor dipaksa membuka daftar pribadi orang lain; editor dapat memilih entri pribadi orang lain; editor tanpa hak mengubah wallet; perubahan label mengubah scope atau riwayat transaksi.

### AC-BI-8 (Confirmed): Arsip dan pemakaian ulang entri pribadi

- **Kondisi:** pemilik mengarsipkan entri pribadi, lalu wallet masih merujuk entri tersebut, atau pemilik menambahkan nama yang sama lagi.
- **Yang terjadi:** arsip bersifat non-destruktif, tanpa hard delete. Aksi `Arsipkan` (konfirmasi inline) dan `Pulihkan` tersedia di grup pribadi picker, dengan toggle `Aktif`/`Arsip`. Entri arsip tidak muncul sebagai pilihan aktif, tetapi label wallet yang sudah merujuk tetap dapat ditampilkan. Bila pengguna menambahkan nama yang sama lagi, entri arsip yang cocok diaktifkan kembali, bukan membuat baris aktif kedua. Restore ditolak bila nama itu sekarang sama dengan bank resmi aktif; pengguna diarahkan ke katalog resmi.
- **Yang tidak boleh terjadi:** wallet kehilangan label atau referensi karena entri diarsipkan; label menghilang dari wallet Bersama; user lain mengarsipkan entri; dua baris aktif dengan nama ternormalisasi sama; restore menghasilkan entri pribadi aktif yang menduplikasi bank resmi aktif.

### AC-BI-9 (Confirmed): Wallet merujuk paling banyak satu institusi

- **Kondisi:** wallet disimpan dengan institusi resmi, institusi pribadi, atau tanpa institusi.
- **Yang terjadi:** wallet hanya boleh merujuk satu dari dua jenis institusi. Tanpa institusi berarti manual. Tidak ada data rekening, nomor kartu, logo, saldo bank, atau status verifikasi yang disimpan pada wallet.
- **Yang tidak boleh terjadi:** wallet merujuk institusi resmi dan pribadi sekaligus; wallet menyimpan nomor rekening atau kredensial bank; label institusi memengaruhi saldo, budget, goal, atau transaksi.
- **Catatan:** bentuk kolom dan CHECK constraint adalah implementation contract A-55 dan Dev Plan, bukan keputusan produk baru.

### AC-BI-10 (Confirmed): Otorisasi server-side

- **Kondisi:** request membaca katalog, membuat/mengelola entri pribadi, atau membaca/mengubah wallet.
- **Yang terjadi:** server mengambil `userId` dari session, memvalidasi membership APPROVED, dan menerapkan filter kepemilikan pada query. Entri pribadi difilter berdasarkan `userId` session, bukan input client. Wallet tetap mengikuti aturan visibilitas A-38. ID milik user lain atau household lain menghasilkan respons generik tanpa mengonfirmasi keberadaan resource.
- **Yang tidak boleh terjadi:** filter hanya di UI; `userId` dikirim client dan dipercaya; daftar pribadi user lain dapat dibaca dengan menebak ID; wallet Pribadi anggota lain dapat diakses lewat label institusi.

### AC-BI-11 (Confirmed): Quick Add bertahan bila pembuatan wallet dibatalkan

- **Kondisi:** pengguna membuka Quick Add dari form Buat dompet, menyimpan entri, lalu membatalkan pembuatan wallet.
- **Yang terjadi:** entri tetap tersimpan di daftar pribadi dan tersedia pada pembukaan form berikutnya. Tidak ada wallet yang dibuat. Entri tidak dibatalkan, tidak dihapus otomatis, dan tidak dipindahkan kepemilikannya.
- **Yang tidak boleh terjadi:** entri ikut terhapus saat wallet dibatalkan; entri dibuat dua kali saat pengguna mencoba lagi; entri muncul di daftar user lain.

### AC-BI-12 (Confirmed, desain PM-approved 2026-10-21): State UX dan aksesibilitas

- **Kondisi:** pemilih institusi, Quick Add, state duplikat, no-match, sukses, atau error ditampilkan.
- **Yang terjadi:** tersedia state loading, empty, error, no-match, duplicate, submitting, selected, dan success. Input dipertahankan saat gagal. Kontrol dapat digunakan dengan keyboard dan pembaca layar. Label tidak bergantung pada warna saja. Layout tidak overflow pada 390px.
- **Yang tidak boleh terjadi:** kontrol terlihat aktif tetapi tidak berfungsi; state duplikat menampilkan tombol Simpan yang tampak aktif; jalur manual hilang saat pencarian tidak menemukan hasil; label bank terpotong tanpa akses ke nama lengkap.
- **Catatan:** implementasi visual mengikuti `docs/design/07-bank-institutions.md`. Mockup di `docs/design/audit-2026-10-visual-refresh/` adalah evidence-only. Tidak ada klaim bahwa UI sudah diimplementasi atau diuji.

### AC-BI-13 (Confirmed): Sumber, versi, dan provenance katalog resmi

- **Kondisi:** katalog resmi diisi atau diperbarui.
- **Yang terjadi:** katalog diisi lewat seeder statis yang versioned. Setiap baris resmi memiliki sumber, URL/file hash, dan periode sumber (`YYYY-MM`). Jika file sumber hanya menyebut bulan, sistem menyimpan bulan itu dan tidak mengarang hari. Waktu import operasional dicatat terpisah dari periode publikasi. Isi seed diverifikasi terhadap file resmi OJK terbaru saat implementasi, bukan dari daftar contoh mockup. Tidak ada sinkronisasi runtime, external, atau otomatis ke OJK. Perubahan resmi hanya masuk lewat update seed/data terkontrol. Bank yang tidak lagi ada di file resmi dinonaktifkan, bukan dihapus, agar referensi wallet tetap aman.
- **Yang tidak boleh terjadi:** daftar bank dikarang atau disalin dari enam nama mockup; katalog diperbarui otomatis tanpa persetujuan; baris yang masih dirujuk wallet dihapus; sumber, versi seed, URL/file hash, atau periode sumber hilang; hari publikasi palsu dibuat dari periode bulan.

## Perubahan Data (Level Produk)

Detail schema, constraint, dan migrasi ada di amendment arsitektur dan Dev Plan. Bagian ini hanya menetapkan data apa yang boleh ada.

### Katalog bank resmi

- Nama tampilan bank.
- Nama ternormalisasi untuk pencarian dan pencegahan duplikat.
- Sumber katalog, URL/file hash sumber, periode sumber (`YYYY-MM`), dan versi seed. Timestamp import adalah metadata operasional, bukan tanggal publikasi.
- Status aktif/nonaktif.
- Timestamp pembuatan dan pembaruan.
- Tidak ada data rekening, logo, nomor kartu, jaringan kartu, saldo, atau kredensial.
- Tidak ada field klasifikasi bank pada v1.

### Entri institusi pribadi

- Pemilik (`userId`).
- Nama tampilan yang diinput pengguna, maksimal 80 karakter.
- Nama ternormalisasi.
- Timestamp pembuatan dan pembaruan.
- Waktu arsip bila diarsipkan.
- Tidak ada field kategori/jenis bank pada Quick Add.
- Tidak ada data rekening, logo, nomor kartu, saldo, atau kredensial.

### Wallet

- Referensi opsional ke satu bank resmi atau satu entri pribadi.
- Manual berarti tidak merujuk keduanya.
- Tidak ada perubahan pada nama, tujuan, scope, saldo awal, arsip, atau aturan saldo wallet.
- Wallet existing tidak di-backfill dan tetap manual.

### DTO dan tampilan

- Wallet menampilkan label institusi (jenis dan nama) bila ada.
- ID entri pribadi hanya boleh dikirim ke pemilik entri. Untuk anggota lain pada wallet Bersama, label boleh tampil tanpa ID pribadi.
- Daftar pribadi tidak pernah digabung ke response yang dapat dibaca user lain.
- Label institusi tidak boleh dihitung client sebagai bukti akses ke wallet atau ke entri pribadi.

## Permission dan Privasi

| Aksi | Bank resmi | Entri pribadi sendiri | Entri pribadi user lain | Label pada wallet Bersama |
|---|---|---|---|---|
| Melihat/mencari daftar | APPROVED | Pemilik | Tidak pernah | Anggota APPROVED yang dapat melihat wallet |
| Menambah | Tidak ada user write; hanya seed terkontrol | Pemilik | Tidak | Tidak relevan |
| Mengubah nama | Tidak ada user write | Tidak ada rename di v1 | Tidak | Tidak relevan |
| Mengarsipkan | Tidak ada user write | Pemilik | Tidak | Tidak relevan |
| Memilih untuk wallet Pribadi | Pemilik wallet | Pemilik wallet dan pemilik entri | Tidak | Tidak relevan |
| Memilih untuk wallet Bersama | Anggota APPROVED yang boleh mengedit | Hanya entri miliknya sendiri | Tidak | Label existing boleh dipertahankan atau dihapus oleh editor yang berhak |
| Membaca daftar lewat API | APPROVED | Pemilik | Tidak | Tidak ada endpoint daftar untuk anggota lain |

Aturan tambahan:

- `userId` selalu berasal dari session server, tidak pernah dari body/query client.
- Filter kepemilikan diterapkan di query repository, bukan hanya di service atau UI.
- ID entri pribadi milik user lain menghasilkan 404 generik, bukan 403 yang mengonfirmasi keberadaan.
- Label pada wallet Bersama adalah metadata wallet, bukan izin untuk membaca daftar pribadi.
- Tidak ada endpoint yang mengembalikan seluruh entri pribadi household.
- Editor wallet Bersama tidak dapat mengenumerasi, membaca, atau memakai entri pribadi anggota lain.

## State dan Edge Case

- Katalog resmi kosong atau seed belum dijalankan: pemilih menampilkan state kosong dan jalur manual tetap tersedia.
- Pencarian tidak menemukan hasil: tampilkan no-match, aksi Quick Add, dan jalur manual.
- Nama Quick Add kosong atau hanya spasi: simpan ditolak dengan pesan yang jelas.
- Nama Quick Add melebihi 80 karakter: simpan ditolak, input dipertahankan.
- Nama Quick Add sama dengan entri pribadi aktif: arahkan ke entri yang ada atau blokir entri baru; jangan membuat baris baru.
- Nama Quick Add sama dengan bank resmi aktif: arahkan ke katalog resmi; jangan membuat entri pribadi.
- Dua request Quick Add bersamaan dengan nama sama: satu berhasil, yang lain mendapat duplikat dan diarahkan ke entri yang sudah ada; tidak ada dua baris aktif.
- Nama resmi sangat panjang: label wallet tetap dapat dibaca; nama lengkap tersedia di detail; nilai uang tidak terpengaruh.
- Nama resmi berbeda dari nama umum (misalnya nama legal vs singkatan): seed memakai nama resmi apa adanya; jangan mengarang alias dari mockup. Bila pengguna tidak menemukan singkatan yang biasa dipakai, keputusan alias/search synonym adalah data-quality decision terpisah, bukan alasan membuat daftar palsu.
- Entri pribadi diarsipkan saat masih dirujuk wallet: wallet tetap menampilkan label; entri tidak muncul di picker aktif tetapi tampil di toggle Arsip.
- Entri pribadi pemilik lama sudah diarsipkan, lalu pemilik menambah nama yang sama: entri arsip diaktifkan kembali, bukan membuat baris aktif kedua.
- Entri pribadi arsip dipulihkan padahal katalog resmi kini memiliki nama aktif yang sama: restore ditolak dengan konflik yang menawarkan baris resmi; baris pribadi tetap arsip.
- Anggota yang membuat entri pribadi keluar dari household: wallet Bersama yang sudah merujuk entri tetap menampilkan label; daftar pribadi tetap tidak dapat diakses anggota lain.
- Anggota lain mengedit wallet Bersama: label existing dapat dipertahankan atau dihapus; ia tidak dapat memilih entri pribadi orang lain.
- Wallet Bersama diarsipkan: label tetap tersimpan dan tetap terlihat di Arsip bagi yang berhak.
- Wallet Pribadi diarsipkan: label tetap privat dan hanya terlihat pemiliknya.
- Pengguna membatalkan pembuatan wallet setelah Quick Add: entri tetap ada di daftar pribadi; tidak ada wallet yatim.
- Request memakai ID bank resmi yang nonaktif: ditolak dengan pesan bahwa pilihan tidak tersedia; pengguna memilih bank lain atau manual.
- Request memakai ID entri pribadi milik user lain: 404 generik tanpa detail.
- Request mengirim dua referensi institusi sekaligus: ditolak sebagai validation error; tidak ada wallet dengan dua label.
- Wallet lama tanpa institusi dibuka di form: field institusi kosong, wallet tetap dapat disimpan tanpa memilih bank.
- Seed katalog mengubah nama resmi: label wallet yang merujuk bank tersebut mengikuti nama row katalog lokal terbaru; tidak ada external sync.
- Seed katalog menonaktifkan bank yang masih dirujuk wallet: referensi tetap valid dan label tetap dapat ditampilkan; bank tidak muncul untuk pemilihan baru.
- Katalog resmi dan daftar pribadi sama-sama gagal dimuat: tampilkan error yang dapat dicoba lagi; jangan menampilkan daftar palsu.

## Constraint Bisnis

- Institusi adalah atribut wallet, bukan akun bank dan bukan bukti kepemilikan rekening.
- Tidak ada sinkronisasi bank, pembacaan saldo, verifikasi rekening, atau impor transaksi bank.
- Katalog resmi bersifat global, read-only bagi user, dan diisi lewat seeder statis versioned dengan update data terkontrol.
- Tidak ada runtime, external, atau automatic synchronization ke OJK.
- Entri pribadi bersifat per user, tidak pernah menjadi data household atau katalog bersama.
- Wallet hanya boleh merujuk paling banyak satu institusi. Manual berarti tidak ada referensi.
- Wallet existing tidak di-backfill dan tidak boleh berubah perilakunya karena fitur ini.
- Label institusi tidak memengaruhi saldo, budget, goal, transfer, OCR, dashboard, atau advisor.
- Arsip entri pribadi bersifat non-destruktif dan tidak boleh memutus label wallet yang sudah ada.
- Semua nilai uang tetap memakai aturan existing: integer minor unit IDR, skala 0. Batas `INT32_MAX` (2.147.483.647) untuk satu transaksi, saldo awal, budget, dan goal tidak berubah. Fitur ini tidak menambah perhitungan atau field uang baru.
- Tidak ada data sensitif bank yang boleh disimpan: nomor rekening, nomor kartu, CVV, expiry, kredensial, atau token bank.
- Custom name tidak dapat di-rename pada v1.

## Dependencies

- PRD: fitur ini adalah **extension ke F6 (Dompet)** di `docs/PRD.md`, disetujui PM 2026-10-21. Tidak ada fitur PRD baru.
- `docs/spec/feat-wallets.md` (Spec Ready) dan `docs/dev-plan/feat-wallets.md` (Approved): bentuk wallet, DTO, permission, dan aturan arsip yang harus dipertahankan.
- `lib/server/contracts/wallets.ts`, `types/api.ts`, `prisma/schema.prisma`: kontrak dan schema existing yang menjadi titik tambah.
- Amendment arsitektur A-52 sampai A-59 di `docs/architecture-decisions.md` (Accepted by PM 2026-10-21).
- `docs/design/07-bank-institutions.md` (PM-approved 2026-10-21) sebagai desain UX kanonik.
- File resmi OJK terbaru yang diverifikasi saat implementasi. Mockup hanya memuat enam nama representatif.
- Dev Plan `docs/dev-plan/feat-bank-institutions.md` yang masih menunggu approval PM.
- QA memiliki test plan dan matriks verifikasi. Dokumen ini hanya menetapkan AC.

## Out of Scope

- Sinkronisasi otomatis dengan OJK atau API bank.
- Sinkronisasi runtime atau external, cron, job refresh, dan tombol sync.
- Admin UI untuk mengelola katalog resmi.
- Katalog bersama untuk entri Quick Add atau moderasi katalog komunitas.
- Nomor rekening, nomor kartu, logo bank, jaringan kartu, warna brand bank, atau aset visual bank.
- Verifikasi rekening, kepemilikan rekening, saldo bank, mutasi, atau tarik data bank.
- Lebih dari satu institusi per wallet.
- Klasifikasi jenis bank pada Quick Add (umum, syariah, e-wallet, dan sebagainya).
- Mengubah nama wallet otomatis dari nama bank.
- Perubahan pada saldo, budget, goal, transfer, OCR, dashboard, advisor, atau laporan.
- Backfill institusi untuk wallet existing.
- Rename entri pribadi setelah dibuat.
- Dark mode, route baru, atau item navigasi baru.
- Perubahan strategi presisi agregat uang. Itu adalah proposal arsitektur terpisah dan bukan bagian T-011.

## Referensi Desain dan Sumber Resmi

### Desain

- `docs/design/07-bank-institutions.md` (kanonik, PM-approved 2026-10-21).
- `docs/design/06-wallets.md` (aturan kartu wallet; tidak diubah oleh fitur ini).
- `docs/design/audit-2026-10-visual-refresh/README.md` §7l.1, §7m, R-15, R-16, dan `mockup-catalog-money-flows.html` bagian D/D2 sebagai evidence-only.
- PNG referensi di folder audit: `wallet-create-bank-picker.png`, `wallet-bank-quick-add-sheet.png`, `wallet-bank-quick-add-duplicate.png`, `wallet-bank-no-match.png`, `wallet-bank-private-selected.png`, `wallet-shared-detail-custom-label.png`.

Mockup bersifat statis. Semua kontrol, angka, dan nama di mockup adalah contoh. Tidak ada klaim bahwa UI sudah berfungsi, sudah diuji, atau sudah disetujui. Developer tidak boleh menyalin contoh statis menjadi data katalog.

### Sumber resmi

- OJK, "Daftar Alamat Kantor Pusat Bank Umum dan Syariah":
  https://ojk.go.id/id/kanal/perbankan/data-dan-statistik/Pages/Daftar-Alamat-Kantor-Pusat-Bank-Umum-Dan-Syariah.aspx
- Cakupan seed: Bank Umum dan Bank Umum Syariah.
- Enam nama di mockup (BCA, BRI, Bank Mandiri, BNI, BSI, BTN) hanya representatif dan **bukan daftar lengkap**.
- Implementasi wajib mengunduh dan memverifikasi file resmi terbaru saat itu, lalu mencatat sumber, URL/file hash, periode sumber (`YYYY-MM`), dan versi seed. Jangan menyalin daftar mockup, jangan mengarang daftar bank, dan jangan mengarang hari publikasi.
- Parsing dan validasi workbook adalah tugas developer saat implementasi, bukan keputusan produk yang tertunda.

## Definition of Ready

**Status: Spec gate terpenuhi. T-011 Implementation in Progress setelah approval PM 2026-10-21.**

Gate yang sudah terpenuhi:

- [x] Spec ini disetujui PM (2026-10-21).
- [x] Amendment arsitektur A-52 sampai A-59 accepted by PM (2026-10-21).
- [x] Desain UX kanonik `docs/design/07-bank-institutions.md` PM-approved (2026-10-21).
- [x] Penempatan PRD ditetapkan sebagai extension F6 dan dicatat di `docs/PRD.md`.
- [x] Keputusan Q1 sampai Q9 dijawab dan dicatat pada 2026-10-21.
- [x] Ticket internal ditetapkan: T-011 (tanpa key Jira).
- [x] Arah schema tingkat tinggi disetujui: dua tabel terpisah, referensi XOR pada wallet, tanpa classification field.

Gate implementasi yang sedang berjalan:

- [x] Dev Plan `docs/dev-plan/feat-bank-institutions.md` disetujui PM (2026-10-21).
- [ ] Developer memperbarui ERD/flowchart sesuai implementasi DDL yang telah disetujui.
- [ ] QA menyusun test plan dan matriks verifikasi sebelum QA execution (QA-owned).

Catatan: verifikasi isi seed, parsing workbook, dan validasi data OJK adalah **implementation work**, bukan keputusan produk yang tertunda. Developer mencatat hasil verifikasi di Dev Plan saat implementasi.

### Keputusan PM Q1 sampai Q9

| ID | Pertanyaan | Keputusan PM 2026-10-21 | Status |
|---|---|---|---|
| Q1 | Apa cakupan katalog resmi, siapa pemilik seed, dan kapan diperbarui? | Cakupan hanya Bank Umum dan Bank Umum Syariah dari direktori OJK. Katalog diisi seeder statis dan versioned dari daftar resmi yang diverifikasi saat implementasi. Tidak ada runtime, external, atau automatic synchronization. Perubahan hanya lewat update seed/data terkontrol. Pemilik seed adalah developer/ops. | Resolved 2026-10-21 |
| Q2 | Bagaimana perilaku duplikat nama? | Trim, collapse whitespace, case-insensitive. Duplikat nama resmi mengarahkan user ke baris resmi. Duplikat entri pribadi aktif memakai entri existing atau memblokir entri baru. Daftar pribadi tetap per user. | Resolved 2026-10-21 |
| Q3 | Apa yang terjadi setelah entri pribadi diarsipkan lalu ditambahkan lagi? | Soft archive, tanpa hard delete. Wallet lama yang merujuk entri arsip tetap menampilkan label. Re-add nama ternormalisasi sama mengaktifkan kembali entri arsip, bukan membuat baris aktif kedua. | Resolved 2026-10-21 |
| Q4 | Apakah Quick Add tetap tersimpan bila pembuatan wallet dibatalkan? | Ya. Entri disimpan segera di daftar pribadi dan tidak dibatalkan bersama wallet. Tidak ada wallet yang dibuat. | Resolved 2026-10-21 |
| Q5 | Siapa yang boleh mengubah institusi pada wallet Bersama? | Anggota APPROVED yang sudah boleh mengedit detail wallet Bersama dapat mempertahankan atau menghapus label, memilih bank resmi, atau memilih entri pribadinya sendiri. Tidak boleh mengenumerasi atau memakai daftar pribadi anggota lain. Label wallet Bersama terlihat oleh reader yang berhak. | Resolved 2026-10-21 |
| Q6 | Apakah label wallet mengikuti data referensi atau disimpan sebagai snapshot? | Wallet merujuk row katalog lokal atau row custom lokal dan menampilkan label row tersebut. Tidak ada external live sync. Nama resmi berubah hanya lewat update seed/data terkontrol. Nama custom tidak dapat di-rename pada v1. | Resolved 2026-10-21 |
| Q7 | Apakah entri pribadi dapat di-rename atau dihapus permanen? | Tidak ada rename dan tidak ada hard delete pada v1. Hanya create, list, archive, dan restore. | Resolved 2026-10-21 |
| Q8 | Apakah entri pribadi dengan nama sama dengan bank resmi boleh dibuat? | Tidak. User diarahkan ke baris katalog resmi. | Resolved 2026-10-21 |
| Q9 | Apakah bentuk schema/API dua tabel + referensi XOR pada wallet disetujui? | Ya pada tingkat tinggi: `BankInstitution` global read-only, `UserCustomInstitution` per user, dan Wallet merujuk paling banyak satu dengan referensi yang saling eksklusif. Manual berarti tidak merujuk keduanya. Tanpa classification field. Nama kolom, constraint, endpoint, dan DTO adalah implementation contract di Dev Plan/amendment. | Resolved 2026-10-21 (high level) |

## PM Review & Approval

- **Status:** `Spec Ready / PM-approved 2026-10-21`.
- **PM review:** disetujui 2026-10-21 berdasarkan keputusan Q1 sampai Q9 dan arah schema tingkat tinggi.
- **Design:** `docs/design/07-bank-institutions.md` PM-approved 2026-10-21.
- **Architecture:** amendment A-52 sampai A-59 accepted by PM 2026-10-21. Detail teknis yang tidak diputuskan PM tetap implementation contract.
- **Dev Plan:** `docs/dev-plan/feat-bank-institutions.md` Approved by PM 2026-10-21.
- **Ticket:** T-011 berstatus `in_progress` di `tickets/TASK-PLAN.md`.
- **Implementasi:** handoff ke Developer dibuka; belum ada klaim kode, schema, migrasi, API, seed, fixture, atau test selesai. QA dan release approval belum diberikan.

## Developer Handoff

- Dokumen kanonik yang mengikat adalah Spec ini, `docs/design/07-bank-institutions.md`, `docs/architecture-decisions.md` A-52 sampai A-59, `docs/PRD.md` F6, dan Dev Plan setelah disetujui.
- Folder `docs/design/audit-2026-10-visual-refresh/` berisi contoh statis evidence-only. Jangan menyalin nama bank, angka, atau state dari folder itu sebagai data nyata, seed, fixture, atau copy produksi.
- Isi seed awal wajib diverifikasi dari file OJK terbaru saat implementasi. Enam nama di mockup bukan katalog.
- Jangan menambahkan sinkronisasi OJK, admin UI katalog, logo bank, nomor rekening/kartu, atau klaim integrasi bank.
- Jangan mengubah `docs/spec/feat-wallets.md`, `docs/dev-plan/feat-wallets.md`, atau kontrak wallet T-009 selain penambahan field institusi yang disetujui.
