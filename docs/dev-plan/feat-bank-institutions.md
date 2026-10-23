# Dev Plan: Katalog Bank Resmi & Quick Add Institusi Pribadi

Detail teknis implementasi. Dokumen ini **Approved by PM (2026-10-21)** untuk T-011. Implementation handoff dibuka; ini bukan release approval.

**Status:** `PM-accepted / Done with QA Pass With Risks (2026-10-22)` · **Tanggal:** 2026-10-20 · **Revisi:** 2026-10-22 · **Ticket:** T-011 (ticket internal; tanpa key Jira)
**Engineer:** Developer · **Estimasi:** ditetapkan Developer saat implementasi.

## PM Approval

- **Status:** `Approved` by PM, 2026-10-21.
- **Sudah tersedia:** Spec `docs/spec/feat-bank-institutions.md` (Spec Ready / PM-approved 2026-10-21), amendment arsitektur A-52 sampai A-59 (Accepted by PM 2026-10-21), desain kanonik `docs/design/07-bank-institutions.md` (PM-approved 2026-10-21), dan penempatan PRD sebagai extension F6.
- **Keputusan produk:** Q1 sampai Q9 sudah dijawab PM pada 2026-10-21. Tidak ada pertanyaan produk yang tersisa.
- **Yang masih diperlukan:** tidak ada gate DDD yang belum disetujui untuk memulai implementasi T-011. Hasil parsing/validasi workbook dan detail operasional seed harus dicatat Developer saat implementasi.
- **Implementasi:** Selesai sesuai scope. QA independen memberi `PASS WITH RISKS` dan PM menerima T-011 sebagai Done pada 2026-10-22. Bukti dan residual tercatat di §Implementation Evidence dan `docs/qa/t011-bank-institutions-qa-report.md`.
- **Rilis:** PM task acceptance bukan release approval. T-008 tetap menjadi release gate; tidak ada deployment/Neon validation yang diklaim.

## Tujuan dan Latar Belakang

Wallet existing tidak memiliki atribut institusi. Pengguna perlu menandai wallet dengan bank atau penyedia yang sesuai, tetapi tetap dapat membuat wallet manual. Sebagian bank/penyedia yang dipakai pengguna juga belum tentu ada di daftar resmi, sehingga diperlukan jalur Quick Add yang tidak mengubah katalog bersama.

Fitur ini memisahkan dua daftar: katalog bank resmi yang global dan read-only, serta daftar entri pribadi per user. Wallet hanya menyimpan referensi opsional ke salah satunya. Tujuannya adalah memberi pilihan yang jelas tanpa mengorbankan privasi, tanpa mengklaim integrasi bank, dan tanpa memaksa wallet lama berubah.

## Scope

**In scope (PM-approved 2026-10-21):**

- Katalog bank resmi dari daftar OJK, read-only bagi user, dengan sumber, versi seed, dan tanggal sumber.
- Seeder statis dan versioned untuk katalog resmi. Perubahan hanya lewat update seed/data terkontrol.
- Daftar entri institusi pribadi per user untuk Quick Add.
- Pencarian dan pemilihan institusi pada form Buat/Edit dompet.
- Jalur manual tanpa institusi yang selalu tersedia.
- Referensi opsional wallet ke satu institusi resmi atau satu entri pribadi.
- Label institusi pada detail/kartu wallet, termasuk label pada wallet Bersama bagi anggota yang berhak.
- Otorisasi server-side, arsip entri pribadi, dan kompatibilitas wallet existing.
- Pengelolaan data katalog di luar runtime aplikasi lewat seed terkontrol.

**Out of scope (PM-approved 2026-10-21):**

- Integrasi, verifikasi, atau sinkronisasi bank.
- Sinkronisasi runtime, external, atau otomatis ke OJK.
- Nomor rekening, logo, nomor kartu, saldo bank, atau kredensial.
- Admin UI katalog dan katalog komunitas bersama.
- Lebih dari satu institusi per wallet.
- Klasifikasi jenis bank pada Quick Add.
- Rename/hard delete entri pribadi pada v1.
- Perubahan pada transaksi, budget, goal, OCR, dashboard, advisor, atau saldo.
- Perubahan strategi presisi agregat uang (proposal arsitektur terpisah).

## Referensi

- Spec: `docs/spec/feat-bank-institutions.md` (Spec Ready / PM-approved 2026-10-21).
- PRD: extension ke F6 (Dompet) di `docs/PRD.md` (PM-approved 2026-10-21). Tidak ada fitur PRD baru.
- Wallet existing: `docs/spec/feat-wallets.md` (Spec Ready) dan `docs/dev-plan/feat-wallets.md` (Approved). Keduanya tidak diubah; fitur ini hanya menambah field/relasi opsional.
- Arsitektur: `docs/architecture-decisions.md` amendment A-52 sampai A-59 (Accepted by PM 2026-10-21). A-36 sampai A-51 tetap accepted dan tidak diubah. Detail endpoint, kolom, constraint, DTO, dan error code adalah implementation contract di dokumen ini.
- Kontrak existing: `lib/server/contracts/wallets.ts`, `types/api.ts`, `prisma/schema.prisma`.
- Desain kanonik: `docs/design/07-bank-institutions.md` (PM-approved 2026-10-21). Aturan kartu wallet tetap di `docs/design/06-wallets.md`; doc 06 tidak diubah oleh fitur ini.
- Evidence visual: `docs/design/audit-2026-10-visual-refresh/README.md` §7l.1 dan §7m, serta `mockup-catalog-money-flows.html` bagian D/D2. Folder ini evidence-only.
- Sumber katalog resmi: https://ojk.go.id/id/kanal/perbankan/data-dan-statistik/Pages/Daftar-Alamat-Kantor-Pusat-Bank-Umum-Dan-Syariah.aspx
- ADR terkait: ADR-001 (Prisma/Neon), ADR-005 (soft delete/archive), ADR-006 (layer).
- ERD: `docs/erd/erd-database-schema.md` perlu amendment saat implementasi setelah Dev Plan disetujui. Belum diubah.
- QA: test plan dan matriks verifikasi dimiliki QA. **Dev Plan ini tidak memuat QA test plan.**
- Ticket: T-011 (internal, tanpa Jira key).

## Ringkasan Teknis

Fitur ini menambahkan katalog bank resmi global yang read-only dan daftar institusi pribadi per user, lalu menghubungkan wallet ke paling banyak satu institusi. Arah tingkat tinggi sudah disetujui PM 2026-10-21: dua tabel terpisah, referensi XOR, manual tanpa referensi, tanpa classification field, dan katalog berupa seed statis versioned tanpa sinkronisasi otomatis. Nama tabel, nama kolom, tipe, index, dan constraint di bawah adalah **implementation contract** yang menunggu review Dev Plan, bukan keputusan produk baru.

Perubahan bersifat **additive**: dua tabel baru, dua kolom nullable pada `wallet`, satu CHECK constraint, satu partial unique index, dan perluasan DTO/kontrak wallet. Tidak ada backfill untuk wallet existing; wallet lama tetap manual.

Prinsip implementasi:

- **Dua scope daftar yang terpisah:** katalog resmi global dan entri pribadi per user. Tidak ada endpoint yang mencampur daftar pribadi user lain.
- **Server-side enforcement:** `userId` selalu dari session. Filter kepemilikan ada di repository/service, bukan hanya UI.
- **Label-only:** tidak ada rekening, logo, nomor kartu, saldo bank, verifikasi, atau integrasi bank.
- **Fail closed:** pilihan institusi baru yang tidak valid, nonaktif, atau bukan milik aktor ditolak; label existing yang dipertahankan atau dihapus tidak memerlukan pemilihan ulang.
- **Kompatibilitas:** field institusi opsional pada create/update. Client lama yang tidak mengirim field pada create menghasilkan wallet manual; pada update label tidak berubah.

Layer terdampak: Prisma schema + migration, repository, service, route handler, kontrak Zod, `types/api.ts`, dan komponen wallet. Tidak ada perubahan pada transaksi, budget, goal, OCR, dashboard, advisor, atau perhitungan saldo.

## Alur Bisnis

### 1. Membuat wallet dengan bank resmi

1. Pengguna APPROVED membuka form Buat dompet.
2. Pengguna membuka pemilih institusi dan mencari bank resmi.
3. Pengguna memilih bank. Nama wallet tetap diisi terpisah dan tidak berubah otomatis.
4. Pengguna menyimpan wallet. Wallet merujuk bank resmi.
5. Detail dan kartu wallet menampilkan label bank. Wallet Bersama menampilkan label itu kepada anggota yang berhak melihat wallet.

### 2. Quick Add bank/penyedia pribadi

1. Pencarian tidak menemukan bank/penyedia yang dimaksud.
2. Pengguna membuka Quick Add, mengisi satu nama (maksimal 80 karakter), lalu menyimpan.
3. Entri disimpan segera di daftar pribadi user dan langsung tersedia/terpilih. Entri tidak bergantung pada wallet yang sedang dibuat.
4. Pengguna menyelesaikan pembuatan wallet. Wallet dapat merujuk entri pribadi tersebut.
5. Bila pengguna membatalkan pembuatan wallet atau menutup sheet, entri tetap tersimpan di daftar pribadi dan dapat dipakai pada pembukaan form berikutnya.
6. Entri tidak masuk katalog resmi dan tidak terlihat oleh user lain.

### 3. Wallet manual

1. Pengguna tidak memilih institusi, atau memilih jalur "Dompet manual / bank lain".
2. Wallet disimpan tanpa referensi institusi.
3. Wallet lama juga tetap manual dan tidak di-backfill.
4. Manual adalah keadaan valid, bukan error atau state sementara.

### 4. Wallet Bersama dengan label pribadi

1. Salah satu anggota memilih entri pribadinya untuk wallet Bersama.
2. Anggota APPROVED lain yang dapat melihat wallet melihat label sebagai metadata.
3. Anggota lain tidak dapat membuka daftar pribadi pemilik entri dan tidak menerima ID pribadi tersebut.
4. Saat mengedit, anggota APPROVED yang boleh mengedit detail wallet dapat mempertahankan atau menghapus label, memilih bank resmi, atau memilih entri pribadinya sendiri.
5. Editor tidak dapat mengenumerasi atau memakai entri pribadi anggota lain. Label milik anggota lain hanya dapat dipertahankan atau dihapus, bukan dipilih ulang sebagai entri baru.

### 5. Arsip entri pribadi

1. Pemilik mengarsipkan entri lewat aksi baris `Arsipkan` di picker bank (design 07 §4a): dua langkah dengan konfirmasi inline, bukan hard delete.
2. Entri hilang dari daftar aktif dan picker, lalu tampil di tampilan `Arsip` pada grup pribadi yang sama.
3. Wallet yang sudah merujuk entri tetap menampilkan label.
4. Pemilik dapat memulihkan lewat aksi baris `Pulihkan`; restore tidak otomatis memilih/mengisi field bank.
5. Bila pemilik menambahkan nama yang sama lagi, entri arsip yang cocok diaktifkan kembali, bukan membuat baris aktif kedua.
6. Restore ditolak bila nama ternormalisasi entri arsip sekarang sama dengan bank resmi yang aktif; UI menawarkan bank resmi tersebut.
7. Tidak ada route/nav/halaman baru; toggle `Aktif`/`Arsip` hidup di picker yang sudah ada.

### 6. Update katalog resmi

1. Developer/operator menyiapkan file resmi OJK terbaru dan memverifikasi isinya saat implementasi.
2. Developer memperbarui seed statis yang versioned di luar runtime aplikasi.
3. Baris baru/berubah di-upsert; baris yang tidak ada lagi dinonaktifkan, bukan dihapus.
4. Sumber, periode sumber (`YYYY-MM`), URL/file hash, dan versi seed dicatat.
5. Tidak ada sinkronisasi runtime, external, atau otomatis, dan tidak ada admin UI.
6. Perubahan katalog hanya terjadi lewat update seed/data terkontrol.

## Alur Teknis

### A. Daftar institusi

```
GET /api/institutions?q=...
  -> auth session + membership APPROVED
  -> Zod query (q optional, trim, max 80)
  -> InstitutionService.list(actor, q)
       -> InstitutionRepository.listOfficialActive(q)
       -> InstitutionRepository.listCustomByUser(actor.userId, "active")
       -> InstitutionRepository.listCustomByUser(actor.userId, "archived")
  -> InstitutionListDTO { official, custom, archivedCustom }
```

- Query resmi, pribadi aktif, dan pribadi arsip dijalankan terpisah, lalu digabung di service.
- `custom` difilter `user_id = actor.userId` dan `archived_at IS NULL`; `archivedCustom` difilter `user_id = actor.userId` dan `archived_at IS NOT NULL`.
- Kedua daftar pribadi memakai session `userId`; UI hanya menampilkan toggle `Aktif`/`Arsip` (design 07 §4a).
- Tidak ada parameter `userId` dari client.
- Bila katalog resmi kosong, response tetap sukses dengan `official: []`; UI menampilkan empty state.

### B. Quick Add

```
POST /api/institutions/custom
  -> auth + APPROVED
  -> Idempotency-Key (mengikuti A-11)
  -> Zod { name }
  -> normalize(name): NFKC, trim, collapse whitespace, case-fold
  -> cek bank resmi aktif dengan normalized_name sama
       -> ada: 409 INSTITUTION_ALREADY_EXISTS (existing.kind = OFFICIAL)
  -> cek entri pribadi aktif dengan normalized_name sama
       -> ada: 409 INSTITUTION_ALREADY_EXISTS (existing.kind = CUSTOM)
  -> cek entri pribadi arsip dengan normalized_name sama (keputusan PM 2026-10-21)
       -> ada: reaktivasi baris arsip (archived_at = null), kembalikan DTO dengan 200
       -> tidak ada: insert baris baru, kembalikan 201
  -> tangani race unique index (P2002/23505) dengan re-read dan arahkan ke entri existing
  -> 201/200 UserCustomInstitutionDTO
```

- Quick Add tidak membuat wallet. Penyimpanan entri terpisah dari penyimpanan wallet.
- Entri tetap ada meskipun pembuatan wallet kemudian dibatalkan (keputusan PM 2026-10-21).
- Untuk duplikat entri pribadi aktif, response memuat entri milik aktor dan UI memilih entri itu; tidak ada baris baru.
- Untuk duplikat bank resmi, response mengarahkan ke katalog resmi; tidak ada entri pribadi baru.
- Tidak ada field kategori pada payload.
- Nama maksimal 80 karakter. Normalisasi dijalankan server-side setelah validasi panjang.

### C. Membuat wallet dengan institusi

```
POST /api/wallets
  -> auth + APPROVED
  -> Idempotency-Key (existing)
  -> Zod createWalletSchema + institution? (discriminated union)
  -> InstitutionService.resolveForWalletWrite(actor, householdId, institution)
       - undefined: manual (both null)
       - NONE: manual (both null)
       - OFFICIAL: cari bank aktif
       - CUSTOM: cari entri milik actor, aktif
  -> WalletService.create(actor, input + resolved refs)
  -> WalletRepository.create(...)
  -> WalletDTO dengan institution
```

### D. Mengubah wallet

```
PATCH /api/wallets/{id}
  -> auth + existing wallet permission
  -> Zod updateWalletSchema + institution? (strict)
  -> institution undefined: label tidak berubah
  -> institution NONE: kedua kolom menjadi null
  -> institution OFFICIAL/CUSTOM: set satu kolom, kosongkan kolom lainnya
  -> update wallet
  -> WalletDTO
```

- Perubahan label tidak boleh mengubah `scope`, saldo awal, status arsip, atau visibilitas riwayat.
- Untuk wallet Pribadi, hanya pemilik. Untuk wallet Bersama, anggota APPROVED yang boleh mengedit detail wallet mengikuti C-4 dan keputusan PM 2026-10-21.
- Bila aktor bukan pemilik entri pribadi yang sedang terpasang, aktor boleh mempertahankan atau menghapus label, tetapi tidak menerima daftar pribadi pemilik dan tidak dapat memilih entri pribadi orang lain.
- `institution` adalah field metadata opsional. Omit berarti label tidak berubah; `NONE` berarti label dihapus; `OFFICIAL` atau `CUSTOM` mengganti label dan mengosongkan referensi lain.
- Scope tetap immutable. Tidak ada perubahan pada aturan arsip wallet, opening balance, atau saldo.

### E. Membaca wallet

```
GET /api/wallets atau GET /api/wallets/{id}
  -> existing visibility A-38
  -> include officialInstitution dan customInstitution
  -> WalletService.toDTO(actor, wallet)
       - institution null bila manual
       - kind OFFICIAL: id + name
       - kind CUSTOM dan actor = pemilik entri: id + name
       - kind CUSTOM dan actor bukan pemilik: id = null, name tetap label wallet
```

- Join label wallet **tidak** memfilter `archived_at` atau `is_active`, sehingga label wallet lama tetap tampil setelah entri diarsipkan atau bank dinonaktifkan.
- Daftar/pencarian yang memfilter aktif hanya ada di `GET /api/institutions`, bukan di pembacaan wallet.
- Label pada wallet Bersama adalah metadata wallet. Tidak ada endpoint untuk membaca daftar pribadi anggota lain.
- Jangan pernah mengirim `user_id` pemilik entri pribadi ke aktor lain.

### F. Arsip/restore entri pribadi

```
POST /api/institutions/custom/{id}/archive
POST /api/institutions/custom/{id}/restore
  -> auth + APPROVED
  -> findCustomByIdForUser(actor.userId, id)
       -> tidak ada / milik orang lain: 404 NOT_FOUND
  -> archive: set archived_at
  -> restore: cek findOfficialByNormalized(normalized_name)
       -> ada bank resmi AKTIF: 409 INSTITUTION_ALREADY_EXISTS dengan existing OFFICIAL
       -> tidak ada: clear archived_at
  -> 200 UserCustomInstitutionDTO
```

- Tidak ada hard delete.
- Wallet yang merujuk entri tidak diubah saat entri diarsipkan.
- Restore hanya untuk pemilik. Re-add dengan nama sama memakai ulang entri arsip (keputusan PM 2026-10-21).
- Restore tidak boleh menghasilkan entri pribadi aktif yang menduplikasi nama bank resmi aktif. Error hanya membawa baris katalog publik, tidak pernah daftar/pemilik pribadi user lain.
- UI archive/restore ada di `BankPickerSheet`: toggle `Aktif`/`Arsip`, aksi `Arsipkan` dua langkah dengan konfirmasi inline, aksi `Pulihkan`, status ringan, fokus kembali ke baris, dan target sentuh minimum 44px.

### G. Otorisasi dan izin edit

| Aksi | Aturan |
|---|---|
| Baca katalog resmi | Session APPROVED. Read-only. |
| Tulis katalog resmi | Tidak ada route aplikasi. Hanya seed/data terkontrol. |
| List/create/archive/restore entri pribadi | Pemilik, `userId` dari session. |
| List entri pribadi user lain | Tidak pernah. Tidak ada endpoint, join, atau count. |
| Baca label pada wallet | Mengikuti A-38. Reader wallet yang berhak melihat label sebagai metadata. |
| Edit label wallet Pribadi | Hanya pemilik. |
| Edit label wallet Bersama | Anggota APPROVED yang boleh mengedit detail wallet (C-4). Boleh preserve/clear label, pilih bank resmi, atau pilih entri pribadinya sendiri. Tidak boleh mengenumerasi atau memakai entri pribadi anggota lain. |
| Pilih entri custom saat create/update | Entri harus aktif dan `user_id = actor.userId`. |
| ID custom di DTO | Hanya untuk pemilik entri. Non-pemilik menerima `id = null` dan nama label. |
| ID custom milik user lain | 404 generik. Tidak mengonfirmasi keberadaan. |
| Scope wallet | Immutable. Perubahan label tidak boleh mengubah scope, saldo, arsip, atau visibilitas riwayat. |

- `userId` tidak pernah diterima dari client untuk operasi daftar pribadi.
- Filter kepemilikan ada di query repository, bukan hanya pengecekan setelah fetch.
- Label wallet Bersama adalah metadata wallet, bukan izin membaca daftar pribadi atau entri pribadi.

## Schema Database

> Arah tingkat tinggi disetujui PM 2026-10-21: dua tabel terpisah, referensi wallet XOR, manual tanpa referensi, dan tanpa classification field. Nama tabel/kolom, tipe, index, dan constraint di bawah adalah **implementation contract** yang menunggu review Dev Plan. Schema existing tidak diubah pada dokumen ini.

### Tabel baru: `bank_institution`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| display_name | varchar(160) | NOT NULL | Nama bank resmi yang ditampilkan. |
| normalized_name | varchar(160) | NOT NULL, UNIQUE | Untuk pencarian dan pencegahan duplikat. |
| source | varchar(40) | NOT NULL, default `OJK_OFFICE_LIST` | Penanda sumber. |
| source_url | varchar(500) | NOT NULL | URL halaman sumber. |
| source_period | varchar(7) | NOT NULL, CHECK `YYYY-MM` | Periode publikasi sumber (seed: `2026-06`). Tidak ada hari yang dikarang; import timestamp ada di `created_at`/`updated_at`. |
| source_ref | varchar(255) | nullable | Referensi sheet/baris atau stable identifier untuk audit dan pencocokan seed. |
| is_active | boolean | NOT NULL, default true | Bank yang tidak ada lagi di file resmi dinonaktifkan, bukan dihapus. |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

Constraint/index:

- `UNIQUE(normalized_name)` untuk mencegah dua baris katalog dengan nama ternormalisasi sama. Bila file resmi memuat tabrakan, seed harus berhenti dan meminta keputusan operator, bukan memilih salah satu diam-diam.
- `INDEX(is_active, normalized_name)` untuk pencarian katalog aktif.
- Tidak ada `household_id`. Katalog bersifat global.
- Tidak ada kolom logo, rekening, nomor kartu, atau kategori bank pada v1.
- Tidak ada hard delete. Penghapusan dari file resmi berarti `is_active = false`.

### Tabel baru: `user_custom_institution`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK -> user, NOT NULL, ON DELETE RESTRICT | Pemilik entri. |
| display_name | varchar(80) | NOT NULL | Nama yang diinput pengguna, sudah di-trim. Batas 80 karakter disetujui PM 2026-10-21. |
| normalized_name | varchar(80) | NOT NULL | Hasil normalisasi server. |
| archived_at | timestamptz | nullable | null = aktif; arsip non-destruktif. |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

Constraint/index (raw SQL):

```sql
CREATE UNIQUE INDEX user_custom_institution_active_name_uq
  ON user_custom_institution (user_id, normalized_name)
  WHERE archived_at IS NULL;

CREATE INDEX user_custom_institution_list_idx
  ON user_custom_institution (user_id, archived_at, normalized_name);
```

- `@@unique([userId, normalizedName])` di Prisma **tidak dipakai** karena akan memblokir penambahan ulang setelah arsip. Partial unique index adalah constraint yang benar untuk aturan "satu entri aktif per nama ternormalisasi per user".
- Tidak ada field kategori/jenis bank. Quick Add hanya satu nama.
- Tidak ada hard delete. Arsip memakai `archived_at`. Re-add nama ternormalisasi sama mengaktifkan kembali entri arsip (keputusan PM 2026-10-21).
- Normalisasi dilakukan server-side saat create/re-add: NFKC, trim, collapse whitespace, case-fold. Nilai yang disimpan adalah hasil normalisasi yang sama dengan yang dipakai untuk pencarian.
- Tidak ada rename pada v1 (keputusan PM 2026-10-21).
- Kepemilikan entri tidak dijamin oleh FK ke wallet. Service wajib memeriksa `user_id = actor.userId` saat memilih entri.

### Perubahan tabel: `wallet`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| official_institution_id | uuid | FK -> bank_institution, nullable, ON DELETE RESTRICT | Diisi bila wallet memakai bank resmi. |
| custom_institution_id | uuid | FK -> user_custom_institution, nullable, ON DELETE RESTRICT | Diisi bila wallet memakai entri pribadi. |

Constraint (raw SQL):

```sql
ALTER TABLE wallet
  ADD CONSTRAINT wallet_institution_at_most_one
  CHECK (official_institution_id IS NULL OR custom_institution_id IS NULL);
```

- Manual = kedua kolom `NULL`.
- Tidak ada kolom `institution_name` terpisah pada v1. Label dibaca dari relasi.
- Tidak ada backfill. Semua wallet existing menjadi manual secara otomatis karena kedua kolom null.
- Tidak ada index pencarian "wallet by institution" pada v1 karena belum ada kebutuhan produk. Index dapat ditambahkan bila muncul filter tersebut.
- `custom_institution_id` dapat merujuk entri milik anggota household yang berbeda dari pembuat wallet. Ini disengaja untuk wallet Bersama, dan keamanannya ditegakkan di service saat pemilihan, bukan oleh FK.
- Label resmi mengikuti nama row katalog lokal terbaru. Tidak ada external live sync; perubahan nama katalog hanya lewat update seed/data terkontrol. Label pribadi stabil karena tidak ada rename pada v1.

### Migrasi

1. **Additive:** buat `bank_institution`, `user_custom_institution`, tambahkan dua kolom nullable ke `wallet`, tambahkan FK, CHECK, partial unique index, dan index pencarian.
2. **Tanpa backfill:** jangan menyentuh baris wallet existing. Jangan membuat institusi default.
3. **Seed katalog terpisah:** jalankan seed statis versioned setelah migrasi, di luar migration transaksi. Seed repeatable berdasarkan `normalized_name` atau stable identifier.
4. **Verifikasi:** jumlah wallet tidak berubah; semua wallet existing memiliki kedua kolom null; tidak ada transaksi yang berubah; constraint XOR dan partial unique aktif.
5. **Rollback:** karena additive, kolom/tabel baru dapat di-drop bila belum ada data produksi. Bila sudah ada referensi, lakukan perbaikan forward, bukan hard delete.

## Seed Katalog

- Seed adalah alat operasional, bukan route aplikasi dan bukan admin UI. Tidak ada sinkronisasi runtime, external, atau otomatis ke OJK.
- Input: file resmi OJK terbaru yang diunduh dan diverifikasi saat implementasi. File tidak boleh dibaca dari mockup.
- Seed bersifat statis dan versioned. Versi seed, URL/file hash, dan `source_period` (`YYYY-MM`) dicatat agar dataset reproducible dan audit-able. Tanggal import operasional tidak dipakai sebagai tanggal publikasi.
- Proses:
  1. Baca dan validasi struktur workbook. Parsing dan pemilihan field nama adalah tugas developer saat implementasi.
  2. Normalisasi nama.
  3. Upsert berdasarkan `normalized_name`, atau berdasarkan stable identifier bila file resmi menyediakannya.
  4. Set `source`, `source_url`, `source_period`, `source_ref`, dan versi seed.
  5. Nonaktifkan baris yang tidak ada lagi di file.
  6. Laporkan jumlah insert, update, deactivate, dan konflik.
- Tidak ada delete baris. Bank yang dinonaktifkan tetap dapat ditampilkan pada wallet lama.
- Seed harus repeatable dan dapat dijalankan ulang tanpa membuat duplikat.
- Konflik nama dalam file resmi harus gagal dengan laporan, bukan memilih baris secara acak.
- Cakupan seed: Bank Umum dan Bank Umum Syariah. Non-bank provider dan institusi yang tidak terdaftar tidak diisi ke katalog resmi; keduanya masuk lewat Quick Add atau jalur manual.
- Update berikutnya hanya lewat perubahan seed/data terkontrol. Tidak ada jadwal sync dan tidak ada auto-refresh.
- Verifikasi isi seed terhadap file resmi adalah implementation work, bukan keputusan produk yang tertunda.

## Interface & Contract

### Repository Interface (`lib/server/repositories/`)

`InstitutionRepository`:

- `listOfficialActive(query?: string): BankInstitutionRecord[]`
- `findOfficialById(id: string): BankInstitutionRecord | null`
- `findOfficialByNormalized(normalized: string): BankInstitutionRecord | null`
- `listCustomByUser(userId: string, view: "active" | "archived"): UserCustomInstitutionRecord[]`
- `findCustomByIdForUser(userId: string, id: string): UserCustomInstitutionRecord | null`
- `findCustomByNormalized(userId: string, normalized: string, view: "active" | "archived"): UserCustomInstitutionRecord | null`
- `createCustom(userId: string, data: { displayName: string; normalizedName: string }): UserCustomInstitutionRecord`
- `reactivateCustom(userId: string, id: string): UserCustomInstitutionRecord`
- `setCustomArchived(userId: string, id: string, archived: boolean): UserCustomInstitutionRecord`

`WalletRepository` (perubahan):

- `create(actor, data & { officialInstitutionId?: string | null; customInstitutionId?: string | null })`
- `update(actor, id, patch & { officialInstitutionId?: string | null; customInstitutionId?: string | null })`
- `findById(actor, id)` dan `list(actor, view)` menyertakan relasi institusi untuk DTO.
- Tidak ada perubahan pada `balances`, `lockForOpeningBalance`, `ensureMigratedDefault`, atau query transaksi.

Catatan:

- Semua method custom menerima `userId` dari service, yang berasal dari session.
- Predikat `userId` harus ada di query, bukan hanya pengecekan setelah fetch.
- `findCustomByIdForUser` mengembalikan null untuk ID milik user lain agar route dapat memberi 404 generik.

### Service Interface (`lib/server/services/`)

`InstitutionService`:

- `list(actor, query?): InstitutionListDTO`
- `quickAdd(actor, name): UserCustomInstitutionDTO`
- `setArchived(actor, id, archived): UserCustomInstitutionDTO`
- `resolveForWalletWrite(actor, householdId, selection?): { officialInstitutionId: string | null; customInstitutionId: string | null }`
- `toWalletInstitutionDTO(actor, wallet): WalletInstitutionDTO | null`

`WalletService` (perubahan):

- `create(actor, input, idempotencyKey?)` menerima `institution?` dan memakai `resolveForWalletWrite`.
- `update(actor, id, patch)` menerima `institution?` dengan semantik omitted/NONE/OFFICIAL/CUSTOM.
- `list`/`get` memakai `toWalletInstitutionDTO` agar ID pribadi tidak bocor.
- Tidak ada perubahan pada aturan `scope` immutable, opening balance lock, archive/restore, atau saldo.

Aturan resolusi:

- `undefined` pada create/update = manual (create) atau tidak berubah (update).
- `NONE` = kedua kolom null.
- `OFFICIAL` = `official_institution_id` diisi, `custom_institution_id` null.
- `CUSTOM` = `custom_institution_id` diisi, `official_institution_id` null.
- Tidak ada keadaan dua kolom terisi. Service juga memeriksa ulang setelah update.

### HTTP Contract

#### Endpoint Delta: route baru

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/institutions` | GET | APPROVED | `?q=` opsional, trim, max 80 | `200 { official: BankInstitutionDTO[], custom: UserCustomInstitutionDTO[], archivedCustom: UserCustomInstitutionDTO[] }` |
| `/api/institutions/custom` | POST | APPROVED | `{ name }` + `Idempotency-Key` | `201 UserCustomInstitutionDTO` untuk baris baru; `200 UserCustomInstitutionDTO` untuk reaktivasi arsip; `409 INSTITUTION_ALREADY_EXISTS` untuk duplikat aktif |
| `/api/institutions/custom/{id}/archive` | POST | APPROVED + pemilik entri | - | `200 UserCustomInstitutionDTO` |
| `/api/institutions/custom/{id}/restore` | POST | APPROVED + pemilik entri | - | `200 UserCustomInstitutionDTO`; `409 INSTITUTION_ALREADY_EXISTS` bila nama kini sama dengan bank resmi aktif |

Catatan:

- `GET /api/institutions` tidak menerima `userId`. Daftar pribadi selalu milik session.
- Tidak ada route untuk menulis katalog resmi.
- `archive`/`restore` mengikuti keputusan PM 2026-10-21 (soft archive, tanpa hard delete). Kedua route ini adalah implementation contract dan dapat disederhanakan pada slice pertama hanya bila PM menyetujui perubahan scope.
- `Idempotency-Key` mengikuti pola POST mutation existing (A-11). Bila tidak diwajibkan, unique constraint tetap menjadi pengaman terakhir.

#### Endpoint Delta: route berubah

| Route | Method | Perubahan |
|---|---|---|
| `/api/wallets` | POST | Menerima `institution?`: `{ kind: "OFFICIAL" \| "CUSTOM", id }` atau `{ kind: "NONE" }`. Omitted/NONE = manual. |
| `/api/wallets` | GET | `WalletDTO`/`WalletCardDTO` menambah label institusi. Tidak ada perubahan filter/visibilitas. |
| `/api/wallets/{id}` | GET | `WalletDTO` menambah `institution`. |
| `/api/wallets/{id}` | PATCH | Menerima `institution?`; omitted = tidak berubah, `NONE` = hapus label, `OFFICIAL`/`CUSTOM` = ganti label dan kosongkan referensi lain. |

Tidak ada perubahan pada route transaksi, transfer, trash/restore, OCR, dashboard, budget, advisor, atau goal.

### Validasi Rules (Zod)

| Field | Rules | Pesan error (bahasa awam) |
|---|---|---|
| `name` (Quick Add) | required, trim, 1..80 | "Nama bank atau penyedia belum diisi." / "Nama bank atau penyedia maksimal 80 karakter." |
| `q` (daftar) | optional, trim, max 80 | "Kata pencarian terlalu panjang." |
| `institution.kind` | `OFFICIAL \| CUSTOM \| NONE` | "Pilih bank atau penyedia yang valid." |
| `institution.id` | UUID, required untuk OFFICIAL/CUSTOM | "Pilih bank atau penyedia." |
| `institution` (PATCH) | optional; `NONE` untuk menghapus; tidak boleh dua referensi | "Pilih satu bank atau penyedia." |
| `officialInstitutionId` (internal) | harus bank aktif | "Bank ini tidak tersedia. Pilih bank lain." |
| `customInstitutionId` (internal) | harus milik aktor dan aktif | "Bank atau penyedia ini tidak tersedia." |
| `name` (wallet) | aturan existing, tidak berubah | Aturan existing. |
| `scope` (wallet) | aturan existing, tidak berubah | Aturan existing. |

Catatan:

- Kontrak create/update memakai discriminated union `institution`, bukan dua field datar, agar keadaan dua referensi tidak dapat dikirim.
- `updateWalletSchema` sudah `.strict()`. Penambahan `institution` harus tetap menolak field tak dikenal.
- Normalisasi nama Quick Add dilakukan server-side setelah validasi panjang, sebelum pengecekan duplikat.
- Jangan mengandalkan validasi UI untuk duplikat, kepemilikan, atau status aktif.

### Error Codes

| Code | HTTP | Kapan | Catatan |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | Payload malformed, kind/id tidak lengkap, nama kosong/terlalu panjang | Reuse `unprocessable`/`fieldErrors`. |
| `INSTITUTION_UNAVAILABLE` | 422 | Bank resmi nonaktif atau entri pribadi sudah diarsipkan | Implementation contract, proposed. Field error pada `institution`. |
| `INSTITUTION_ALREADY_EXISTS` | 409 | Duplikat nama ternormalisasi dengan entri pribadi aktif atau bank resmi aktif, termasuk saat restore | Implementation contract, proposed. Body hanya memuat entri milik aktor atau katalog publik. |
| `NOT_FOUND` | 404 | Entri pribadi milik user lain, tidak ada, atau wallet tidak terlihat | Generik, tanpa existence leak. |
| `ACCESS_DENIED` | 403 | Mutasi wallet terlihat tanpa hak | Reuse existing. |
| `UNAUTHORIZED` | 401 | Session tidak valid | Reuse existing. |
| `ACCESS_PENDING` / `ACCESS_DECLINED` / `ACCESS_REVOKED` | 403 | Membership tidak APPROVED | Reuse existing. |

- Bila PM ingin meminimalkan code baru, `INSTITUTION_UNAVAILABLE` dapat diganti `VALIDATION_ERROR` dengan field error. Rekomendasi tetap code khusus agar UI dapat membedakan pilihan yang hilang dari input tidak valid.
- `INSTITUTION_ALREADY_EXISTS` sebaiknya mengembalikan `existing` hanya untuk entri milik aktor atau bank resmi. Jangan mengembalikan detail entri pribadi user lain.

### DTO

Usulan tipe (nama final mengikuti konvensi `types/api.ts`):

```ts
export type InstitutionKind = "OFFICIAL" | "CUSTOM";

export type BankInstitutionDTO = {
  id: string;
  name: string;
};

export type UserCustomInstitutionDTO = {
  id: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
};

export type InstitutionListDTO = {
  official: BankInstitutionDTO[];
  custom: UserCustomInstitutionDTO[];
  /** Additive: caller's own archived entries for the Aktif/Arsip view. */
  archivedCustom: UserCustomInstitutionDTO[];
};

export type WalletInstitutionDTO = {
  kind: InstitutionKind;
  id: string | null;
  name: string;
};
```

- `WalletDTO` menambah `institution: WalletInstitutionDTO | null`.
- `WalletCardDTO` menambah `institution: { kind: InstitutionKind; name: string } | null` atau memakai `WalletInstitutionDTO` dengan `id: null`. Pilih satu saat implementasi; jangan mengirim ID pribadi ke kartu.
- `id` pada `WalletInstitutionDTO` hanya diisi untuk bank resmi atau entri pribadi milik aktor. Untuk anggota lain pada wallet Bersama, `id = null` tetapi `name` tetap tampil.
- `UserCustomInstitutionDTO` tidak memuat `userId`. Pemilik sudah diketahui dari session.
- DTO existing tetap backward-compatible karena field baru bersifat additive.

## Async & Queue

Tidak ada async/worker untuk fitur ini. Seed katalog adalah langkah operasional di luar request. Tidak ada job baru, tidak ada queue baru, dan tidak ada sinkronisasi berkala.

## Dampak dan Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Detail schema/API belum disetujui | Implementasi bisa salah arah | Approval Dev Plan; implementation contract A-52 sampai A-59. |
| Duplikat nama hanya dicegah di UI | Data ganda dan UX membingungkan | Normalisasi server + partial unique index + penanganan race. |
| Partial unique index memblokir re-add setelah arsip | Tidak bisa menambah ulang | Index parsial `WHERE archived_at IS NULL`; re-add mengaktifkan entri arsip (keputusan PM 2026-10-21). |
| ID entri pribadi bocor ke anggota lain | Enumerasi/privasi | Filter `userId` di query; `id` null untuk non-pemilik; 404 generik. |
| Editor wallet Bersama memilih entri pribadi orang lain | Kebocoran daftar pribadi | Izin edit mengikuti C-4; pilihan custom dibatasi `user_id = actor.userId`; label orang lain hanya preserve/clear. |
| Form edit mengirim ulang label tanpa sengaja | Label pribadi orang lain terhapus atau validasi gagal | Field `institution` wajib omitted bila tidak diubah; `id = null` pada label pribadi non-pemilik tidak boleh dikirim balik. |
| Data OJK tidak lengkap/berubah | Katalog salah atau stale | Seed dari file resmi terbaru, simpan versi dan `source_period`, nonaktifkan bukan hapus, verifikasi manual saat implementasi. |
| Nama resmi sangat panjang | Label kartu terpotong | Nama lengkap di detail; desain menangani ellipsis; nilai uang tidak terpengaruh. |
| Nama resmi berbeda dari nama umum (mis. legal name vs singkatan) | Pengguna tidak menemukan bank yang biasa dipakai | Seed memakai nama resmi apa adanya; jangan mengarang alias dari mockup. Bila file resmi tidak memuat singkatan, keputusan alias/search synonym adalah data-quality decision terpisah. |
| Normalisasi Unicode tidak konsisten | Duplikat lolos | Satu helper normalisasi server, test batas, dan constraint DB. |
| Seed dan pemilihan berjalan bersamaan | Bank baru saja nonaktif masih terpilih | Validasi aktif saat write; dampak terbatas dan dapat diterima sampai update data berikutnya. |
| Katalog tumbuh besar atau pencarian substring | Response lambat / index tidak terpakai | Katalog resmi diperkirakan kecil; ukur saat seed. Tambah pagination/trigram index hanya bila terbukti perlu. |
| Client lama tidak mengirim field | Wallet tersimpan manual | Field opsional; omit = manual/unchanged. |
| Label resmi berubah karena update seed | Nama wallet terlihat berubah | Diterima karena wallet merujuk row katalog lokal; tidak ada external sync. Alternatif snapshot perlu keputusan ulang. |
| Custom entry milik anggota yang keluar household | Label tetap tampil di wallet Bersama | Label adalah metadata wallet; daftar tetap privat. Tidak ada efek pada wallet Pribadi. |
| Presisi agregat saldo wallet | Risiko lama, bukan fitur ini | Tidak diubah. Agregat DTO tetap JS `number`; nilai di atas `MAX_SAFE_INTEGER` dapat kehilangan presisi. Catatan existing di §7l.6 tetap berlaku; jangan diklaim selesai oleh fitur ini. Proposal presisi adalah follow-up terpisah. |

## Dependencies

- Spec `docs/spec/feat-bank-institutions.md` (Spec Ready / PM-approved 2026-10-21).
- Amendment arsitektur A-52 sampai A-59 (Accepted by PM 2026-10-21).
- Desain kanonik `docs/design/07-bank-institutions.md` (PM-approved 2026-10-21).
- File resmi OJK terbaru dan developer/ops yang menjalankan seed.
- Keputusan PM Q1 sampai Q9 sudah selesai (2026-10-21); tidak ada pertanyaan produk yang tersisa.
- Approval PM atas Dev Plan ini.
- QA test plan dan matriks verifikasi (QA-owned).
- Tidak ada dependency baru pada library. Tidak ada integrasi bank.

## Task Breakdown

> Semua item belum dikerjakan. Centang hanya setelah implementasi dan verifikasi engineering, bukan setelah dokumen ini dibuat.

### Database & Model

- [x] Tambah model `BankInstitution` sesuai §Schema Database (plus `seed_version` untuk provenance).
- [x] Tambah model `UserCustomInstitution` dengan `archived_at`.
- [x] Tambah dua kolom nullable dan relasi institusi pada `Wallet`.
- [x] Migration additive: tabel, kolom, FK, CHECK XOR, partial unique index, index pencarian.
- [x] Raw SQL untuk CHECK dan partial unique index (Prisma tidak dapat mengekspresikan keduanya langsung).
- [x] Verifikasi migrasi pada database kosong dan database berisi wallet existing; tidak ada backfill.
- [x] Siapkan fixture test untuk bank resmi, entri pribadi aktif/arsip, wallet manual, wallet resmi, wallet pribadi, dan wallet Bersama dengan label pribadi.

### Seed Katalog

- [x] Seeder statis dan versioned dari file resmi OJK (Bank Umum + Bank Umum Syariah).
- [x] Parsing workbook dan pemilihan field nama diverifikasi saat implementasi; hasil dicatat di §Implementation Evidence.
- [x] Normalisasi nama dan deteksi konflik.
- [x] Upsert, deactivate, dan laporan hasil.
- [x] Catat `source`, `source_url`, `source_period`, `source_ref`, dan versi seed.
- [x] Verifikasi manual terhadap file resmi terbaru; tidak memakai enam nama mockup sebagai daftar lengkap.
- [x] Dokumentasikan cara menjalankan, memperbarui, dan rollback seed.
- [x] Tidak menambahkan sync, cron, job refresh, atau route admin.

### Repository

- [x] `InstitutionRepository` untuk katalog resmi dan entri pribadi.
- [x] Query filter `userId` dan `archived_at` di repository.
- [x] `WalletRepository.create/update/findById/list` menyertakan relasi institusi.
- [x] Penanganan duplikat race (`P2002`/`23505`) dengan re-read.

### Service

- [x] `InstitutionService.list`, `quickAdd`, `setArchived`.
- [x] Helper normalisasi nama yang dipakai create/re-add/pencarian.
- [x] `InstitutionService.resolveForWalletWrite` dengan validasi aktif dan kepemilikan.
- [x] `WalletService.toDTO`/DTO builder yang men-null-kan ID pribadi untuk non-pemilik.
- [x] Integrasi `WalletService.create/update` tanpa mengubah aturan scope, opening balance, archive, atau saldo.
- [x] Error code baru di `lib/server/errors.ts` sesuai implementation contract yang disetujui di Dev Plan.

### HTTP

- [x] Zod schema `GET /api/institutions`, `POST /api/institutions/custom`, archive/restore.
- [x] Perluas `createWalletSchema` dan `updateWalletSchema` dengan `institution` discriminated union.
- [x] Route Handler `app/api/institutions` dan `app/api/institutions/custom`.
- [x] Update `app/api/wallets` dan `app/api/wallets/[id]`.
- [x] Pastikan `Idempotency-Key` diterapkan konsisten pada POST mutation.
- [x] Tidak ada route admin katalog dan tidak ada route sync.

### Frontend

- [x] Pemilih institusi di `WalletFormSheet`: dua grup, pencarian, selected, no-match, manual path, privacy statement, duplicate state. Copy/placement mengikuti `docs/design/07-bank-institutions.md`.
- [x] Quick Add sheet satu field, validasi 80 karakter, loading/error/success, fokus kembali ke pemicu.
- [x] Tampilkan label institusi di `WalletDetailSheet` dan kartu wallet sesuai desain.
- [x] Form edit: field institusi opsional; kirim `institution` hanya bila pengguna mengubah label. Label pribadi non-pemilik memiliki `id = null` dan tidak boleh dikirim balik.
- [x] Form edit wallet Bersama: preserve/clear label, pilih resmi, atau pilih entri sendiri. Jangan menampilkan daftar pribadi anggota lain.
- [x] Tampilkan label pada detail wallet Bersama tanpa mengekspos daftar pribadi.
- [x] State loading/empty/error/no-match/duplicate/submitting/success dan aksesibilitas keyboard/screen reader/390px.
- [x] Kelola daftar pribadi di `BankPickerSheet` (design 07 §4a): toggle `Aktif`/`Arsip`, baris `Arsipkan` dua langkah dengan konfirmasi inline, baris `Pulihkan`, chip `Diarsipkan`, status ringan, fokus kembali, target sentuh 44px. Tanpa hard delete dan tanpa memilih otomatis saat pulih.
- [x] Jangan menambahkan route atau item navigasi baru.
- [x] Jangan mengubah `docs/design/06-wallets.md`; doc 07 adalah acuan alur bank.

### Dokumentasi & Gate

- [x] Update Spec bila ada deviasi perilaku; minta approval PM sebelum implementasi berbeda. (Koreksi provenance 2026-10-22: `source_period` menggantikan `source_as_of`; Spec/PRD diperbarui.)
- [x] Update ERD/flowchart setelah Dev Plan disetujui (`docs/erd/erd-database-schema.md` §9, `docs/erd/flowcharts.md` §12).
- [x] Approval PM atas Dev Plan ini tercatat 2026-10-21.
- [ ] QA menyusun test plan terpisah sebelum QA execution; Dev Plan tidak memuat test plan.
- [x] Developer handoff melarang penggunaan contoh statis di `docs/design/audit-2026-10-visual-refresh/` sebagai data seed, fixture, atau copy produksi.

## Implementation Evidence (2026-10-21, updated 2026-10-22)

### Seed source yang diverifikasi

| Item | Nilai |
|---|---|
| Halaman resmi | `https://ojk.go.id/id/kanal/perbankan/data-dan-statistik/Pages/Daftar-Alamat-Kantor-Pusat-Bank-Umum-Dan-Syariah.aspx` |
| File | `Daftar Alamat Kantor Pusat Bank Umum Dan Syariah - Juni 2026.xlsx` |
| SHA-256 | `4e87b30794245952ecb982bb03cf9ccdb294ed1b08498ab3715621a313d63b50` |
| Worksheet | `Daftar Bank Umum`, kolom A:F, baris 1..110 |
| Baris bank bernama | **105** (4 Persero, 67 Swasta Nasional termasuk BUS yang dikelompokkan OJK di sini, 27 BPD, 7 Kantor Cabang Bank Luar Negeri) |
| Duplikat kode/nama ternormalisasi | **0** |
| Versi seed | `ojk-office-list-2026-06-v1` |
| `source_period` | `2026-06` |
| Catatan periode | File hanya menyebut bulan "Juni 2026". Provenance disimpan pada level bulan; tidak ada hari publikasi yang dikarang. Import timestamp operasional terpisah di `created_at`/`updated_at`. |
| Marker | Nomor catatan kaki OJK (`1)`, `11)`, dst.) dihapus dari nama; tidak ada alias, singkatan mockup, atau logo yang ditambahkan. |

Seed dijalankan dua kali pada database lokal: run pertama `inserted=105`, run kedua `inserted=0, updated=0, reactivated=0, unchanged=105, deactivated=0`. File data statis: `prisma/data/bank-institutions-ojk-2026-06.ts`. Parser reproduksi: `prisma/scripts/parse-ojk-workbook.ts`. Runner: `prisma/seed-bank-institutions.ts`.

### Implementasi

- Migration additive `20261021120000_bank_institutions` membuat `bank_institution`, `user_custom_institution`, dua kolom nullable `wallet`, FK, `wallet_institution_at_most_one`, partial unique active-name index, dan index pencarian.
- Migration lanjutan `20261022120000_institution_source_period` mengonversi `source_as_of` (DATE) menjadi `source_period` (VARCHAR(7)) memakai `to_char(..., 'YYYY-MM')`, menambah CHECK format, lalu menghapus kolom lama. Migrasi T-011 yang sudah applied tidak ditulis ulang; tidak ada drop/reset database.
- Verifikasi DB lokal: 105 baris katalog, 105 normalized unik, 105 aktif, seluruh `source_period = '2026-06'`, 0 wallet dengan referensi institusi segera setelah migrasi (tanpa backfill), partial index dan CHECK terpasang.
- API: `GET /api/institutions` (menambahkan `archivedCustom` additive), `POST /api/institutions/custom`, `POST /api/institutions/custom/{id}/archive`, `POST /api/institutions/custom/{id}/restore`; `POST/PATCH /api/wallets` menerima discriminated union `institution`.
- Restore kini menolak nama yang bertabrakan dengan bank resmi aktif (409 `INSTITUTION_ALREADY_EXISTS`, `existing.kind = OFFICIAL`) tanpa membocorkan daftar pribadi user lain.
- UI: `BankPickerSheet` (termasuk toggle `Aktif`/`Arsip`, `Arsipkan`, `Pulihkan`), `InstitutionQuickAddSheet`, field di `WalletFormSheet`, label di `WalletDetailSheet` dan `WalletCard`. Tidak ada route/nav baru.
- Dokumentasi: ERD §9 dan flowchart §12.

### Hasil verifikasi engineering (bukan QA sign-off)

| Perintah | Hasil |
|---|---|
| `bunx tsc --noEmit` | Pass, 0 error (setelah koreksi 2026-10-22). |
| `bun run test` | 40 file, **371 test pass** (setelah koreksi 2026-10-22). Termasuk test archive-list, restore-collision, seed source period, dan route `archivedCustom`. |
| `bunx vitest run -c vitest.integration.config.mts lib/server/services/institution.integration.test.ts` | **8 test pass pada database disposable** yang dimigrasikan dari nol dengan 5 migration dan di-seed 105 baris. Mencakup seed idempotency, `source_period = 2026-06`, deactivation, partial index, XOR CHECK, archive label, owner-only archived list, foreign/archived/inactive rejection, dan restore-collision. |
| `bun run test:integration` (full) | **7 file pass / 1 file gagal; 28 test pass / 1 gagal**. Satu-satunya kegagalan adalah harness T-008 lama `docs/qa/harness/t008-auth-lifecycle.integration.test.ts` yang memanggil `transaction.create` tanpa `walletId` (wajib sejak T-009). Bukan regresi T-011; T-011 integration file 8/8 pass. |
| `bunx eslint` pada file T-011 yang berubah | Pass, 0 error. `bunx eslint app components lib types prisma e2e` juga pass (0 error). Full `bun run lint` masih gagal pada **9 error pre-existing** di script evidence/QA harness (`require()`), bukan file T-011. |
| `bun run build` | Pass dengan `NODE_OPTIONS=--max-old-space-size=4096` dan worker build sementara `experimental.cpus=1` (config dikembalikan setelah build); `.next/BUILD_ID` dihasilkan dan route `/api/institutions*` ada di output. |
| `bunx playwright test e2e/bank-institutions.spec.ts --workers=1` | **6/6 pass** (mobile 390, tablet 768, desktop 1280): alur create/label/clear/QuickAdd-cancel dan alur archive → label wallet lama tetap → restore ke Aktif. Dijalankan terhadap production build (`next start`); `playwright.config.ts` dikembalikan ke dev setelah run. |

Status: implementasi selesai dan PM-accepted sebagai Done dengan QA `PASS WITH RISKS` pada 2026-10-22. Risiko yang diterima tetap tercatat dalam laporan QA. Tidak ada release approval; T-008 tetap release gate terpisah.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-20 | Dokumen DDD Draft dibuat: Spec, amendment arsitektur Proposed, dan Dev Plan Draft. | Tidak ada kode, schema, migrasi, API, fixture, atau seed yang diubah. Belum ada implementasi. |
| 2026-10-21 | Sinkronisasi dokumen dengan keputusan PM 2026-10-21. | Spec menjadi Spec Ready, A-52 sampai A-59 accepted, PRD F6 extension dicatat, ticket menjadi needs_review. Dev Plan tetap Draft / Waiting PM Approval. Tidak ada kode, schema, migrasi, API, seed, fixture, atau test yang diubah. |
| 2026-10-21 | Dev Plan disetujui PM dan T-011 masuk development. | Developer boleh memulai seeder OJK statis, tabel katalog resmi + custom pribadi, wallet reference, API, Quick Add, dan QA preparation sesuai scope. Belum ada hasil implementasi yang diklaim pada baris ini. |
| 2026-10-21 | Schema, migration additive, repository, service, seed, API, dan UI T-011 diimplementasikan. | Sumber seed diverifikasi dari workbook OJK Juni 2026 (SHA-256 `4e87b30...`, 105 baris unik). `seed_version` ditambahkan ke `bank_institution` untuk provenance. Tidak ada deviasi perilaku dari Spec; Spec tidak diubah. |
| 2026-10-21 | Test unit, route, seed, integrasi DB, dan E2E bank institution ditambahkan dan dijalankan. | `tsc` pass, unit 368 pass, integrasi T-011 7 pass, E2E 3/3 pass. Full integration suite tetap gagal hanya pada harness T-008 lama yang tidak mengirim `walletId`; full lint tetap gagal pada script evidence pre-existing. Belum ada QA sign-off. |
| 2026-10-21 | ERD dan flowchart diperbarui untuk DDL T-011. | `docs/erd/erd-database-schema.md` §9 dan `docs/erd/flowcharts.md` §12. Tidak ada perubahan pada `docs/spec/feat-wallets.md` atau `docs/dev-plan/feat-wallets.md`. |
| 2026-10-22 | QA correction round 1: arsip daftar pribadi punya jalur UI sesuai design 07 §4a. | `BankPickerSheet` menambahkan toggle `Aktif`/`Arsip`, `Arsipkan` dua langkah dengan konfirmasi inline, `Pulihkan`, status, fokus kembali, dan target sentuh 44px. `GET /api/institutions` menambahkan `archivedCustom` additive (owner-only). Tidak ada route/nav/halaman baru; tidak ada hard delete. |
| 2026-10-22 | QA correction round 1: restore tidak boleh menduplikasi bank resmi aktif. | `InstitutionService.setArchived(..., false)` memeriksa `findOfficialByNormalized` sebelum reaktivasi; hasilnya 409 `INSTITUTION_ALREADY_EXISTS` dengan `existing.kind = OFFICIAL` tanpa data pribadi user lain. Test service, route, dan integrasi ditambahkan. |
| 2026-10-22 | Koreksi provenance: `source_as_of` diganti `source_period` level bulan. | Migration baru `20261022120000_institution_source_period` mengonversi data existing dengan `to_char(..., 'YYYY-MM')`, bukan menulis ulang migration yang sudah applied. Seed memakai `2026-06`, report mencatat `importedAt` operasional; schema/DTO/repo/ERD/flowchart/Dev Plan/PRD/Spec diperbarui. Tidak ada reset/drop database. |
| 2026-10-22 | QA correction verification dijalankan pada DB disposable dan DB lokal yang sudah dimigrasikan. | Detail hasil ada di §Hasil verifikasi engineering. T-011 tetap `in_progress`; belum ada QA Passed atau release approval. |
| 2026-10-22 | Final correction verification: ARIA private-list cleanup, archived chip date, README sync, and full command rerun. | Private list memakai plain list dengan dua tab stop per baris + `aria-current` (bukan listbox); official list tetap listbox. Chip Arsip menampilkan tanggal arsip. Root `README.md` mencantumkan command/provenance seed. Hasil: tsc pass, unit 371/371, T-011 integration 8/8, full integration 28/29 (T-008 stale), E2E 6/6, build pass, targeted lint pass. T-011 tetap `in_progress`. |
| 2026-10-22 | QA independen retest dan PM task acceptance. | QA `PASS WITH RISKS`, tidak ada blocker. PM menerima T-011 sebagai Done dengan risiko tercatat di `docs/qa/t011-bank-institutions-qa-report.md`. T-008 tetap release gate; tidak ada deployment/release approval. |

## Keputusan Teknis

> Product decision yang berstatus **PM-approved 2026-10-21** sudah final. Entri berstatus **Implementation contract** adalah detail teknis yang menunggu review Dev Plan dan bukan keputusan produk PM.

| Tanggal | Keputusan | Status | Alasan | Update Spec/ADR? |
|---|---|---|---|---|
| 2026-10-20 | Dua scope daftar: katalog resmi global read-only dan entri pribadi per user | PM-approved 2026-10-21 | Mencegah katalog bersama tercemar entri pribadi | Spec; arch A-52 |
| 2026-10-21 | Katalog resmi hanya Bank Umum dan Bank Umum Syariah, diisi seed statis versioned | PM-approved 2026-10-21 | Cakupan resmi dan data yang dapat diaudit | Spec Q1; arch A-52/A-53/A-58 |
| 2026-10-21 | Tidak ada runtime, external, atau automatic synchronization ke OJK | PM-approved 2026-10-21 | Menghindari ketergantungan eksternal dan data tak terkontrol | Spec; arch A-52/A-58 |
| 2026-10-20 | Tabel `bank_institution` global dengan sumber dan tanggal sumber | Implementation contract | Katalog perlu audit trail dan read-only | Arch A-53 |
| 2026-10-20 | Tabel `user_custom_institution` dengan `user_id`, `display_name`, `normalized_name`, `archived_at` | Implementation contract | Daftar pribadi, arsip non-destruktif, pencarian/duplikat | Arch A-54 |
| 2026-10-20 | Partial unique index `(user_id, normalized_name) WHERE archived_at IS NULL` | Implementation contract | `@@unique` biasa memblokir re-add setelah arsip | Arch A-54 |
| 2026-10-20 | `wallet` memakai dua kolom nullable dengan CHECK at most one; manual = keduanya null | PM-approved arah; constraint implementation contract | Integritas referensi dan fallback manual | Arch A-55 |
| 2026-10-20 | Kontrak API memakai discriminated union `institution` (OFFICIAL/CUSTOM/NONE) | Implementation contract | Mencegah dua referensi terkirim dan membedakan omit vs clear | Arch A-57 |
| 2026-10-20 | `id` entri pribadi hanya dikirim ke pemilik; anggota lain hanya menerima label | PM-approved 2026-10-21 | Privasi daftar pribadi | Arch A-56 |
| 2026-10-21 | Quick Add disimpan sebelum wallet; batal wallet tidak membatalkan entri | PM-approved 2026-10-21 | Mencegah kehilangan input dan memisahkan entri dari wallet | Spec Q4 |
| 2026-10-21 | Izin edit institusi wallet Bersama mengikuti izin edit nama/tujuan, dengan pembatasan entri sendiri | PM-approved 2026-10-21 | Konsisten dengan aturan wallet existing | Spec Q5; arch A-56 |
| 2026-10-21 | Re-add nama pribadi yang sama mengaktifkan kembali entri arsip | PM-approved 2026-10-21 | Menghindari duplikat aktif dan mempertahankan referensi | Spec Q3 |
| 2026-10-21 | Label mengikuti row katalog lokal; entri pribadi tidak di-rename pada v1 | PM-approved 2026-10-21 | Tidak ada external sync; label pribadi stabil | Spec Q6 |
| 2026-10-21 | Seed katalog lewat proses operasional terkontrol, tanpa sync otomatis | PM-approved 2026-10-21 | Tidak ada API bank; kualitas data harus diverifikasi | Arch A-58 |
| 2026-10-20 | Tidak ada backfill wallet existing | Implementation contract | Semua wallet lama valid sebagai manual; menghindari tebakan bank | Arch A-58 |
| 2026-10-21 | Tidak ada field kategori pada Quick Add | PM-approved 2026-10-21 | Quick Add hanya satu nama | Spec AC-BI-4 |
| 2026-10-20 | Error `INSTITUTION_UNAVAILABLE` dan `INSTITUTION_ALREADY_EXISTS` | Implementation contract | UI perlu membedakan pilihan tidak tersedia vs duplikat | Arch A-57 |
| 2026-10-21 | `bank_institution.seed_version` ditambahkan (varchar 40, NOT NULL) | Implementation contract | A-53 menyebut versi seed sebagai implementation contract dan Dev Plan mewajibkan versi dicatat; kolom ini membuat provenance audit-able per baris | Dev Plan §Seed; ERD §9 |
| 2026-10-21 | Match key seed = OJK `Sandi Bank` di `source_ref`; `normalized_name` tetap UNIQUE sebagai pengaman | Implementation contract | Workbook menyediakan stable identifier; rename di masa depan tidak membuat baris aktif kedua | Arch A-53/A-58 |
| 2026-10-22 | `source_period` = `2026-06` (menggantikan `source_as_of`) | Implementation contract, koreksi provenance PM 2026-10-22 | Workbook hanya menyebut "Juni 2026". Tanggal hari-terakhir-bulan sebelumnya adalah inferensi; sekarang provenance disimpan level bulan, tanpa hari karangan. Import timestamp tetap di `created_at`/`updated_at` | Dev Plan §Implementation Evidence; A-53 |
| 2026-10-21 | Cakupan seed mencakup seluruh 105 baris bernama di worksheet, termasuk 7 Kantor Cabang Bank Luar Negeri | Implementation contract | File resmi adalah direktori "Bank Umum dan Syariah"; membuang grup resmi akan membuat katalog tidak sesuai file. Grup tidak disimpan sebagai classification produk | Spec Q1; ERD §9.5 |
| 2026-10-21 | Error 409 membawa `error.existing = { kind, id, name }` | Implementation contract | UI perlu merutekan duplikat ke baris resmi/pribadi. `existing` hanya berisi baris publik atau baris milik aktor | Arch A-57 |
| 2026-10-21 | `WalletCardDTO.institution` memakai `{ kind, name }` tanpa ID | Implementation contract | Kartu tidak membutuhkan ID dan tidak boleh membocorkan ID privat; `WalletDTO` memakai `WalletInstitutionDTO` dengan `id = null` untuk non-pemilik | Arch A-56 |
| 2026-10-21 | Picker mengambil `GET /api/institutions` sekali lalu memfilter di client | Implementation contract | Katalog ~105 baris dan daftar privat kecil; responsivitas live lebih baik. Kontrak `?q=` tetap diimplementasikan dan diuji untuk kebutuhan API | Design 07 §3; Arch A-57 |
| 2026-10-21 | Quick Add success tidak menutup picker; entri langsung terpilih dan form di belakang ikut terisi | Implementation contract | Mengikuti design 07 §4: user dapat langsung melanjutkan konfirmasi Buat dompet tanpa langkah tambahan | Design 07 §4 |
| 2026-10-22 | Daftar pribadi memakai plain list dengan dua tab stop per baris (pilih + Arsipkan/Pulihkan); tombol pilih memakai `aria-current` | Implementation contract QA correction | Baris private punya dua focus stop, sehingga listbox/option tidak valid; `role="listbox"` hanya untuk katalog resmi. Semua kontrol tetap target 44px | Design 07 §4a.4 |
| 2026-10-22 | Chip Arsip menampilkan `Diarsipkan · <tanggal>` dari `archivedAt` dengan zona Asia/Jakarta | Implementation contract | Mengikuti wireframe §4a.3 dan memberi konteks tanpa mengubah data | Design 07 §4a.3 |

## Open Questions dan Keputusan PM

Tidak ada pertanyaan produk yang tersisa. Semua Q1 sampai Q9 sudah dijawab PM pada 2026-10-21.

| ID | Pertanyaan | Keputusan PM 2026-10-21 | Status |
|---|---|---|---|
| Q1 | Cakupan katalog resmi, pemilik seed, dan jadwal pembaruan | Bank Umum + Bank Umum Syariah dari direktori OJK; seed statis versioned; developer/ops; tanpa runtime/external/auto sync; perubahan hanya lewat seed/data terkontrol. | Resolved |
| Q2 | Normalisasi dan perilaku duplikat | Trim, collapse whitespace, case-insensitive; duplikat resmi diarahkan ke katalog; duplikat pribadi aktif memakai entri existing atau diblokir; daftar tetap per user. | Resolved |
| Q3 | Arsip dan re-add entri pribadi | Soft archive tanpa hard delete; wallet lama tetap menampilkan label; re-add mengaktifkan entri arsip. | Resolved |
| Q4 | Quick Add persists saat wallet dibatalkan | Ya, entri tetap di daftar pribadi; tidak ada wallet dibuat. | Resolved |
| Q5 | Izin edit institusi wallet Bersama | Editor wallet Bersama boleh preserve/clear label, pilih resmi, atau pilih entri sendiri; tidak boleh mengenumerasi atau memakai entri orang lain. | Resolved |
| Q6 | Live reference vs snapshot label | Wallet merujuk row lokal dan menampilkan label row tersebut; tanpa external sync; custom tidak di-rename pada v1. | Resolved |
| Q7 | Rename/hard delete entri pribadi | Tidak ada rename/hard delete v1; hanya create/list/archive/restore. | Resolved |
| Q8 | Entri pribadi sama dengan bank resmi | Tolak dan arahkan ke katalog resmi. | Resolved |
| Q9 | Bentuk schema/API | Dua tabel terpisah + referensi XOR pada wallet; manual = keduanya null; tanpa classification field. Detail kolom/endpoint adalah implementation contract. | Resolved (high level) |

### Pertanyaan teknis yang tersisa (bukan keputusan produk)

| ID | Pertanyaan teknis | Pemilik | Status |
|---|---|---|---|
| TQ1 | Parsing workbook OJK: sheet, field nama, validasi baris, dan stable identifier | Developer | Resolved 2026-10-21: worksheet `Daftar Bank Umum`, 105 baris, `Sandi Bank` sebagai `source_ref`, 0 konflik. |
| TQ2 | Nama final endpoint, DTO, error code, dan bentuk constraint SQL | Developer | Resolved 2026-10-21: route `/api/institutions*`, DTO `WalletInstitutionDTO`, error `INSTITUTION_UNAVAILABLE`/`INSTITUTION_ALREADY_EXISTS`, CHECK + partial unique index diterapkan di migration. |
| TQ3 | Marker versi seed dan lokasi penyimpanan versi | Developer | Resolved 2026-10-21: `bank_institution.seed_version` + konstanta `BANK_INSTITUTION_SEED_VERSION`. |

## Gate Kesiapan

**Status: IMPLEMENTATION COMPLETE FOR QA REVIEW (T-011), Dev Plan approved 2026-10-21. Not QA Passed and not release-approved.**

- [x] Spec `docs/spec/feat-bank-institutions.md` PM-approved 2026-10-21.
- [x] Amendment A-52 sampai A-59 accepted by PM 2026-10-21.
- [x] Q1 sampai Q9 dijawab dan dicatat 2026-10-21.
- [x] Desain kanonik `docs/design/07-bank-institutions.md` PM-approved 2026-10-21.
- [x] Penempatan PRD ditetapkan sebagai extension F6.
- [x] Ticket key diberikan: T-011 (internal, tanpa key Jira).
- [x] Dev Plan ini disetujui PM (2026-10-21).
- [x] Implementasi engineering selesai sesuai scope dan bukti verifikasi tercatat di §Implementation Evidence.
- [ ] QA independen menyusun dan mengeksekusi test plan; hasil QA Passed belum ada.
- [ ] PM release approval belum ada; T-008 tetap release gate terpisah.

Catatan: verifikasi isi seed dan parsing workbook adalah implementation work. QA test plan dan matriks verifikasi adalah deliverable QA dan tidak menghalangi approval Dev Plan.

## Developer Handoff

- Dokumen kanonik yang mengikat: Spec `docs/spec/feat-bank-institutions.md`, desain `docs/design/07-bank-institutions.md`, amendment `docs/architecture-decisions.md` A-52 sampai A-59, PRD F6, dan Dev Plan ini setelah disetujui.
- `docs/design/audit-2026-10-visual-refresh/` hanya berisi contoh statis evidence-only. Jangan menyalin nama bank, angka, state, atau copy dari folder itu sebagai data nyata, seed, fixture, atau teks produksi.
- Enam nama bank di mockup bukan katalog. Seed awal wajib diverifikasi dari file OJK terbaru saat implementasi.
- Jangan menambahkan sinkronisasi OJK, cron, admin UI katalog, logo bank, nomor rekening/kartu, atau klaim integrasi bank.
- Jangan mengubah `docs/spec/feat-wallets.md` atau `docs/dev-plan/feat-wallets.md`. Perubahan wallet dibatasi pada field institusi opsional yang disetujui.
- Presisi agregat uang adalah proposal terpisah. T-011 tidak mengubah money DTO, agregat, atau API uang.
