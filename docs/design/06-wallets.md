# Wallet Design: Dompet Pribadi & Dompet Bersama

## 0. Status & batas dokumen

Dokumen ini adalah **artefak desain (design-only)** dengan status **PM UX sign-off (2026-10-08)**. Tidak ada kode yang diubah. **Spec `docs/spec/feat-wallets.md` sudah disetujui PM (Spec Ready, 2026-10-08)**; namun sign-off ini bukan berarti implementasi siap: fitur wallet menjadi riil hanya setelah (1) PM mengamandemen `docs/architecture-decisions.md` (amendment teknis: kontrak wallet baru + perubahan kontrak dashboard/budget) dan (2) Developer Dev Plan disetujui. Sign-off PM di sini adalah persetujuan arah desain UX, dan Spec sudah resmi disetujui, tetapi keduanya **bukan** klaim bahwa kode ada atau implementasi siap dan **bukan** izin mulai implementasi; detail lihat §0.1. Desain ini tidak mengubah keputusan bisnis apa pun tanpa penanda eksplisit; poin tanpa penanda adalah **rekomendasi, bukan scope yang sudah dikonfirmasi**.

> **Update visual 2026-10-20 (PM-approved for T-010):** sesuai arah user, kartu dompet memakai **metafora kartu ATM/debit generik** (§4) dan warna mengikuti token biru-putih-hijau (§5.1). **Seluruh keputusan bisnis C-1..C-32 tetap utuh dan tidak dibuka kembali.** ATM di sini adalah identitas visual dompet aplikasi ini (kartu lanskap + chip abstrak + glyph contactless), bukan identitas bank nyata: tanpa nomor kartu, tanggal kedaluwarsa, CVV, nama pemegang, logo bank/jaringan, atau klaim keamanan. Ini adalah penyelarasan visual dengan C-14/C-15, bukan keputusan bisnis baru. Fitur bank/penyedia di form Buat dompet dimiliki desain terpisah **07-bank-institutions.md** (T-011); data model teknis masih menunggu review PM/Dev. C-1..C-32 tetap PM-approved dan tidak berubah.

Prinsip yang dipakai:

- Melanjutkan tokens, pola, dan vocabulary kanonik dari [01-design-system-tokens.md](01-design-system-tokens.md) (biru-putih-hijau, 2026-10-20), [02-bento-dashboard-wireframes.md](02-bento-dashboard-wireframes.md) (urutan Beranda R-9), dan [03-transaction-and-ocr-flow.md](03-transaction-and-ocr-flow.md).
- Nav tetap 5 item (`Beranda`, `Budget`, `Tambah`, `Aktivitas`, `Keluarga`); **tidak ada item navigasi Wallet baru** (confirmed).
- Scope dompet ditampilkan lewat pill label bertoken plus ikon (no-sole-color, doc 01 §6), dan tidak ada "dompet pribadi = hitam" (confirmed). Warna identitas kartu kini memakai keluarga biru token (navy `#14273F` Bersama, biru `#1D4F87` Pribadi); bidang kuning/merah dipakai HANYA sebagai status semantik, bukan identitas dompet (doc 01 §2.3).
- Kartu dompet mengikuti arah user: **metafora kartu ATM/debit generik** ringkas, mudah dibaca, mudah dikelola/tambah, tanpa meniru identitas visual satu bank tertentu dan tanpa artefak kartu nyata (§4).

### 0.1. Catatan sign-off PM (2026-10-08)

- **Tanggal & keputusan:** PM menyetujui arah UX MVP wallet pada 2026-10-08 sebagaimana terdokumentasi di dokumen ini.
- **Scope yang disetujui:** keputusan confirmed **C-1..C-27** sesuai §1.1, termasuk vocabulary "Dompet" / "Pribadi" / "Bersama" (C-23), manajemen detail dompet via sheet dari Beranda/picker tanpa route/nav baru (C-24), tanpa batas jumlah dompet di UI (C-25), repeat-memory ditunda (C-26), dan helper copy arsip diterima (C-27).
- **Sisa rekomendasi yang diterima PM sebagai detail UX** (bukan keputusan bisnis, tidak dipromosikan jadi nomor C): **R-3** (label aliran field `Dari dompet` / `Ke dompet`, §7), **R-5** (Trash menampilkan transfer sebagai satu baris, §9), dan **R-7** (dompet terarsip keluar dari picker/carousel aktif, riwayat tetap tampil, §6.3). Sisanya: **R-10** (ringkasan arsip di tab Arsip) tetap follow-up opsional; **unsaved-changes guard** dan temuan audit lainnya tetap rekomendasi terpisah dan **bukan scope Spec**.
- **Status Spec:** Spec `docs/spec/feat-wallets.md` **sudah disetujui PM (Spec Ready, 2026-10-08)**; perilaku desain inti terwakili di Spec tersebut. Ini bukan klaim implementasi siap dan bukan tanda kode sudah dimulai.
- **Keputusan lanjutan PM (2026-10-09):** setelah sign-off di atas, PM mengonfirmasi dua keputusan tambahan: **C-28** (visibilitas struk terhadap anggota household approved, disclosure sebelum simpan ke dompet Bersama via OCR) dan **C-29** (job OCR dan draft extracted tetap uploader-only sebelum dan sesudah simpan, bahkan ketika gambar struk share-visible melalui transaksi bersama). Sign-off 2026-10-08 (C-1..C-27) tetap berlaku utuh dan tidak dibuka kembali; C-28 dan C-29 dicatat sebagai keputusan PM-confirmed terpisah di §1.1, §10, §12, dan §18.
- **Keputusan lanjutan PM (2026-10-09, melengkapi C-28):** PM mengonfirmasi **C-30**, implikasi desain dari visibilitas struk yang sudah diputuskan di C-28: pengguna yang **berhak** melihat struk harus benar-benar dapat membuka gambar struk itu dari detail transaksi, lewat aksi eksplisit **`Lihat struk`** dengan penampil gambar yang aman (lihat §10.1). C-30 hanya **mengimplementasikan** visibilitas yang sudah dikonfirmasi dan **tidak membuka kembali** scope sign-off 2026-10-08 maupun ketentuan C-19, C-28, dan C-29; disclosure review OCR varian 1/varian 2 (§10) dan status uploader-only job/draft (C-29) **tidak berubah**.
- **Keputusan lanjutan PM (2026-10-09, berikutnya):** PM mengonfirmasi **C-31**, scope dompet **Pribadi/Bersama bersifat immutable (tidak dapat diubah) setelah dompet dibuat**: scope hanya dipilih saat pembuatan dan tidak muncul sebagai field yang dapat diedit di form Ubah dompet. Bila user membutuhkan scope berbeda, jalurnya adalah **membuat dompet baru dengan scope yang diinginkan lalu memindahkan dana lewat Transfer** lintas scope (C-8), sehingga riwayat transaksi dompet lama tetap tampil dan visibilitas historisnya terjaga; tidak ada aksi konversi/migrasi scope di UI. Sign-off 2026-10-08 (C-1..C-27) dan keputusan C-28, C-29, C-30 tetap berlaku utuh dan tidak dibuka kembali; C-31 dicatat sebagai keputusan PM-confirmed terpisah di §1.1, §6.1, §6.2, §12, §17.1, dan §18.
- **Koreksi defect implementasi (2026-10-09, keputusan C-32):** defect yang ditemukan pada implementasi. Aksi **`Buat dompet baru`** di dalam `WalletPickerSheet` membuka sheet `Buat dompet` **tanpa menutup picker lebih dulu**, sehingga picker (layer z-80) tetap bertumpuk di atas `WalletFormSheet` (z-70) dan **form create tidak dapat dipakai** (ketutup overlay picker). PM memutuskan urutan yang benar: (1) tap `Buat dompet baru` **menutup picker dulu**, (2) sheet Buat dompet terbuka sebagai **satu-satunya sheet dompet di layar**, (3) setelah create berhasil dompet baru **langsung terpilih otomatis** ke field/picker yang sedang user isi dan picker **tidak dibuka kembali**, (4) bila user membatalkan form buat, nilai field **kembali seperti semula** dan picker **tidak dibuka kembali**, (5) fokus **kembali ke tombol pemicu yang membuka picker**. C-32 hanya memperbaiki **urutan state sheet** yang memang sudah dimaksud §7.1/§6.1: tidak ada copy, field, atau permukaan baru (repeat-memory tetap ditunda C-26, disclosure C-28/C-29 dan status job/draft uploader-only tidak berubah, C-30 dan C-31 tidak berubah). Sign-off 2026-10-08 dan keputusan C-1..C-31 tetap berlaku utuh dan tidak dibuka kembali; C-32 dicatat sebagai keputusan PM-confirmed terpisah di §1.1, §6.1, §7.1, §10, §12, §14, dan §18.
- **Gate menuju implementasi** (sisa, belum terpenuhi): (1) amendment teknis `architecture-decisions.md` oleh PM (kontrak wallet + kontrak dashboard/budget) dan (2) persetujuan Developer Dev Plan. Sign-off ini tidak mengklaim implementasi siap.
- **Catatan rekonsiliasi dokumentasi (2026-10-09, bukan keputusan C baru):** QA (T-009 F6) melaporkan ambiguitas internal: §4.1, §4.2, dan §14 mendeskripsikan kontrol kartu `⋯ Kelola` sebagai menu popup (`aria-haspopup="menu"`, `aria-expanded`, menu kecil `Ubah`/`Arsipkan`), sementara C-24 dan implementasi membuka sheet `Kelola dompet` (tab `Aktif`/`Arsip`) / sheet detail. PM meruling: `Kelola` membuka sheet manage/detail (tanpa menu popup), dan `Ubah`/`Arsipkan` adalah aksi **di dalam** sheet tersebut, digated permission (C-4/C-22). Wording §3.1, §4.1, §4.2, §6.3, §12, §14, dan §18 diselaraskan agar cocok dengan implementasi berbasis sheet. **Ini bukan keputusan bisnis baru**: tidak ada ID C baru, tidak ada perubahan perilaku, dan C-1..C-32 tetap utuh.
- **Catatan rekonsiliasi dokumentasi (2026-10-09, berikutnya; bukan keputusan C baru):** QA (T-009 F6) melaporkan konflik angka touch target: §13 baris "Umum" menuliskan "touch target ≥48px saat mobile", sementara baseline yang benar-benar di-enforce di codebase adalah **44px** (`Button` memakai `min-h-11` dan menyatakan konvensi "at least 44px (R-03)"; badge ikon doc 01 §5.5 memang `44px x 44px`). PM meruling: **minimum yang di-enforce adalah 44px untuk semua kontrol interaktif**, sementara **CTA primer di mobile menargetkan 48px bila feasible** (itu target, bukan floor). Wording §13 (baris "Umum") dan §10.1 (tombol tutup viewer struk) diselaraskan ke aturan itu. **Ini bukan keputusan bisnis baru**: tidak ada ID C baru, tidak ada perubahan perilaku, dan perbaikan **BUG-5 tetap valid** karena sudah dikerjakan di lantai 44px yang sama; C-1..C-32 tetap utuh.

---

## 1. Scope confirmed vs rekomendasi

### 1.1. Confirmed

| # | Keputusan |
| :--- | :--- |
| C-1 | Wallet adalah **rekening/dompet aktual** (tempat uang berada), bukan kategori akuntansi. |
| C-2 | Dua scope: **Pribadi** (hanya pemilik yang bisa lihat/gunakan) dan **Sharing** (semua anggota household approved bisa lihat/gunakan). |
| C-3 | Setiap anggota approved boleh membuat wallet Pribadi maupun Sharing. |
| C-4 | Permission dompet: semua anggota approved boleh **mengubah detail** (nama/tujuan) wallet Sharing, tetapi **mengarsipkan hanya oleh pembuat wallet atau Owner**. Wallet Pribadi hanya bisa diubah dan diarsipkan oleh pemiliknya. Tidak ada hard-delete untuk data yang punya transaksi. |
| C-5 | Saldo awal opsional; dikosongkan = Rp0. |
| C-6 | Wallet punya **tujuan penggunaan yang ditetapkan pengguna** (termasuk Tabungan); ini bukan tipe rekening. |
| C-7 | Money in/out memilih wallet. |
| C-8 | Transfer bisa lintas wallet/lintas scope, dua arah (Pribadi ↔ Bersama maupun sebaliknya). |
| C-9 | Hapus/pulihkan transfer memproses dua kaki bersama. |
| C-10 | Aktivitas wallet Sharing menampilkan transfer lintas scope secara umum: tanpa nama wallet pribadi, tanpa catatan, dan tanpa riwayat personal. |
| C-11 | Dashboard menampilkan **dua ringkasan terpisah**: saldo wallet Sharing dan total wallet Pribadi milik user, plus **kartu per-wallet di carousel geser horizontal** dengan penanda scope. Geser di sini berarti **carousel untuk browse** (melihat kartu berikutnya), **bukan reorder urutan kartu** (lihat §5.2). |
| C-12 | Budget dan pengeluaran household hanya menghitung wallet Sharing. |
| C-13 | Nav 5 item tetap; tanpa item Wallet baru. |
| C-14 | Arah visual kartu: kartu akun ala aplikasi perbankan, mudah dikelola/tambah. |
| C-15 | Gunakan tokens/pola existing; tanpa warna baru; tidak meniru satu bank tertentu. |
| C-16 | Default scope saat membuat dompet = **Pribadi**; user tetap bisa memilih **Bersama**. (Promosi dari R-8; menutup Q-3, 2026-10-08.) |
| C-17 | Semua transaksi **pre-wallet** dimigrasikan ke **satu wallet default Sharing per household** yang dibuat otomatis, dengan **saldo awal Rp0** sehingga saldo historis tidak dihitung ganda (saldo wallet dihitung dari transaksinya). Nama default diusulkan **"Dompet Keluarga"** — usulan, bukan keputusan nama final. (Menutup Q-4, 2026-10-08.) |
| C-18 | Saldo dompet terarsip **tetap dihitung** dalam ringkasan total (§5.1). Carousel hanya menampilkan dompet aktif, jadi selisih antara total dan penjumlahan kartu yang terlihat adalah perilaku yang benar. (Menutup Q-10, 2026-10-08.) |
| C-19 | Respons duplikat OCR receipt: bila struk yang diunggah sudah pernah diproses **oleh anggota household lain**, UI hanya menerima **respons generik** bahwa struk duplikat; detail tentang job/draft/uploader/receipt yang sudah ada **tidak pernah diekspos** ke uploder lain. **Retry oleh uploder yang sama boleh memakai ulang job-nya sendiri.** Lihat §10. (Keputusan PM, 2026-10-08.) |
| C-20 | Trash/restore **pasangan transfer lintas scope** hanya dapat dilakukan oleh **pembuat transfer atau Owner**, diproses **atomik** pada kedua kaki. Anggota yang hanya melihat kaki dompet Sharing (mis. tanpa akses ke kaki dompet Pribadi) **tidak boleh memodifikasi pasangan** (tidak ada aksi mutate pada salah satu kaki saja). Lihat §9. (Keputusan PM, 2026-10-08.) |
| C-21 | Saldo awal dapat **dikoreksi selama wallet belum memiliki transaksi pertama**. Kunci aktif sejak **baris transaksi pertama wallet itu ada**: termasuk transaksi yang sudah masuk **Trash** (soft-delete) dan **leg transfer** yang menunjuk ke wallet; Trash/arsip tidak membuka kembali koreksi. Setelah itu saldo awal **tidak lagi dapat diedit langsung** (lihat §6.1 dan §6.2). (Keputusan PM, 2026-10-08; makna "transaksi pertama" diperjelas selaras §6.2.) |
| C-22 | Memulihkan dompet terarsip dari Arsip: dompet **Bersama** hanya oleh **pembuat dompet atau Owner**; dompet **Pribadi** hanya oleh **pemiliknya**. Hak ubah detail tidak berubah (C-4); hak arsip tidak berubah; keputusan ini hanya soal restore. Lihat §6.3. (Keputusan PM, 2026-10-08.) |
| C-23 | Vocabulary kanonik UI dikunci: konsep wallet = **"Dompet"**; scope teknis (`PERSONAL|SHARING`) dirender **"Pribadi"** / **"Bersama"** di UI (A-30). Label teknis "Sharing" tidak pernah muncul di UI. (Promosi dari R-1; menutup Q-1, 2026-10-08.) |
| C-24 | Detail dan manajemen dompet hanya melalui **sheet dari kartu dompet Beranda / picker / sheet `Kelola dompet`**, tanpa route atau page baru (A-31 tidak diamandemen) dan tanpa item nav baru (C-13). Bila kelak dibutuhkan deep-link (`/home?wallet={id}`), itu amendment A-31 terpisah, bukan scope MVP. (Promosi dari R-2; menutup Q-2, 2026-10-08.) |
| C-25 | **Tidak ada batas jumlah dompet** yang diterapkan atau ditampilkan di UI MVP sampai ada bukti atau keputusan teknis tentang angka batas. Copy error "melebihi batas" baru dibutuhkan bila batas ditetapkan; penetapan batas tetap domain PM/Developer di amendment teknis, bukan desain UI. (Menutup Q-7, 2026-10-08.) |
| C-26 | **Repeat-memory (wallet & kategori) di luar confirmed scope MVP**: tidak diimplementasikan di MVP dan ditunda sebagai follow-up terpisah (bukan open blocker). Akibatnya: tidak ada default "terakhir dipakai" di picker (R-4 dihapus), tidak ada chip saran di form/OCR, dan tidak ada keputusan penyimpanan lokal vs server. (Menutup Q-8, 2026-10-08.) |
| C-27 | Helper copy C-18 diterima: teks kecil **"Termasuk dompet di Arsip"** dengan tautan ke tab Arsip di bawah masing-masing ringkasan §5.1, karena total menyertakan dompet yang tidak tampak di carousel aktif. Usulan lanjutan "ringkasan arsip di tab Arsip" belum diputuskan (R-10). (Promosi dari R-9; keputusan PM, 2026-10-08.) |
| C-28 | **Visibilitas struk terhadap anggota household approved:** struk yang menempel pada transaksi di dompet **Bersama** boleh terlihat oleh anggota household yang approved; record transaksi Pribadi sendiri **tetap privat**. Visibilitas struk mengikuti **gabungan (union) transaksi yang ditautkan ke struk itu**: struk hanya tertaut ke transaksi Pribadi → terlihat oleh pemiliknya saja; sekali tertaut ke transaksi Bersama mana pun → terlihat oleh anggota approved household, **termasuk bila struk itu kemudian dipakai ulang untuk transaksi Pribadi**. Satu struk boleh tetap menempel ke **beberapa transaksi** sesuai spec F3 existing. Saat menyimpan ke Bersama lewat OCR, review screen menampilkan **disclosure berbahasa awam** sebelum user mengonfirmasi simpan; bila struk sudah tertaut ke transaksi Bersama dan dipakai ulang untuk transaksi Pribadi, status berbagi yang sudah ada juga dijelaskan ke uploader. Lihat §10. (Keputusan PM, 2026-10-09.) |
| C-29 | **Job OCR dan draft hasil ekstraksi tetap uploader-only sebelum DAN sesudah simpan**, bahkan ketika **gambar struk** ikut share-visible melalui transaksi dompet Bersama (C-28). Visibilitas union (C-28) hanya berlaku pada **image/file struk**; job OCR dan draft extracted-nya tidak pernah ikut dibagikan kepada anggota household lain, termasuk bila struk itu dipakai atau tertaut pada transaksi Bersama. User yang memilih dompet **Bersama** tetap menerima **disclosure sebelum konfirmasi** bahwa anggota household bisa melihat **gambar struk** (bukan draft/job). Draft upload dan job upload milik uploader tetap tidak terlihat oleh anggota lain — **bukan** bagian share-visible, dan C-19 (respons duplikat generik, tanpa detail job/draft/uploader milik anggota lain) tidak berubah. Lihat §10. (Keputusan PM, 2026-10-09.) |
| C-30 | **Aksi `Lihat struk` pada detail transaksi (implikasi desain C-28):** pengguna yang berhak dapat membuka gambar struk dari sheet detail transaksi lewat aksi eksplisit **`Lihat struk`** (menggantikan status quo teks statis "Terlampir pada catatan scan" tanpa aksi), membuka **penampil gambar aman** dengan state loading/error/not-found/unauthorized dan perilaku dialog existing. Aksi hanya dirender dari **flag visibilitas yang diputuskan server**; client tidak pernah menghitung visibilitas sendiri. Byte gambar hanya disajikan lewat **jalur server terautentikasi**, **tanpa URL Blob publik**. Visibilitas mengikuti union C-28 (SHARING-linked → anggota approved; hanya Pribadi → pemilik; **tautan yang sedang di Trash tetap dihitung dalam union**); **visibilitas gambar tidak membuka baris transaksi Pribadi** dan **tidak menyertakan job/draft OCR** (C-29); disclosure review OCR dan status uploader-only job/draft **tetap**. Lihat §10.1. (Keputusan PM, 2026-10-09.) |
| C-31 | **Scope dompet tidak dapat diubah setelah dibuat (immutable):** dompet **Pribadi** tetap Pribadi dan dompet **Bersama** tetap Bersama sepanjang umurnya; scope dipilih **hanya saat pembuatan** (C-16) dan tidak ditawarkan sebagai field yang dapat diedit pada form Ubah dompet (§6.2) maupun aksi konversi/migrasi scope di mana pun di UI. Bila user membutuhkan dompet dengan scope berbeda, jalur UI-nya adalah **buat dompet baru dengan scope yang diinginkan lalu pindahkan dana via Transfer** lintas scope dua arah yang selalu tersedia (C-8); riwayat transaksi dompet lama **tetap tampil** (soft-delete philosophy, R-7) sehingga visibilitas historis terjaga. Lihat §6.1, §6.2. (Keputusan PM, 2026-10-09.) |
| C-32 | **Perbaikan defect layar `Buat dompet baru` dari dalam picker (keputusan PM, 2026-10-09):** aksi **`+ Buat dompet baru`** di `WalletPickerSheet` harus **menutup picker lebih dulu**, baru membuka sheet **Buat dompet** sebagai **satu-satunya sheet dompet di layar** (bukan dua sheet bertumpuk; defect implementasi saat ini membuat picker z-80 menutupi form z-70 sehingga form tidak dapat dipakai). Setelah dompet **berhasil dibuat**, dompet baru **langsung terpilih otomatis** di field/picker yang sedang user isi dan picker **tidak dibuka kembali**; bila user **membatalkan** form buat, nilai field **kembali seperti semula** dan picker **tidak dibuka kembali**; setelah sheet buat ditutup (berhasil maupun batal), **fokus kembali ke tombol pemicu yang membuka picker**. Lihat §7.1. (Koreksi urutan state sheet saja: tidak ada copy/field baru, C-26/C-28/C-29/C-30/C-31 tidak berubah.) |

### 1.2. Rekomendasi & terimanya PM

| # | Rekomendasi | Status |
| :--- | :--- | :--- |
| R-3 | Field dompet mengikuti arah aliran: `Dari dompet` (uang keluar/transfer) dan `Ke dompet` (uang masuk/transfer), picker berupa bottom-sheet bergrup. | **Diterima PM sebagai detail UX (2026-10-08)**: label aliran `Dari dompet` / `Ke dompet` dipakai di §7. |
| R-5 | Di Trash, dua kaki transfer tampil sebagai **satu baris Transfer** dan `Pulihkan` memulihkan keduanya sekaligus. | **Diterima PM sebagai detail UX (2026-10-08)**: perilaku satu baris Trash di §9. |
| R-7 | Dompet terarsip hilang dari picker dan dari carousel aktif; riwayat transaksinya tetap tampil di aktivitas (soft-delete philosophy, tanpa hard-delete). Saldo dompet terarsip tetap masuk ringkasan total: itu perilaku confirmed **C-18**, bukan bagian dari rekomendasi ini. | **Diterima PM sebagai detail UX (2026-10-08)**: perilaku picker/carousel/aktivitas di §6.3. |
| R-10 | Usulan lanjutan dari R-9: ringkasan dompet terarsip di tab Arsip ("N dompet diarsipkan, total RpX"). Helper copy utamanya sudah confirmed **C-27**. | **Tetap follow-up opsional**, belum diputus; bukan scope MVP dan bukan scope Spec. |

> Catatan penomoran: R-8 dipromosikan menjadi confirmed **C-16** (lihat §1.1) dan ID-nya tidak dipakai ulang; R-6 (urutan kartu dompet tersimpan per user) **dihapus setelah klarifikasi PM**: kartu dompet adalah carousel geser untuk browse, bukan reorder, dan tidak ada persistensi urutan (lihat §5.2); ID R-6 juga tidak dipakai ulang. Pada ronda ketiga keputusan PM (2026-10-08): R-1 dipromosikan menjadi **C-23** (menutup Q-1), R-2 dipromosikan menjadi **C-24** (menutup Q-2), dan R-9 dipromosikan menjadi **C-27** (helper C-18 diterima); R-4 (default dompet = terakhir dipakai) **dihapus** karena premisnya terjawab: repeat-memory ditunda (C-26), jadi MVP tidak punya default dompet terakhir dipakai. ID R-1, R-2, R-4, R-9 tidak dipakai ulang; daftar rekomendasi berlanjut di R-10. Bersama sign-off PM di hari yang sama (§0.1), sisa rekomendasi R-3, R-5, dan R-7 diterima PM sebagai **detail UX** (status di tabel di atas); R-10 tetap follow-up opsional.

---

## 2. Konsep & vocabulary kanonik

Istilah teknis (`wallet`, `PERSONAL|SHARING`) tetap di catatan implementasi; UI memakai Bahasa Indonesia (A-30). Konsep "Sharing" dirender sebagai "Bersama" di UI. Tabel berikut menambah vocabulary kanonik doc 01:

| Konsep | String kanonik (UI) | Jangan pakai |
| :--- | :--- | :--- |
| Wallet | **Dompet** | Wallet, Account, Rekening |
| Scope Pribadi | **Pribadi** | Private, Personal, Saya |
| Scope Sharing | **Bersama** | Sharing, Public |
| Membuat dompet | **Buat dompet** | Add wallet, New account |
| Mengubah detail | **Ubah dompet** | Edit account, Manage account |
| Mengarsipkan (non-destruktif) | **Arsipkan dompet** | Delete, Hapus, Soft delete |
| Daftar dompet terarsip | **Arsip** | Trash, Deleted items |
| Tujuan dompet | **Tujuan penggunaan** | Account type, Tipe rekening, Kategori |
| Saldo awal | **Saldo awal (opsional)** | Initial balance, Opening balance |
| Memilih dompet | **Pilih dompet** | Account selector, Source account |
| Transfer antar-dompet | **Transfer** | Internal transfer, Pindahan |
| Dompet terakhir dipakai | (tanpa label; behavior belakang layar) | Last used, Recent account |

Copy di UI tidak memakai kata "saldo" untuk angka harian; ringkasan memakai label "Uang tersedia" sesuai vocabulary doc 01, dan kartu dompet menampilkan angka polos tanpa label tambahan. Kata "saldo" hanya muncul di helper teknis seperti "Saldo awal (opsional)" pada form.

> Vocabulary ini dikunci PM (confirmed **C-23**, menutup Q-1, 2026-10-08): tabel di atas resmi menambah vocabulary kanonik doc 01, dan label teknis "Sharing" tidak pernah muncul di UI.

---

## 3. IA & entry point (tanpa item nav baru, C-13)

### 3.1. Peta entry point
Dompet tidak punya ikon sendiri di navigasi. Semua tugas dompet menempel ke tujuan nav yang sudah ada karena tugas user sebenarnya adalah "lihat uang di mana", "catat uang", dan "atur tempat uang":

```
BERANDA (/home)
├── Ringkasan dua angka (2 kartu kecil, TERPISAH)
├── Kartu dompet geser dengan penanda scope  +  [ + Dompet baru ]
│      ├── tap kartu → sheet Detail dompet
│      │        ├── riwayat transaksi dompet itu
│      │        ├── Ubah dompet
│      │        └── Arsipkan dompet
│      └── `⋯ Kelola` → sheet `Kelola dompet` (tab Aktif / Arsip)
│               ├── Ubah
│               ├── Arsipkan (tab Aktif)
│               └── Pulihkan (tab Arsip)
SHEET TAMBAH TRANSAKSI (pola doc 03)
├── Uang masuk  → field [ Ke dompet ]   → Pilih dompet
├── Uang keluar → field [ Dari dompet ] → Pilih dompet
└── Transfer    → [ Dari dompet ] + [ Ke dompet ] → Pilih dompet
AKTIVITAS (/transactions, existing)
└── entri menampilkan dompet terkait untuk dompet Bersama;
    transfer lintas scope tampil generik tanpa detail pribadi (C-10)
```

### 3.2. Mengapa tanpa route baru
Tabel route kanonik (A-31) dan nav 5 item dikunci PM. Menambah `/wallets` berarti amendment route yang memakan effort MVP untuk tugas yang sudah terlayani dari Beranda. PM menutup Q-2 (2026-10-08, confirmed **C-24**): detail dan manajemen dompet cukup melalui **sheet** dari kartu dompet atau picker, **tanpa route atau page baru** dan tanpa item nav baru (C-13). Bila kelak PM menginginkan URL untuk detail dompet (deep-link), opsi `/home?wallet={id}` atau amendment A-31 dibahas sebagai scope terpisah, bukan di MVP.

---

## 4. Kartu dompet: metafora kartu ATM/debit generik (R-11; visual 2026-10-20)

### 4.0. Karakter kartu dan batas identitas

Kartu dompet digambar seperti **kartu ATM/debit generik**: kartu lanskap yang solid (tanpa gradasi), chip abstrak hijau kecil di kiri atas, glyph contactless samar di kanan atas, saldo besar sebagai focal point, nama dompet + pill scope + `⋯ Kelola` sebagai baris identitas di atas saldo. Kartu tetap milik aplikasi ini; metafora ini BUKAN milik bank tertentu dan BUKAN kartu fisik:

- **Token visual** (doc 01 §5.6): `wallet-card-shared #14273F` (navy) untuk dompet Bersama, `wallet-card-personal #1D4F87` (biru) untuk dompet Pribadi, `wallet-chip #166534` hijau abstrak, glyph contactless `#DCEBFA` samar. Permukaan kartu **solid, tanpa gradasi**.
- **Dilarang pada kartu (memperluas C-14/C-15/C-18):** tanpa nomor kartu, tanpa tanggal kadaluarsa, tanpa CVV, tanpa nama pemegang, tanpa logo bank nyata, tanpa logo/merek jaringan kartu, tanpa klaim keamanan atau fitur bank. Metafora ini tidak mengklaim koneksi/integrasi bank apa pun; label bank pada form Buat dompet adalah **label-only** (lihat [07-bank-institutions.md](07-bank-institutions.md), T-011).
- **Varian ukuran:** kartu ATM penuh dipakai di Beranda (mobile carousel + desktop strip). Pada picker (§7.1), sheet Detail dompet, dan sheet `Kelola dompet`, kart diwakili ringkas (mini kartu biru dengan chip hijau) supaya pemindaian daftar tetap cepat; baris picker tidak dipaksa menjadi kartu besar.
- Kontras teks putih di atas `#14273F` dan `#1D4F87` terukur PASS pada tabel kontras bucket audit (doc 01 §2.2/§6).

### 4.1. Anatomi satu kartu

Scope ditandai pill label + ikon di atas permukaan kartu ATM (ikon/label memenuhi aturan no-sole-color doc 01); warna kartu ikut membedakan scope tetapi tidak pernah jadi satu-satunya sinyal.

```
+------------------------------------------------------------------+
| ( ▨ chip hijau )                              (〰 contactless )   |
|           Dompet Keluarga                        [ 👥 Bersama ]   |
|           Tujuan: Biaya rumah                     ⋯ Kelola        |
|                                                                  |
|  Rp14.250.800                                                    |
+------------------------------------------------------------------+

Versi Pribadi:
+------------------------------------------------------------------+
| ( ▨ chip hijau )                              (〰 contactless )   |
|           Tabungan Liburan                     [ 👤 Pribadi ]     |
|           Tujuan: Tabungan                        ⋯ Kelola        |
|                                                                  |
|  Rp2.450.000                                                     |
+------------------------------------------------------------------+
```

- Kartu: `bg-[#14273F]` (Bersama) atau `bg-[#1D4F87]` (Pribadi), `rounded-3xl shadow-bento p-5 text-white`, solid tanpa gradasi.
- Chip abstrak: rounded rectangle kecil `#166534` dengan glyph lebih terang, dekoratif (`aria-hidden`), bukan chip kartu fisik bermerek.
- Identitas: nama dompet (`text-lg font-semibold text-white`) + pill scope di kanan-atas:
  - **Bersama:** `bg-[#DCEBFA] text-[#14273F]` + ikon 👥.
  - **Pribadi:** `bg-[#EFF4FA] text-[#14273F]` + ikon 👤.
- Tujuan penggunaan: satu baris kecil `text-[#DCEBFA]` di bawah nama (pada kartu lanskap); pada layar sempit tujuan pindah ke sheet detail bila tidak muat tanpa membungkus dua baris.
- Angka: `text-2xl font-semibold tabular-nums text-white`, `white-space: nowrap` (angka tidak boleh terpotong/terbungkus di 390px; cek overlap audit PASS); skala besar (hero) hanya di ringkasan §5.1.
- Kontrol `⋯ Kelola` (kanan-bawah kartu, `text-[#DCEBFA]`): **bukan menu popup**. Kontrol ini membuka sheet `Kelola dompet` (tab `Aktif` / `Arsip`), tempat aksi `Ubah`, `Arsipkan`, dan `Pulihkan` berada. Label aksi di dalam sheet tetap teks eksplisit, bukan ikon trash tanpa label (aturan aksi destruktif doc 01).
- Footer meta (`text-xs text-[#DCEBFA]`): "Ditambah oleh Sarah" untuk dompet Bersama. Kartu Pribadi tidak menampilkan nama pembuat.

### 4.2. Interaksi kartu

| Elemen | Interaksi | Kedudukan |
| :--- | :--- | :--- |
| Badan kartu | Tap → buka sheet Detail dompet | Aksi utama |
| `+ Dompet baru` (kartu ghost di ujung daftar) | Buka sheet Buat dompet. Tombol ghost dashed `border-[#166534]` dengan teks navy/hijau, digambar **terpisah** dan TIDAK menyerupai kartu ATM (bukan kartu keempat). | Kedua |
| `⋯ Kelola` | Buka sheet `Kelola dompet` (tab `Aktif` / `Arsip`); aksi `Ubah`, `Arsipkan`, dan `Pulihkan` berada di dalam sheet itu, bukan di menu popup pada kartu. `Arsipkan` hanya dirender bagi yang berhak (C-4): pembuat atau Owner untuk dompet Bersama, pemilik untuk dompet Pribadi; `Pulihkan` mengikuti C-22. | Tersier |
| Validasi lengkap | Nama ≤80, Tujuan penggunaan ≤80 (mengikuti pola panjang A-20) | Helper/error inline |

Catatan scope (C-31 tidak berubah): kartu Pribadi dari anggota lain tidak pernah dirender untuk anggota lain (C-2); warna kartu tidak memperkenalkan state atau permission baru apa pun.

### 4.3. State kartu dompet (meneruskan pola §4.6 doc 02; perilaku tidak berubah, warna mengikuti token)
- **Loading:** skeleton 3 kartu tinggi tetap (`h-24`), tanpa spinner tanpa batas.
- **Empty:** satu kartu pembuka: "Belum ada dompet. Simpan uang ke tempat yang tepat: [ Buat dompet pertama ]". Tanpa angka karangan (antislop).
- **Error:** satu error state section penuh dengan tombol `Coba lagi`; bukan partial card.
- **Success:** setelah buat/ubah/arsipkan, sheet menutup, daftar kartu diperbarui, toast `aria-live="polite"` "Dompet tersimpan".

---

## 5. Ringkasan dashboard: dua angka terpisah + kartu geser (C-11)

### 5.1. Struktur
Dua ringkasan tampil **terpisah** dan tidak dijumlahkan (posisi modul di Beranda kini di bawah hero pengeluaran, urutan R-9 doc 02):

```
[ Uang tersedia bersama ]        [ Dompet pribadiku ]
 Rp14.250.800                     Rp2.450.000

[ Kartu ATM dompet 1 ] [ Kartu ATM dompet 2 ] [ + Dompet baru ] ...  ← geser
```

- Kartu dompet dalam carousel: **geser untuk browse** (melihat dompet satu per satu), bukan mengurutkan ulang; tidak ada fitur reorder (lihat §5.2).
- **Uang tersedia bersama:** total saldo dompet Bersama. Permukaan putih dengan aksen tint biru (`#DCEBFA`, label + ikon 👥) dan angka navy, karena ringkasan ini mewarisi konteks uang keluarga (sturktur warna R-10; yang lama berbasis peach sudah ditarik, doc 01 §2.5).
- **Dompet pribadiku:** total dompet Pribadi milik user. Putih dengan well biru sangat muda `#EFF4FA` dan ikon 👤; itu warna keluarga token yang membedakan konteks Pribadi (fungsional, bukan warna seremonial baru).
- Tambah delta ringan ("Naik Rp500.000 minggu ini") itu **rekomendasi** (bukan scope confirmed) dan bisa dipangkas bila memakan komputasi backend tambahan.
- **Confirmed (C-18):** saldo dompet terarsip **tetap dihitung** dalam kedua ringkasan. Carousel hanya menampilkan kartu aktif, sehingga penjumlahan kartu yang terlihat boleh lebih kecil dari angka ringkasan; itu perilaku yang benar, bukan bug. Untuk menutup celah kebingungan, di bawah masing-masing ringkasan tampil helper copy kecil "Termasuk dompet di Arsip" dengan tautan ke tab Arsip (diterima PM sebagai **C-27**, promosi R-9); usulan lanjutan ringkasan arsip di tab Arsip tetap follow-up opsional (**R-10**, belum diputus dan bukan scope MVP).

### 5.2. Carousel kartu dompet (browse, bukan reorder)
Carousel hanya untuk **browse**: menggeser untuk melihat kartu dompet berikutnya, bukan fitur mengubah urutan. **Tidak ada drag-reorder, tidak ada mode `Kelola urutan`, tidak ada persistensi urutan** (rekomendasi R-6 dihapus setelah klarifikasi PM). Urutan tampil kartu mengikuti urutan bawaan daftar yang sama dengan picker (§7.1): alfabetis dalam grup scope.

| Elemen | Interaksi | Kedudukan |
| :--- | :--- | :--- |
| Track kartu (mobile) | Swipe horizontal dengan CSS `scroll-snap` (pola quick actions doc 02); kartu berikutnya mengintip di tepi | Aksi utama browse |
| Tombol `Kartu sebelumnya` / `Kartu berikutnya` (desktop, bila perlu) | Dirender hanya bila kartu melebihi area tampil; button fokus-able, Enter/Space menggeser | Sekunder |
| Indikator kartu berikutnya | Tepi kartu berikutnya selalu tampak (peek) sehingga jelas ada konten yang bisa digeser; indikator ini juga tetap terlihat saat track/tombol menerima fokus | Petunjuk |

Aturan minimum dan aksesibilitas:

- Bila semua kartu muat di area tampil (tablet/desktop grid atau hanya satu dompet), tombol prev/next **tidak dirender**, bukan disabled tanpa penjelasan (antislop no fake interactive elements).
- Fokus keyboard tidak memicu geser sendiri; saat tombol prev/next difokuskan, ring fokus terlihat (doc 01 §6) dan Enter/Space baru menggeser track.
- `prefers-reduced-motion: reduce`: geser menjadi lompatan tanpa animasi (pola doc 03 §5.2).

---

## 6. Flow: buat, ubah, arsipkan

### 6.1. Buat dompet
```
User → tap "+ Dompet baru" → sheet Buat dompet
     → isi: Nama, Tujuan penggunaan, Scope, Saldo awal (opsional)
     → Simpan → kartu muncul di Beranda + toast "Dompet tersimpan"
```

Form fields:

| Field | Tipe | Wajib | Catatan |
| :--- | :--- | :--- | :--- |
| Nama | teks | ya | ≤80 karakter. Placeholder: "mis. Dompet Keluarga". Error: "Nama dompet belum diisi". |
| Tujuan penggunaan | teks bebas | opsional | User yang menentukan, termasuk menulis "Tabungan" (C-6). Placeholder: "mis. Tabungan, Biaya rumah". **Bukan dropdown tipe rekening.** |
| Scope | segmented pill `[ Pribadi ] [ Bersama ]` | ya | Default **Pribadi**, confirmed **C-16** (ex-Q-3, ex-R-8). Helper: "Bersama: semua anggota keluarga bisa melihat. Pribadi: hanya kamu." **Scope hanya dapat dipilih saat pembuatan** dan tidak dapat diubah setelah dompet dibuat (confirmed **C-31**); helper menambah kalimat itu agar keputusan sekali-jalan transparan sejak form. |
| Saldo awal | amount IDR integer | opsional | Kosong = Rp0 (C-5). Error: "Saldo awal tidak boleh negatif". **Dapat dikoreksi selama wallet belum punya transaksi (C-21)**; setelah transaksi pertama terekam, field ini terkunci (pola Ubah dompet di §6.2). |

- CTA: `[ Buat dompet ]` (pill primary `#166534`, formula verb + outcome doc 01 §5.1).
- **Field tambahan `Bank atau penyedia` (opsional; desain kanonik baru di [07-bank-institutions.md](07-bank-institutions.md), T-011):** label-only selector bergrup (katalog publik OJK read-only + daftar pribadi user + jalur manual "Dompet manual / bank lain"). Alur lengkap, seluruh state (duplikat, no-match, sukses), aturan privasi daftar pribadi, dan batas desain vs schema ada di doc 07. Sifatnya **desain terkunci pada level flow; data model teknis menunggu review PM/Dev**.
- **Scope tidak dapat diubah setelah dompet dibuat (confirmed C-31):** pilihan `Pribadi`/`Bersama` adalah keputusan **sekali-jalan** (one-time choice) yang dibuat di sheet Buat dompet ini. UI tidak menawarkan konversi scope pada dompet yang sudah ada: bila user kelak membutuhkan dompet dengan scope berbeda, jalurnya **buat dompet baru dengan scope yang diinginkan lalu pindahkan dana via Transfer** lintas scope (C-8); riwayat transaksi dompet lama tetap tampil (soft-delete philosophy) sehingga visibilitas historisnya terjaga. Helper di field Scope menyatakan hal ini dengan kalimat awam (lihat tabel field di atas).
- Tanpa dompet di form lain: tombol `Pilih dompet` tetap bisa dibuka, dan dari dalam picker tersedia CTA `+ Buat dompet baru` untuk mencegah dead-end saat user belum membuat dompet sebelum mencatat transaksi. Perilaku layar ketika CTA itu ditekan (picker menutup dulu, sheet Buat dompet jadi satu-satunya sheet dompet, dompet baru langsung terpilih setelah simpan) diatur bersama sebagai **C-32** di §7.1.

### 6.2. Ubah dompet
- Buka dari sheet detail → sheet Ubah dompet berisi form Buat dompet **tanpa field Scope** (scope tidak dapat diubah, confirmed **C-31**) dengan nilai terisi.
- Semua anggota approved bisa mengubah detail dompet Bersama; dompet Pribadi hanya bisa diubah oleh pemiliknya (C-2, C-4). Pemilik keluarga tidak punya hak khusus tambahan pada dompet anggota lain. Hak arsip berbeda dari hak ubah: lihat §6.3.
- **Field Saldo awal di form Ubah mengikuti C-21:** kunci aktif begitu **baris transaksi pertama wallet itu ada** — termasuk transaksi yang sudah masuk **Trash** (soft-delete) dan **satu leg transfer** yang menunjuk ke wallet; keduanya dihitung sebagai transaksi dan keduanya mengunci saldo awal. Trash/restore tidak membuka kembali koreksi saldo awal. Sebelum baris pertama ada, nilainya masih bisa dikoreksi. Setelah terkunci, field dirender **disabled** dengan helper: "Saldo awal terkunci: sudah ada transaksi untuk dompet ini, jadi nilainya tidak bisa diedit langsung." Tanpa angka karangan dan tanpa alasan teknis yang membingungkan (antislop). Server menolak mutasi saldo awal yang tidak valid; pola penolakan mengikuti state matrix §12, dan kontrak kode error final diputuskan di `architecture-decisions.md`, bukan di doc ini.
- **Field Scope tidak ada di form Ubah (confirmed C-31):** form Ubah dompet hanya mengedit **Nama, Tujuan penggunaan, dan Saldo awal** (dengan kunci C-21). Kontrol scope tidak dirender: pill scope tetap tampil di kartu/sheet detail sebagai informasi, tetapi tidak dapat diganti dari sini maupun dari tempat lain di UI. Bila scope dompet keliru sejak awal, jalurnya **buat dompet baru dengan scope yang benar lalu pindahkan dana via Transfer** (C-8); riwayat dompet lama tetap tampil sehingga visibilitas historis terjaga.
- Anggota tidak bisa melihat dompet Pribadi anggota lain (tidak muncul di daftar, tidak bisa dibuka).

### 6.3. Arsipkan (soft, non-destruktif; C-4)
```
Arsipkan dompet → dialog konfirmasi:
"Dompet 'Dompet Keluarga' akan dipindahkan ke Arsip.
Riwayat transaksinya tetap tersimpan dan tidak bisa
dihapus permanen.
[ Batalkan ]                     [ Arsipkan ]"
```
- Tersedia sebagai aksi di dalam sheet `Kelola dompet` (tab `Aktif`, yang dibuka dari kontrol `⋯ Kelola` di kartu) dan di sheet detail dompet Bersama (**hanya pembuat dompet atau Owner**, C-4) serta dompet Pribadi (pemiliknya). Bukan menu popup pada kartu: aksinya hidup di dalam sheet. Anggota approved lain boleh mengubah detail dompet Bersama, tetapi tidak melihat opsi `Arsipkan`.
- Tidak ada opsi hapus permanen di MVP, termasuk untuk pemilik keluarga (konsisten ADR-005 dan pola doc 03 §4.3).
- Dompet terarsip: (1) hilang dari picker money in/out/transfer, (2) keluar dari carousel aktif, tetapi **saldo-nya tetap dihitung dalam ringkasan §5.1 (C-18)**; riwayat transaksi tetap tampil di aktivitas (R-7). Selisih antara total dan penjumlahan kartu aktif disamarkan dengan helper copy (confirmed **C-27**).
- Daftar `Arsip` tersedia di sheet `Kelola dompet` (tab Aktif / Arsip); dompet terarsip bisa `Pulihkan` ke aktif.
- **Hak memulihkan (confirmed C-22):** opsi `Pulihkan` pada dompet Bersama hanya tampil bagi **pembuat dompet atau Owner**; dompet Pribadi hanya dapat dipulihkan oleh **pemiliknya**. Anggota approved lain tetap boleh mengubah detail dompet Bersama (C-4) tetapi tidak melihat opsi `Pulihkan`; server tetap memvalidasi (pola 403 §12).
- Arsip dompet bukan Trash transaksi: tidak memasuki `/transactions?view=trash`.

### 6.4. Migrasi transaksi pre-wallet (C-17)

- Saat fitur wallet aktif, seluruh transaksi lama (pre-wallet) diarahkan ke **satu wallet default Sharing per household** yang dibuat otomatis (confirmed C-17, ex-Q-4).
- Wallet default dibuat dengan **saldo awal Rp0**. Saldo wallet selalu dihitung dari transaksi yang menunjuk ke sana; menambahkan opening balance di atasnya berarti menghitung uang lama dua kali. Inilah alasan opening balance-nya nol.
- Nama default diusulkan **"Dompet Keluarga"** — usulan, bukan keputusan nama final; finalisasi menyusul dari PM. Placeholder form §6.1 memakai nama yang sama hanya sebagai contoh.
- Setelah migrasi, tiap household pasti punya minimal satu dompet aktif. Kartu default tampil seperti kartu dompet biasa (§4) dengan pill **Bersama**.
- Kontrak teknis migrasi (mapping record, idempotensi, urutan rollout) masuk amendment `architecture-decisions.md` oleh PM+Developer, bukan di doc ini.

---

## 7. Money in / out / transfer: Pilih dompet

Modal Add (doc 03) tambah field dompet. Field kategori, tanggal, catatan tidak berubah.

```
|  JENIS TRANSAKSI: [ Uang keluar (aktif) ] [ Uang masuk ] [ Transfer ] |
|
|  JUMLAH:  Rp 0
|
|  DARI DOMPET:     [ Pilih dompet                       >  ]   (Uang keluar, Transfer)
|  KE DOMPET:       [ Pilih dompet                       >  ]   (Uang masuk, Transfer)
|
|  KATEGORI / TANGGAL / CATATAN: sesuai doc 03 (tidak berubah)
```

| Jenis transaksi | Field dompet |
| :--- | :--- |
| Uang masuk | satu: `Ke dompet` |
| Uang keluar | satu: `Dari dompet` |
| Transfer | dua: `Dari dompet` + `Ke dompet` |

- Field dompet menampilkan nama dompet + pill scope kecil setelah dipilih.
- Placeholder ketika kosong: "mis. Dompet Keluarga" dengan helper satu kalimat "Pilih di mana uangnya dihitung."
- Validasi: dompet wajib dipilih sebelum tombol `Simpan transaksi` aktif (C-7). Submit dengan dompet yang sudah diarsip/disalahgunakan → 422 `WALLET_UNAVAILABLE` (kode error final diputuskan di architecture-decisions PM) dengan pesan "Dompet ini sudah diarsipkan. Pilih dompet lain." Field lain tetap terisi.
- Transfer lintas scope dua arah selalu tersedia (C-8), tidak ada blocking; transfer tidak punya kategori (konsisten doc 03 §2.2).
- Satu input jumlah untuk transfer (dua kaki di belakang layar, AC-3 spec transaksi), tetap doc 03.

### 7.1. Pilih dompet (bottom sheet di mobile, modal di desktop)
```
+----------------------------------------------+
|  Pilih dompet                      [ X ]     |
|                                              |
|  BERSAMA (semua anggota bisa lihat)          |
|  (👥) Dompet Keluarga            Rp14.250.800 |
|  (👥) Dana Darurat               Rp3.200.000  |
|                                              |
|  PRIBADI (hanya kamu)                        |
|  (👤) Tabungan Liburan           Rp2.450.000  |
|  (👤) Kas Harian                 Rp180.500    |
|                                              |
|  [ + Buat dompet baru ]                      |
+----------------------------------------------+
```
- Grup heading `BERSAMA` dan `PRIBADI` menjelaskan siapa yang bisa melihat; scope juga tetap terlihat di option yang dipilih.
- Urutan bawaan: alfabetis dalam grup, tanpa pengubah urutan. Repeat-memory (dompet/kategori terakhir dipakai) ditunda oleh PM di luar scope MVP (confirmed **C-26**, ex-Q-8, 2026-10-08), jadi MVP tidak menampilkan saran "terakhir dipakai"; item ini dapat kembali lewat follow-up terpisah jika diaktifkan (§15).
- Empty (belum ada dompet): "Kamu belum punya dompet. Buat dompet agar uang tersimpan ke tempat yang tepat." + CTA `+ Buat dompet baru`. **Tidak ada fallback "tanpa dompet"** pada transaksi (C-7). Pasca-migrasi C-17 tiap household sudah punya wallet default Sharing, jadi state ini fallback untuk edge-case (household baru/data tidak lengkap), bukan tampilan utama.
- Search box TIDAK di MVP (tidak ada kontrak backend; antislop no fake interactive elements). Revisit bila daftar dompet anggota rimbun.

#### Alur `Buat dompet baru` dari dalam picker (confirmed **C-32**, koreksi defect 2026-10-09)

CTA `+ Buat dompet baru` di dalam picker mencegah dead-end saat user belum punya dompet, tetapi jalur layarnya harus rapi: membuat dompet dari dalam picker **bukan** menumpuk form di atas picker. Aturannya sebagai berikut:

```
User → form transaksi terbuka → tap field `Dari dompet` / `Ke dompet`
     → `WalletPickerSheet` terbuka (satu-satunya sheet dompet di layar)
     → tap `+ Buat dompet baru`
        (1) picker menutup dulu
        (2) sheet `Buat dompet` terbuka sebagai satu-satunya sheet dompet
        (3a) Simpan berhasil → sheet buat tutup → dompet baru langsung terpilih
                               di field yang sedang diisi → picker TIDAK dibuka kembali
            (3b) Batal → sheet buat tutup → nilai field kembali seperti semula
                              → picker TIDAK dibuka kembali
        (4) fokus kembali ke tombol field yang membuka picker
```

1. **Urutan layar wajib:** tap `+ Buat dompet baru` **menutup picker lebih dulu**, lalu baru membuka sheet Buat dompet. Hanya **satu sheet dompet** yang boleh terbuka pada satu waktu; tidak boleh ada dua sheet dompet saling bertumpuk di layar (baik mobile maupun desktop).
2. **Defect yang dikoreksi (C-32):** pada implementasi saat ini aksi itu membuka `WalletFormSheet` **tanpa menutup picker**, sehingga picker (layer z-80) tetap menutupi form Buat dompet (z-70) dan form **tidak dapat dipakai** (user hanya melihat picker di atasnya). Perbaikannya adalah **urutannya state picker dan form di pemanggil**, bukan menaikkan z-index form.
3. **Field target harus diingat:** sheet Buat dompet dibuka dari field tertentu (`Dari dompet`, `Ke dompet`, atau satu field pada money in/out) dan picker akan ditutup pada langkah (1). State "sedang mengisi field apa" tetap dipegang pemanggil (picker tidak menyimpan pilihan sendiri), supaya hasil create tahu harus mengisi field mana.
4. **Setelah simpan berhasil:** dompet baru **langsung terpilih** di field asal tanpa langkah konfirmasi tambahan, sheet Buat dompet menutup, picker **tidak dibuka kembali**. Isian lain form transaksi (jumlah, tanggal, kategori, catatan) tetap seperti sebelum user membuka picker. Pada transfer, satu kaki yang sedang diisi terisi; kaki satunya tetap menunggu pilihan user.
5. **Setelah batal:** sheet Buat dompet menutup, nilai field **kembali seperti semula** (tetap kosong bila sebelumnya belum ada pilihan), picker **tidak dibuka kembali**. User tetap berada di form transaksi dan tidak kehilangan isian lain.
6. **Fokus:** setelah sheet Buat dompet ditutup, baik lewat Simpan maupun Batal, fokus **kembali ke tombol field yang membuka picker**; fokus tidak tertinggal di body dan tidak ada dua dialog aktif yang berebut fokus.
7. **Simpan gagal (error server/validasi):** sheet Buat dompet tetap terbuka dengan error inline (pola §12), picker tetap tertutup, nilai field tidak berubah.
8. **Berlaku di semua tempat yang memakai picker:** form manual Uang masuk/keluar/Transfer (§7) dan review OCR (§10). Dari Beranda, tombol `+ Dompet baru` di ujung carousel kartu berbeda: ia membuka sheet Buat dompet **tanpa picker**, dan setelah simpan sheet menutup dengan toast (pola §4.3) tanpa mengisi field apa pun.

---

## 8. Transfer & privasi lintas scope (C-10)

Skenario: Sarah punya dompet Pribadi "Tabungan Liburan". Anggota lain (Alex) menampilkan aktivitas dompet Bersama "Dompet Keluarga" dan melihat ada uang masuk dari arah dompet pribadi Sarah.

Aturan tampilan di aktivitas dompet Bersama:

- Baris transfer luar-scope tampil **generik**: `⇄ Transfer dari dompet pribadi  + Rp500.000` (atau `ke dompet pribadi` untuk arah keluar). Nama dompet Pribadi Sarah tidak tampil.
- Catatan/note transfer dari dompet Pribadi tidak tampil di aktivitas Bersama.
- Riwayat personal (transaksi dompet Pribadi lain milik Sarah) tidak muncul.
- Arah transfer yang relevan untuk dompet Bersama tetap terlihat (jumlah, tanggal), agar ringkasan dan aktivitas tidak ganda angka.
- Screen reader membaca: "transfer dari dompet pribadi, masuk Rp500.000, <tanggal>" tanpa menyebut nama dompet pribadi.

## 9. Trash & transfer dua kaki (C-9, R-5)

Perilaku Trash, undo, dan restore sudah diatur di doc 03 §4. Doc ini menambahkan aturan khusus transfer dua kaki:

- Trash menampilkan transfer sebagai **satu baris Transfer** (bukan 2 baris terpisah), berlabel arah: `⇄ Transfer  Rp500.000  Dari dompet pribadi ke Dompet Keluarga`.
- `Pulihkan` memulihkan kedua kaki sekaligus (kebalikan dari pembuatan AC-3 yang membuat dua kaki atomik). UI tidak menawarkan aksi restore satu kaki saja, sehingga tidak ada kemungkinan satu kaki dipulihkan tanpa kaki lainnya.
- Soft delete dan restore menyasar kedua record lewat `transfer_group_id` (rincian kontrak di Spec PM, bukan di sini).
- **Permission trash/restore pasangan transfer lintas scope (confirmed C-20, 2026-10-08):** hanya **pembuat transfer atau Owner** boleh trash/restore pasangan tersebut, dan prosesnya **atomik** pada kedua kaki (melanjutkan C-9). Anggota yang hanya melihat kaki dompet Sharing (misalnya karena kaki lain adalah dompet Pribadi anggota lain) **tidak boleh memodifikasi pasangan**: UI tidak menampilkan `Hapus`/`Pulihkan` untuk mereka pada transfer lintas scope yang bukan buatan mereka, dan server tetap memvalidasi. Yang tetap melihat aksi: **pembuat transfer** dan **Owner**, termasuk Owner yang pada UI-nya hanya melihat kaki dompet Sharing. Ini permission berbeda dari C-4 (yang mengatur ubah/arsip dompet individual): pembuat transfer yang tidak berhak arsip salah satu dompetnya tetap boleh trash/restore transfer yang ia buat. Baris transfer untuk anggota tanpa aksi tetap tampil generik sesuai §8.

---

## 10. OCR wallet assignment (wallet dipilih/ditinjau saat konfirmasi)

Doc 03 §3.4 Review screen menerima tambahan field dompet:

```
| [ RECEIPT THUMBNAIL ]         [ DETAIL (EDITABLE) ]
|                               Toko, Jumlah, Tanggal, Kategori (✨)
|
|                               Dari dompet:
|                               [ Pilih dompet            ]   (TANPA badge ✨)
|                               Pilih di mana uang catatan ini dihitung.
```

- **OCR tidak memilih wallet.** Field dompet dikosongkan, tanpa badge ✨ (badge ✨ hanya untuk hasil baca AI).
- Field wajib diisi sebelum `Simpan transaksi` aktif; helper: "Pilih dompet dulu".
- **Alur buat dompet dari picker pada review OCR (confirmed C-32, §7.1):** review screen memakai `WalletPickerSheet` yang sama dengan form manual, jadi aturan layernya sama: `+ Buat dompet baru` **menutup picker lebih dulu**, membuka sheet Buat dompet sebagai satu-satunya sheet dompet di layar, dan setelah create berhasil dompet baru **langsung terpilih** di field `Dari dompet` review (picker tidak dibuka kembali). Batal mengembalikan field seperti semula dan picker tidak dibuka kembali; fokus kembali ke tombol field dompet. Isian review lain (toko, jumlah, tanggal, kategori) tidak berubah saat sheet buat dibuka/ditutup.
- Disclosure C-28 tetap mengikuti pilihan dompet pada review screen: bila dompet baru yang terpilih otomatis termasuk Bersama, panel disclosure varian 1 tetap dirender sebelum CTA (aturan §10 tidak berubah oleh C-32).
- Pilihan dompet diminta saat konfirmasi (review screen), bukan saat upload.
- Repeat-memory ditunda di luar scope MVP (confirmed **C-26**, ex-Q-8), jadi MVP **tidak menampilkan chip** "Terakhir dipakai": field dompet OCR tetap kosong sampai user memilih/mengonfirmasi (C-7). Bila fitur ini diaktifkan lewat follow-up, saran hanya tampil sebagai chip tap-to-fill tanpa auto-submit dan tetap tidak memasukkan saran ke field otomatis.
- OCR tidak mendukung transfer (spec AC-3 edge case, tab Scan tidak menampilkan opsi transfer); aturan ini tetap.
- **Respons duplikat struk (confirmed C-19, 2026-10-08):** bila struk yang diunggah ternyata sudah pernah diproses oleh **anggota household lain**, UI hanya menampilkan **pesan generik** bahwa struk tersebut duplikat atau tidak dapat diproses, diikuti opsi retry atau isi manual (pola honest failure di doc 03). Detail tentang pekerjaan yang sudah ada tidak diberikan: tanpa nama/id job, tanpa draft milik orang lain, tanpa nama uploader sebelumnya, tanpa pratinjau atau data receipt lama. Garis privasinya sama dengan aturan aktivitas lintas scope (§8): data milik anggota lain tidak pernah tampil lewat jalur duplikat.
- **Retry oleh uploder yang sama (bagian dari C-19):** uploder boleh mengunggah ulang struk miliknya sendiri dan boleh memakai ulang job miliknya yang masih relevan (mis. melanjutkan/retry job yang masih terbuka miliknya). Rancangan UI tidak menampilkan apa pun yang bukan milik uploder sendiri.
- **Disclosure visibilitas struk ke dompet Bersama (confirmed C-28, keputusan PM, 2026-10-09):** struk yang menempel pada transaksi di dompet **Bersama** boleh terlihat oleh anggota household approved. Saat user memilih dompet **Bersama** pada review screen, tampil disclosure berbahasa awam **sebelum** user mengonfirmasi `Simpan transaksi`. Panel dirender sebagai blok info statis dengan kalimat persetujuan di dalamnya, **tanpa checkbox terpisah dan tanpa mengubah CTA**; alternatif checkbox eksplisit ditolak karena menambah langkah baru untuk status yang memang melekat pada pilihan dompet Bersama, dan pola info-panel lebih konsisten dengan helper disclosure existing (polanya masih dideskripsikan penuh di bawah).

  Aturan visibilitas pasca-simpan (union of linked transactions, confirmed C-28):

  | Struk tertaut ke | Siapa yang bisa melihat struk |
  | :--- | :--- |
  | Hanya transaksi dompet **Pribadi** | Pemilik struk saja |
  | Sekali tertaut ke satu transaksi dompet **Bersama** | Semua anggota household approved, **termasuk bila struk juga/kemudian dipakai untuk transaksi Pribadi** |

  - Satu struk tetap boleh menempel ke **beberapa transaksi** (spec F3 existing); aturan visibilitasnya dihitung dari **gabungan semua transaksi yang tertaut**. Transaksi apa pun yang tertaut ke dompet Bersama membuat struk share-visible oleh anggota approved.
  - **Record transaksi Pribadi tetap privat (C-28):** share-visibility hanya berlaku pada **gambar/file struk** sebagai satu artefak bersama. Catatan transaksi Pribadi (jumlah, kategori, catatan, dompet) tidak ikut terekspos ke anggota lain; garis privasi aktivitas lintas scope §8 tetap berlaku untuk record transaksinya.
  - **Pakai ulang struk yang sudah share-visible (confirmed C-28):** bila struk sudah tertaut ke transaksi Bersama dan uploader memakainya lagi untuk transaksi **Pribadi**, struk itu **tetap share-visible** (union tidak mengecil). Karena ini struk milik uploader sendiri, menampilkan status berbaginya **tidak melanggar C-19** (yang melarang memaparkan job/struk milik anggota lain). Review screen menampilkan varian disclosure berikut sehingga uploader paham mengapa struknya tetap terlihat keluarga.

  Disclosure copy (Bahasa Indonesia, kalimat awam, bahasa tanpa istilah teknis):

  ```
  Varian 1, simpan ke dompet Bersama (blok info, di atas CTA):
  ( ℹ️ ) Catatan sebelum menyimpan
        Struk ini akan terhubung ke transaksi di dompet Bersama
        "<nama dompet>". Foto struknya bisa dilihat anggota keluarga
        yang sudah disetujui. Rincian transaksimu tetap tersimpan
        seperti biasa.
        Dengan menekan "Simpan transaksi", kamu setuju dengan itu.

  Varian 2, pakai ulang struk yang sudah share-visible,
  dan dompet Pribadi dipilih (blok info, di atas CTA):
  ( ℹ️ ) Struk ini sudah terhubung ke transaksi di dompet Bersama,
        jadi foto struknya tetap bisa dilihat anggota keluarga,
        meskipun transaksi barumu kamu simpan di dompet Pribadi.
        Rincian transaksi barumu tetap hanya milikmu.
  ```

  - Panel tampil/berganti mengikuti pilihan dompet dan status tautan struk: dompet Bersama dipilih → varian 1; dompet Pribadi dipilih pada struk yang sudah tertaut ke transaksi Bersama → varian 2; struk belum tertaut ke transaksi Bersama dan dompet Pribadi dipilih → panel tidak dirender. Bila varian 2 tampil, kalimat varian 1 tidak digandakan.
  - Panel berada di urutan DOM **sebelum** tombol `Simpan transaksi` sehingga screen reader membacanya sebelum CTA (urutan baca linear doc 01 §6); tidak beranimasi dan tidak memindahkan fokus.
  - Kontrak teknis visibilitas (kapan union dihitung, efek Trash/restore pada tautan, endpoint) adalah item `architecture-decisions.md` PM+Developer, bukan di doc ini (lihat §18).
- **Job & draft OCR tetap uploader-only (confirmed C-29, keputusan PM, 2026-10-09):** visibilitas union di atas hanya berlaku pada **gambar struk saja**. **Job OCR dan draft hasil ekstraksinya tidak pernah dibagikan**, baik **sebelum** maupun **sesudah** transaksi disimpan, bahkan ketika struk tertaut ke atau dipakai untuk transaksi dompet **Bersama** dan gambar struknya share-visible (C-28). Artinya:
  - Anggota household lain yang bisa melihat gambar struk via transaksi Bersama **tidak** melihat draft, data extracted, status job, uploader, maupun riwayat proses OCR itu; yang dibagikan hanya **gambar struk** sebagaimana C-28.
  - Draft/job upload milik uploader bukan artefak shared: C-29 memisahkan artefak yang ikut dibagikan (image saja) dari yang tidak (job + draft). Tidak ada UI yang menampilkan draft/job milik anggota lain, dan aturan duplikat generik **C-19 tidak berubah** karena itu.
  - User yang memilih dompet **Bersama** tetap menerima disclosure varian 1 **sebelum konfirmasi** (aturan C-28 tidak berubah): copy-nya berbicara tentang **foto struk** yang bisa dilihat anggota keluarga, **bukan** tentang draft/job yang ikut dibagikan — memang tidak ada bagian draft/job yang dibagikan (C-29). Copy disclosure tidak ditambah kalimat teknis tentang draft/job; batas ini didokumentasikan sebagai perilaku sistem dan di-enforce server-side (§18), bukan lewat copy awam tambahan.
- Kontrak respons duplikat (kode status, payload DTO, dedup key) adalah item teknis untuk `architecture-decisions.md`, bukan keputusan bisnis di doc ini; doc ini hanya mengunci perilaku privasi UI di atas.

### 10.1. Aksi `Lihat struk` pada detail transaksi (implikasi C-28, keputusan C-30)

C-28 memutuskan **siapa** yang boleh melihat gambar struk; PM melengkapi implikasi desainnya sebagai **C-30** (2026-10-09), karena visibilitas tanpa aksi buka tidak berarti: pengguna yang berhak harus benar-benar dapat membuka gambarnya dari sheet detail transaksi. Saat doc ini ditulis, sheet detail transaksi hanya menampilkan teks "Terlampir pada catatan scan" **tanpa aksi**; status quo itu dicatat sebagai kesenjangan yang ditutup oleh desain berikut. Karena detail transaksi adalah milik doc 03, doc ini hanya menambah perilaku Struk di dalamnya; hal lain di sheet detail tetap canonical doc 03.

#### Aksi di sheet detail transaksi

- Baris `Struk` di sheet detail transaksi tidak lagi berhenti pada teks statis. Bila server memberi tahu user ini **berhak** melihat gambar struk (union C-28), barisnya dirender sebagai aksi: label Struk + teks pengantar + **tombol `Lihat struk`** (label Bahasa Indonesia, kanonik untuk UI; pencatatannya ke tabel vocabulary doc 01 menyusul di ronda sinkronisasi).
- Tombol `Lihat struk` hanya dirender dari **flag visibilitas dari server** (satu sumber yang sama dengan flag disclosure §10); client tidak pernah menghitung perkiraan visibilitas dari `receiptId`, scope transaksi, atau kepemilikan — pola yang sama dengan note §18 C-28.
- Bila user **tidak berhak** (union hanya tautan Pribadi pemilik lain, atau tidak approved), baris dirender sebagai teks informatif tanpa tombol. Garis privasi tidak melonggar: union tidak mengecil karena Trash — **tautan yang sedang di Trash tetap dihitung dalam union**, sehingga aksi tetap tersedia di detail transaksi `mode = trash` bagi yang berhak (pembuat/Owner melihat struknya walaupun transaksinya masih di Trash); finalisasi efek Trash/restore pada union tetap kontrak server (note §18).
- Aksi `Lihat struk` berkedudukan **sekunder** pada detail transaksi: primernya tetap aksi utama sheet (doc 03), jadi tombol dirender sebagai aksi berteks (bukan ikon tunggal) di baris Struk, bukan CTA penuh di atas.

#### Penampil gambar (viewer)

- Pola container: **pola dialog existing doc 03 §5.1**. Mobile `<768px`: bottom sheet penuh lebar, rounded-top (pola picker §13); tablet/desktop: modal dialog medium terpusat, bukan drawer.
- Heading: "Foto struk". Isi: gambar struk ditampilkan menyesuaikan lebar area, dapat discroll vertikal untuk struk panjang.
- **MVP tanpa aksi tambahan di dalam viewer**: tanpa unduh, tanpa crop/edit, tanpa metadata atau data hasil baca mesin. Ruang lingkup-nya kecil secara sengaja: satu gambar yang benar terlampir, dibaca, ditutup. Fitur tambahan (mis. unduh) adalah follow-up terpisah bila kelak diminta.
- Bila struk tertaut ke **beberapa transaksi** (F3 existing), viewer tetap menyajikan **satu gambar saja**; daftar transaksi tertaut tidak ditambahkan ke viewer karena itu akan membuka baris transaksi Pribadi pemilik struk kepada anggota lain.

#### State penampil (safe states)

| State | Perilaku |
| :--- | :--- |
| Loading | Skeleton berdimensi tetap di area gambar + teks "Memuat struk…"; tanpa spinner tanpa batas, tanpa layout shift. |
| Error (gagal memuat) | Honest failure (pola doc 03): pesan awam "Struk gagal dimuat. Periksa koneksi, lalu coba lagi." + tombol `Coba lagi`; error tidak memaparkan jejak teknis (URL, kode status). |
| Not found | Pesan generik "Struk tidak tersedia." + tombol tutup; tanpa detail teknis dan tanpa data apa pun dari struk. |
| Unauthorized (403) | Pesan generik "Kamu tidak punya akses untuk melihat struk ini." Gambar tidak dirender (termasuk gambar yang sempat dimuat sebelum akses berubah); viewer menutup atau menampakkan hanya state aman ini, bukan gambar; fokus kembali ke sheet detail. |
| 401 / sesi berakhir | Mengikuti pola 401 yang ada (banner "Sesi berakhir. Masuk lagi…"); isian apa pun di sheet tidak hilang. |
| Success | Gambar muncul; tidak ada toast tambahan (membuka gambar bukan aksi mutate). |

#### Tutup, keyboard, dan screen reader

- Menutup viewer: tombol `X` (nama aksesibel "Tutup", touch target minimum 44px, target 48px bila feasible), tombol `Escape`, dan tap backdrop (modal desktop). Fokus **kembali ke tombol `Lihat struk`** sebagai trigger.
- Viewer memakai `role="dialog"`, `aria-modal="true"`, focus trap, dan fokus kembali ke trigger (pola dialog doc 03 §5.1, sama dengan sheet detail §14).
- Tombol `Lihat struk` adalah button nyata dengan nama aksesibel jelas; bukan div yang bisu.
- `alt` gambar memakai deskripsi generik yang dibentuk dari data yang **sudah tampil** di sheet detail (jenis, jumlah, tanggal), misal `alt="Foto struk untuk transaksi Uang keluar Rp35.000, 9 Oktober 2026"`. Alt **tidak** mengambil isi dari hasil ekstraksi OCR (job/draft tetap uploader-only, C-29) dan tidak menampilkan kalimat yang tidak ada datanya.
- `prefers-reduced-motion: reduce`: transisi buka/tutup viewer diganti tampilan statik (pola doc 03 §5.2).

#### Batas penyajian & privasi (disiplin dengan C-28/C-29/C-19)

- **Tanpa URL Blob publik:** byte gambar hanya disajikan lewat **jalur server terautentikasi**; tombol viewer tidak pernah membuka URL Blob mentah dan client tidak pernah menerima/menyimpan URL publik (konsisten ADR-008 server-proxy; kontrak serving diputuskan di `architecture-decisions.md`, lihat §18).
- **Visibilitas gambar tidak membuka baris transaksi Pribadi:** anggota yang sah melihat **gambar struk** saja; viewer tidak menyediakan tautan, tombol, atau payload yang menampilkan daftar/row transaksi Pribadi apa pun (termasuk tautan Pribadi lain pada struk yang sama), dan garis privasi lintas scope §8 tidak berubah.
- **Viewer hanya melayani image (C-29):** payload viewer tidak pernah menyertakan job OCR, draft hasil ekstraksi, status job, atau identitas uploader; tidak ada elemen UI di viewer yang menyajikan data itu.
- **Disclosure review OCR tetap (C-28):** varian 1/varian 2 di §10 tidak berubah dan tidak ditambah; viewer tidak menampilkan panel persetujuan baru — pembukaan gambar oleh user yang berhak bukan peristiwa share baru.
- **C-19 tidak berubah:** viewer tidak mengungkap jejak job/draft/uploader milik anggota lain melalui copy error maupun state apa pun (copy not-found/unauthorized tetap generik).

---

## 11. Budget & pengeluaran household (C-12)

- Kartu **Budget bulan ini** dan grafik **Pengeluaran** hanya menghitung transaksi `MONEY_OUT` **aktif** (tidak di Trash) yang berasal dari dompet Bersama — **termasuk dompet Bersama yang sudah diarsipkan** (konsisten C-18: arsip tidak menghapus kontribusi historis). Leg **transfer** tidak dihitung meskipun salah satu kakinya menunjuk ke dompet Bersama, karena transfer memindahkan uang antar-dompet, bukan pengeluaran household. Transaksi dari dompet Pribadi tidak dihitung (C-12).
- Copy disesuaikan supaya tidak menyesatkan: helper pada kartu Budget, "Dihitung dari dompet keluarga saja." Kartu tetap menampilkan "dari Rp5.000.000" dsb.
- Angka ringkasan §5.1 dan angka chart berbeda karenanya; dua angka tidak boleh dijumlahkan karena uang pribadi tidak bisa dianggap sama dengan uang keluarga.
- Perilaku di atas **confirmed** (C-12, keputusan PM). Amendment kontrak perhitungan ke `architecture-decisions.md` adalah item teknis PM+Developer, bukan open question bisnis (lihat §18).

---

## 12. State matrix (loading / empty / error / success)

Berlaku untuk: daftar/kartu dompet, ringkasan ganda, picker, form dompet, sheet detail, dan sheet `Kelola dompet` (tab `Aktif` / `Arsip`).

| State | Perilaku |
| :--- | :--- |
| Loading | Skeleton: 2 kartu ringkasan + 3 kartu dompet (gaya section-level doc 02 §4.6). Picker menampilkan skeleton daftar. |
| Empty | Kartu pembuka di Beranda dengan CTA `Buat dompet pertama`; picker menampilkan CTA `+ Buat dompet baru`. Ringkasan: "Rp0" + helper, bukan angka karangan. Pasca-migrasi C-17 tiap household pasti punya wallet default Sharing, jadi state ini fallback edge-case, bukan tampilan utama. |
| Error | Satu error state per section dengan `Coba lagi`. Form error inline per field dalam bahasa awam (pola 422 `fieldErrors` doc 01). |
| Success | Toast `aria-live="polite"`: "Dompet tersimpan", "Perubahan disimpan", "Dompet diarsipkan", "Dompet dipulihkan". Daftar kartu dan ringkasan diperbarui tanpa reload penuh. |
| 401 | Mengikuti pola doc 03 §5.3: sheet tetap terbuka, banner "Sesi berakhir. Masuk lagi untuk menyimpan.", isian form terjaga. |
| 403 / akses dicabut | Dompet Pribadi anggota lain tidak pernah render. Bila akses dicabut saat sheet terbuka: banner + tutup sheet tanpa menampilkan data lama. |
| Dompet diarsipkan oleh user lain (mis. Owner/pembuat dompet) saat form terbuka | Inline error saat submit; saldo selalu server-computed (tidak dihitung client). |
| Duplikat struk OCR (C-19) | Pesan generik yang sama untuk semua penerima; tidak memaparkan record milik anggota lain: tanpa id job/draft/uploader/receipt existing. Retry diizinkan; retry oleh uploder sama boleh memakai ulang job miliknya. Copy generik, bukan kode status spesifik di UI. |
| Disclosure struk C-28 (review OCR) | Mengikuti pilihan dompet + status tautan struk: dompet Bersama dipilih → varian 1 tampil sebelum CTA; dompet Pribadi dipilih pada struk yang sudah tertaut ke transaksi Bersama → varian 2; selain itu panel tidak dirender. Ganti pilihan dompet langsung mengganti/menyembunyikan panel tanpa perlu re-submit; panel tidak beranimasi dan tidak memindahkan fokus. |
| Job & draft OCR (C-29) | Draft hasil ekstraksi dan job OCR **selalu uploader-only**, sebelum dan sesudah simpan — termasuk bila gambar struknya share-visible via transaksi Bersama (C-28). Anggota household lain tidak pernah menerima draft/data extracted/status job/uploader itu di UI mana pun; yang dibagikan hanya gambar struk. Copy disclosure tidak menyebut draft/job (lihat §10). |
| Penampil struk `Lihat struk` (C-30, §10.1) | Aksi dirender hanya bila flag visibilitas dari server mengizinkan (union C-28, termasuk tautan yang sedang di Trash); bila tidak, baris Struk tetap teks tanpa tombol. Viewer: loading = skeleton berdimensi tetap + "Memuat struk…"; error = honest failure + `Coba lagi`; not found = "Struk tidak tersedia." (generik); 403 = "Kamu tidak punya akses untuk melihat struk ini." tanpa gambar lama; 401 mengikuti pola 401 baris di atas. Tutup = `X`/Escape/backdrop, fokus kembali ke trigger `Lihat struk`. |
| Ubah scope (C-31) | Kontrol scope **tidak dirender** di form Ubah dompet dan tidak ada aksi konversi/migrasi scope di UI mana pun, jadi tidak ada state error khusus "ubah scope ditolak" dari jalur UI. Bila permintaan scope berbeda tetap sampai ke server (mis. via payload lama), server menolak dengan pola error §12 (kode final diputuskan di `architecture-decisions.md`); UI menampilkan error inline awam. Jalur UI untuk kebutuhan scope berbeda: buat dompet baru + Transfer (§6.1/§6.2). |
| Buat dompet baru dari dalam picker (C-32, §7.1) | Picker **menutup lebih dulu** saat `+ Buat dompet baru` ditekan, lalu sheet Buat dompet terbuka sebagai satu-satunya sheet dompet di layar; picker tidak bertumpuk di atas form. Simpan berhasil → dompet baru langsung terpilih di field asal, picker **tidak** dibuka kembali, isian lain tetap ada. Batal → nilai field kembali seperti semula, picker **tidak** dibuka kembali. Fokus kembali ke tombol field yang membuka picker setelah sheet buat ditutup. Simpan gagal → sheet buat tetap terbuka dengan error inline, picker tetap tertutup. Tidak ada state loading/empty/error baru: komponennya memakai state sheet Buat dompet (§6.1) dan state sheet picker yang existing. |

---

## 13. Responsive behavior

| Breakpoint | Perilaku |
| :--- | :--- |
| Mobile `<768px` | Satu kolom. Dua ringkasan grid-2 (ramping, `min-h-20`). Kartu dompet carousel horizontal dengan `scroll-snap`, kartu berikutnya mengintip (§5.2); no horizontal overflow di 390px. Picker + form dompet = bottom sheet penuh lebar, rounded-top. |
| Tablet `768-1023px` | Dua kolom bento: ringkasan dan kartu dompet; kartu dompet grid 2-3 kolom (bukan carousel). Picker jadi modal medium, bukan bottom sheet. Form tetap modal. |
| Desktop `≥1024px` | Grid 12-kolom; dua ringkasan + daftar kartu dompet di satu bento block; sheet detail dompet = drawer kanan `max-w-md`. `+ Dompet baru` berupa kartu ghost di ujung daftar, tidak floating. Carousel hanya dibutuhkan bila kartu melebihi area tampil; bila demikian, tombol prev/next fokus-able (§5.2). |
| Umum | Touch target: **minimum 44px** untuk semua kontrol interaktif; aksi primer (CTA utama) **menargetkan 48px** bila feasible (baseline `min-h-11`, sama dengan ukuran badge ikon doc 01 §5.5; perbaikan BUG-5 sudah berada di lantai 44px yang sama); fokus keyboard terlihat di semua kontrol (doc 01 §6); scroll vertikal aman di semua breakpoint; tanpa scroll horizontal. |

---

## 14. Aksesibilitas (keyboard & screen reader)

- Kartu dompet diimplementasikan sebagai satu button (bukan div yang bisu) dengan `aria-label` jelas: "Dompet Keluarga, Bersama, tersedia Rp14.250.800, buka detail".
- `⋯ Kelola` adalah button terpisah yang membuka **sheet** `Kelola dompet` (tab `Aktif` / `Arsip`), bukan menu popup: tidak ada `aria-haspopup="menu"`, tidak ada `aria-expanded`, dan tidak ada navigasi Arrow antar item menu. Sheet mengikuti pola dialog yang sama dengan sheet lain di dokumen ini: fokus masuk ke panel saat sheet terbuka, `Escape` menutup, dan fokus kembali ke trigger `Kelola` yang membukanya. Aksi `Ubah` / `Arsipkan` / `Pulihkan` di dalam sheet adalah button berlabel teks dengan nama aksesibel jelas, dan hanya dirender bila user berhak (C-4/C-22).
- Sheet (detail / `Kelola dompet` / buat / ubah / picker) memakai pola dialog doc 03 §5.1: `role="dialog"`, `aria-modal="true"`, focus trap, Escape, focus return ke trigger.
- Picker: list semantik (`listbox`), grup `Bersama`/`Pribadi` sebagai heading yang dikenali screen reader; navigasi Arrow atas/bawah; Enter/Space memilih; Escape menutup tanpa mengubah field.
- Toast memakai `aria-live="polite"` (pola doc 03 §4.2).
- Aksi `Lihat struk` pada detail transaksi (C-30, §10.1) adalah button berlabel teks dengan nama aksesibel jelas; viewer-nya memakai pola dialog doc 03 §5.1 (`role="dialog"`, `aria-modal="true"`, focus trap, Escape, fokus kembali ke trigger). Gambar memakai `alt` deskriptif generik dari data transaksi yang sudah tampil (bukan hasil OCR); pemuatan/error/not-found/unauthorized diumumkan lewat pesan di dalam viewer, bukan lewat title/hover.
- Carousel kartu (browse): tombol `Kartu sebelumnya`/`Kartu berikutnya` hanya dirender bila kartu melebihi area tampil; swipe tidak menggeser fokus. Bila hanya satu dompet, carousel tampil sebagai kartu tunggal tanpa kontrol geser (bukan disabled tanpa penjelasan).
- Kontras AA terjaga untuk pill scope dan teks di atas warna pastel/fond (doc 01 §6); scope tidak bergantung warna saja (ikon + label).
- `prefers-reduced-motion: reduce`: animasi sheet/carousel diganti transisi atau tampilan statik (pola doc 03 §5.2).
- Alur buat dompet dari picker (C-32, §7.1): hanya **satu sheet dompet** yang aktif pada satu waktu, jadi hanya satu dialog yang memegang focus trap (tidak ada dua dialog saling berebut fokus saat picker dan form buat terbuka bersamaan). Setelah sheet Buat dompet ditutup, baik lewat Simpan maupun Batal, fokus **kembali ke tombol field yang membuka picker**; ring fokus terlihat pada trigger itu, dan fokus tidak tertinggal di `body` atau di belakang overlay.
- Paduan audit: pemeriksaan penuh ada di wave QA (T-008 style), bukan di doc ini.

---

## 15. Rekomendasi dari audit UX lama (quick wins terkait pencatatan)

Dua tema dari analisis audit UX lama relevan dengan alur pencatatan. Statusnya berbeda: **unsaved-changes guard** tetap rekomendasi terpisah yang belum diputus PM dan **bukan scope Spec wallet**; **repeat-memory** sudah diputus PM sebagai **ditunda di luar confirmed scope MVP (C-26, menutup Q-8, 2026-10-08)** dan disimpan sebagai follow-up terpisah (bukan open blocker):

| Item | Usulan | Status |
| :--- | :--- | :--- |
| **Unsaved-changes guard** | Saat menutup Add sheet atau Ubah dompet dengan isian belum disimpan (termasuk lewat Escape/tap diluar/back): dialog singkat "Perubahan belum disimpan. Keluar tanpa menyimpan?" dengan `[ Lanjutkan mengedit ]` (primary) dan `[ Keluar ]`. | Rekomendasi terpisah, belum diputus PM; bukan scope Spec wallet ini (catatan sign-off §0.1, 2026-10-08). |
| **Repeat-memory (wallet & kategori)** | Ingat pilihan dompet dan kategori terakhir per user, tampilkan sebagai **saran** di Add form (chip "Terakhir dipakai: X [Gunakan]") dan sebagai saran pertama di picker. User tetap wajib mengkonfirmasi; tidak ada auto-submit. Pada OCR, field dompet tetap kosong sampai user mengisi/konfirmasi (C-7). | **Ditunda (C-26):** di luar confirmed scope MVP dan disimpan sebagai follow-up terpisah. Tidak ada keputusan penyimpanan lokal vs server; desain terkait (chip saran §7.1/§10, default last-used) dinonaktifkan di MVP. |

Dua tema lain dari audit yang sama adalah **follow-up terpisah**, bukan bagian scope dokumen ini: privacy disclosure pada Scan struk, dan perbaikan copy/error pada alur Target tabungan (Goals). Keduanya punya alur dan pemilik file berbeda; tidak digabung ke implementasi wallet. **Pengecualian sejak 2026-10-09:** disclosure privasi untuk kasus struk yang disimpan ke dompet **Bersama** kini sudah diputuskan PM sebagai **C-28** dan didokumentasikan di §10 doc ini; sisa tema privacy disclosure pada Scan (di luar kasus dompet Bersama) kini tetap follow-up terpisah, kecuali PM meleburkannya kelak.

---

## 16. Hubungan dengan dokumen lain

| Dokumen | Hubungan |
| :--- | :--- |
| [03-transaction-and-ocr-flow.md](03-transaction-and-ocr-flow.md) | Doc ini **menambah** field dompet ke modal Add dan Review OCR. Hal lain (kategori kanonik A-09, garis besar OCR states, trash/undo, a11y dialog) tetap canonical. Sinkronisasi ringkas doc 03 dilakukan setelah Spec wallet disetujui PM. |
| [02-bento-dashboard-wireframes.md](02-bento-dashboard-wireframes.md) | Kartu hero "Uang tersedia" digantikan oleh dua ringkasan terpisah (§5.1). Kartu lain (budget, chart, goals, aktivitas) tetap canonical doc 02 sampai sinkronisasi pasca-approval. |
| [01-design-system-tokens.md](01-design-system-tokens.md) | Tabel vocabulary §2 doc ini menambah baris ke tabel vocabulary doc 01 (vocabulary dikunci PM sebagai **C-23**, 2026-10-08). Token biru-putih-hijau 2026-10-20 menggantikan rujukan warna lama di doc ini (§0, §4, §5.1); ATM treatment: doc 01 §5.6. |
| [07-bank-institutions.md](07-bank-institutions.md) | Alur desain kanonik untuk field `Bank atau penyedia` pada sheet Buat dompet (T-011): picker bank bergrup (OJK read-only + daftar pribadi + jalur manual), state duplikat/no-match/sukses, entri terpilih di Buat dompet, metadata label di sheet detail dompet Bersama. Data model teknis menunggu PM/Dev. |
| ADR-005 (soft delete) | Arsip dompet mengikuti philosophy non-destruktif; kontrak data (kolom `archived_at` dsb.) adalah keputusan PM/Developer, bukan sini. |
| Spec transaksi (feat-transactions-ocr) | Field dompet di form manual + review OCR butuh update Spec oleh PM; doc ini hanya menjelaskan perilaku yang diinginkan. |

---

## 17. Open questions untuk PM

Seluruh open question telah **ditutup atas jawaban PM (2026-10-08)**; **tidak ada pertanyaan terbuka tersisa**:

- Ronda pertama: Q-5 (aktivitas transfer lintas scope) dan Q-9 (budget household).
- Ronda kedua: **Q-3** (default scope saat buat dompet = **Pribadi**, ex-R-8), **Q-4** (transaksi pre-wallet dimigrasikan ke satu wallet default Sharing per household, saldo awal Rp0, nama usulan "Dompet Keluarga"), dan **Q-10** (saldo dompet terarsip tetap dihitung dalam ringkasan total).
- Ronda ketiga: **Q-1** (vocabulary UI = "Dompet" + "Pribadi"/"Bersama", C-23), **Q-2** (detail/manajemen dompet cukup sheet dari Beranda/picker, tanpa route/page baru, C-24), **Q-7** (tidak ada batas jumlah dompet di UI MVP sampai ada bukti/keputusan teknis, C-25), dan **Q-8** (repeat-memory di luar confirmed scope MVP, ditunda sebagai follow-up terpisah, C-26).

Semua resolusi tercatat sebagai keputusan confirmed di §1.1 (C-10 hingga C-27) dan diringkas di §17.1; nomor ID lama tidak dipakai ulang. Q-6 (kontrak endpoint/DTO) bukan pertanyaan bisnis dan dipindah ke note teknis §18.

Pada tanggal yang sama (2026-10-08), PM juga mengonfirmasi **tiga keputusan tambahan** yang tidak menutup open question ID mana pun: **C-19** (respons duplikat OCR hanya generik, §10), **C-20** (trash/restore pasangan transfer lintas scope hanya pembuat transfer atau Owner, atomik, §9), dan **C-21** (saldo awal bisa dikoreksi sebelum transaksi pertama wallet, setelahnya terkunci, §6.1/§6.2). Ketiganya dicatat langsung di §1.1 dan di §17.1. Disusul pada hari yang sama, PM mengonfirmasi **C-22** (hak memulihkan dompet terarsip: Bersama hanya pembuat dompet atau Owner, Pribadi hanya pemiliknya, §6.3); juga dicatat langsung di §1.1 dan di §17.1. Pada **2026-10-09**, PM mengonfirmasi satu keputusan tambahan lagi: **C-28** (visibilitas struk terhadap anggota household approved, disclosure sebelum simpan ke dompet Bersama via OCR, union of linked transactions, §10). Disusul pada tanggal yang sama keputusan **C-29** (job OCR dan draft extracted tetap uploader-only sebelum dan sesudah simpan, bahkan ketika gambar struk share-visible melalui transaksi Bersama; disclosure ke user tetap hanya soal gambar struk, §10). Kedua keputusan ini tidak menutup open question ID mana pun (seluruh Q sudah tertutup sejak 2026-10-08) dan tidak membuka kembali sign-off 2026-10-08; keduanya dicatat langsung di §1.1, §10, §12, dan §17.1. Pada tanggal yang sama, PM melengkapi C-28 dengan **C-30** (**aksi `Lihat struk` pada detail transaksi, §10.1**): implikasi desain dari visibilitas struk yang sudah dikonfirmasi, yaitu pengguna yang berhak dapat membuka gambar struk lewat penampil aman (loading/error/not-found/unauthorized), tanpa URL Blob publik; disclosure review OCR (C-28), status uploader-only job/draft (C-29), dan C-19 tidak berubah. C-30 juga tidak menutup open question ID mana pun dan tidak membuka kembali sign-off 2026-10-08; dicatat di §1.1, §10.1, §12, §14, dan §17.1. Pada tanggal yang sama, PM mengonfirmasi keputusan tambahan berikutnya: **C-31** (scope dompet **Pribadi/Bersama immutable setelah pembuatan**: scope hanya dipilih saat buat dompet, tidak dapat diedit kemudian; bila butuh scope berbeda, buat dompet baru dan pindahkan dana via Transfer lintas scope C-8, dengan riwayat dompet lama tetap tampil agar visibilitas historis terjaga, §6.1/§6.2). C-31 tidak menutup open question ID mana pun, tidak membuka kembali sign-off 2026-10-08, dan tidak mengubah C-16 (default Pribadi saat buat), C-8 (transfer lintas scope dua arah tetap selalu tersedia), C-4 (hak ubah detail/arsip tidak berubah), maupun C-22; dicatat di §1.1, §6.1, §6.2, §12, §17.1, dan note §18. Pada tanggal yang sama kembali (2026-10-09), PM mengonfirmasi **C-32** sebagai **koreksi defect yang ditemukan implementasi** pada alur picker (§7.1): aksi `Buat dompet baru` di `WalletPickerSheet` harus **menutup picker lebih dulu**, baru membuka sheet Buat dompet sebagai **satu-satunya sheet dompet** di layar (defect: picker z-80 tetap bertumpuk di atas form z-70 sehingga form create tidak dapat dipakai); setelah create berhasil dompet baru **langsung terpilih** di field/picker yang sedang diisi dan picker **tidak dibuka kembali**; bila user membatalkan, nilai field **kembali seperti semula** dan picker tidak dibuka kembali; fokus **kembali ke tombol pemicu yang membuka picker**. C-32 tidak menutup open question ID mana pun (seluruh Q sudah tertutup sejak 2026-10-08), tidak membuka kembali sign-off 2026-10-08, dan tidak mengubah permukaan copy/field picker maupun form (C-26, C-28, C-29, C-30, dan C-31 tetap berlaku utuh); dicatat di §1.1, §6.1, §7.1, §10, §12, §14, dan §18.

### 17.1. Keputusan bisnis yang sudah dijawab PM (2026-10-08)

| Jawaban PM | Pencatatan di dokumen |
| :--- | :--- |
| Aktivitas dompet Sharing untuk transfer lintas scope tampil generik (catatan umum): tanpa nama wallet Pribadi, tanpa note, tanpa riwayat pribadi. | Confirmed sebagai C-10 (ex-Q-5); §8 adalah perilaku confirmed, bukan rekomendasi. |
| Semua anggota approved boleh membuat wallet Pribadi maupun Sharing. | Menegaskan C-3. |
| Dashboard menampilkan dua ringkasan terpisah (saldo wallet Sharing dan total wallet Pribadi milik user) plus kartu per-wallet yang bisa digeser dengan penanda scope. | Confirmed sebagai C-11. "Bisa digeser" diinterpretasikan sebagai carousel geser untuk browse, bukan reorder urutan kartu (klarifikasi PM 2026-10-08): §5.1 dan §5.2 disesuaikan; rekomendasi urutan per user (R-6) dihapus. |
| Budget dan pengeluaran household hanya menghitung wallet Sharing. | Confirmed sebagai C-12 (ex-Q-9); §11 disesuaikan. |
| Semua anggota approved boleh mengubah detail dompet Sharing; **arsip hanya oleh pembuat atau Owner**; dompet Pribadi hanya diubah/diarsipkan pemilik. | C-4 direvisi; §4.2, §6.2, §6.3 disesuaikan. |
| Delete/restore transfer dua kaki selalu diproses bersama. | Menegaskan C-9; §9. |
| Default scope saat buat dompet = **Pribadi**; user tetap bisa memilih Bersama. | Confirmed sebagai **C-16** (ex-Q-3, ex-R-8); §1.1 dan field Scope form §6.1 disesuaikan. |
| Transaksi pre-wallet dimigrasikan ke **satu wallet default Sharing per household** dengan **saldo awal Rp0** agar saldo historis tidak dihitung ganda; nama "Dompet Keluarga" adalah usulan, bukan keputusan nama final. | Confirmed sebagai **C-17** (ex-Q-4); §6.4 baru, catatan empty state §7.1 dan §12 disesuaikan. |
| Saldo dompet terarsip **tetap dihitung** dalam ringkasan total; carousel aktif tidak menampilkan dompet terarsip. | Confirmed sebagai **C-18** (ex-Q-10); §5.1, §6.3, R-7 disesuaikan; saat itu helper copy + ringkasan arsip dicatat sebagai rekomendasi R-9 (helper copy kini confirmed **C-27**; usulan ringkasan arsip kini R-10). |
| Respons duplikat OCR receipt dari anggota household lain hanya **generik**; detail job/draft/uploader/receipt existing tidak pernah diekspos; retry oleh uploder sama boleh memakai ulang job miliknya. | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-19** (2026-10-08); §10 dan state matrix §12 disesuaikan. Kontrak status/payload duplikat tetap item teknis §18. |
| Trash/restore **pasangan transfer lintas scope** hanya oleh **pembuat transfer atau Owner**, diproses **atomik** pada kedua kaki; anggota yang hanya melihat kaki Sharing tidak boleh memodifikasi pasangan. | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-20** (2026-10-08); §9 dan note §18 disesuaikan. C-9 (dua kaki diproses bersama) ditegaskan dengan lapisan permission baru. |
| **Saldo awal** dapat dikoreksi selama wallet **belum memiliki transaksi pertama**; setelah transaksi pertama terekam, saldo awal tidak lagi dapat diedit langsung. | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-21** (2026-10-08); §6.1 (form buat), §6.2 (form ubah, field disabled + helper) dan note §18 disesuaikan. |
| Restore dompet terarsip dari Arsip: dompet **Bersama** hanya oleh **pembuat dompet atau Owner**; dompet **Pribadi** hanya oleh **pemiliknya**. | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-22** (2026-10-08); §6.3 dan note §18 disesuaikan. Tidak mengubah C-4: ubah detail dompet Bersama tetap boleh oleh semua anggota approved, arsip tetap pembuat/Owner; dompet Pribadi tetap ubah/arsip/pulihkan pemilik saja. |
| Istilah UI "**Dompet**" + "**Pribadi**"/"**Bersama**" (untuk konsep teknis Sharing) disetujui sebagai vocabulary kanonik A-30; label teknis "Sharing" tidak pernah muncul di UI. | Ronda ketiga (2026-10-08), confirmed sebagai **C-23** (ex-Q-1, promosi R-1); §2 disesuaikan. |
| Detail dan manajemen dompet melalui **sheet** dari kartu Beranda/picker; **tanpa route/page baru** dan tanpa item nav baru. | Ronda ketiga (2026-10-08), confirmed sebagai **C-24** (ex-Q-2, promosi R-2); §3.2 disesuaikan. Bila kelak dibutuhkan deep-link (`/home?wallet={id}`), itu amendment A-31 terpisah, bukan MVP. |
| **Tidak ada batas jumlah dompet** yang diterapkan/ditampilkan di UI MVP sampai ada bukti/keputusan teknis. | Ronda ketiga (2026-10-08), confirmed sebagai **C-25** (ex-Q-7); tidak ada copy "melebihi batas" di UI. Penetapan batas (bila kelak ada) adalah domain PM/Developer lewat amendment teknis §18. |
| **Repeat-memory (wallet & kategori)** tidak masuk confirmed scope MVP; ditunda sebagai follow-up terpisah (bukan open blocker). | Ronda ketiga (2026-10-08), confirmed sebagai **C-26** (ex-Q-8); §7.1, §10, §15 disesuaikan dan R-4 dihapus. Tidak ada keputusan penyimpanan lokal vs server. |
| Helper copy C-18 disetujui: "**Termasuk dompet di Arsip**" + tautan ke tab Arsip di bawah masing-masing ringkasan §5.1. | Ronda ketiga (2026-10-08), promosi R-9 menjadi **C-27**; §5.1 dan §6.3 disesuaikan. Usulan lanjutan ringkasan arsip di tab Arsip belum diputuskan dan dicatat sebagai R-10. |
| Struk yang menempel pada transaksi dompet **Bersama** boleh terlihat anggota household approved; **disclosure berbahasa awam** pada review OCR sebelum simpan ke Bersama; setelah simpan, visibilitas struk mengikuti **union of linked transactions** (hanya tautan Pribadi → pemilik; ada tautan Bersama → anggota approved, termasuk saat struk dipakai ulang untuk transaksi Pribadi dan tetap share-visible, dengan penjelasan status berbagi ke uploader); **record transaksi Pribadi tetap privat**; satu struk boleh menempel beberapa transaksi (F3 existing). | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-28** (2026-10-09); §10, §12, dan note §18 disesuaikan. Tidak melanggar C-19: disclosure pakai-ulang hanya menampilkan status berbagi struk milik uploader sendiri, bukan job/struk milik anggota lain. C-19 ditegaskan dan tidak diubah. |
| **Job OCR dan draft extracted tetap uploader-only** sebelum dan sesudah simpan, bahkan ketika **gambar struk** share-visible melalui transaksi dompet Bersama (C-28); disclosure saat memilih Bersama tetap hanya menyatakan anggota bisa melihat **gambar struk**, bukan draft/job. | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-29** (2026-10-09); §10 dan state matrix §12 disesuaikan, note §18 ditambah. Memisahkan artefak image (ikut union C-28) dari job/draft (tidak pernah dibagikan). C-19 dan C-28 ditegaskan dan tidak diubah. |
| Pengguna yang berhak dapat **membuka gambar struk** dari detail transaksi melalui aksi **`Lihat struk`**; aksi dirender dari flag visibilitas server (union C-28, termasuk tautan yang sedang di Trash) dan membuka penampil gambar aman (mobile bottom sheet, desktop/tablet modal; loading/error/not-found/unauthorized/401 safe states; `X`/Escape/backdrop menutup dengan fokus kembali ke trigger); `alt` gambar deskriptif generik, bukan hasil OCR; byte hanya disajikan lewat **jalur server terautentikasi, tanpa URL Blob publik**; visibilitas gambar tidak membuka baris transaksi Pribadi dan viewer tidak menyertakan job/draft OCR (C-29). | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-30** (2026-10-09) sebagai implikasi desain C-28; §10.1 (baru), state matrix §12, bullet aksesibilitas §14, dan note §18 ditambah. Tidak mengubah C-19, C-28, C-29, maupun scope sign-off 2026-10-08; detail sheet non-Struk tetap canonical doc 03. |
| Scope dompet **tidak dapat diubah setelah dibuat** (immutable): scope hanya dipilih saat pembuatan dan tidak ada field/aksi ubah scope di UI; bila butuh scope berbeda, **buat dompet baru dengan scope yang diinginkan lalu pindahkan dana via Transfer** lintas scope, dan riwayat dompet lama tetap tampil (visibilitas historis terjaga). | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-31** (2026-10-09); §6.1 (helper field Scope + bullet buat), §6.2 (form Ubah tanpa kontrol Scope), state matrix §12, dan note §18 ditambah. Tidak mengubah C-16 (default Pribadi saat buat), C-8 (transfer lintas scope dua arah tetap selalu tersedia), C-4 (hak ubah detail/arsip tidak berubah), maupun scope sign-off 2026-10-08. |
| Defect implementasi alur picker: aksi `Buat dompet baru` di `WalletPickerSheet` membuka `WalletFormSheet` tanpa menutup picker, sehingga picker (layer di atas) menutupi form Buat dompet dan form tidak dapat dipakai. PM memutuskan urutan pengganti: picker **menutup dulu**, sheet Buat dompet menjadi **satu-satunya sheet dompet di layar**; setelah simpan berhasil dompet baru **langsung terpilih** di field/picker yang sedang diisi (picker tidak dibuka kembali, isian lain tetap); batal mengembalikan nilai field seperti semula (picker tidak dibuka kembali); fokus **kembali ke tombol pemicu picker**. | Keputusan baru (bukan jawaban open Q ID), confirmed sebagai **C-32** (2026-10-09) sebagai koreksi defect implementasi; §7.1 (sub-bagian baru), §6.1, §10, state matrix §12, bullet aksesibilitas §14, dan note §18 disesuaikan. Tidak menambah copy/field baru dan tidak mengubah C-26 (tanpa repeat-memory), C-28/C-29 (disclosure & job/draft uploader-only), C-30 (`Lihat struk`), maupun C-31 (scope immutable). |
| **Rekonsiliasi dokumentasi, bukan keputusan bisnis:** kontrol kartu `⋯ Kelola` sempat dideskripsikan sebagai menu popup, sementara C-24 dan implementasi membuka sheet `Kelola dompet` (tab `Aktif`/`Arsip`) / sheet detail; aksi `Ubah`/`Arsipkan` hidup di dalam sheet, digated permission (C-4/C-22). | **Bukan keputusan bisnis dan bukan ID C baru (2026-10-09)**: hanya menyelaraskan wording §3.1, §4.1, §4.2, §6.3, §12, §14, dan §18 dengan implementasi berbasis sheet sesuai C-24 yang sudah ada. Tidak ada perilaku baru; C-1..C-32 tetap utuh. |
| **Rekonsiliasi dokumentasi, bukan keputusan bisnis:** §13 (baris "Umum") menyatakan "touch target ≥48px saat mobile", sementara baseline yang di-enforce codebase adalah **44px** (`Button` `min-h-11` dengan konvensi "at least 44px (R-03)"; badge ikon doc 01 §5.5 `44px x 44px`). | **Bukan keputusan bisnis dan bukan ID C baru (2026-10-09)**: PM meruling **minimum yang di-enforce 44px untuk semua kontrol interaktif**, dan **CTA primer mobile menargetkan 48px bila feasible**. Wording §13 dan §10.1 (tombol tutup viewer) diselaraskan ke aturan itu. Tidak ada perilaku baru dan **perbaikan BUG-5 tetap valid** karena sudah berada di lantai 44px; C-1..C-32 tetap utuh. |

> Riwayat koreksi (2026-10-08): baris yang lebih awal menyatakan "Q-3 ditutup, default scope = Pribadi (C-16)" sempat **dicabut** karena saat itu PM belum memutuskan. Pada ronda keputusan berikutnya di hari yang sama, PM memutuskan default scope = **Pribadi**; Q-3 resmi ditutup dan keputusannya dicatat sebagai **C-16 penomoran baru** (bukan pemakaian ulang keputusan yang dicabut). Pada saat itu belum ada keputusan tentang route/detail sheet (Q-2), vocabulary (Q-1), limit (Q-7), atau repeat-memory (Q-8). Pada **ronda ketiga** di hari yang sama, keempatnya resmi ditutup sebagai **C-23, C-24, C-25, dan C-26**, ditambah penerimaan helper (R-9) sebagai **C-27**; tidak ada open question tersisa.

---

## 18. Developer handoff notes

- Ini bukan Spec dan bukan kontrak API. Kontrak data mengikuti `architecture-decisions.md` yang akan diamandemen PM; desain sudah disetujui PM (§0.1) dan Spec `feat-wallets.md` sudah disetujui PM (Spec Ready, 2026-10-08), tetapi amendment teknis arsitektur dan Developer Dev Plan **belum terjadi**.
- Item teknis (bukan open question PM): pemecahan kontrak dashboard (`DashboardDTO.balanceMinor` → `sharedBalanceMinor` + `personalBalanceMinor`, atau endpoint baru), kontrak perhitungan budget wallet-only, dan kontrak migrasi pre-wallet (**C-17**: satu wallet default Sharing per household, saldo awal Rp0 agar saldo historis tidak dobel, idempotensi migrasi) diputuskan PM+Developer lewat amendment `architecture-decisions.md`. Nama final wallet default juga difinalkan di sana (usulan saat ini: "Dompet Keluarga").
- Permission C-4 wajib di-enforce server-side untuk setiap mutation dompet: ubah detail dompet Sharing = semua anggota approved; **arsip dompet Sharing = pembuat dompet atau Owner**; ubah/arsip dompet Pribadi = pemilik. Aksi `Arsipkan`/`Ubah` dirender **di dalam sheet** (sheet `Kelola dompet` tab `Aktif` dan sheet detail dompet), bukan sebagai menu popup pada kartu; kontrol `⋯ Kelola` di kartu hanya membuka sheet `Kelola dompet`. UI menyembunyikan aksi bagi yang tak berhak, dan server tetap menolak panggilan langsung dengan 403 (pola §12) supaya menyembunyikan tombol bukan satu-satunya pengaman.
- Ringkasan (DTO dashboard) menghitung saldo dompet aktif **plus** dompet terarsip (C-18); carousel/daftar kartu hanya dompet aktif. Pastikan query ringkasan tidak menyaring `archived_at` seperti pada carousel, tanpa mengekspos nama dompet Pribadi anggota lain di payload.
- Komponen baru yang diusulkan (mengikuti pola colocation AGENTS.md §3): `components/wallets/` berisi `WalletCard`, `WalletSummaryPair`, `WalletPickerSheet`, `WalletFormSheet`, `WalletDetailSheet`, dan `WalletManageSheet` (sheet `Kelola dompet` dengan tab `Aktif`/`Arsip`; dibuka dari `⋯ Kelola` pada kartu, dan dari helper "Termasuk dompet di Arsip" langsung ke tab `Arsip`). Aksi `Ubah`/`Arsipkan`/`Pulihkan` dirender sebagai button berlabel teks di dalam sheet, bukan menu popup pada kartu. Hanya layer client-side UI; data fetching menunggu kontrak.
- Amount selalu integer IDR (skala 0); jangan dibagi 100 (AGENTS.md §5). Gunakan `cn()` (clsx + tailwind-merge).
- Scope dompet adalah data sensitif: nama dompet Pribadi anggota lain tidak boleh muncul di payload aktivitas untuk user lain; label generik §8 harus cocok dengan filtering server.
- Transfer tetap satu input jumlah + dua record (AC-3); sync Trash/Restore harus atomik pada `transfer_group_id`.
- Permission C-20 wajib di-enforce server-side pada seluruh jalur trash/restore transfer lintas scope: hanya **pembuat transfer atau Owner** boleh memutasi pasangan, dan mutasinya atomik pada kedua kaki `transfer_group_id`. Anggota selain keduanya tidak boleh memodifikasi pasangan (termasuk anggota yang hanya melihat kaki Sharing; pengecualian hanya Owner, yang mungkin hanya melihat kaki Sharing di UI); UI menyembunyikan aksi bagi yang tak berhak, server tetap memvalidasi (pola 403 §12).
- Respons duplikat OCR (C-19) harus **generik dan tidak membocorkan** job/draft/uploader/receipt milik anggota lain di payload apa pun (garis privasi sama dengan §8 dan note scope sensitif di atas). Dedup key, kode status, dan kontrak reuse job milik uploder sendiri diputuskan di `architecture-decisions.md`.
- Visibilitas struk (**C-28**) wajib di-enforce server-side: keputusan serve gambar struk ke anggota household approved dihitung dari **union tautan transaksi ke struk** (hanya tautan Pribadi → pemilik; ada tautan Bersama aktif → anggota approved), bukan dari pilihan dompet pada transaksi terakhir. Payload hanya menyediakan flag/konteks status berbagi dari server; client tidak pernah menghitung visibilitas sendiri. Copy disclosure varian 1/varian 2 (§10) merender flag itu; kontrak flag, efek Trash/restore tautan, dan endpoint visibilitas diputuskan di `architecture-decisions.md`. `receiptId` tidak boleh diperlakukan sebagai sinyal kepemilikan di UI: status berbagi selalu berasal dari server.
- Job & draft OCR (**C-29**) wajib di-enforce server-side: job OCR dan draft hasil ekstraksi **tidak pernah diserve** kepada anggota household lain, baik sebelum maupun sesudah transaksi tersimpan — termasuk bila gambar struknya share-visible karena tertaut ke transaksi Bersama (C-28). Endpoint draft/job hanya menerima uploder sendiri; endpoint visibilitas struk (C-28) hanya menyerve **image**, dan payloadnya tidak boleh menyertakan data draft/job dari pihak lain. UI tidak membuat jalur tampil draft/job milik anggota lain; copy disclosure tetap tidak menyebut draft/job (§10). Kontrak pemisahan artefak image vs job/draft diputuskan di `architecture-decisions.md`.
- Aksi `Lihat struk` (**C-30**, §10.1): payload transaksi hanya membawa **flag/konteks visibilitas dari server** (sumber yang sama dengan flag disclosure C-28); client tidak pernah menghitung visibilitas dari `receiptId`/scope/kepemilikan sendiri dan hanya merender tombol bila flag mengizinkan (termasuk pada detail transaksi di Trash, selama union masih menghitung tautannya). Untuk user tanpa akses baris Struk tetap teks tanpa tombol.
- Penampil gambar (**C-30**, §10.1) hanya menyerve **image** lewat **jalur server terautentikasi**; client tidak pernah menerima URL Blob publik dan tombol viewer tidak membuka URL mentah (konsisten ADR-008 server-proxy). Kontrak serving (endpoint byte, caching/header, efek Trash/restore pada union, bentuk flag) adalah item `architecture-decisions.md` PM+Developer. Payload viewer tidak menyertakan job/draft OCR (C-29), data extracted, status job, atau uploader, dan tidak membuka jalur ke baris transaksi Pribadi; `alt` gambar dibentuk dari data transaksi yang sudah tampil di sheet, bukan hasil OCR. Viewer berada di area komponen transaksi (colocation AGENTS.md §3, di luar daftar `components/wallets/` di atas); penamaan komponen/file final menunggu kontrak.
- Scope dompet (**C-31**, 2026-10-09) adalah **immutable setelah pembuatan** dan wajib di-enforce server-side: endpoint update dompet tidak menerima mutasi scope (field `scope`/tipe dompet diabaikan atau request ditolak; kode error final diputuskan di `architecture-decisions.md`, pola error §12), dan tidak ada aksi konversi/migrasi scope maupun endpoint "ubah scope + pindah saldo". UI tidak merender kontrol Scope di form Ubah (§6.2); relokasi dana lintas scope hanya melalui **Transfer** biasa (C-8), sehingga riwayat transaksi dompet lama mengikuti soft-delete philosophy (R-7) dan visibilitas historisnya tetap tampil.
- Alur **`Buat dompet baru` dari dalam picker** (**C-32**, §7.1, koreksi defect 2026-10-09): pemanggil picker wajib **menutup `WalletPickerSheet` sebelum membuka `WalletFormSheet` mode create**, sehingga hanya **satu sheet dompet** yang terbuka pada satu waktu. Defect yang dikoreksi: `onCreate` di form manual langsung membuka form create sementara state picker tetap membuka (picker memakai layer z-80, form z-70), sehingga picker menutupi form dan form create tidak dapat dipakai. Perbaikan dilakukan dengan **urutan state** (tutup picker, buka form), **bukan** dengan menaikkan z-index form. Karena picker ditutup lebih dulu, target field asal (`from` / `to` / field tunggal `wallet`) harus tetap disimpan di state pemanggil supaya hasil `onSaved` tahu field mana yang diisi; setelah create berhasil, dompet baru di-*set* ke field itu, form ditutup, dan picker **tidak** dibuka kembali. Batal: form ditutup, nilai field tidak berubah, picker tidak dibuka kembali. Setelah form ditutup, fokus **kembali ke tombol field yang membuka picker** (hook `useDialogFocusTrap` existing; tidak ada dua dialog aktif bersamaan sehingga tidak ada rebutan fokus). Jalur yang sudah benar dipakai sebagai rujukan: picker pada review OCR (ReceiptScanner) sudah menutup picker sebelum membuka form; jalur form manual yang disesuaikan.
- Aturan saldo awal (C-21): server menolak edit saldo awal pada wallet yang sudah punya transaksi (baris transaksi pertama mana pun yang menunjuk ke wallet itu, **termasuk transaksi yang sudah di Trash (soft-delete) dan satu leg transfer**; Trash/restore tidak membuka kembali koreksi); client merender field disabled (§6.2) tetapi validasi final tetap server-side.
- Permission C-22 wajib di-enforce server-side pada restore dompet terarsip: dompet **Bersama** hanya dapat dipulihkan oleh **pembuat dompet atau Owner**; dompet **Pribadi** hanya oleh **pemiliknya**. UI menyembunyikan opsi `Pulihkan` bagi yang tak berhak (termasuk anggota approved yang berhak mengubah detail dompet Bersama) dan server tetap memvalidasi (pola 403 §12).
- Idempotency-Key di semua POST mutation dompet, mengikuti pola namespace existing.
- Keputusan ronda ketiga (2026-10-08) untuk implementasi: vocabulary UI mengikuti **C-23** (string "Dompet", "Pribadi", "Bersama"; label teknis `Sharing`/`PERSONAL` hanya di kode/backend); entry dan manajemen dompet hanya **sheet** dari kartu Beranda/picker (**C-24**), jadi tidak ada route `/wallets` dan tidak ada komponen page baru; **tanpa batas jumlah dompet di UI** (**C-25**), dan bila server kelak menerapkan cap, kontrak error-nya masuk amendment `architecture-decisions.md` sebelum copy-nya dibuat; **tanpa repeat-memory** di MVP (**C-26**), jadi hook/localStorage "terakhir dipakai" dan chip saran tidak dibuat. Helper "Termasuk dompet di Arsip" + tautan tab Arsip di bawah ringkasan §5.1 adalah bagian desain yang disetujui (**C-27**). Tambahan keputusan 2026-10-09: **C-28** — panel disclosure varian 1/varian 2 pada review OCR (§10) dirender dari flag status berbagi dari server, bukan dihitung client; copy final disclosure mengikuti string §10. Tambahan keputusan 2026-10-09 lainnya: **C-29** — job OCR dan draft extracted tetap uploader-only sebelum dan sesudah simpan (tidak pernah diserve ke anggota lain), bahkan bila gambar struknya share-visible via transaksi Bersama; disclosure varian 1 tetap hanya bicara soal foto struk. Tambahan keputusan 2026-10-09 berikutnya: **C-30** — aksi `Lihat struk` pada detail transaksi dirender dari flag visibilitas server (§10.1) dan menampilkan gambar lewat penampil aman (bottom sheet mobile / modal desktop) yang hanya menyerve image via jalur terautentikasi; **tanpa URL Blob publik** dan **tanpa data job/draft** di UI mana pun. Tambahan keputusan 2026-10-09 terakhir di daftar ini: **C-31** — scope dompet immutable setelah pembuatan: form Ubah dompet **tidak merender kontrol Scope**, endpoint update tidak menerima mutasi scope (server-side enforcement, kode error final di amendment `architecture-decisions.md`), dan tidak ada aksi konversi/migrasi scope; jalur untuk scope berbeda adalah buat dompet baru + Transfer (C-8) dengan riwayat dompet lama tetap tampil. Koreksi defect 2026-10-09 berikutnya: **C-32** - aksi `Buat dompet baru` di `WalletPickerSheet` **menutup picker lebih dulu**, lalu membuka `WalletFormSheet` create sebagai satu-satunya sheet dompet di layar (perbaikan urutan state, bukan z-index, dan bukan membiarkan picker tetap terbuka di atas form); setelah simpan berhasil dompet baru langsung di-*set* ke field pemanggil (`from`/`to`/`wallet`, target field disimpan sebelum picker ditutup), picker **tidak** dibuka kembali; batal mengembalikan nilai field; fokus kembali ke tombol trigger picker setelah form ditutup.
- Tanpa library carousel/drag-and-drop baru: track memakai CSS `scroll-snap` native dan tombol prev/next adalah button biasa (§5.2); tidak ada reorder dan tidak ada persistensi urutan kartu.
