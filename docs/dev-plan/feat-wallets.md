# Dev Plan: Dompet Pribadi & Sharing (F6)

Detail teknis implementasi. Ini dokumen utama yang dibaca saat generate kode. Berisi
keputusan teknis: schema, interface, validasi, dan task breakdown. **Status `Approved`
(PM 2026-10-09); implementasi T-009 boleh dimulai sesuai plan ini.**

## PM Approval

- **Status:** `Approved` — PM, **2026-10-09**.
- **Dasar ratifikasi:** `docs/architecture-decisions.md` "Amendment — Wallet F6 (T-009)"
  **A-36..A-50 (Accepted by PM, 2026-10-09)**, Spec `docs/spec/feat-wallets.md` (Spec Ready),
  design `docs/design/06-wallets.md` (PM UX sign-off). Tidak ada keputusan PM yang masih terbuka
  (open decision) pada plan ini.
- **Scope:** T-009 termasuk scope rilis MVP saat ini (A-50), **bukan** ditunda pasca-MVP.
- **Urutan rilis:** T-009 diimplementasikan lebih dulu; **T-008 tertahan (blocked)** sampai F6 QA
  selesai **dan** kondisi rilis AC-F4-5 terselesaikan (A-50). Approval plan ini tidak menyiratkan
  approval rilis.

## Referensi

- Spec: `docs/spec/feat-wallets.md` (Spec Ready, PM 2026-10-08) — AC-F6-1 … AC-F6-12
- PRD: `docs/PRD.md#fitur-6-dompet-pribadi-sharing`
- F3 existing yang dipertahankan: `docs/spec/feat-transactions-ocr.md` — satu receipt boleh menempel ke beberapa transaksi (dedup scope = upload); dasar keputusan C-28
- Desain: `docs/design/06-wallets.md` (PM UX sign-off 2026-10-08; C-1..C-27) + C-28 (keputusan PM 2026-10-09: visibilitas **gambar** struk = union transaksi tertaut, disclosure review OCR) + C-30 (viewer gambar struk terautentikasi untuk pengguna berhak)
- Keputusan PM lanjutan 2026-10-09 yang dicatat di arch-dec A-46/A-49: **C-29** — gambar struk tetap union (C-28), tetapi OCR job + `draft`/`result_json` **uploader-only** sebelum & sesudah simpan; anggota lain tidak menerima job/draft/flag
- Keputusan PM terbaru 2026-10-09 yang dicatat di arch-dec A-36: **C-31** — `scope` wallet (`PERSONAL|SHARING`) **immutable setelah create**; keinginan pindah scope = buat wallet **baru** + **transfer dana eksplisit**, bukan konversi in-place; tidak ada operasi yang mengubah visibilitas riwayat (transaksi/struk/saldo) ke depan maupun ke belakang (Spec AC-F6-3; Out of Scope)
- Arch-dec amendment (ratified): `docs/architecture-decisions.md` "Amendment — Wallet F6 (T-009)" (**Accepted by PM 2026-10-09**, A-36..A-50)
- ADR terkait: ADR-001 (Prisma/Neon), ADR-005 (soft delete; **amendment Accepted 2026-10-09** untuk pasangan transfer atomik), ADR-006 (layer), ADR-007 (free tier), ADR-008 (Blob; **amendment Accepted 2026-10-09**: authenticated image read path — objek tetap privat `access: "private"`, byte hanya lewat route server terautentikasi, URL Blob publik/direct tetap dilarang)
- ERD: `docs/erd/erd-database-schema.md` §3.7 + §8 (amendment wallet)
- Flow: `docs/erd/flowcharts.md` §4, §5, §6, §9 + §11 (amendment wallet)
- QA (QA-owned, tidak diduplikasi di sini): `docs/qa/verification-matrix.md` (Matriks AC F6, 12 baris) dan `docs/qa/user-journey-map.md` §10 (W1..W15)
- Task internal: **T-009** (tidak ada Jira key) — diimplementasikan pada rilis MVP saat ini (A-50)
- Engineer: Developer · Estimasi: 6 hari · Status: **Approved** (PM 2026-10-09)

## Ringkasan Teknis

Wallet adalah rekening aktual ber-scope `PERSONAL|SHARING` yang **immutable setelah create** (C-31):
mengganti scope keinginan = buat wallet baru + transfer dana eksplisit, bukan konversi in-place
yang dapat mengubah visibilitas riwayat. Perubahan menyentuh seluruh
lapisan: schema (`wallet` baru + `transaction.wallet_id`), repository (semua jalur
wallet-scoped menerima **actor**, bukan hanya `householdId`), service (visibilitas,
transfer pasangan, kunci saldo awal, agregasi SHARING-only), route handler (route wallet
baru + perubahan transaksi/trash/OCR/dashboard), dan frontend (kartu/picker/sheet sesuai
design 06, tanpa route/nav baru). Prinsip inti: **server-side enforcement** visibilitas
wallet di setiap jalur, **redaksi metadata Pribadi** pada response lintas scope, dan
**migrasi idempoten** transaksi pre-wallet ke satu wallet default SHARING per household
bernama **"Dompet Keluarga"** (nama final PM 2026-10-09, tetap editable). Visibilitas
**gambar/byte struk** mengikuti **union semua transaksi tertaut** (C-28): hanya tautan
Pribadi → pemilik; ada satu tautan Bersama → semua anggota APPROVED dapat membaca gambar
struk, sementara baris transaksi Pribadi tetap privat. Berbeda dari gambar, **OCR job +
`draft`/`result_json` tetap uploader-only** sebelum maupun sesudah simpan, walaupun
gambarnya share-visible lewat tautan Bersama (C-29); anggota lain tidak menerima
job/draft/flag. Satu receipt tetap boleh menempel ke beberapa transaksi (perilaku F3 yang
dipertahankan, bukan fitur baru). **Penyajian gambar**: inspeksi kode menunjukkan F3 belum
punya jalur yang mengembalikan byte struk (`BlobStore` hanya `put`; `TransactionDetailSheet`
hanya teks), sehingga menampilkan gambar C-28 memerlukan **route server terautentikasi
`GET /api/ocr/receipts/{id}/image`** (ratifikasi PM 2026-10-09, C-30; lihat HTTP Contract).
Layer terdampak: Route Handler (`app/api/wallets`, `app/api/transactions`, `app/api/ocr`,
`app/api/dashboard`, `app/api/budget`, `app/api/advisor`) → Service → Repository → Prisma;
frontend `components/wallets/*` dan `components/transactions/TransactionDetailSheet` (render gambar struk).

## Schema Database

> Sumber: `docs/architecture-decisions.md` Amendment Wallet F6 (A-36/A-37, **Accepted by PM
> 2026-10-09**) dan ERD §8 (amendment). Kolom di luar wallet/`transaction.wallet_id` tidak berubah.

### Tabel baru: `wallet`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | scope isolasi |
| created_by_user_id | uuid | FK → user, NOT NULL | pembuat; untuk `PERSONAL` sekaligus pemilik |
| scope | enum | NOT NULL | `PERSONAL \| SHARING`; **immutable setelah create (C-31, PM 2026-10-09)** — tidak ada field scope di `PATCH` (create-only) |
| name | varchar | NOT NULL | ≤80 (app-enforced) |
| purpose | varchar | nullable | ≤80; tujuan penggunaan user, bukan tipe rekening |
| opening_balance_minor | int | NOT NULL, default 0, CHECK >= 0 `*` | IDR scale 0; bukan transaksi |
| archived_at | timestamptz | nullable | null = aktif |
| archived_by_user_id | uuid | FK → user, nullable | |
| system_key | varchar | nullable | penanda migrasi (A-48); NULL untuk wallet user |
| created_at / updated_at | timestamptz | NOT NULL | |

Constraint/index (raw SQL bila bertanda `*`):
- `UNIQUE(household_id, system_key)` `*` — idempotensi wallet default hasil migrasi.
- `UNIQUE(household_id, id)` — target FK household-qualified untuk `transaction.wallet_id`.
- `idx(household_id, scope, archived_at)` — picker/carousel/ringkasan.
- `CHECK (opening_balance_minor >= 0)` `*`.
- Invariant scope **immutable (C-31, PM 2026-10-09):** `scope` bersifat **create-only**. `PATCH` menolak field `scope` dengan 422 `VALIDATION_ERROR` (`fieldErrors.scope`); tidak ada jalur update/archive/restore/transfer yang mengubah `scope` atau memindahkan baris wallet antar scope. Mengganti scope = wallet baru + transfer dana eksplisit; operasi ini tidak boleh mengubah visibilitas riwayat (AC-F6-2, AC-F6-3, AC-F6-11).

### Tabel: `transaction` (perubahan)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| wallet_id | uuid | FK → wallet, NOT NULL (setelah backfill) | wajib MONEY_IN/MONEY_OUT + kedua kaki transfer |

- FK household-qualified via raw SQL: `FOREIGN KEY (household_id, wallet_id) REFERENCES wallet(household_id, id)`; relasi Prisma tetap single-column (`wallet_id → wallet(id)`), service tetap memverifikasi `wallet.household_id = transaction.household_id`.
- Index tambahan: `idx(household_id, wallet_id, deleted_at, occurred_at desc)`.
- `UNIQUE(household_id, transfer_group_id, type)` dan `idx(household_id, deleted_at, occurred_at desc)` lama **tidak diubah/diduplikasi**.
- Invariant transfer (service): 2 kaki (`MONEY_OUT` dari `fromWalletId`, `MONEY_IN` ke `toWalletId`), `transfer_group_id` sama, jumlah+tanggal konsisten, `fromWalletId != toWalletId`, atomic.

## Interface & Contract

### Repository Interface (`lib/server/repositories/`)

Wallet-scoped reads/mutations menerima `WalletActor` (`{ userId, householdId, role }`) agar predikat visibilitas A-38 bisa diterapkan di query.

- `WalletRepository.create(actor, data): WalletRecord`
- `WalletRepository.list(actor, view: "active"|"archived"|"all"): WalletRecord[]` — filter visibilitas A-38; `active` = `archived_at IS NULL`
- `WalletRepository.findById(actor, id): WalletRecord | null` — extended-unique where (foreign/private → null → 404)
- `WalletRepository.update(actor, id, patch): WalletRecord` — name/purpose/opening saja (opening hanya bila unlocked); **tipe `patch` tidak memuat `scope`** dan `scope` bukan kolom mutable (C-31)
- `WalletRepository.setArchived(actor, id, archived: boolean, byUserId): WalletRecord`
- `WalletRepository.lockForOpeningBalance(tx, walletId): WalletRecord` — `SELECT ... FOR UPDATE` (A-42)
- `WalletRepository.ensureMigratedDefault(tx, householdId, ownerUserId): WalletRecord` — idempoten via `system_key`
- `TransactionRepository.create` / `createTransferPair`: tambah `walletId` (dan `fromWalletId`/`toWalletId`)
- `TransactionRepository.listActive/listTrash/findById`: filter visibilitas wallet + kembalikan `walletId`/scope untuk redaksi DTO
- `TransactionRepository.resolveTransferGroup(actor, id): { groupId, legs } | null`
- `TransactionRepository.softDeletePair/restorePair(actor, groupId): { alreadyDeleted|alreadyActive, count }`
- `TransactionRepository.sumByType/listByDay`: tambah filter scope SHARING (incl. arsip) — dipakai dashboard/budget/advisor
- `ReceiptRepository.findByHash`: kembalikan `uploadedByUserId` (untuk branching A-47)
- `ReceiptRepository.findByIdForActor(actor, id): Receipt | null` — predikat **gambar/Blob** (bukan job API): uploader, atau anggota APPROVED bila **union semua** transaksi tertaut memuat ≥1 wallet SHARING (A-46/C-28); union tanpa filter `deleted_at` (termasuk tautan soft-deleted) dan hanya memberi akses ke **byte/gambar** receipt, **tidak** ke OCR job/draft dan **tidak** mengekspos baris transaksi Pribadi
- `ReceiptRepository.isSharedWithHousehold(receiptId, tx?): boolean` — hitung union tautan (`receipt → transaction → wallet`), **termasuk transaksi soft-deleted**; menggambarkan visibilitas **gambar** dan dipakai untuk flag `receiptSharedWithHousehold` (bukan visibilitas job/draft)
- `OcrJobRepository.findByIdForActor(actor, id): OcrJobRecord | null` — **uploader-only** (C-29: `receipt.uploaded_by_user_id == actor.userId`), sebelum maupun sesudah simpan; **tidak** diperlebar oleh union receipt; tidak mengekspos baris transaksi
- `WalletBalanceRepository` (atau method di `WalletRepository`): saldo per wallet = `opening + Σ MONEY_IN aktif − Σ MONEY_OUT aktif`

Semua method tetap default filter `deleted_at IS NULL` untuk query aktif (ADR-005/006).

### Service Interface (`lib/server/services/`)

- `WalletService.create(actor, input, idempotencyKey?): WalletDTO`
- `WalletService.list(actor, view): WalletDTO[]`
- `WalletService.get(actor, id): WalletDTO`
- `WalletService.update(actor, id, patch): WalletDTO` — validasi permission + opening lock; **tolak `scope` bila ada di payload** (422 `VALIDATION_ERROR`, C-31); tidak ada konversi scope in-place
- `WalletService.archive(actor, id): WalletDTO` / `WalletService.restore(actor, id): WalletDTO`
- `WalletService.resolveVisible(actor, walletIds): Map<id, WalletRecord>` — helper ACL
- `WalletService.cards(actor): WalletCardDTO[]` — kartu aktif untuk carousel
- `TransactionService.createManual/createFromOcr`: tambah validasi wallet (visible, aktif, household sama) + transfer pair wallet
- `TransactionService.softDelete/restore`: pair-aware + otorisasi A-41
- `DashboardService.get(actor): DashboardDTO` — `sharedBalanceMinor` + `personalBalanceMinor` + `wallets`
- `BudgetService.get`: spent SHARING-only
- `AdvisorService`: agregat + cache SHARING-only
- `OcrService.upload`: dedup branching by uploader (A-47/C-19, tidak berubah oleh C-29) — same-uploader reuse own job; uploader lain → 409 `DUPLICATE_RECEIPT` generik
- `OcrService.getJob(actor, id)`: akses **uploader-only** (C-29); **bukan** union; untuk uploader sertakan `receiptSharedWithHousehold` (server-computed dari union gambar, C-28). Anggota lain tidak menerima job/draft/flag
- `OcrService.getReceiptImage(actor, receiptId): { mimeType, bytes } | null` — **route gambar baru (ratified PM 2026-10-09, C-30)**: akses via predikat **union terpisah** (`ReceiptRepository.findByIdForActor`, A-46/C-28); hanya byte gambar, tidak pernah job/draft/flag (C-28 vs C-29). Null → 404 generik
- `BlobStore` (seam `lib/server/providers/blob.ts`) diperluas: selain `put`, perlu operasi **read/stream** server-side memakai `@vercel/blob@2.8.0` `get(pathname, { access: "private", token })` (mengembalikan `stream`/`headers`/`blob`) untuk jalur gambar; tidak pernah mengeluarkan URL Blob publik/signed ke client (ADR-008 amendment Accepted 2026-10-09)
- Jalur penyajian byte/gambar struk memakai predikat **union terpisah** (`ReceiptRepository.findByIdForActor`) — gambar saja, tidak pernah job/draft (C-28 vs C-29)

### HTTP Contract

Route baru:

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/wallets` | POST | Approved | `{ name, purpose?, scope, openingBalanceMinor? }` + `Idempotency-Key` | `201 WalletDTO` |
| `/api/wallets` | GET | Approved | `?view=active\|archived\|all` | `{ wallets: WalletDTO[] }` |
| `/api/wallets/{id}` | GET | Approved + visible | - | `WalletDTO` |
| `/api/wallets/{id}` | PATCH | Approved + permission | `{ name?, purpose?, openingBalanceMinor? }` — **tanpa `scope`; mengirim `scope` → 422** (C-31) | `WalletDTO` |
| `/api/wallets/{id}/archive` | POST | Permission A-43 | - | `WalletDTO` |
| `/api/wallets/{id}/restore` | POST | Permission A-43 | - | `WalletDTO` |

Route berubah:

| Route | Method | Perubahan |
|---|---|---|
| `/api/transactions` | POST | `walletId` (MONEY_IN/OUT) atau `fromWalletId`+`toWalletId` (TRANSFER) |
| `/api/transactions` | GET | filter `walletId`; redaksi DTO A-39 |
| `/api/transactions/{id}/trash` \| `/restore` | POST | pair-aware + otorisasi A-41 |
| `/api/transactions/trash` | GET | pasangan transfer sebagai satu baris logis (rekomendasi; grouping UI dapat diterima) |
| `/api/dashboard` | GET | `sharedBalanceMinor` + `personalBalanceMinor` + `wallets` |
| `/api/budget` | GET/PUT | spent SHARING-only |
| `/api/advisor/insights` | POST | agregat/cache SHARING-only |
| `/api/ocr/receipts` | POST | same-uploader reuse job sendiri; uploader lain → 409 `DUPLICATE_RECEIPT` generik (A-47; tidak berubah oleh C-29) |
| `/api/ocr/jobs/{id}` | GET | akses **uploader-only** (C-29); bukan union; tidak mengekspos baris transaksi Pribadi; uploader menerima `receiptSharedWithHousehold` (server-computed dari union **gambar**, C-28) |

Route baru (**ratified PM 2026-10-09**, A-49/C-30):

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/ocr/receipts/{id}/image` | GET | Approved + predikat union **gambar** A-46 | - | byte gambar (`Content-Type` = mime allowlist A-21, `Cache-Control: private, no-store`) |

- Inspeksi kode: F3 belum punya jalur byte-serving (`BlobStore` hanya `put`; tidak ada route yang mengembalikan byte; `TransactionDetailSheet` hanya teks). Menampilkan gambar C-28 karena itu **memerlukan route baru**; jangan mengklaim jalur existing.
- Otorisasi = predikat union semua transaksi tertaut **termasuk soft-deleted** (`ReceiptRepository.findByIdForActor`, A-46/C-28); unauthorized/asing/tanpa tautan → **404 generik** (tanpa existence leak).
- Response **hanya byte**: tanpa JSON body, `storage_key`, URL Blob publik/signed, token, OCR job/draft/`result_json`, atau baris transaksi tertaut. `BlobStore` membaca objek privat server-side via `@vercel/blob@2.8.0` `get(pathname, { access: "private", token })` lalu men-stream byte (ADR-008 amendment Accepted 2026-10-09); URL Blob publik/direct tetap dilarang.
- `GET /api/ocr/jobs/{id}` tetap uploader-only dan `receiptSharedWithHousehold` tetap uploader-only — route gambar tidak memperlebar keduanya (C-29).

> **Dua predikat OCR yang terpisah (C-28 vs C-29):**
> - **Gambar/byte struk** (route ratified di atas + `ReceiptRepository.findByIdForActor`) memakai predikat **union** semua transaksi tertaut, **termasuk tautan soft-deleted** (A-46/C-28); hanya byte gambar, tidak pernah mengekspos baris transaksi Pribadi.
> - **OCR job + draft/`result_json`** (`GET /api/ocr/jobs/{id}`) memakai predikat **uploader-only** (C-29), sebelum & sesudah simpan; union gambar **tidak** memperlebar akses job/draft.
> Route byte-serving **baru** (ratified C-30) diperlukan karena tidak ada jalur existing yang mengembalikan byte; enforcement predikat gambar dan job dipasang terpisah (A-46/A-49, ADR-008 amendment Accepted 2026-10-09).

DTO:
- `WalletDTO = { id, name, purpose, scope, openingBalanceMinor, balanceMinor, archivedAt, createdBy: UserDTO|null, canEdit, canArchive, canRestore, createdAt, updatedAt }` — `createdBy` hanya untuk SHARING.
- `WalletCardDTO = { id, name, purpose, scope, balanceMinor, archivedAt, canEdit, canArchive, canRestore }`.
- `TransactionDTO` + `wallet: WalletRefDTO | null`; baris generik lintas scope mempertahankan hanya arah generik + amount/date dan men-null-kan `merchant`, `category`, `note`, `receiptId`, `transferGroupId`, `wallet`, `source`, `createdByUser` (A-39); tanpa PII.
- `OcrJobDTO` + `receiptSharedWithHousehold: boolean` (C-28/C-29) — server-computed dari union **gambar** (termasuk transaksi soft-deleted); **hanya untuk uploader**; anggota lain tidak menerima job/draft/flag; dipakai review OCR varian 2. Flag menggambarkan visibilitas gambar, bukan visibilitas job. Client tidak pernah menghitung visibilitas receipt.
- `DashboardDTO` = `{ sharedBalanceMinor, personalBalanceMinor, currencyCode, wallets: WalletCardDTO[], monthlyBudget, spending, goals, recentActivity }`.

### Validasi Rules (Zod)

| Field | Rules | Pesan error (bahasa awam) |
|---|---|---|
| name (wallet) | required, trim, 1..80 | "Nama dompet belum diisi." / "Nama dompet maksimal 80 karakter." |
| purpose | optional, trim, ≤80 | "Tujuan penggunaan maksimal 80 karakter." |
| scope | required, in `PERSONAL\|SHARING`; default `PERSONAL`; **create-only** | "Pilih jenis dompet." |
| scope (PATCH) | **tidak diterima** — update schema tidak memuat `scope` (strict; field tak dikenal → tolak); bila ada → 422 `VALIDATION_ERROR` + `fieldErrors.scope` (C-31) | Server-side; UI tidak merender kontrol scope (design 06 §6.2/§12 menampilkan error inline awam) |
| openingBalanceMinor | optional, int, >= 0, ≤ int32 max | "Saldo awal tidak boleh negatif." / "Saldo awal terlalu besar." |
| walletId (transaksi) | required untuk MONEY_IN/MONEY_OUT, uuid | "Pilih dompet." |
| fromWalletId / toWalletId | required untuk TRANSFER, uuid, `from != to` (A-51: pelanggaran → `VALIDATION_ERROR` 422 + `fieldErrors`, bukan code baru) | "Dompet asal dan tujuan harus berbeda." |
| view (query) | optional, in `active\|archived\|all`, default `active` | "Tampilan dompet tidak dikenal." |

### Error namespace (A-49, diselaraskan ke amandemen A-51 PM 2026-10-09)

- `WALLET_UNAVAILABLE` (422) — wallet terarsip/tidak tersedia saat submit.
- `WALLET_OPENING_BALANCE_LOCKED` (422) — edit saldo awal setelah baris transaksi pertama (termasuk trashed / kaki transfer).
- **A-51 (PM-confirmed): pasangan wallet transfer memakai code yang sudah ada, tanpa code baru `TRANSFER_INVALID`:**
  - `fromWalletId`/`toWalletId` hilang atau malformed → `VALIDATION_ERROR` (422) dengan `fieldErrors` pada field yang bersangkutan.
  - source = destination (wallet asal sama dengan wallet tujuan) → `VALIDATION_ERROR` (422) dengan `fieldErrors.toWalletId` (pesan "Dompet asal dan tujuan harus berbeda.").
  - salah satu/semua wallet terarsip → `WALLET_UNAVAILABLE` (422).
  - wallet tidak ada / milik household lain / PERSONAL yang tidak terlihat aktor → 404 generik `NOT_FOUND` (tanpa existence leak).
  - mutasi pair yang terlihat tapi tidak berhak → `ACCESS_DENIED` (403).
- Reuse: `ACCESS_DENIED` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422).
- Scope immutable (C-31): percobaan mengubah `scope` lewat `PATCH` → `VALIDATION_ERROR` (422, `fieldErrors.scope`). Reuse error yang ada; bukan code baru.
- `DUPLICATE_RECEIPT` (409) — **kontrak diterima PM apa adanya (2026-10-09)**: body generik tanpa `job`/`draft`/`receiptId`/uploader untuk uploader berbeda; same-uploader retry memakai ulang job miliknya (C-19/A-47). Tanpa perubahan kode/status.
- Idempotency: `Idempotency-Key` di semua POST mutation wallet + transfer, mengikuti A-11.

## Async & Queue

Tidak ada async/worker (ADR-007). Migrasi backfill dijalankan sebagai SQL migration idempoten (A-48), bukan worker. Semua agregasi dihitung sinkron dalam request.

## Verifikasi & QA (referensi)

> **Tidak ada test plan di Dev Plan ini.** Skenario test, oracle, dan matriks state dimiliki
> QA dan tinggal di artefak QA; jangan diduplikasi. Section ini hanya memetakan AC → slice
> → journey supaya PM dapat menilai kesiapan.

- Skenario per-AC: `docs/qa/verification-matrix.md` §"Matriks AC F6" (12 baris, semua `Not started`).
- Journey end-to-end: `docs/qa/user-journey-map.md` §10 (W1..W15, semua `Not started`).
- Peta AC → slice:
  - S1 (wallet + ACL): AC-F6-1, AC-F6-2, AC-F6-3, AC-F6-11, AC-F6-12 (state/kartu) — W1, W2, W3, W5, W14, W15 (termasuk **C-31**: scope immutable — `PATCH` ber-`scope` → 422, scope tidak berubah, dan ganti scope hanya via wallet baru + transfer)
  - S2 (transaksi + transfer + privacy): AC-F6-4, AC-F6-5, AC-F6-6, AC-F6-11 — W4, W6, W7, W8
  - S3 (dashboard + budget/advisor): AC-F6-7, AC-F6-8, AC-F6-11 — W9, W10
  - S4 (OCR): AC-F6-10, AC-F6-2, AC-F6-11 — W12 (termasuk C-28: akses **gambar** receipt via union tautan, gambar diakses lewat **route gambar ratified (C-30)** `GET /api/ocr/receipts/{id}/image`, receipt Sharing yang dipakai ulang untuk transaksi Pribadi tetap share-visible, disclosure review varian 1/2, duplikat generic C-19; C-29: OCR job + draft uploader-only sebelum & sesudah simpan, anggota lain dengan tautan Bersama tetap tidak mendapat job/draft/flag)
  - S5 (migrasi): AC-F6-9 — W11
  - S6 (frontend): AC-F6-12 + seluruh journey UI — W1..W15 (UI bagian)
- QA artifacts yang menutup C-28 (QA-owned, tidak diduplikasi di sini): `docs/qa/verification-matrix.md` baris AC-F6-10 (termasuk §"Catatan C-29" dan skenario IMG-1..IMG-8) dan `docs/qa/user-journey-map.md` W12 (langkah 3–7 + oracle union/disclosure). Oracle job/draft uploader-only C-29 tercatat di artefak QA tersebut; Dev Plan hanya merujuk, tidak menambah atau mengubah oracle QA.
- **C-31 (scope immutable):** oracle utamanya ada di baris Spec **AC-F6-3** (`docs/qa/verification-matrix.md`) dan journey wallet (W1/W2/W3/W5/W14/W15). QA perlu menambah/menutup assertion: `PATCH /api/wallets/{id}` ber-`scope` → **422 `VALIDATION_ERROR`** (`fieldErrors.scope`) dan `scope` tetap; `PATCH` nama/tujuan tetap sukses; ganti scope hanya lewat wallet baru + transfer eksplisit dan tidak mengubah visibilitas riwayat (transaksi/struk/saldo) bagi aktor mana pun, termasuk Owner. Rujukan saja (QA-owned); Dev Plan tidak mengubah artifak QA.
- **Oracle route gambar (rujukan QA, tidak dieksekusi di sini):** QA perlu menambah assertion untuk route gambar ratified (C-30): 200 + `Content-Type` allowlist + `Cache-Control: private, no-store` untuk actor berhak (termasuk via tautan soft-deleted); 404 generik untuk unauthorized/asing/tanpa tautan; response tidak memuat `storage_key`/URL Blob/job/draft/`result_json`/baris transaksi; route job tetap uploader-only. Ditambahkan sebagai rujukan; eksekusi test tetap di QA.
- QA matrix/journey tetap `Not started` sampai ada eksekusi; Dev Plan ini tidak mengklaim test dijalankan.
- Cross-cutting yang wajib diverifikasi QA (bukan di sini): actor matrix (Owner/creator/ordinary approved/personal owner/non-approved), tidak ada existence leak, response body bersih dari metadata Pribadi, visibilitas **gambar** receipt = union tautan (termasuk link soft-deleted) sementara baris transaksi Pribadi tetap tersembunyi, **route gambar hanya mengembalikan byte (tanpa URL Blob/`storage_key`/job/draft/baris transaksi, `Cache-Control: private, no-store`)**, **OCR job/draft uploader-only sebelum & sesudah simpan (C-29) termasuk saat gambar share-visible**, **scope immutable (C-31): `PATCH` ber-`scope` ditolak 422 dan tidak ada perubahan visibilitas riwayat**, paritas ledger pre/post migrasi.

## Task Breakdown

### Database & Model

- [ ] `prisma/schema.prisma`: model `Wallet`, enum `WalletScope`, `transaction.walletId`
- [ ] Migration additive: tabel `wallet`, index, `transaction.wallet_id` nullable
- [ ] Raw SQL: `CHECK opening >= 0`, `UNIQUE(household_id, system_key)`, `UNIQUE(household_id, id)`, composite FK `(household_id, wallet_id)`, index per-wallet
- [ ] Backfill idempoten (wallet default SHARING bernama **"Dompet Keluarga"** + `UPDATE transaction.wallet_id`), termasuk trashed + kaki transfer + household tanpa transaksi
- [ ] Migration enforce: `wallet_id NOT NULL` + composite FK
- [ ] Fixture: wallet Pribadi/Bersama/arsip, transfer same-scope + cross-scope, household lama dengan/ tanpa transaksi, receipt duplikat, receipt tertaut ke beberapa transaksi (Pribadi-only dan Pribadi+Bersama, termasuk tautan soft-deleted), receipt dengan job milik uploader yang gambarnya share-visible ke anggota lain (C-29)

### Repository

- [ ] `WalletRepository` (create/list/findById/update/setArchived/lockForOpeningBalance/ensureMigratedDefault)
- [ ] `TransactionRepository`: wallet filter + visibilitas, pair resolve/trash/restore, agregat scope SHARING
- [ ] `ReceiptRepository` (predikat **gambar**): union transaksi tertaut wallet-visible + `uploadedByUserId` + `isSharedWithHousehold` (C-28, termasuk tautan soft-deleted)
- [ ] `OcrJobRepository` (predikat **job**): **uploader-only** (`uploadedByUserId == actor.userId`), tidak diperlebar union (C-29)
- [ ] Helper predikat visibilitas A-38 + helper union receipt dipakai konsisten
- [ ] `BlobStore` (provider seam): tambah read/stream server-side di samping `put` untuk route gambar memakai `@vercel/blob@2.8.0` `get(pathname, { access: "private", token })`; hanya `stream`/`headers`/`blob` yang keluar, tidak pernah URL Blob publik/signed (ADR-008 amendment Accepted 2026-10-09)

### Service

- [ ] `WalletService` (CRUD/archive/restore, permission A-43, opening lock A-42, kartu) — **tolak perubahan `scope`** (C-31, 422)
- [ ] `TransactionService`: binding wallet + transfer pair + trash/restore pair A-41 + redaksi DTO A-39
- [ ] `DashboardService`/`BudgetService`: split total + agregat SHARING-only
- [ ] `AdvisorService`: agregat + cache SHARING-only
- [ ] `OcrService`: dedup by uploader (A-47) + akses **job/draft uploader-only** (C-29) + predikat gambar terpisah (A-46/C-28) + `receiptSharedWithHousehold` untuk uploader (C-28) + `getReceiptImage` untuk route gambar baru (ratified C-30)
- [ ] `lib/server/errors.ts`: error code A-49 + mapping HTTP

### HTTP

- [ ] Zod schema wallet + perubahan transaksi (A-49); **update schema tidak memuat `scope`** (strict; C-31) — tidak ada jalur update/archive/restore/transfer yang mengubah `scope`; ganti scope hanya via wallet baru + transfer dana eksplisit
- [ ] Route Handlers `app/api/wallets` + `[id]` + `[id]/archive` + `[id]/restore`
- [ ] Update `app/api/transactions` (POST/GET, `[id]/trash|restore`, `trash`), `app/api/dashboard`, `app/api/budget`, `app/api/advisor/insights`, `app/api/ocr/receipts`, `app/api/ocr/jobs/[id]`
- [ ] Route Handler gambar **baru (ratified PM 2026-10-09, C-30)**: `app/api/ocr/receipts/[id]/image` — auth union gambar A-46, baca Blob privat server-side via `@vercel/blob@2.8.0` `get(pathname, { access: "private", token })` lalu stream byte, `Content-Type` allowlist, `Cache-Control: private, no-store`, 404 generik, tanpa job/draft/baris transaksi/`storage_key`/URL Blob
- [ ] `Idempotency-Key` pada semua POST mutation

### Frontend (design 06, tanpa route/nav baru)

- [ ] `components/wallets/`: `WalletCard`, `WalletSummaryPair`, `WalletPickerSheet`, `WalletFormSheet`, `WalletDetailSheet`, `WalletManageSheet` (tab Aktif/Arsip)
- [ ] `WalletFormSheet` scope **create-only (C-31)**: mode **create** menampilkan pemilih `Pribadi`/`Bersama`; mode **edit** hanya mengirim `name`/`purpose`/`openingBalanceMinor` dan **tidak pernah mengirim `scope`** ke `PATCH`. Jika pengguna ingin pindah scope, form edit mengarahkan ke alur **buat wallet baru + transfer dana** (bukan konversi in-place); copy/placement milik `docs/design/06-wallets.md`, Dev Plan hanya merujuk C-31. `WalletDetailSheet`/`WalletManageSheet` menampilkan scope sebagai **nilai non-editable**, bukan kontrol aktif.
- [ ] Integrasi Add sheet (money in/out/transfer) + OCR review: field wallet wajib, `Dari dompet`/`Ke dompet`, dan panel disclosure C-28. Varian 1 (memilih dompet Bersama) mengikuti scope wallet yang dipilih; **varian 2 (struk sudah share-visible) hanya dirender dari flag server `receiptSharedWithHousehold`, tidak diinferensi klien dari input wallet**; flag ini hanya tersedia untuk uploader (C-29), tidak ada permukaan lintas-anggota. Copy/placement disclosure dimiliki `docs/design/06-wallets.md`; Dev Plan hanya merujuk C-28 + flag server (A-46).
- [ ] Beranda: dua ringkasan terpisah + helper "Termasuk dompet di Arsip" + carousel aktif
- [ ] `components/transactions/TransactionDetailSheet` (**C-30 viewer**): tampilkan gambar struk untuk `receiptId` yang berhak (fetch route gambar ratified `GET /api/ocr/receipts/{id}/image`) dengan state loading/success/error + fallback teks, tutup via keyboard (Escape) dan fokus kembali ke pemicu; **bukan** OCR job/draft (`result_json`); tidak ada URL Blob/storage key di client (C-28 vs C-29/C-30)
- [ ] State loading/empty/error/submitting/selected/success + a11y (keyboard/screen reader, non-color scope, 390px)

### Async (jika ada)

- [ ] Tidak ada. Backfill = SQL migration idempoten.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-09 | **S1 Data model + Wallet API**: `WalletScope`/`Wallet` model, `transaction.walletId`, additive/idempotent migration `20261009120000_wallet_f6` (default SHARING "Dompet Keluarga" `system_key='legacy_default'`, opening 0, trashed + transfer legs attached, `NOT NULL` + household-qualified composite FK), `WalletRepository`/`WalletService`, contracts, `POST/GET /api/wallets`, `GET/PATCH /api/wallets/{id}`, `/archive`, `/restore`; scope immutable (PATCH ber-`scope` → 422 `fieldErrors.scope`). | Deviasi kecil: DTO menambah `openingBalanceLocked` (dibutuhkan form Ubah §6.2 agar field disabled; lihat Keputusan Teknis). |
| 2026-10-09 | **S2 Transactions + transfer + privacy**: `TransactionService` mengikat `walletId` (MONEY_IN/OUT) dan `fromWalletId`/`toWalletId` (TRANSFER); wallet row-lock sebelum insert (A-42); pair trash/restore atomik via `transfer_group_id` dengan matriks otorisasi A-41; redaksi A-39 (projection generik, `wallet`/`source`/`transferGroupId`/… null) + `WalletRefDTO`. | — |
| 2026-10-09 | **S3 Dashboard/budget/advisor**: `DashboardDTO.sharedBalanceMinor`+`personalBalanceMinor`+`wallets` (aktif saja, saldo arsip tetap dihitung); budget & advisor agregasi SHARING-only (termasuk arsip, transfer dikecualikan). | — |
| 2026-10-09 | **S4 OCR**: dedup per-uploader (`DUPLICATE_RECEIPT` generik untuk uploader lain, P2002 race-safe), `GET /api/ocr/jobs/{id}` uploader-only + `receiptSharedWithHousehold`, route gambar baru `GET /api/ocr/receipts/{id}/image` (union A-46 termasuk tautan soft-deleted, byte privat, `Cache-Control: private, no-store`, 404 generik), `BlobStore.get` via `@vercel/blob` `get(pathname,{access:'private',token})`. | — |
| 2026-10-09 | **S5/S6 UI**: komponen `components/wallets/*` (kartu, ringkasan ganda + carousel, picker, form scope create-only, detail, kelola Aktif/Arsip), integrasi Beranda, form manual, review OCR (disclosure C-28 varian 1/2 dari flag server), `Lihat struk` viewer (C-30). | Tombol prev/next carousel tidak dirender (dokumen menyatakan hanya bila overflow); carousel memakai CSS scroll-snap. |
| 2026-10-09 | **Verifikasi**: `bunx tsc --noEmit` bersih; `bun run test` 319 passed (34 test baru: kontrak wallet, WalletService, transaksi+transfer+privasi, OCR privacy/union, dashboard split, route wallet); `bun run lint` 0 error (8 warning pra-ada di docs/qa/harness); `bun run build` sukses (semua route wallet + gambar terdaftar). | Integration/E2E **tidak dijalankan** (tidak ada `DATABASE_URL`); migrasi belum diterapkan ke DB mana pun. |
| 2026-10-09 | **Koreksi ronde 1 (QA BUG-1/BUG-2 + AC-F6-12)**: (1) helper `transferInvalid`/`TRANSFER_INVALID` dihapus dari `lib/server/errors.ts`; `TransactionService` memakai `unprocessable`/`VALIDATION_ERROR` untuk pair wallet tidak lengkap/malformed dan source=destination (A-51); (2) fixture integration ditambah wallet kedua + assertion saldo per wallet (AC-F6-4/AC-F6-5) di `transaction.integration.test.ts` dan `idempotency.integration.test.ts`; (3) hook bersama `hooks/useDialogFocusTrap.ts` (trap Tab + focus return ke trigger + Escape/backdrop) dipasang di 5 dialog wallet/viewer; (4) `WalletPickerSheet` menerima `selectedWalletId`, `aria-selected` akurat + styling terpilih + roving tabIndex + navigasi Arrow; (5) test route gambar C-30 level route (byte privat, mime, `private, no-store`, tanpa URL/storage key/job/draft, Personal-only 404 generik, union termasuk tautan trashed, job/draft uploader-only). | Semua verifikasi berjalan pada DB lokal disposable **`financial_planner_dev_t009r1`** (localhost:5432, dibuat ronde ini; bukan Neon, bukan `financial_planner_t003`, bukan DB QA `financial_planner_qa_f6`). Suite QA-owned `docs/qa/harness/t008-auth-lifecycle.integration.test.ts` memblokir dirinya sendiri di DB non-t003 (guard hard-coded) dan **tidak dijalankan**; tidak ada data user/shared yang dimigrasi atau dimutasi. |
| 2026-10-09 | **Koreksi ronde 1b (C-32, alur buat dompet dari picker)**: `WalletPickerSheet` "Buat dompet baru" kini menutup picker dulu lalu membuka `WalletFormSheet` di atasnya (sebelumnya form render di belakang picker karena z-70 < z-80 sehingga tidak bisa dipakai di `ManualEntryForm`). `ManualEntryForm` menyimpan `createTarget` (field yang membuka picker) supaya wallet baru auto-select ke field itu sesudah simpan, tidak membuka picker kembali, dan batal menyimpan tidak mengubah nilai field. `ReceiptScanner` sudah menutup picker lebih dulu + auto-select; ronde ini hanya menambahkan remount key agar daftar wallet ter-refetch (dompet baru muncul saat picker dibuka lagi). | C-32 (PM decision, tercatat di design 06 §7.1): picker ditutup dulu, sheet buat dibuka di atasnya, auto-select ke field asal, batal tidak mengubah field, fokus kembali ke kontrol pembuka picker. Fokus dikelola `useDialogFocusTrap`: penutupan picker mengembalikan fokus ke tombol field, lalu sheet buat memindahkan fokus ke dirinya sendiri dan mengembalikannya saat ditutup. | Tidak mengubah Spec; design 06 §7.1/C-32 (rujukan) |
| 2026-10-09 | **Koreksi ronde 2 (QA BUG-3/BUG-4/BUG-5 + duplicate key)**: (1) `hooks/useDialogFocusTrap.ts` sekarang memakai **stack dialog module-level**: hanya dialog terdalam (topmost) yang menanggapi Escape/Tab, sehingga Escape menutup satu layer per kali tekan, parent tidak ikut tertutup, dan fokus tidak jatuh ke `body`; `AddTransactionSheet` dan `TransactionDetailSheet` (dua pemilik trap inline terakhir) beralih ke hook bersama sehingga tidak ada listener `keydown` ganda yang saling berebut. (2) Touch target wallet surface dinaikkan ke `min-h-11` (≥44px): `Kelola` pada `WalletCard`, helper "Termasuk dompet di Arsip" pada `WalletSummaryPair` (hit area 44px, visual tetap ringkas lewat margin negatif + hit area), dan aksi baris `WalletManageSheet` (kelas defect sama pada surface yang sama). (3) `DashboardView`: key `closed` yang sama pada `WalletManageSheet`/`WalletFormSheet` dibuat unik (`manage-closed`/`form-closed`) untuk menghilangkan warning React "two children with the same key" di `/home`. | QA BUG-3: Escape di dialog bersarang (picker dari `AddTransactionSheet`, viewer struk dari `TransactionDetailSheet`) menutup kedua dialog dan fokus jatuh ke `body`, membuang isian form. QA BUG-4: Tab bocor ke dialog induk setelah 4 Tab (picker) / 2 Tab (viewer). QA BUG-5: kontrol <44px pada surface wallet. | Tidak mengubah Spec; design 06 §11/§14 (rujukan) |

## Keputusan Teknis

> Entri di bawah adalah keputusan **pra-implementasi** yang merujuk arch-dec **Amendment Wallet F6
> (A-36..A-50, Accepted by PM 2026-10-09)**; akan diperbarui setiap sesi coding.

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-09 | `wallet` + `transaction.wallet_id` dengan composite FK household-qualified | Mencegah tautan lintas household di level DB (AC-F6-9, AC-F6-11) | Arch-dec A-36/A-37 (ratified) |
| 2026-10-09 | Semua jalur wallet-scoped menerima actor, bukan hanya `householdId` | `householdId` saja tidak cukup untuk privasi Pribadi (AC-F6-2, AC-F6-11) | Arch-dec A-38 (ratified) |
| 2026-10-09 | Redaksi DTO lintas scope (wallet/note/receipt/transferGroupId = null) | Cegah korelasi kaki Pribadi (AC-F6-6) | Arch-dec A-39 (ratified) |
| 2026-10-09 | Trash/restore transfer atomik via `transfer_group_id`; mengamandemen ADR-005 | C-9/C-20, AC-F6-5 | ADR-005 (amendment Accepted 2026-10-09) |
| 2026-10-09 | Kunci saldo awal dengan wallet row lock + re-check NOT EXISTS | Race READ COMMITTED (AC-F6-1, C-21) | Arch-dec A-42 (ratified) |
| 2026-10-09 | Dashboard split + agregat/cache SHARING-only | AC-F6-7, AC-F6-8, AC-F6-11 | Arch-dec A-44/A-45 (ratified) |
| 2026-10-09 | OCR dedup by uploader, unique constraint dipertahankan | C-19, AC-F6-10 | Arch-dec A-47 (ratified) |
| 2026-10-09 | Backfill idempoten via `system_key='legacy_default'`, opening 0 | AC-F6-9, C-17 | Arch-dec A-48 (ratified) |
| 2026-10-09 | Visibilitas **gambar** struk = union semua transaksi tertaut; satu receipt boleh menautkan banyak transaksi (F3 existing); baris transaksi Pribadi tetap privat; tautan soft-deleted tetap dihitung; flag `receiptSharedWithHousehold` dihitung server | C-28, AC-F6-10 | Arch-dec A-46 (ratified) |
| 2026-10-09 | Gambar struk tetap union (C-28), tetapi **OCR job + `draft`/`result_json` = uploader-only** sebelum & sesudah simpan; predikat job API dipisah dari predikat image/Blob; anggota lain dengan tautan Bersama tetap tidak menerima job/draft/flag | C-29, AC-F6-10 | Arch-dec A-46/A-49 (ratified) |
| 2026-10-09 | Route gambar **baru (ratified PM 2026-10-09, C-30)** `GET /api/ocr/receipts/{id}/image`: auth union gambar A-46 (termasuk tautan soft-deleted), baca/stream byte Blob privat server-side via `@vercel/blob@2.8.0` `get(pathname, { access: "private", token })`, `Content-Type` allowlist + `Cache-Control: private, no-store`, 404 generik, tanpa URL/`storage_key`/token/job/draft/baris transaksi; `BlobStore` perlu seam read/stream | Bukti kode: tidak ada jalur byte-serving existing (`BlobStore` hanya `put`); melayani C-28 tanpa URL Blob publik | Arch-dec A-46/A-49 + ADR-008 (amendment Accepted 2026-10-09) |
| 2026-10-09 | Duplikat OCR lintas-uploader = **409 `DUPLICATE_RECEIPT` generik** (kontrak diterima PM apa adanya); same-uploader reuse job sendiri | C-19, A-47, keputusan PM 2026-10-09 | Arch-dec A-47 (ratified) |
| 2026-10-09 | Nama default wallet migrasi = **"Dompet Keluarga"** (final, editable setelah dibuat) | C-17, keputusan PM 2026-10-09 | Arch-dec A-48 (ratified) |
| 2026-10-09 | `scope` wallet (`PERSONAL\|SHARING`) **immutable setelah create** (C-31): `PATCH` tidak menerima `scope` (422 `VALIDATION_ERROR`); pindah scope = wallet **baru** + transfer dana eksplisit; tidak ada konversi in-place dan tidak ada operasi yang mengubah visibilitas riwayat | C-31, AC-F6-3 (AC-F6-2/AC-F6-11), keputusan PM 2026-10-09 | Arch-dec A-36/A-43 (ratified) |
| 2026-10-09 | **Error pasangan wallet transfer diselaraskan ke amandemen A-51 (PM-confirmed):** tidak ada code `TRANSFER_INVALID`; helper `transferInvalid` di `lib/server/errors.ts` dihapus dan kegagalan pair memakai `unprocessable`/`VALIDATION_ERROR` (field hilang/malformed, source=destination dengan `fieldErrors.toWalletId`), `WALLET_UNAVAILABLE` (terarsip), 404 `NOT_FOUND` generik (tidak ada/asing/tak terlihat), `ACCESS_DENIED` 403 (pair terlihat tanpa hak) | BUG-1 QA T-009 F6: kode kontrak A-49 menyebut `TRANSFER_INVALID` padahal jalur HTTP tidak pernah memancarkannya; A-51 memutuskan memakai code existing agar machine-readable contract = perilaku aktual | Arch-dec A-51 (PM-confirmed 2026-10-09); memperbarui Dev Plan, bukan Spec/PRD |
| 2026-10-09 | **Aksesibilitas dialog (AC-F6-12):** focus trap + focus return ke trigger diekstrak ke satu hook bersama `hooks/useDialogFocusTrap.ts` (dipakai `WalletFormSheet`, `WalletPickerSheet`, `WalletManageSheet`, `WalletDetailSheet`, `ReceiptImageViewer`); pola sama dengan dialog existing doc 03 §5.1 (Escape, backdrop, `role="dialog"`+`aria-modal="true"`), tanpa animasi tambahan sehingga reduced-motion tidak berubah | QA T-009 F6 resiko AC-F6-12: sheet wallet + viewer struk hanya menangani Escape/backdrop tanpa trap Tab dan tanpa focus return; duplikasi pola trap sudah ada di dua komponen jadi hook bersama adalah perubahan terkecil | Tidak mengubah Spec; design 06 §14 (rujukan) |
| 2026-10-09 | **Semantik picker (AC-F6-12):** `WalletPickerSheet` menerima `selectedWalletId` dari pemanggil, merender `aria-selected` yang akurat + styling terpilih, `role="option"` pada anak langsung listbox (`li role="none"`), roving `tabIndex`, dan navigasi Arrow atas/bawah; Escape/backdrop menutup tanpa mengubah field | QA T-009 F6 resiko AC-F6-12: semua opsi merender `aria-selected={false}` (status selected palsu) dan tidak ada kontrol keyboard terarah; kepemilikan state tetap di pemanggil agar picker tidak jadi kontrol mati | Tidak mengubah Spec; design 06 §14 (rujukan) |
| 2026-10-09 | **Alur "Buat dompet baru" dari picker (C-32):** `onCreate` menutup picker (`setPickerTarget(null)`/`setPickerOpen(false)`) lalu membuka `WalletFormSheet`; pemanggil menyimpan field tujuan (`createTarget` di `ManualEntryForm`) supaya wallet hasil simpan langsung ter-bind ke field itu; `onClose` form hanya menutup sheet (nilai field tidak berubah); picker tidak pernah dibuka ulang otomatis | Design 06 §7.1/C-32: picker (z-80) dan form (z-70) yang sama-sama terbuka membuat form tak bisa disentuh di `ManualEntryForm`; menutup picker dulu adalah perbaikan minimal tanpa menaikkan z-index atau menumpuk dua dialog modal. Picker di-remount (`pickerKey`) supaya daftar wallet ter-refetch dan dompet baru muncul saat picker dibuka lagi | Tidak mengubah Spec; design 06 §7.1/C-32 (rujukan) |
| 2026-10-09 | **Dialog bersarang = stack topmost-only:** `useDialogFocusTrap` menyimpan id dialog yang terbuka di array module-level dan listener `keydown` hanya bertindak bila dialog itu yang teratas; Escape/Tab diabaikan selama ada dialog anak terbuka. Field tabIndex dialog induk juga tidak dipakai untuk menghitung first/last (trap induk tidak aktif), sehingga Tab tidak bocor dari picker/induk | QA BUG-3/BUG-4: listener `keydown` di `document` dari dialog induk dan anak sama-sama aktif, sehingga Escape menutup dua layer dan fokus jatuh ke `body` (isian hilang) serta Tab melompat ke dialog induk. Satu stack bersama memperbaiki keduanya tanpa mengubah API 4 komponen pemakai hook | Tidak mengubah Spec; design 06 §11/§14 (rujukan) |
| 2026-10-09 | **Touch target wallet surface ≥44px:** `min-h-11` pada `Kelola` (`WalletCard`), helper "Termasuk dompet di Arsip" (`WalletSummaryPair`, hit area 44px dengan `-my-1.5` agar tinggi visual kartu tidak berubah banyak), dan aksi baris `WalletManageSheet` | QA BUG-5 + konvensi `components/ui/Button.tsx` ("Every size keeps a tap target of at least 44px (R-03)"); kontrol <44px di surface wallet melanggar konvensi yang sama. Layout 390px tetap satu kolom/tanpa overflow horizontal (perubahan hanya tinggi) | Tidak mengubah Spec; design 06 §11/§14 + konvensi Button R-03 (rujukan) |

| 2026-10-09 | DTO `WalletDTO` menambah field `openingBalanceLocked: boolean` (server-computed dari keberadaan baris transaksi) di samping kontrak A-49 | Desain §6.2 mewajibkan field Saldo awal dirender disabled saat terkunci; tanpa flag ini klien tidak punya sumber server-side. Additive/backward-compatible | Tidak mengubah Spec; perlu catatan QA (bukan perubahan perilaku) |
| 2026-10-09 | `visibleWalletWhere` menghasilkan `{ householdId, OR: [SHARING, createdByUserId=actor] }`; diterapkan di repository (list/find/update/trash/balance/union receipt) | A-38: `householdId` saja tidak cukup; predikat di query, bukan hanya service | Arch-dec A-38 (ratified) |
| 2026-10-09 | Redaksi A-39 memakai `privateGroupIdsForActor` (grup transfer yang punya leg di wallet tak terlihat) → projection generik untuk non-pemilik/non-creator | Menegakkan "hanya satu kaki Bersama, generik" tanpa membocorkan metadata Pribadi | Arch-dec A-39 (ratified) |
| 2026-10-09 | Sinyal `Lihat struk` (C-30) = `receiptId` non-null pada baris transaksi yang terlihat dan tidak teredaksi | Baris teredaksi A-39 selalu `receiptId=null`; baris Pribadi hanya terlihat pemiliknya; baris Bersama terlihat household → `receiptId` adalah sinyal otorisasi yang sudah dihitung server (union A-46). Klien tidak menghitung visibilitas dari scope/kepemilikan | C-30; QA perlu mengonfirmasi oracle |
| 2026-10-09 | Kartu carousel Beranda memakai array `DashboardDTO.wallets` (server-computed), sedangkan `WalletManageSheet`/picker memuat via `GET /api/wallets` | Satu sumber angka di Beranda; menghindari dua perhitungan saldo di klien | AC-F6-7 |
| 2026-10-09 | `WalletRepository.balances(householdId)` mengembalikan `balanceMinor` + `transactionCount` (count TANPA filter `deleted_at`) | `openingBalanceLocked` butuh hitung baris termasuk trashed/kaki transfer (A-42) tanpa N+1 | A-42 |

## Open Questions (technical only)

Tidak ada open question yang meminta PM memutuskan ulang hal yang sudah dikonfirmasi, dan tidak ada keputusan PM yang masih terbuka. Keputusan PM 2026-10-09 (nama wallet default "Dompet Keluarga", kardinalitas receipt↔transaction, kode/payload duplikat OCR `DUPLICATE_RECEIPT`, **C-29** pemisahan predikat gambar vs job/draft, **C-30** route gambar terautentikasi, dan **C-31** scope wallet immutable) sudah tercatat sebagai kontrak di Keputusan Teknis + arch-dec Amendment Wallet F6 **A-36..A-50 (Accepted by PM 2026-10-09)**. Kode/status error A-49 kini berstatus **kontrak teknis ratified**, bukan draft. Sisa item murni teknis:

- **Technical (bukan PM):** kelayakan composite FK household-qualified di Prisma (fallback: FK single-column + assertion `wallet.household_id = transaction.household_id` di service).
- **Technical (bukan PM):** bentuk grouping `GET /api/transactions/trash` untuk pasangan transfer (satu baris logis vs dua baris; rekomendasi, grouping di UI dapat diterima).
- **Technical (bukan PM, C-29/C-30):** jalur penyajian byte gambar struk. **Diselesaikan dari bukti + ratifikasi PM:** F3 tidak punya jalur byte-serving (`BlobStore` hanya `put`, tidak ada route yang mengembalikan byte, `TransactionDetailSheet` hanya teks), jadi predikat union A-46/C-28 memerlukan **route gambar baru**, kini **ratified** sebagai `GET /api/ocr/receipts/{id}/image` (lihat HTTP Contract/A-49 + ADR-008 amendment Accepted 2026-10-09). Nama route **final**; alternatif `/api/receipts/{id}/image` tidak dipakai. Sisa sub-pertanyaan teknis implementasi: seam read/stream pada `BlobStore` via `get(pathname, { access: "private", token })`.
- **Technical (bukan PM, C-29):** memastikan tidak ada jalur read F3 existing (`findByReceiptId`, `getJob`, akses lewat `receiptId` pada transaksi) yang membocorkan draft ke non-uploader; penegakan `uploaded_by_user_id == actor.userId` harus di repository/service, bukan hanya di route.
