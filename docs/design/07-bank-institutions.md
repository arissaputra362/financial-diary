# Bank Institutions: Picker Bank + Quick Add Pribadi + Jalur Manual (Desain UX Kanonik)

## 0. Status, sumber arah, dan batas dokumen

- **Status: PM-approved desain UX (2026-10-21).** Pemilik: UI/UX Designer (`docs/design/`). Arah dasar dan keputusan PM lanjutan telah dikonfirmasi. Model data tingkat tinggi, Spec, architecture amendment, dan Dev Plan T-011 telah PM-approved; kontrak teknis rinci mengikuti Dev Plan. Kode/schema/API belum diimplementasikan. Bukti perjalanan visual ada di `docs/design/audit-2026-10-visual-refresh/` (revisi R-14 sampai R-16); direktori itu **evidence-only, bukan kanonik**, dan doc ini menulis ulang alurnya secara mandiri (revisi R-14 sampai R-18).
- **Keputusan PM terkonfirmasi (2026-10-21):**
  1. Katalog resmi: **Bank Umum dan Bank Umum Syariah dari daftar OJK**, diisi lewat **seeder** dengan daftar resmi yang diverifikasi saat implementasi. **Tidak perlu sinkronisasi otomatis** dengan sumber resmi; Quick Add tetap ada untuk penyedia/bank yang tidak ada di katalog.
  2. Anggota dompet Bersama yang sesuai izin edit Wallet Bersama dapat mempertahankan/mengosongkan label institusi, memilih dari katalog resmi, atau memilih entri custom miliknya sendiri di form Ubah dompet. Tidak dapat memilih atau melihat daftar pribadi anggota lain.
  3. Entri Quick Add **tersimpan ke daftar pribadi** walau user membatalkan pembuatan dompet setelahnya.
  4. Nama bank di sistem **tidak perlu diperbarui otomatis dari OJK**. Katalog di database adalah snapshot lokal dari seeder; perubahan resmi masuk lewat perubahan data/seeder terkontrol, bukan auto-sync. Pilihan label pada wallet mengacu ke row katalog lokal. **No runtime external synchronization.**
- **Penempatan PRD:** fitur ini adalah **extension ke F6 (Dompet)** di `docs/PRD.md`; tidak menambah fitur PRD baru. Detail AC milik F6 + Spec T-011.
- **Keputusan PM lanjutan (2026-10-22, revisi desain ini):** arsip daftar pribadi kini punya **jalur UI yang bisa dipakai user**: toggle tampilan **Aktif / Arsip** di dalam picker bank (§4a), aksi baris `Arsipkan` dan `Pulihkan`, dan konfirmasi inline sebelum arsip. Tanpa route, nav, atau sheet global baru.
- **Terkait:** ticket **T-011** (`../tickets/14-T-011-bank-institutions.md`, `in_progress`); visual refresh **T-010**. Doc ini adalah pemilik alur desain `Bank atau penyedia`; referensi dari doc 06 ada di §6.1 doc tersebut.
- **Ini desain UX, BUKAN schema/API/ADR/Spec/Dev Plan:**
  - **Data model tingkat tinggi** (dua tabel terpisah dan satu referensi Wallet opsional ke paling banyak satu entri) telah PM-approved pada 2026-10-21. Detail DDL/API/DTO/migrasi didefinisikan di Spec, architecture, dan Dev Plan T-011. Doc ini tetap fokus pada kontrak UX, bukan duplikasi kontrak teknis.
- **Yang TIDAK diubah:** keputusan 06-wallets C-1..C-32 tetap utuh; tidak ada route, nav, atau fitur baru di luar T-010/T-011; ini **bukan** integrasi/perpindahan dana bank; field ini **label-only**.

### 0.1. Vocabulary untuk fitur ini (string kanonik; kontennya sudah PM-approved 2026-10-21 untuk copy alur ini)

| Konsep | String kanonik (usulan) | Jangan pakai di UI |
| :--- | :--- | :--- |
| Field selector | **Bank atau penyedia** | Institution, Account/Routing number |
| Katalog publik | **Bank resmi (daftar publik OJK)** + keterangan "hanya bisa dilihat; user tidak bisa mengubah isinya" | OJK ID, registry, read-only (istilah teknis), exhaustive, sinkronisasi otomatis |
| Daftar personal | **Bank/penyedia pribadiku** | Custom list, internal |
| Tambah cepat | **Tambah bank atau penyedia** | Quick Add (istilah ini hanya di catatan implementasi/bukti) |
| Jalur tanpa bank | **Dompet manual / bank lain** | Unlinked, cash account |

## 1. Tujuan UX & ruang lingkup

**Tujuan user:** saat membuat dompet, user bisa mengidentifikasi di mana uangnya: memilih nama "bank atau penyedia" dari daftar, atau membuat dompet tanpa identitas bank (jalur manual). User yang banknya tidak ada di daftar tetap tidak menemui dead-end.

**Batas yang sengaja ditetapkan:**

1. **Label-only.** Tidak ada koneksi rekening, penarikan data, verifikasi, atau mutasi uang apa pun dari field ini. Nama yang dipilih hanya metadata dompet.
2. **Tanpa artefak identitas bank:** tidak ada logo bank, nomor kartu/rekening, kode routing, atau klaim keamanan; kartu dompet tetap ATM generik (doc 01 §5.6, doc 06 §4). Hanya **nama** yang dipakai.
3. **Tanpa klasifikasi custom baru** pada Quick Add maupun beranda/Tambah transaksi; field ini hanya hidup di sheet Buat dompet, form Ubah dompet, dan metadata detail dompet.
4. Pembuatan dompet, scope (C-16 default Pribadi; C-31 immutable), saldo awal (C-21), dan state lainnya tidak berubah karena adanya field ini.
5. **Katalog adalah data lokal read-only hasil seeder** (keputusan PM 2026-10-21): tidak ada job, tombol, atau UI sinkronisasi apa pun di produk; perubahan resmi hanya lewat perubahan data/seeder terkontrol.

## 2. Penempatan di sheet Buat dompet

Field ditambahkan di sheet Buat dompet (06-wallets §6.1), di antara `Nama` dan `Tujuan penggunaan` (opsional; kosong = jalur manual). Field lain (Nama, Tujuan penggunaan, Scope, Saldo awal, CTA `Buat dompet`) tidak berubah.

```
SHEET BUAT DOMPET (mobile bottom sheet / modal desktop, pola dialog doc 03 §5.1)
+--------------------------------------------------+
| Buat dompet                              [ X ]   |
|                                                  |
| NAMA *            [ mis. Dompet Keluarga  ]      |
| BANK ATAU PENYEDIA (opsional)                    |
| [ Pilih bank atau penyedia               >  ]    |
| helper: Bisa dilewati. Dompet tanpa bank tetap   |
| bisa dibuat (Dompet manual / bank lain).         |
| TUJUAN PENGGUNAAN [ mis. Tabungan ]              |
| SCOPE *           [ Pribadi ] [ Bersama ]        |
|                   (C-31: pilihan sekali-jalan)   |
| SALDO AWAL (opsional)  Rp0                       |
|                                                  |
| [ Buat dompet ]  (CTA primer hijau, doc 01 §5.1) |
+--------------------------------------------------+
```

- Field opsional: tidak ada validasi wajib bank; yang wajib tetap `Nama` dan `Scope`.
- Setelah dompet dibuat dengan bank terpilih, entri itu tampil sebagai **metadata dompet** di sheet detail (§5).

## 3. Picker bank (dua grup + jalur manual)

Tap field `Bank atau penyedia` membuka picker (bottom sheet mobile / modal desktop). Picker ini adalah sheet kedua di atas sheet Buat dompet (bukan sheet dompet), jadi aturan "satu sheet dompet" C-32 tidak berubah; perilaku tutup/fokus mengikuti pola dialog yang sama dengan picker dompet (06 §7.1): Escape menutup tanpa mengubah field, fokus kembali ke field pemicu.

```
+--------------------------------------------------+
| Pilih bank atau penyedia                  [ X ]  |
|                                                  |
| CARI BANK ATAU PENYEDIA                          |
| [ 🔍 Cari nama bank/penyedia...          ]       |
| (memfilter kedua grup di bawah; filter terhadap  |
|  daftar yang dikembalikan ke user saat ini)      |
|                                                  |
| BANK RESMI (daftar publik OJK)                   |
| "Hanya bisa dilihat; user tidak bisa mengubah    |
|  isinya. Bukan daftar lengkap."                  |
| (B) BCA                                          |
| (B) BRI                                          |
| (B) Bank Mandiri                                 |
| (B) BNI                                          |
| (B) BSI                                          |
| (B) BTN                                          |
|                                                  |
| BANK/PENYEDIA PRIBADIKU                          |
| "Tersimpan di daftar pribadimu; tidak menjadi    |
|  pilihan bagi user lain."                        |
| (P) Bank Pasar Loka (contoh)                     |
|                                                  |
| [ + Tambah bank atau penyedia ]                  |
| [ Dompet manual / bank lain ]                    |
+--------------------------------------------------+
```

- **Grup 1 "Bank resmi (daftar publik OJK)":** read-only bagi user (tidak bisa ditambah/ubah/dihapus dari UI). Cakupan resmi (keputusan PM 2026-10-21): **Bank Umum dan Bank Umum Syariah dari daftar publik OJK**, diisi via **seeder** dengan daftar resmi yang diverifikasi saat implementasi. Katalog di database adalah **snapshot lokal dari seeder**: pilihan label pada wallet mengacu ke row katalog lokal, dan **nama bank tidak diperbarui otomatis dari OJK**; **no runtime external synchronization**, tidak ada job atau UI sinkronisasi; perubahan resmi hanya lewat perubahan data/seeder terkontrol. **Keterangan "Bukan daftar lengkap" tetap tampil sampai isi seeder diverifikasi saat implementasi.** Enam nama di atas (BCA, BRI, Bank Mandiri, BNI, BSI, BTN) di wireframe HANYA nama representatif contoh, BUKAN isi katalog rilis. Sumber untuk seed awal: workbook/file publik daftar penyelenggara OJK (format `.xlsx`, belum di-parse saat doc ini ditulis). Tanpa logo bank.
- **Grup 2 "Bank/penyedia pribadiku":** entri di grup ini tetap milik user; daftar pilihan pribadi **tidak pernah muncul sebagai pilihan bagi user lain** (privasi §6). Baris memakai mark "P", bukan logo. Pengelolaan grup ini (arsip dan pulihkan entri pribadi) ada di §4a: toggle tampilan `Aktif`/`Arsip` + aksi baris berlabel, di sheet yang sama.
- **Jalur `Dompet manual / bank lain` tetap utuh:** memilih artinya **mengosongkan** identitas bank (dompet dibuat tanpa metadata bank); bukan memilih nama palsu. Jalur ini wajib tampil agar tidak ada dead-end.
- Pembanding nama dilakukan terhadap katalog resmi ATAU daftar pribadi user sendiri; **kedua daftar ini bisa membesar karena berisi entri milik user maupun katalog resmi yang bisa memuat banyak nama**, jadi picker **wajib menyediakan satu kotak pencarian** (`Cari bank atau penyedia...`) di atas kedua grup. Search ini adalah **persyaratan UX** (usulan desain): ia memfilter daftarkatalog yang dikembalikan kepada user saat itu; pencarian belum tersedia di implementasi saat ini, sehingga memfilter di sisi API atau sisi client, responsivitas live saat mengetik, dan sumber data katalog adalah **keputusan teknis yang akan diputuskan di Spec/Dev Plan**, bukan bagian dari dokumen desain ini. State "Tidak ada yang cocok" tetap meninggalkan tombol `+ Tambah bank atau penyedia` dan `Dompet manual / bank lain` terlihat, jadi tidak ada dead-end (pola no-match §4).
- Pilihan terpilih ditandai status terpilih (icon + teks) mengikuti pola picker dompet; visually double-coded (status terpilih ditampilkan sebagai indikator karena warna saja tidak cukup, doc 01 §6).
- Keyboard: listbox semantik per grup, navigasi Arrow atas/bawah, Enter/Space memilih, Escape menutup (pola 06 §14).

## 4. Tambah bank atau penyedia (jalur Quick Add, seluruh state)

Sheet `Tambah bank atau penyedia` dibuka dari picker dengan pola dialog yang sama (satu dialog aktif; Escape menutup; fokus kembali ke tombol `Tambah bank atau penyedia` di picker saat sheet ini ditutup, sukses maupun batal).

| State | Perilaku |
| :--- | :--- |
| **Form** | Satu input `Nama bank atau penyedia` (teks, maksimum 80 karakter, pola panjang A-20). Helper: "Entri ini tersimpan di daftar pribadimu dan tidak menjadi pilihan bagi user lain." CTA `Simpan` (primer) + `Batal`. |
| **Duplikat (nama tercantum, katalog resmi ATAU grup pribadi)** | CTA `Simpan` dirender **dinonaktifkan**; error inline tampil **di luar tombol**: "Nama ini sudah ada. Pilih dari daftar resmi/pribadi, atau gunakan nama lain." Perbandingan nama **dinormalisasi**: trim, collapse whitespace, dan tidak peka huruf besar-kecil (keputusan PM 2026-10-21), jadi user tidak bisa membuat entri kembar. **Routing duplikat:** nama yang cocok entri resmi mengarahkan user ke pilihan resmi; nama yang cocok entri pribadi memakai kembali entri yang sudah ada (bila entri lama diarsip, lihat baris Arsip/re-add). Bila nama cocok entri resmi DAN pribadi sekaligus (atas nama yang sama), grup resmi yang dituntun dulu. Teks tombol non-aktif tetap wajib terbaca (kontras 4.5:1; bucket evidence mengukurnya di pasangan warna "ink-2 di tint Pribadi"). |
| **No-match (nama tidak sesuai daftar apa pun)** | Tidak ada penghalang: helper "Belum ada di daftar resmi. Kamu masih bisa menambahkannya sebagai entri pribadi." Bisa disimpan ke daftar Pribadi tanpa langkah baru; **TIDAK pernah otomatis menulis ke katalog resmi** dan tidak ada klaim pengajuan resmi. |
| **Sukses** | Sheet Tambah menutup, kembali ke picker: entri baru **langsung terpilih di grup Pribadi** dengan status terpilih; helper: "Entri yang kamu tambahkan baru saja terpilih di daftar pribadimu." User bisa langsung melanjutkan konfirmasi ke sheet Buat dompet; nilai field bank terisi nama baru. Tanpa toast tambahan (entri terpilih sudah terlihat di grup Pribadi). |
| **Batal** | Sheet Tambah menutup tanpa entri baru; fokus kembali ke tombol `Tambah bank atau penyedia` di picker; field bank pada form Buat dompet kembali seperti sebelumnya. Tanpa perubahan lain pada form. |
| **Pembatalan pembuatan dompet** | Entri Quick Add yang sudah tersimpan **tetap ada di daftar pribadi user** walau user membatalkan pembuatan Wallet setelahnya atau menutup sheet Buat dompet secara apa pun (keputusan PM 2026-10-21). Daftar pribadi tidak melekat pada dompet; tidak ada penghapusan otomatis entri begitu alur dompet ditutup. |
| **Gagal (error server/validasi)** | Sheet tetap terbuka, error inline awam, tanpa jejak teknis (kode status, stack). Retry manual mengikuti pola umum. |

- **Arsip & re-add daftar custom (keputusan PM 2026-10-21; affordance UI baru di §4a, keputusan PM 2026-10-22):** daftar pribadi bersifat **arsip non-destruktif**. Entri pribadi yang diarsip tidak lagi tampil di grup "Bank/penyedia pribadiku" sebagai pilihan default, tapi dompet yang masih mereferensikan entri diarsip **tetap menampilkan labelnya**. Menambah ulang nama yang dinormalisasi sama dengan entri diarsip **mengaktifkan kembali entri itu**, bukan membuat kembaran. Tempat user menjalankan arsip dan pulihkan dijelaskan di §4a.
- Tanpa auto-submit: buat dompet tetap perlu konfirmasi CTA `Buat dompet` (pola review doc 03).
- Dinamika state layar mengikuti pola C-32 yang tetap berlaku HANYA untuk sheet dompet (picker dompet vs sheet Buat dompet); sheet picker bank adalah lapisan berbeda dan boleh berada di atas sheet Buat dompet sebagai satu konteks alur yang sama.

## 4a. Mengelola daftar pribadimu: tampilan Aktif dan Arsip (arsip + pulihkan, tanpa route baru; keputusan PM 2026-10-22)

**Tujuan user:** user yang pernah menambah bank/penyedia sendiri kadang ingin merapikan daftar pribadinya, misalnya entri yang diketik salah ejaan atau sudah tidak dipakai. Aturan arsip non-destruktif (§4) sudah disetujui, tapi sebelum revisi ini belum ada tempat di UI yang membuat user bisa mengarsip dan memulihkannya. Revisi ini menambahkan affordance manajemen itu **di dalam sheet Picker bank yang sudah ada (§3)**, tanpa route, nav, atau halaman baru.

### 4a.1 Penempatan dan struktur (di dalam picker, bukan tempat lain)

- Pengelolaan daftar pribadi hidup **di dalam sheet Picker bank** (§3), tepat di grup `Bank/penyedia pribadiku`. Tidak ada route baru, tidak ada nav baru, tidak ada sheet "pengaturan" global baru, dan tidak ada UI pengelolaan apa pun di katalog resmi (katalog resmi seperti semula hanya bisa dilihat; §3).
- Di kepala grup pribadi ada **toggle tampilan dua posisi: `Aktif` dan `Arsip`** (pola `tabrow` Aktif/Arsip yang sudah ada di Kelola dompet, 06 §7). Default `Aktif`. Katalog resmi TIDAK punya toggle ini dan tidak ikut berubah.
- Toggle ini hanya mengganti **isi grup pribadi pada sheet yang sama** (daftar aktif vs daftar arsip); ia tidak menutup sheet, tidak mengubah nilai field `Bank atau penyedia`, dan tidak memicu penyimpanan apapun.
- Rekomendasi desain: cukup dua posisi (`Aktif` dan `Arsip`); jangan menambah tab, lapisan, atau statistik lain di v1 (hindari over-design).

```
SHEET PICKER BANK (potongan grup pribadi, bukan layout utuh; §3 tetap acuan penuh)
+--------------------------------------------------+
| Pilih bank atau penyedia                  [ X ]  |
| ... (pencarian + BANK RESMI daftar publik OJK)   |
|                                                  |
| BANK/PENYEDIA PRIBADIKU                          |
| [ Aktif ]  [ Arsip ]      (toggle tampilan grup) |
| helper: Entri diarsip tidak dihapus: label bank  |
| pada dompet yang sudah memakainya tetap tampil.  |
|                                                  |
| (P) Bank Pasar Loka (contoh)      [ Arsipkan ]   |
|                                                  |
| [ + Tambah bank atau penyedia ]                  |
| [ Dompet manual / bank lain ]                    |
+--------------------------------------------------+
```

### 4a.2 Aksi `Arsipkan` pada baris custom aktif (dua langkah, berlabel)

- Setiap baris custom **aktif** di grup pribadi punya aksi teks berlabel `Arsipkan` (pola aksi daftar Kelola dompet). Warnanya mengikuti token status destruktif (`danger`) **tetapi selalu ditemani label teks**: tidak pernah ada ikon hapus/arsip tanpa label, ikon apa pun berdampingan dengan teks dan berperan dekoratif saja.
- `Arsipkan` adalah aksi dua langkah. Langkah pertama tidak langsung menerapkan: tampil **konfirmasi inline kontekstual** di dalam grup yang sama (bukan mengganti layar) berisi help text pencegah salah paham, lalu tombol `Batal` dan `Arsipkan`. Help text kanonik: "Bank/penyedia ini akan disembunyikan dari daftar pilihan berikutnya. Label bank pada dompet yang sudah memakainya tetap tampil. Kamu bisa memulihkannya kapan saja di tab Arsip." Konfirmasi menegaskan ini **bukan hapus permanen**.
- Setelah konfirmasi `Arsipkan` diterapkan: baris pindah ke tampilan `Arsip`, grup `Aktif` kembali kosong atau memuat sisa barisnya, tampil status ringan berlabel (icon + teks): "Bank Pasar Loka (contoh) diarsipkan. Lihat tab Arsip untuk memulihkan." Tidak ada hapus dompet, tidak ada perubahan metadata dompet yang memakainya.

```
SHEET PICKER BANK · GROUP PRIBADI, KONFIRMASI INLINE (potongan)
+--------------------------------------------------+
| BANK/PENYEDIA PRIBADIKU   [ Aktif ]  [ Arsip ]   |
|                                                  |
| (P) Bank Pasar Loka (contoh)      [ Arsipkan ]   |
| +----------------------------------------------+ |
| | Arsipkan "Bank Pasar Loka (contoh)"?         | |
| | Entri disembunyikan dari daftar pilihan      | |
| | berikutnya. Label bank pada dompet yang      | |
| | sudah memakainya tetap tampil. Bukan hapus   | |
| | permanen; bisa dipulihkan di tab Arsip.      | |
| |                    [ Batal ]  [ Arsipkan ]   | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

### 4a.3 Tampilan `Arsip` dan aksi `Pulihkan` (tersedia tanpa sharing global)

- Tampilan `Arsip` memuat **entri pribadi milik user sendiri** yang diarsip. Setiap baris menampilkan: nama, chip status berlabel "Diarsipkan" (icon + teks + warna, bukan warna saja, doc 01 §6), dan aksi teks berlabel `Pulihkan` (hijau, tone tindakan positif). Baris arsip tetap milik user: **tidak pernah tampil bagi user lain** dan tidak pernah masuk daftar pilihan user lain (privasi §6).
- `Pulihkan` mengaktifkan kembali entri itu (satu langkah, tanpa konfirmasi tambahan: tidak destruktif dan tidak menghilangkan data apa pun dari pandangan; risiko salah target rendah). Entri kembali tampil di daftar `Aktif` dan kembali jadi pilihan yang bisa dipilih di picker **untuk user itu sendiri**; tidak otomatis mengisi field bank di form dompet yang sedang terbuka, dan tidak memicu sharing ke user lain.
- Setelah `Pulihkan` diterapkan: toggle kembali menunjuk `Aktif` (user melihat hasilnya langsung), entri terlihat di daftar aktif dengan status ringan berlabel "Bank Pasar Loka (contoh) dipulihkan. Entri kini tersedia kembali di daftar pilihanmu."
- **State kosong tampilan `Arsip`:** teks ramah: "Belum ada entri di Arsip. Entri yang kamu arsipkan lewat tombol Arsipkan tampil di sini." Tanpa CTA yang tidak berlaku (tidak ada tombol Arsipkan di state kosong ini).

```
SHEET PICKER BANK · GRUP PRIBADI, TAMPILAN ARSIP (potongan)
+--------------------------------------------------+
| BANK/PENYEDIA PRIBADIKU   [ Aktif ]  [ Arsip* ]  |
| * posisi aktif toggle: Arsip                     |
|                                                  |
| ~~~~~~~~~ (posisi Daftar arsip) ~~~~~~~~~        |
| (P) Bank Pasar Loka (contoh)                     |
|     chip: Diarsipkan · diarsipkan 21 Okt (contoh)|
|                                 [ Pulihkan ]     |
|                                                  |
| helper: Entri di Arsip tidak lagi muncul di      |
| daftar pilihan, tapi label bank pada dompet yang |
| sudah memakainya tetap tampil.                   |
|                                                  |
| [ + Tambah bank atau penyedia ]                  |
| [ Dompet manual / bank lain ]                    |
+--------------------------------------------------+
```

```
SHEET PICKER BANK · HASIL PULIHKAN (potongan; state berikutnya)
+--------------------------------------------------+
| BANK/PENYEDIA PRIBADIKU   [ Aktif* ]  [ Arsip ]  |
| * kembali ke Aktif                               |
|                                                  |
| ✓ Bank Pasar Loka (contoh) dipulihkan            |
|   Entri kini tersedia kembali di daftar pilihan. |
| (P) Bank Pasar Loka (contoh)      [ Arsipkan ]   |
|                                                  |
| (catatan: status ringan memakai icon + teks;      |
|  baris pulih tidak otomatis memilih/mengisi      |
|  field bank; user masih memilih sendiri)         |
+--------------------------------------------------+
```

- **Re-add tetap konsisten:** menambah ulang nama yang dinormalisasi sama dengan entri diarsip tetap mengaktifkan kembali entri lama (§4 baris Arsip/re-add), bukan membuat kembaran. Tampilan Arsip adalah tempat masuk kedua selain jalur re-add.
- **Ruang lingkup v1:** tanpa hapus permanen, tanpa ubah nama entri, tanpa klasifikasi (aturan yang sama dengan §4). Jika suatu saat PM menginginkan hapus/perubahan nama, itu keputusan produk baru, bukan bagian doc ini.
- **Hak akses:** hanya pemilik daftar pribadi yang melihat grup ini dan menjalankan arsip/pulihkan. Arsip/pulihkan tidak punya varian "untuk semua anggota" di dompet Bersama, karena daftar pribadi itu sendiri tidak pernah tampil bagi anggota lain. Anggota lain tetap hanya melihat labelnya sebagai metadata dompet (§5).

### 4a.4 Keyboard, fokus, dan target sentuh (wajib, mengikuti doc 01)

- Toggle `Aktif`/`Arsip` berperan tablist semantik: navigasi panah kiri/kanan antar tab, Enter/Space menjalankan, Escape tetap menutup sheet picker tanpa mengubah apapun (pola dialog §3).
- Grup pribadi tetap bagian daftar pilihan; baris custom menyertakan dua fokus stop (baris pilih dan tombol `Arsipkan`/`Pulihkan`), dengan urutan Tab yang tetap (nama terbaca sebelum aksi; aksi tidak pernah tampil sebagai satu-satunya konten baris tanpa nama).
- Semua kontrol sentuh minimum 44px, target 48px untuk CTA dalam konfirmasi (doc 01 §6); label `Arsipkan`/`Pulihkan` teks sebenarnya (bukan title-only), kontras 4.5:1 per R-25.
- `prefers-reduced-motion: reduce` mematikan transisi toggle dan animasi state status (pola doc 03 §5.2); tampilan langsung pindah.
- Setelah konfirmasi atau pulih, **fokus kembali ke baris entri** yang terdampar (bukan ikut di-pindah ke awal daftar), supaya user tidak kehilangan konteks; perilaku ini mengikuti kontrak fokus dialog §3.

## 5. Setelah dompet dibuat: label tampil sebagai metadata sesuai hak akses

- **Sheet Detail dompet** (doc 06) menambah satu baris metadata `Bank atau penyedia: <nama>`. Metadata ini terlihat oleh **anggota yang berhak melihat dompet itu**: dompet **Bersama** (semua anggota household approved, C-2) dan dompet **Pribadi** (pemiliknya). Ini lebih ketat: **fitur ini tidak menambahkan hak akses baru** dan tidak mengurangi hak existing; label adalah metadata biasa di bawah aturan visibilitas dompet yang sudah ada (C-2/C-4; aktivitas lintas scope memakai label generik sesuai 06 §8 termasuk untuk metadata dompet Pribadi).
- **Daftar pribadi pembuat TIDAK diekspor sebagai daftar:** menambahkan entri pribadi oleh user A tidak membuat entri itu jadi pilihan yang dapat dipilih oleh user B. Anggota lain hanya melihat **nama bank yang dipilih pada dompet Bersama yang berhak mereka lihat**, bukan daftar pribadi pembuat.
- Kartu ATM dompet TIDAK menggambar logo bank ATAU nomor karena field ini (§1 batas 2); ikon "B"/"P" pada picker adalah mark abstrak fungsi grup, bukan identitas bank.
- **Form Ubah dompet (06 §6.2) menambah field `Bank atau penyedia` sebagai field opsional (keputusan PM 2026-10-21):**
  - Anggota yang boleh mengubah dompet dapat **mempertahankan label saat ini** (tidak menyentuh field), **mengosongkannya** (kembali jalur manual), **memilih dari katalog resmi**, atau **memilih entri custom miliknya sendiri** lewat Quick Add di picker yang sama.
  - Hak edit mengikuti izin edit dompet existing, tanpa hak akses baru: dompet **Pribadi** hanya pemilik; dompet **Bersama** anggota APPROVED yang sesuai izin edit Wallet Bersama (C-2/C-4; keputusan PM 2026-10-21).
  - **Editor tidak dapat melihat daftar pribadi anggota lain** dan tidak bisa mereferensi entri pribadi anggota lain; pilihannya hanya katalog resmi plus entri pribadinya sendiri. Label lama yang dipilih anggota lain tetap tampil nilainya, tapi hanya bisa dipertahankan/dikosongkan/diganti oleh editor yang punya entri itu di daftarnya sendiri atau memilih katalog resmi (privasi §6).
  - **Tidak ada perubahan wallet scope** (C-31): anggota yang tidak punya izin edit tidak melihat field ini aktif di Ubah dompet, sama seperti pengeditan field lain.
  - Sheet Detail dompet tetap menampilkan label sebagai metadata (baris pertama §5).

## 6. Privasi & batasan lintas fitur (contoh kasus dan garisnya)

| Aturan | Perilaku |
| :--- | :--- |
| Daftar pribadi tetap privat | Entri pribadi user A tidak tampil di grup "pribadi" milik user B dan tidak di UI mana pun bagi user B; analog: nama dompet Pribadi anggota lain yang tidak pernah muncul (C-2/C-10, 06 §8). Filtering payload adalah amanat server, bukan di doc ini. |
| Entri pada dompet Bersama | Nama bank yang dipilih tampil di metadata Detail dompet bagi anggota approved yang berhak melihat dompet itu, termasuk bagi anggota yang bergabung setelahnya (metadata dompet mengikuti visibilitas dompet, bukan aturan tampilan historis terpisah). |
| Duplikat tidak membocorkan kepemilikan | Pesan duplikat generik dan tidak menyebut detail entri milik user lain (pola C-19); tidak ada pun daftar katalog pribadi yang tampil. |
| Entri bukan berarti resmi | Entri pribadi tidak boleh tampil sebagai pilihan katalog resmi, di UI anggota keluarga lain di luar metadata dompet, atau diberi label "terdaftar OJK" ATAU semacamnya. |
| Edit label di Ubah dompet | Editor (Pribadi: pemilik; Bersama: anggota APPROVED dengan izin edit Wallet Bersama) hanya bisa memilih dari katalog resmi atau entri pribadinya sendiri; daftar pribadi anggota lain tidak pernah tampil sebagai pilihan maupun rujukan bagi editor (keputusan PM 2026-10-21). |
| Quick Add tetap tersimpan | Entri yang ditambah lewat Quick Add milik penambahnya sendiri, walau pembuatan dompet yang memicunya dibatalkan; tidak ada pemindahan kepemilikan atau pembersihan otomatis (keputusan PM 2026-10-21). |
| Klaim sumber | Label sumber "daftar publik OJK" di UI hanya keterangan sumber, selalu lokal (snapshot seeder) dan tanpa klaim sinkronisasi otomatis; keterangan "bukan daftar lengkap" tetap tampil sampai isi seeder diverifikasi saat implementasi. |

## 7. Open questions tersisa (teknis saja; keputusan desain/PM sudah ditutup 2026-10-21)

Pertanyaan PM desain lama sudah dijawab dan dipindah ke daftar accepted (§8): isi katalog (seeder Bank Umum + Bank Umum Syariah, no auto-sync), field bank editable di Ubah dompet, duplikat ternormalisasi, re-add entri diarsip, persistensi Quick Add, dan hak edit Wallet Bersama. Yang tersisa hanyalah keputusan teknis dan verifikasi, bukan keputusan UX:

1. **Verifikasi isi seeder (Dev, saat implementasi):** import/parse workbook publik daftar OJK terbaru (Bank Umum + Bank Umum Syariah, format `.xlsx`, belum di-parse saat doc ini ditulis) dan **pilih field baris sumber** yang dipakai sebagai nama bank di katalog. Sampai itu diverifikasi, UI tetap menampilkan keterangan "Bukan daftar lengkap". Prosedur update seeder berikutnya tidak ditetapkan di doc ini; arti "no-sync" di sini: seeder hanya **initial atau update manual terkontrol**, tanpa auto-refresh dari sumber resmi. Jika prosedur update pasti belum diketahui, doc ini tidak mengarangnya.
2. **Data model teknis, API, dan migrasi (Spec/Dev Plan/architecture):** DDL, DTO, endpoint, dan constraint final atas konsep yang sudah disetujui tingkat tinggi: **dua tabel** (katalog resmi read-only + daftar personal per user) plus **satu referensi Wallet opsional ke tepat satu entri** (dompet manual = tanpa referensi). Kontrak final milik Spec/Dev Plan/architecture, untuk review Developer/PM.
3. **Kebijakan referensi data saat update:** bagaimana wallet menyimpan referensi (ID row katalog lokal vs snapshot) diputuskan di Spec/Dev Plan; secara UX, label mengikuti row katalog lokal dan tidak ada runtime external sync.
4. **Ambang chip status budget** (Aman/Mendekati limit/Lewat limit, penemuan audit R-13) masih menunggu PM; dicatat di doc 02 dan tidak diputuskan oleh doc ini.
5. **Presisi agregat** (pembulatan/presisi angka agregat) adalah area teknis terpisah, **out of scope** untuk doc ini; tidak berubah oleh doc ini.

## 8. Ringkasan keputusan (accepted vs open)

**Accepted (keputusan PM terkonfirmasi 2026-10-21, ditambah arah user 2026-10-20, dicatat kanonik di doc ini):**
- **Penempatan PRD:** extension ke **F6 (Dompet)**; tidak ada fitur PRD baru.
- Field `Bank atau penyedia` label-only, opsional, di sheet Buat dompet DAN di form Ubah dompet (opsional; bisa dipertahankan/dikosongkan/diganti).
- Picker dua grup: "Bank resmi (daftar publik OJK)" read-only dan "Bank/penyedia pribadiku" milik user.
- Katalog resmi = **Bank Umum + Bank Umum Syariah dari daftar OJK**, diisi via **seeder** yang diverifikasi saat implementasi; **snapshot lokal, no runtime external synchronization**; perubahan resmi hanya lewat perubahan data/seeder terkontrol.
- Tambah cepat menyimpan ke **daftar pribadi user saja**, tanpa global sharing; entri **tetap tersimpan walau pembuatan Wallet dibatalkan**.
- Daftar custom: **arsip non-destruktif**; re-add nama ternormalisasi sama mengaktifkan kembali entri; label dompet ke entri diarsip tetap tampil. **Affordance UI arsip (keputusan PM 2026-10-22):** toggle tampilan `Aktif`/`Arsip` di dalam picker bank (§4a), aksi baris `Arsipkan` (dua langkah, berlabel, konfirmasi inline) dan `Pulihkan` (berlabel, satu langkah); tanpa route/nav baru; pulihkan tersedia tanpa sharing global.
- Duplikat ternormalisasi (trim, collapse whitespace, case-insensitive): duplikat resmi mengarah ke pilihan resmi; duplikat pribadi memakai kembali entri yang ada.
- Jalur `Dompet manual / bank lain` tetap utuh sebagai jalur tanpa identitas bank.
- Seluruh state Tambah: form, duplikat (Simpan non-aktif + error di luar tombol), no-match, sukses (entri baru terpilih di grup Pribadi), error, batal.
- Edit/update label di Ubah dompet memakai hak akses existing: Pribadi owner-only; Bersama anggota APPROVED sesuai izin edit Wallet Bersama; editor memilih katalog resmi atau custom miliknya sendiri, **tidak bisa melihat atau mereferensi daftar pribadi anggota lain**; tanpa perubahan wallet scope.
- Entri terpilih tampil sebagai metadata dompet pada detail, sesuai hak akses (Bersama: anggota approved; Pribadi: pemilik).
- Daftar pribadi tetap privat; tidak ada logo/nomor/klaim; sitasi OJK selalu lokal dan ditemani keterangan "bukan daftar lengkap" sampai seeder diverifikasi.

**Open (teknis saja; bukan keputusan UX/PM desain):**
- §7.1 (verifikasi isi seeder), §7.2/§7.3 (bentuk data model, API, migrasi, referensi data, milik Spec/Dev Plan/architecture), §7.5 (presisi agregat, area terpisah), §7.4 (ambang chip status budget, dicatat di doc 02).
- Desain UX di doc ini **PM-approved per 2026-10-21**; schema/API/implemented app **belum** diratifikasi dan belum diimplementasi.

---

## 9. Catatan developer handoff (peran UX saja)

- Pola komponen dari existing: sheet pattern (bottom sheet mobile / modal desktop), input dengan inline error, disabled CTA yang tetap terbaca; tanpa library baru; tanpa carousel/drag-and-drop. Untuk §4a: toggle `Aktif`/`Arsip` memakai pola `tabrow` Aktif/Arsip yang sudah ada di `WalletManageSheet` (06-wallets §7), tidak ada widget atau tab baru; Dev menyambungkannya ke endpoint archive/restore yang sudah ada di Spec T-011.
- Widget baru yang diusulkan (colocation, AGENTS.md §3): `BankPickerSheet` sebagai dukungan form Buat dompet, **bukan** pengganti `WalletPickerSheet`; penamaan file final menunggu kontrak waktu implementasi.
- Semua kontrol interaktif minimum 44px (target 48px untuk CTA primer mobile); fokus terlihat; `prefers-reduced-motion: reduce` mengganti transisi sheet dengan tampilan statik (pola doc 03 §5.2).
- Idempotency-Key di POST mutasi baru (menunggu data model; aturannya mengikuti pola namespace existing).
- Semua angka di wireframe adalah contoh berlabel `(contoh)`; tanpa nomor rekening/kartu di mana pun.
