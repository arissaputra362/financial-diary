# Dev Plan: Transaksi Manual & OCR Review

Detail teknis implementasi. Ini dokumen utama yang dibaca saat generate kode. Berisi
keputusan teknis: schema, interface, validasi, testing, dan task breakdown.

## Referensi

- Spec: `docs/spec/feat-transactions-ocr.md`
- PRD: `docs/PRD.md#fitur-3-transaksi-manual-ocr-review`
- ADR terkait: ADR-001 (Prisma/Neon), ADR-003 (Gemini structured output), ADR-006 (layer), ADR-007 (free tier), ADR-008 (Blob)
- ERD: `docs/erd/erd-database-schema.md` §3.7 (transaction), §3.9 (receipt), §3.10 (ocr_job), §3.13 (idempotency_key), §4 (D-1, D-2, D-8)
- Flow: `docs/erd/flowcharts.md` §4, §5
- AC (verification-matrix): AC-F3-1 … AC-F3-9; amandemen T-012: AC-F3-10 … AC-F3-14
- Engineer: Developer · Estimasi: 4 hari · Status: Baseline plan Draft; T-012 amendment PM-approved 2026-10-22

## Ringkasan Teknis

Dua jalur masuk data: form manual (money in/out/transfer) dan upload struk yang diekstrak
Gemini Vision menjadi draft yang WAJIB direview user sebelum disimpan. Semua POST mutation
mendukung `Idempotency-Key` (claim key dulu, dedup di dalamnya — A-11). Endpoint OCR
**tidak pernah** membuat transaction. Layer terdampak: Route Handler (`app/api/transactions`,
`app/api/ocr`) → Service (`TransactionService`, `OcrService`, `IdempotencyService`) →
Repository → Prisma; seam `OcrProvider` + `BlobStore` di-inject ke service (mock-seams §1, §2).

## Schema Database

> Disalin dari ERD §3.7, §3.9, §3.10, §3.13. Tidak ada kolom baru pada kontrak
> T-006. Amandemen T-012 menambahkan `ocr_job.attempt` lewat migrasi additive;
> lihat §Amandemen 2026-10-22.

### Tabel: `transaction`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| type | enum | NOT NULL | `MONEY_IN \| MONEY_OUT` (input `TRANSFER` ditranslasi ke 2 kaki, AC-F3-3) |
| amount_minor | int | NOT NULL, CHECK > 0 `*` | IDR scale 0 |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| category | varchar | nullable | kanonik A-09 |
| merchant | varchar | nullable | ≤120 |
| note | text | nullable | ≤500 |
| occurred_at | timestamptz | NOT NULL | UTC |
| source | enum | NOT NULL | `MANUAL \| OCR` |
| receipt_id | uuid | FK → receipt, nullable | |
| transfer_group_id | uuid | nullable, TANPA FK | server-generated |
| deleted_at | timestamptz | nullable | soft delete |
| deleted_by_user_id | uuid | FK → user, nullable | |
| created_at / updated_at | timestamptz | NOT NULL | |

Constraint: `idx(household_id, deleted_at, occurred_at desc)`;
`UNIQUE(household_id, transfer_group_id, type)`.
`CHECK transaction_transfer_group_consistency` lama dihapus oleh migrasi
`20261006120000_fix_transfer_enum` (BUG-001): kedua kaki transfer (`MONEY_OUT` +
`MONEY_IN`) boleh berbagi `transfer_group_id`; enum `TRANSFER` tidak lagi dipakai.

### Tabel: `receipt`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| uploaded_by_user_id | uuid | FK → user, NOT NULL | |
| content_sha256 | varchar | NOT NULL | dedup |
| mime_type | varchar | NOT NULL | jpeg/png/webp |
| size_bytes | int | NOT NULL | ≤4.194.304 |
| storage_key | varchar | NOT NULL | Vercel Blob key; byte TIDAK di DB |
| created_at | timestamptz | NOT NULL | |

Constraint: `UNIQUE(household_id, content_sha256)` → 409 `DUPLICATE_RECEIPT`.

### Tabel: `ocr_job`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| receipt_id | uuid | FK → receipt, NOT NULL | |
| status | enum | NOT NULL | `PROCESSING \| SUCCEEDED \| FAILED` |
| model | varchar | nullable | |
| result_json | jsonb | nullable | draft; tidak pernah auto-save |
| confidence | float | nullable | |
| error_code | varchar | nullable | namespace A-10 |
| created_at | timestamptz | NOT NULL | |
| completed_at | timestamptz | nullable | |

Index: `idx(receipt_id)`; opsional `*` partial `UNIQUE(receipt_id) WHERE status = 'PROCESSING'`.

> Amandemen T-012 (Draft, belum diimplementasikan) menambahkan kolom
> `attempt int NOT NULL DEFAULT 1`, `UNIQUE(receipt_id, attempt)`, dan index
> `(receipt_id, attempt DESC)`. Lihat §Amandemen 2026-10-22.

### Tabel: `idempotency_key`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → user, NOT NULL | scope per user (A-22) |
| key | varchar | NOT NULL | header `Idempotency-Key` |
| request_hash | varchar | NOT NULL | sha256(method + path + canonical JSON) |
| response_status | int | nullable | |
| response_body | jsonb | nullable | snapshot response penuh |
| created_at | timestamptz | NOT NULL | |
| expires_at | timestamptz | NOT NULL | created_at + 24 jam |

Constraint: `UNIQUE(user_id, key)`, `idx(expires_at)`.

## Interface & Contract

### Repository Interface (`lib/server/repositories/`)

- `TransactionRepository.create(data): Transaction`
- `TransactionRepository.createTransferPair(householdId, outData, inData): Transaction[]` (satu tx)
- `TransactionRepository.findById(householdId, id): Transaction | null`
- `TransactionRepository.listActive(householdId, filters): { rows, nextCursor }`
- `ReceiptRepository.findByHash(householdId, sha256): Receipt | null`
- `ReceiptRepository.create(data): Receipt`
- `OcrJobRepository.create(data): OcrJob`
- `OcrJobRepository.findById(householdId, id): OcrJob | null`
- `OcrJobRepository.update(id, patch): OcrJob`
- `IdempotencyRepository.claim(userId, key, requestHash): { claimed: boolean, existing?: IdempotencyKey }`
- `IdempotencyRepository.complete(id, status, body): void`
- `IdempotencyRepository.purgeExpired(userId): void`

Semua method ledger **wajib** menerima `householdId` scope (ADR-006).

### Service Interface (`lib/server/services/`)

- `TransactionService.createManual(actor, householdId, input, idempotencyKey?): TransactionDTO`
- `TransactionService.createFromOcr(actor, householdId, input, idempotencyKey?): TransactionDTO`
- `OcrService.upload(actor, householdId, file, idempotencyKey?): { job, draft }`
- `OcrService.getJob(householdId, jobId): { job, draft }`
- `IdempotencyService.run(userId, key, requestHash, fn): { status, body }` — single-transaction idempotency
- `OcrProvider.extract(imageBytes, mimeType): OcrDraft | OcrError` (seam)
- `BlobStore.put(bytes, key, contentType): { key, url }` (seam)

### HTTP Contract

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/transactions` | POST | Approved | `{ type, amountMinor, category, occurredAt, note?, merchant?, source?, receiptId? }` + `Idempotency-Key` | `201 TransactionDTO` |
| `/api/ocr/receipts` | POST | Approved | multipart image + `Idempotency-Key` | `200 { job, draft }` |
| `/api/ocr/jobs/{id}` | GET | Approved | - | `{ job, draft }` |

`OcrDraftDTO` = `{ merchant, totalAmountMinor, currencyCode, occurredAt, category, taxAmountMinor, confidence, missingFields, notes }` (schema di arch-dec "Structured model schemas").

### Validasi Rules (Zod)

| Field | Rules | Pesan error (bahasa awam) |
|---|---|---|
| type | required, in `MONEY_IN\|MONEY_OUT\|TRANSFER` | "Pilih jenis transaksi." |
| amountMinor | required, int, > 0, ≤ 2.147.483.647 | "Jumlah harus lebih dari 0." / "Jumlah terlalu besar." |
| occurredAt | required, ISO date, tidak > now WIB | "Tanggal tidak boleh di masa depan." |
| category | required, in kanonik A-09, sesuai type | "Pilih kategori yang sesuai." |
| note | optional, ≤500 | "Catatan maksimal 500 karakter." |
| merchant | optional, ≤120 | "Nama toko maksimal 120 karakter." |
| file | required, mime jpeg/png/webp, ≤4.194.304 byte | "Ukuran foto maksimal 4 MB." / "Format foto harus JPG, PNG, atau WebP." |

Kategori kanonik (A-09): `food, transport, bills, shopping, health, education, entertainment, income, gift_donation, other`. MONEY_OUT: semua kecuali `income`; MONEY_IN: `income, gift_donation, other`.

### Error namespace OCR (A-10) — WAJIB

Kegagalan OCR tetap **HTTP 200** dengan `{ job: { status: FAILED, errorCode }, draft: null }`.
`errorCode` ∈ `OCR_TIMEOUT | OCR_RATE_LIMITED | OCR_INVALID_OUTPUT | OCR_MODEL_UNAVAILABLE`.

### Precedence idempotency (A-11) — WAJIB

Urutan: (1) claim key → (2) di dalam claim jalankan dedup receipt/mutasi → (3) tulis
`response_status` + `response_body` → commit. Key sama + payload sama → replay; key sama +
payload beda → 409 `IDEMPOTENCY_CONFLICT`; mutasi gagal → rollback (key hilang); tanpa key →
normal; path bagian dari hash.

## Async & Queue

Tidak ada background worker (Vercel Hobby, ADR-007). OCR bersifat **synchronous-within-request**:
`PROCESSING` transient dalam request upload. Timeout model eksplisit 8–10 detik; `maxDuration`
route disetel sesuai batas platform.

## Test Scenario (BDD)

### Unit (Service — mock Repository + seam)

- it validates amount > 0 and rejects 0/negative/out-of-range (AC-F3-1)
- it rejects `occurred_at` in the future (WIB) (AC-F3-1)
- it enforces category per type (A-09) (AC-F3-1)
- it stores amount as integer minor with `Minor` DTO suffix (AC-F3-2)
- it creates exactly two transfer legs with the same `transfer_group_id` in one tx (AC-F3-3)
- it converts date-only D to `occurred_at` = D 12:00 Asia/Jakarta (AC-F3-4)
- it never creates a transaction from the OCR endpoint (AC-F3-4)
- it maps each model failure to the correct `OCR_*` code with HTTP 200 (AC-F3-5)
- it flags low-confidence drafts (<0.70) and leaves `missingFields` empty (AC-F3-7)
- it claims the idempotency key before running dedup (AC-F3-8)

### Feature (Route Handler)

- it returns 422 with plain-language fieldErrors on invalid manual input (AC-F3-1)
- it returns 422 `AMOUNT_OUT_OF_RANGE` above int32 max (AC-F3-1)
- it returns 201 with two legs for a transfer (AC-F3-3)
- it returns 200 with job+draft and no transaction on valid upload (AC-F3-4)
- it returns 422 `FILE_INVALID` for >4MB or bad mime (AC-F3-4)
- it returns 409 `DUPLICATE_RECEIPT` + existing job for same sha256 in household (AC-F3-6)
- it allows the same content in a different household (AC-F3-6)
- it replays the original response for same key+payload, incl. replay of 409 (AC-F3-8)
- it returns 409 `IDEMPOTENCY_CONFLICT` for same key+different payload (AC-F3-8)
- it rolls back the key when the mutation fails (AC-F3-8)
- it never leaks `GEMINI_API_KEY`/`DATABASE_URL` in the response (AC-F3-9)

### Integration

- it completes manual entry → appears in activity end-to-end (AC-F3-1..AC-F3-3)
- it completes upload → draft → edit → save with `source=OCR` end-to-end (AC-F3-4)
- it enforces `UNIQUE(household_id, content_sha256)` under concurrent upload (AC-F3-6)
- it enforces idempotency precedence under concurrent duplicate (P2002 → replay) (AC-F3-8)

### Smoke

- it scans the client bundle for `GEMINI_API_KEY`/`DATABASE_URL` (must be absent) (AC-F3-9)

## Task Breakdown

### Database & Model

- [ ] `prisma/schema.prisma`: model `Transaction`, `Receipt`, `OcrJob`, `IdempotencyKey` sesuai §Schema Database
- [ ] Enums: `TransactionType`, `TransactionSource`, `OcrJobStatus`
- [ ] Migration + raw SQL: CHECK amount/transfer group, `UNIQUE(household_id, content_sha256)`, `UNIQUE(user_id, key)`, partial OCR PROCESSING
- [ ] Fixture: boundary amounts, transfer pair, receipts/jobs, idempotency rows (fixtures-seed-plan §3, §6, §8, §9)

### Repository

- [ ] Interface + implementasi Prisma untuk 4 repository di §Repository Interface
- [ ] `createTransferPair` dalam satu interactive transaction
- [ ] `claim` memakai unique constraint sebagai claim (P2002 → re-read → replay)

### Service

- [ ] `TransactionService`, `OcrService`, `IdempotencyService`
- [ ] Seam `OcrProvider` + `BlobStore` (interface + implementasi nyata + fake untuk test)
- [ ] `lib/server/errors.ts`: namespace `OCR_*` + mapping HTTP
- [ ] Unit test: sesuai §Test Scenario > Unit

### HTTP

- [ ] Zod schema: sesuai §Validasi Rules
- [ ] Route Handlers `app/api/transactions` (POST), `app/api/ocr/receipts`, `app/api/ocr/jobs/{id}` (Node runtime)
- [ ] `maxDuration` + timeout model eksplisit
- [ ] Feature test: sesuai §Test Scenario > Feature

### Frontend

- [ ] Form manual + OCR review-before-save (milik T-006; konsumsi kontrak ini)
- [ ] State OCR: PROCESSING/SUCCEEDED/FAILED/low-confidence/duplicate (T-006)

### Async (jika ada)

- [ ] Tidak ada (synchronous-within-request).

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-01 | T-003: schema Transaction/Receipt/OcrJob/IdempotencyKey + repository (create, createTransferPair satu tx, listActive keyset, receipt findByHash, ocrJob, idempotency claim/complete/purge) | Persis ERD §3.7/3.9/3.10/3.13; CHECK amount>0 & transfer-group via raw SQL; UNIQUE(household_id, content_sha256); claim = insert-as-claim per user (A-22); kontrak Zod transaksi+OCR (A-02/A-10/A-11) di `lib/server/contracts/transactions.ts` + `ocr.ts` |
| 2026-10-05 | T-006: IdempotencyService (A-11) + TransactionService + OcrService + seam OcrProvider/BlobStore (real + fake test); 7 route handler (6 file); frontend aktivitas + add flow + scan/review + trash/undo; 187 test hijau; lint + build hijau | `GEMINI_MODEL` runtime diverifikasi → `gemini-3.5-flash` (2.5-flash 404 untuk key baru; bukti di `T-006-transactions-ocr.md`); Blob `access: private`; DUPLICATE_RECEIPT = hasil 409 committed berisi job/draft (replay A-11); integrasi DB + E2E ditunda ke T-008 |
| 2026-10-06 | QA T-006 fix: BUG-001 migrasi `fix_transfer_enum` (drop CHECK legacy + buang enum TRANSFER) + tipe persist `MONEY_IN/MONEY_OUT`; BUG-003 redirect default `/transactions`; koreksi klaim auto-detect di AGENTS.md/dev-setup-local.md; 188 unit + 5 integration hijau; typecheck + lint hijau | Integration DB dijalankan di PostgreSQL lokal setelah migrasi (fix BUG-001 diuji nyata). Devi dari handoff: auto-detect `lib/db.ts` dipertahankan karena `.env` lokal & E2E QA bergantung padanya |
| 2026-10-08 | WO-008: normalisasi salinan gambar untuk Gemini lewat seam server-only `ImageNormalizer` (Sharp: auto-orient EXIF, max edge 2048, tanpa upscale, MIME dipertahankan); byte asli tetap sumber SHA-256/dedup/size/Blob privat; fallback byte asli bila transform gagal; default model provider → `gemini-3.5-flash-lite` | Payload model lebih kecil/konstan tanpa mengubah business flow; `sharp@0.35.4` jadi dependency langsung (Next 16 sudah externalize); tidak ada panggilan Gemini/Blob nyata; spec/ADR/ERD write-lock utuh |

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-05 | Timeout model 9 detik; transaksi idempotency 20 detik; route OCR `maxDuration=30` | ADR-003 (8-10 detik) dan A-11 (mutation di dalam claim) | Tidak |
| 2026-10-05 | Blob disimpan private; hanya `storage_key` di DB | ADR-008 (byte tidak sampai client/DB) | Tidak |
| 2026-10-05 | `category` opsional untuk TRANSFER di kontrak transaksi | Design 03 §2.2 (transfer tanpa kategori) | Tidak |
| 2026-10-05 | Respons POST transaksi = `{ transactions: TransactionDTO[] }` | Transfer butuh 2 DTO dalam satu response | Tidak |
| 2026-10-05 | Model efektif `gemini-3.5-flash` | Bukti runtime ALARM-002; ADR-003 tetap acuan struktur output | Tidak |
| 2026-10-08 | WO-008: `ImageNormalizer` (Sharp) menghasilkan salinan ter-normalisasi untuk Gemini; original tak tersentuh; fallback original bila transform gagal; default model → `gemini-3.5-flash-lite` | Payload model lebih kecil/konstan; business flow, kontrak upload/error, dedup, dan retensi Blob tidak berubah; ADR-003/008 write-lock | Tidak |

## QA Log

| Tanggal | AC diuji | Hasil | Catatan |
|---|---|---|---|
| 2026-10-06 | AC-F3-3, AC-F3-8, Journey A2 (re-test BUG-001/002/003) | Pass | 188 unit + 5 integration hijau; transfer 2 kaki terverifikasi di level DB; replay idempotency deep-equal; login/signup -> /transactions. Verdict PASS. Detail: agent-comms/2026-10-06-qa-t006-retest-report.md |
| 2026-10-08 | WO-008 (normalisasi salinan OCR + default model Flash-Lite) | PASS WITH RISKS (unit/config/build; tanpa panggilan nyata) | 36/36 focused + 285/285 unit hijau; lint 0 error; tsc 0; build hijau; `sharp@0.35.4` dependency langsung & ter-externalize (nft OCR 81 file termasuk binary native). AC byte asli/dedup/Blob utuh, kontrak transform (<=2048, orient, MIME, no-upscale), fallback typed, dan pemilihan model terbukti. Integration DB tidak dijalankan; quota/quality model tidak diverifikasi. Detail: ../../agent-comms/2026-10-08-qa-wo008-report.md |
| 2026-10-08 | Timestamp persistence, bounded cross-cutting evidence (not a full AC-F3-4 retest) | Pass, bounded | On local PostgreSQL whose default timezone is `Asia/Bangkok`, actual `PrismaPg` app session reports UTC. Real `POST /api/transactions` with date-only `2026-10-07` produced matching API, Prisma, and raw-SQL epoch `1791349200000`. This supports exact persistence for this case only; calendar/filter semantics remain separate and unverified here. No Neon/production tested. Evidence: `../../agent-comms/2026-10-08-qa-t008-timezone-fix.md`. |

## Bug Fixes (2026-10-06)

### BUG-001: Transfer 500 (Critical)

- **Root cause:** raw-SQL `CHECK transaction_transfer_group_consistency` melarang
  `transfer_group_id` pada `MONEY_OUT`/`MONEY_IN`, padahal service menyimpan transfer
  sebagai dua kaki. Database menolak dengan SQLSTATE 23514.
- **Fix:** migrasi `20261006120000_fix_transfer_enum` menghapus CHECK tersebut dan
  membuang nilai enum `TRANSFER` yang tidak pernah ditulis; kontrak input tetap menerima
  `type: 'TRANSFER'` dan service menerjemahkannya ke dua kaki.
- **Files:** `prisma/migrations/20261006120000_fix_transfer_enum/migration.sql`,
  `prisma/schema.prisma`, `lib/server/repositories/ledger.ts`,
  `lib/server/contracts/transactions.ts`.
- **Verifikasi:** unit 188 hijau; integration DB 5 hijau (termasuk regression test
  transfer 2 kaki); migrasi diuji di PostgreSQL lokal.

### BUG-003: Login Redirect 404 (Major)

- **Root cause:** default redirect pasca-login menuju `/home` yang belum ada (T-005).
- **Fix:** default diarahkan ke `/transactions` (route yang sudah live), dengan komentar
  TODO untuk kembali ke `/home` setelah T-005.
- **Files:** `app/(auth)/login/page.tsx` (dipakai juga oleh `app/(auth)/signup/page.tsx`).
- **Verifikasi:** manual test login/signup (QA).

### BUG-002: Idempotency Replay 500 (Major)

- **Status:** fix savepoint sudah diimplementasi dan diratifikasi PM; QA re-test.

## Amandemen 2026-10-22: T-012 OCR Retry dan Add Reopen (PM-approved)

**Status:** Amandemen Dev Plan **Approved by PM 2026-10-22; Ready for Development**.
Approval hanya membuka scope T-012, bukan release approval. Implementasi belum
dimulai pada saat approval dicatat.
**Tiket:** `T-012` di `../tickets/15-T-012-ocr-retry.md`.
**Spec:** `docs/spec/feat-transactions-ocr.md` AC-F3-10 sampai AC-F3-14.
**PRD:** `docs/PRD.md#fitur-3-transaksi-manual-ocr-review` AC-9 sampai AC-13.
**Pemetaan:** PRD AC-9 = Spec AC-F3-10, PRD AC-10 = Spec AC-F3-11, PRD AC-11 =
Spec AC-F3-12, PRD AC-12 = Spec AC-F3-13, PRD AC-13 = Spec AC-F3-14.
**Desain:** `docs/design/03-transaction-and-ocr-flow.md` §3.5 PM-approved untuk UX
2026-10-22; implementasi tetap mengikuti Dev Plan ini.

### Ruang Lingkup dan Non-Goals

Ruang lingkup T-012:

- Retry manual eksplisit hanya untuk job OCR `FAILED` terbaru milik uploader.
- Satu `OcrJob` attempt baru per retry memakai byte privat yang sudah tersimpan;
  job gagal lama dan riwayat error tetap ada.
- Penanganan jujur bila byte tersimpan tidak tersedia atau tidak terbaca.
- `OcrJob.attempt` sebagai urutan percobaan dan klaim retry yang serialisasi pada
  row `Receipt`.
- Perbaikan intent `?add=1` agar sheet Add dapat dibuka lagi setelah ditutup.
- Tidak ada perubahan pada review sukses, simpan transaksi manual, dedup sukses,
  household hash dedup, image-sharing union, atau perilaku share receipt yang ada.

Non-goals:

- Tidak ada retry otomatis, backoff, antrean background, atau retry count UI.
- Tidak ada recovery multipart same-job. Endpoint retry tidak menerima file, tidak
  mengganti byte pada `storage_key`, dan tidak membuat `Receipt` baru.
- Tidak ada `receiptImageAvailable` dan tidak ada preflight `BlobStore.exists`.
- Tidak ada perubahan pada `Receipt`, hash, ukuran, mime, atau pemilik receipt.
- Tidak ada route halaman atau item navigasi baru; tidak ada halaman baru.
- Tidak ada auto-save atau transaction otomatis dari OCR/retry.
- Tidak ada perubahan pada ADR-003, ADR-008, transaksi, wallet, dashboard, goal,
  secrets, atau logging.

### Diagnosis Statis

Fakta yang sudah diverifikasi dari kode saat ini:

- `POST /api/ocr/receipts` membuat `Receipt` sebelum OCR, lalu `OcrJob`; unique
  `(household_id, content_sha256)` membuat upload byte yang sama mengembalikan
  `409 DUPLICATE_RECEIPT` tanpa memandang status job.
- `ReceiptScanner.retry()` mengunggah ulang `lastFileRef` ke endpoint upload dengan
  idempotency key baru. Jalur ini bertabrakan dengan dedup dan bukan retry job.
- Jalur respons `200 FAILED` memanggil `fail(errorCode)` tanpa menyimpan job id;
  jalur `409` same-uploader dengan job `FAILED` juga belum dipakai untuk retry.
- `ActivityView` menginisialisasi `sheetOpen` dari `initialAdd` sekali. Penutupan
  hanya mengubah state lokal. URL tetap `?add=1`, dan page key memuat flag add,
  sehingga navigasi ke URL yang sama tidak memicu state awal lagi.
- `findByReceiptId` saat ini memilih job dengan `createdAt DESC, id DESC`. Urutan
  ini tidak dapat diandalkan sebagai urutan percobaan ketika sebuah request
  menunggu lock: waktu `createdAt` dapat mendahului commit job lain.
- `OcrService.persist` membuat `PROCESSING` dan memanggil provider di dalam
  `ledgerTransaction`; retry akan mengikuti pola transaksi yang sama.
- `IdempotencyService.run` mengklaim key terlebih dahulu, menjalankan mutation di
  dalam claim, lalu menyimpan response. Key sama + request sama menjadi replay;
  key sama yang masih diproses menjadi konflik idempotency yang aman.

### Kontrak Data dan Migrasi

Amandemen ini menambah satu kolom additive pada `OcrJob`:

```prisma
model OcrJob {
  // ...kolom yang sudah ada
  attempt Int @default(1) @map("attempt")

  @@unique([receiptId, attempt])
  @@index([receiptId, attempt(sort: Desc)])
}
```

Aturan data:

- `attempt` adalah urutan percobaan per receipt, dimulai dari 1.
- `UNIQUE (receipt_id, attempt)` mencegah dua attempt dengan nomor sama.
- Index `(receipt_id, attempt DESC)` dipakai untuk membaca job terbaru per receipt.
- Job lama di-backfill deterministik. Receipt yang hanya punya satu job menjadi
  attempt 1; receipt historis dengan beberapa job mendapat 1..n berdasarkan
  `created_at, id` agar unique index tetap dapat dibuat.
- `@@index([receiptId])` yang lama boleh tetap ada agar migrasi murni additive;
  index komposit sudah mencakup prefix `receipt_id`. Pembersihan index redundan
  dapat menjadi task terpisah.
- Tidak ada perubahan pada `Receipt`. Retry tidak membuat receipt baru dan tidak
  mengubah `storage_key`, `content_sha256`, `mime_type`, `size_bytes`, atau
  `uploaded_by_user_id`.

Rancangan migrasi additive (dijalankan hanya setelah approval):

```sql
ALTER TABLE "ocr_job" ADD COLUMN "attempt" INTEGER;

WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "receipt_id"
           ORDER BY "created_at", "id"
         ) AS rn
  FROM "ocr_job"
)
UPDATE "ocr_job" AS j
SET "attempt" = ranked.rn
FROM ranked
WHERE j."id" = ranked."id";

ALTER TABLE "ocr_job" ALTER COLUMN "attempt" SET DEFAULT 1;
ALTER TABLE "ocr_job" ALTER COLUMN "attempt" SET NOT NULL;
CREATE UNIQUE INDEX "ocr_job_receipt_id_attempt_key"
  ON "ocr_job" ("receipt_id", "attempt");
CREATE INDEX "ocr_job_receipt_id_attempt_idx"
  ON "ocr_job" ("receipt_id", "attempt" DESC);
```

- Migrasi tidak menghapus baris dan tidak menulis ulang data receipt.
- Deploy harus menjalankan migrasi sebelum kode yang membaca `attempt` aktif.
- `OcrJobDTO` tidak berubah pada T-012. `attempt` adalah urutan internal untuk
  klaim dan audit, bukan kontrak UI baru.
- `OcrJobDTO.errorCode` tetap hanya namespace model A-10. Kode kontrol retry
  bukan bagian dari `OcrErrorCode` dan tidak ditulis ke `job.error_code`.

### Kontrak HTTP yang Diusulkan

| Route | Method | Auth | Request | Success | Control errors |
|---|---|---|---|---|---|
| `/api/ocr/jobs/{id}/retry` | POST | APPROVED, uploader-only | `Idempotency-Key` wajib; **tanpa body** | `200 { job, draft }` | `404 NOT_FOUND`; `400 INVALID_IDEMPOTENCY_KEY`; `409 OCR_NOT_RETRYABLE`; `409 OCR_RETRY_IN_PROGRESS`; `409 OCR_IMAGE_UNAVAILABLE` |

Detail request:

- `id` adalah `OcrJob.id` dari job `FAILED` terbaru yang ditampilkan UI, bukan
  `Receipt.id`.
- `Idempotency-Key` wajib. Satu tap user menghasilkan satu key baru; double-tap
  dengan key yang sama harus menjadi replay, bukan dua panggilan model.
- Request tidak memiliki body dan tidak menerima multipart/file. Server tidak
  membaca body sebagai byte gambar dan tidak dapat mengganti byte receipt.
- Job yang tidak ada, id malformed, milik household lain, atau bukan milik
  uploader menghasilkan `404 NOT_FOUND` generik yang sama.
- Job `PROCESSING` atau `SUCCEEDED` tidak dapat di-retry.
- Respons sukses dan respons kegagalan model memakai bentuk yang sama dengan
  upload: `200 { job, draft }`, dengan `draft: null` saat `FAILED`.
- Respons tidak memuat `storage_key`, URL Blob, token, atau path internal.

Kode kontrol:

- `OCR_NOT_RETRYABLE` (`409`): job target bukan job terbaru, job target bukan
  `FAILED`, atau job terbaru sudah `SUCCEEDED`.
- `OCR_RETRY_IN_PROGRESS` (`409`): job terbaru `PROCESSING`, atau request kalah
  klaim setelah row lock dan menemukan percobaan lain sedang berjalan.
- `OCR_IMAGE_UNAVAILABLE` (`409`): byte asli null, gagal dibaca, kosong,
  terpotong, atau ukuran tidak sesuai metadata. Tidak ada job baru dan tidak ada
  panggilan model. Kode ini juga dipakai untuk kegagalan operasi Blob; tidak ada
  `503 OCR_RETRY_UNAVAILABLE` terpisah.
- `INVALID_IDEMPOTENCY_KEY` (`400`): key hilang atau tidak valid.
- `NOT_FOUND` (`404`): generik untuk job tidak ada, foreign, cross-household,
  atau bukan uploader. Tidak ada pembedaan pesan.

Tidak ada `422 FILE_INVALID` atau `422 RECEIPT_MISMATCH` pada endpoint retry
karena tidak ada file yang dikirim. Semua error memakai envelope
`{ error: { code, message, fieldErrors } }` yang sudah ada.

### Alur Service dan Klaim Serialisasi

`OcrService.retry(actor, jobId, idempotencyKey)`:

1. Parse dan wajibkan `Idempotency-Key`.
2. Jalankan seluruh operasi di dalam `IdempotencyService.run` dengan request hash
   `POST + path` (tanpa body).
3. `ocrJob.findByIdForActor(actor, jobId)`. Null, foreign household, atau bukan
   uploader menghasilkan `404` generik. Ini gerbang ACL, bukan image union.
4. Ambil row lock `Receipt` dengan `SELECT ... FOR UPDATE` melalui repository
   additive, mis. `receipt.lockByIdForActor(actor.householdId, job.receiptId)`.
   Null atau `uploaded_by_user_id !== actor.userId` menghasilkan `404` generik.
5. **Setelah lock didapat**, baca ulang job terbaru receipt dengan urutan
   `attempt DESC` (bukan `createdAt`). Keputusan memakai hasil baca ulang ini:
   - `latest.id !== jobId` → `OCR_NOT_RETRYABLE` (job target basi).
   - `latest.status === "PROCESSING"` → `OCR_RETRY_IN_PROGRESS`.
   - `latest.status === "SUCCEEDED"` → `OCR_NOT_RETRYABLE`.
   - `latest.status !== "FAILED"` → `OCR_NOT_RETRYABLE`.
6. Baca byte secara lazy dari `receipt.storage_key` melalui `BlobStore.get`, dengan
   batas `MAX_RECEIPT_BYTES + 1`, lalu verifikasi byte tidak kosong dan panjangnya
   sama dengan `receipt.size_bytes`. Null, error baca, byte kosong/terpotong, atau
   ukuran tidak sama → `OCR_IMAGE_UNAVAILABLE`; **tidak ada job baru dan tidak ada
   panggilan provider**.
7. Alokasikan `nextAttempt = latest.attempt + 1` dan buat `OcrJob` baru
   `PROCESSING` untuk receipt yang sama. Karena row `Receipt` terkunci, tidak ada
   dua retry yang mengalokasikan attempt yang sama.
8. Panggil `extract` dengan normalizer dan provider yang sama seperti upload.
   Sukses: update job baru `SUCCEEDED`, `resultJson`, `confidence`, `completedAt`.
   Gagal model: update job baru `FAILED`, `errorCode`, `completedAt`. Job lama
   tidak disentuh.
9. Kembalikan `{ job: toOcrJobDTO(...), draft }`.

Transaksi, lock, dan idempotency:

- Row lock `Receipt` dipegang dari langkah 4 sampai transaksi selesai, termasuk
  panggilan provider. Ini membuat retry untuk receipt yang sama berjalan
  serialisasi dan konsisten dengan pola upload yang sudah ada.
- Re-check setelah lock harus membaca versi terbaru yang sudah commit. Jalankan
  transaksi pada `READ COMMITTED` (default PostgreSQL) atau gunakan locking/current
  read; jangan mengandalkan snapshot `REPEATABLE READ` yang dibuat sebelum lock.
  Unique `(receipt_id, attempt)` tetap menjadi pengaman terakhir bila snapshot
  basi dan alokasi attempt bertabrakan.
- Request retry kedua yang menunggu lock akan membaca ulang job terbaru setelah
  lock didapat. Jika retry pertama `SUCCEEDED`, job terbaru sudah `SUCCEEDED`.
  Jika retry pertama `FAILED`, job terbaru adalah `FAILED` baru milik retry
  pertama dan job target retry kedua sudah basi. Keduanya ditolak tanpa
  panggilan provider.
- Partial unique `UNIQUE(receipt_id) WHERE status = 'PROCESSING'` tetap ada
  sebagai defense in depth. `P2002` dipetakan ke `OCR_RETRY_IN_PROGRESS` hanya
  setelah dipastikan constraint yang gagal adalah partial unique OCR, bukan
  unique lain.
- Retry memakai `ledgerTransaction` yang sudah ada, timeout 20 detik; route
  `maxDuration = 30`. Ini sama dengan upload OCR synchronous.
- Key idempotency yang sama menjalankan replay response asli. Key sama yang masih
  diproses mengikuti perilaku `IdempotencyService` yang ada (konflik aman), tanpa
  panggilan provider kedua. Key berbeda bersamaan diserialisasi oleh row lock dan
  mendapat kode kontrol OCR.
- Job lama tetap `FAILED`; riwayat percobaan bersifat append-only.

### Concurrency dan Idempotency

| Skenario | Hasil |
|---|---|
| Dua tap dengan key sama, berurutan | Satu eksekusi, satu replay response |
| Dua tap dengan key sama, bersamaan | Satu eksekusi; request lain replay atau konflik idempotency in-progress; tanpa provider kedua |
| Dua key berbeda, job target sama | Satu klaim; yang kalah `OCR_RETRY_IN_PROGRESS` atau `OCR_NOT_RETRYABLE`; tanpa provider |
| Retry pertama sukses sebelum retry kedua mendapat lock | Retry kedua melihat job terbaru `SUCCEEDED` → `OCR_NOT_RETRYABLE`; tanpa provider |
| Retry pertama gagal sebelum retry kedua mendapat lock | Retry kedua melihat job terbaru `FAILED` baru milik retry pertama; job targetnya basi → `OCR_NOT_RETRYABLE`; tanpa provider |
| Tab lama masih memegang job `FAILED` setelah retry sukses | `latest` sudah `SUCCEEDED` → `OCR_NOT_RETRYABLE` |
| Retry setelah retry gagal | Job terbaru `FAILED`, jadi retry berikutnya diizinkan dan membuat attempt baru |

Tidak ada retry otomatis dan tidak ada loop di client. Setiap percobaan adalah
satu tap eksplisit.

### ACL dan Privasi

- Job, draft, retry, dan byte receipt hanya untuk uploader asli receipt.
  `findByIdForActor` dan row lock receipt tetap menjadi gerbang, bukan image
  union C-28/A-46.
- Anggota household lain yang mengunggah byte sama tetap mendapat
  `409 DUPLICATE_RECEIPT` generik tanpa job, draft, receipt id, uploader, atau
  detail availability.
- `GET /api/ocr/receipts/{id}/image` tidak berubah. Retry tidak memperluas akses
  gambar ke anggota lain dan tidak membuat URL publik.
- Respons retry tidak boleh memuat `storage_key`, URL Blob, token, atau path
  internal. Tidak ada byte gambar di response.
- Perilaku sukses yang sudah ada tetap: uploader dapat review dan menyimpan,
  receipt yang tertaut wallet Sharing tetap mengikuti aturan image union, dan
  dedup lintas household tidak berubah.
- Tidak ada perubahan secrets atau logging. Prompt mentah model dan byte gambar
  tidak boleh masuk log.

### Perilaku Blob Hilang

- Aksi retry hanya muncul pada state job `FAILED` terbaru milik uploader. Tidak
  ada `receiptImageAvailable`, tidak ada `BlobStore.exists`, dan tidak ada
  pengecekan ketersediaan sebelum user menekan retry.
- Saat retry ditekan, server membaca Blob secara lazy. Jika byte tidak tersedia
  atau tidak terbaca, server tidak membuat job baru dan tidak memanggil model;
  respons `409 OCR_IMAGE_UNAVAILABLE` dan job lama tetap utuh.
- UI mengganti kartu retryable dengan salinan jujur: gambar struk tidak bisa
  diproses lagi, pemindaian tidak bisa diulang dari kartu itu, dan percobaan
  gagal sebelumnya tidak mengubah catatan keuangan. Aksi: `Isi manual` dan
  `Pilih struk lain`.
- `Pilih struk lain` membuka alur upload normal baru (kamera/dropzone), bukan
  retry dan bukan recovery same-job. Jika user memilih byte yang sama, dedup
  existing berlaku; job `FAILED` tersebut tetap tidak bisa di-retry tanpa gambar
  tersimpan dan UI tidak boleh mengklaim sebaliknya.
- Tidak ada `Coba periksa lagi` karena tidak ada pengecekan availability yang
  bisa diulang. Tidak ada klaim bahwa retry akan berhasil sebelum server membaca
  byte.

### Dampak Frontend

`components/transactions/ReceiptScanner.tsx`:

- Simpan `failedJob` (`id`, `receiptId`, `errorCode`) saat respons `200 FAILED`
  atau `409` same-uploader membawa job `FAILED`.
- `Pindai ulang` (revisi UX 2026-10-23) membuka pemilih file, bukan memanggil
  endpoint retry langsung. Reset `input.value` sebelum membuka picker agar file
  yang sama tetap memicu `change`.
- File yang dipilih dikirim ke `POST /api/ocr/receipts`:
  - byte berbeda membuat `Receipt` dan job baru, lalu OCR berjalan normal;
  - byte identik mengembalikan `409 DUPLICATE_RECEIPT` dengan job `FAILED` milik
    uploader, lalu client memanggil `/api/ocr/jobs/{job.id}/retry` dengan
    `Idempotency-Key` baru, method POST, tanpa body.
- Saat file diproses, tampilkan loading state yang sudah ada. `Isi manual`,
  `Batal`, dan `X` tetap aktif. Guard double tap tetap.
- Sukses retry memakai `hydrateReview` yang sama. Gagal retry menyimpan job baru
  dan menampilkan kartu gagal lagi.
- `409 OCR_IMAGE_UNAVAILABLE` mengganti kartu retry dengan varian tidak tersedia;
  tombol retry dihapus, `Pilih foto struk` (pemilih file) dan `Isi manual`
  tersedia. Tidak ada pengecekan availability di client dan tidak ada klaim
  bahwa retry bisa dilanjutkan.
- Simpan id job yang sudah menerima `OCR_IMAGE_UNAVAILABLE` di sesi itu. Jika
  user memilih file identik lagi, tetap tampilkan varian tidak tersedia dan
  jangan memanggil provider.
- Jangan mengisi field dari percobaan gagal. Tidak ada auto-save.

`app/transactions/page.tsx` dan `components/transactions/ActivityView.tsx`:

- Jangan memakai flag `add` sebagai bagian key yang memaksa remount. Key page
  tidak boleh berubah hanya karena `add`; gunakan `initialAdd` sebagai intent dan
  buka sheet saat nilainya bertransisi menjadi `true`.
- Satu helper penutup sheet menangani `X`, `Batal`, `Escape`, dan backdrop. Helper
  menulis URL sekali dengan `router.replace`, menghapus hanya `add`, dan
  mempertahankan `month` atau `view=trash`. Tidak boleh ada `router.push` untuk
  penutupan.
- `handleCreated` dan penutupan harus berbagi satu penulis URL. Saat simpan
  berhasil, `handleCreated` menentukan target active view sekali (bulan aktif,
  tanpa `add`, tanpa `view=trash`) dan penutupan setelah simpan tidak boleh
  menulis `router.replace` kedua dari state trash yang lama. Gunakan flag/ref
  "sudah dinavigasi" atau satu fungsi commit dengan alasan `saved` vs `dismiss`.
- Fokus kembali ke trigger. Jika trigger dari URL lintas halaman sudah tidak
  terpasang, fokus ke tombol `Tambah transaksi` yang terlihat.
- Aksi Add global tetap membuka sheet dalam satu klik setelah penutupan karena
  intent `add` sudah dihapus dari URL.

### Manual Review

- Retry sukses hanya menghasilkan draft. User tetap memilih wallet, memeriksa
  field, dan menekan simpan.
- `POST /api/transactions` tetap satu-satunya jalur yang membuat transaction,
  dengan `source=OCR` dan `receiptId` yang sama.
- Retry gagal tidak menghasilkan draft dan tidak mengubah form manual.
- Low confidence, `missingFields`, dan validasi amount/tanggal/kategori mengikuti
  kontrak yang sudah ada.

### Task Breakdown T-012

- [x] Dokumentasi amandemen Spec, PRD, dan Dev Plan sebagai Draft untuk review PM.
- [x] Mencatat keputusan teknis PM 2026-10-22 dan menutup pertanyaan keputusan.
- [ ] Migrasi additive `ocr_job.attempt`, backfill, unique, dan index (hanya
  setelah approval).
- [ ] Repository: row lock `Receipt` (`SELECT ... FOR UPDATE`), ubah
  `findByReceiptId`/pembacaan job terbaru ke `attempt DESC` (dipakai juga oleh
  respons duplicate), dan pemetaan `P2002` partial unique.
- [ ] Service: `OcrService.retry` dengan urutan key → ACL → lock → re-check →
  baca Blob lazy → attempt baru → provider, tanpa file/multipart.
- [ ] HTTP: route `POST /api/ocr/jobs/{id}/retry`, tanpa body, validasi
  idempotency, `404` generik, dan kode kontrol.
- [ ] Frontend OCR: `failedJob`, aksi retry, varian `OCR_IMAGE_UNAVAILABLE`,
  `Isi manual`, `Pilih struk lain`, dan loading/failure/review states.
- [ ] Frontend Add intent: hapus `add` dengan replace, effect transisi intent,
  satu penulis URL, focus fallback, dan preservasi bulan/trash.
- [ ] QA: test plan dan verifikasi ditulis QA secara terpisah setelah Spec/Dev
  Plan disetujui. Dev Plan ini tidak menambah test scenario baru.

### Progress Log T-012

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-22 | Dokumentasi T-012 (Spec, PRD, Dev Plan) | Draft awal untuk review PM. Tidak ada kode, schema, migrasi, API, atau test yang diubah. Implementasi belum dimulai. |
| 2026-10-22 | Revisi Draft sesuai keputusan teknis PM | Menambahkan rencana `ocr_job.attempt` dan klaim row lock, menghapus recovery multipart, `receiptImageAvailable`, dan `BlobStore.exists`, serta memperjelas Add intent satu penulis URL. Belum ada implementasi, migrasi, API, test, atau perubahan tiket/TASK-PLAN. |
| 2026-10-22 | PM menyetujui amandemen Spec/Dev Plan dan UX untuk T-012. | DDD gate T-012 lulus; internal ticket dibuat dan task dibuka. Implementasi belum dilakukan pada saat approval. QA/release tetap gate terpisah. |
| 2026-10-22 | Implementasi backend retry OCR. | Migrasi additive `20261022140000_ocr_job_attempt` (attempt, backfill ROW_NUMBER, unique, index desc), route retry, row lock `Receipt`, lazy Blob read, kode kontrol `OCR_IMAGE_UNAVAILABLE`/`OCR_RETRY_IN_PROGRESS`/`OCR_NOT_RETRYABLE`. `tsc` bersih, unit 391/391 saat itu, integrasi retry 4/4. Tidak ada panggilan Gemini/Blob nyata. |
| 2026-10-22 | Implementasi frontend retry dan Add intent. | `Pindai ulang` dengan loading dan guard double tap, varian gambar hilang, review editable dipertahankan, intent Add dipindah ke kanal sinkron `lib/transaction-add-intent.ts`, key halaman tidak lagi memuat `add`. E2E 33/33 saat itu. |
| 2026-10-22 | QA ronde 1: FAIL. | Dua defect UI: `add=1` tertinggal dan Add global gagal dibuka dalam 0-150 ms; konflik retry menampilkan dead end karena me-refresh job target yang stale. Backend, migrasi, privasi, dan Blob matrix lulus. |
| 2026-10-22 | Perbaikan BUG-1 dan BUG-2. | Intent Add dikirim sinkron ke sheet yang sudah ter-mount; penutupan membersihkan intent lebih dulu lalu `router.replace`. Konflik retry menyelesaikan job terbaru receipt dan memetakan SUCCEEDED/FAILED/PROCESSING. Test race 0/50/100/150 ms dan dua tab ditambahkan. |
| 2026-10-22 | QA ronde 2 dan task acceptance PM. | **PASS WITH RISKS**. Race Add 768/768, dua tab 8/8, E2E 63/63, unit 395/395, integrasi retry 4/4, `tsc` bersih. Risiko terbuka: polling `PROCESSING` tanpa batas dan BUG-3 duplikat submit satu tick (pre-existing, WO terpisah). T-012 `done` sebagai task acceptance; release tetap menunggu T-008. |
| 2026-10-23 | Revisi UX retry: picker gambar. | User meminta `Pindai ulang` dapat memilih atau mengganti gambar. `Pindai ulang` sekarang membuka picker; byte berbeda jadi upload normal, byte identik memicu dedup lalu endpoint retry. Copy varian tidak tersedia menjadi `Pilih foto struk`. Desain 03 §3.5, Spec AC-F3-10..12, dan PRD AC-9..11 diselaraskan. QA revisi belum dijalankan. |

### Keputusan Teknis T-012

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-22 | Retry eksplisit hanya untuk job `FAILED` terbaru milik uploader; membuat attempt baru dan mempertahankan riwayat | Menghindari overwrite job/error lama dan mencegah retry otomatis | Spec AC-F3-10 |
| 2026-10-22 | Retry memakai byte privat tersimpan server-side; tanpa `Receipt` baru atau penggantian byte | Menjaga integritas receipt, hash, dan privasi | Spec AC-F3-11 |
| 2026-10-22 | Recovery multipart same-job tidak masuk T-012 | Tidak ada jalur aman untuk menerima byte baru lewat retry; mencegah Receipt kedua dan byte replacement | Spec AC-F3-12, Out of Scope |
| 2026-10-22 | Tambah `OcrJob.attempt` dengan unique `(receipt_id, attempt)` dan index terbaru | `createdAt` tidak andal saat request menunggu lock; attempt memberi urutan commit yang eksplisit | Spec AC-F3-13 |
| 2026-10-22 | Klaim retry memakai row lock `Receipt`, re-check setelah lock, lalu alokasi `max + 1` | Menjamin hanya satu retry yang membuat attempt/provider; partial unique hanya defense in depth | Spec AC-F3-13 |
| 2026-10-22 | Tanpa `receiptImageAvailable` dan `BlobStore.exists`; baca Blob lazy saat retry | Mengurangi round-trip dan mencegah UI menjanjikan retry sebelum byte terbukti ada | Spec AC-F3-12 |
| 2026-10-22 | Endpoint retry `POST /api/ocr/jobs/{id}/retry`, key wajib, tanpa body, uploader-only, `404` generik | Kontrak minimal dan tidak membuka jalur upload kedua | Spec AC-F3-10 |
| 2026-10-22 | Add intent dibersihkan dengan `router.replace`, transisi intent, satu penulis URL | Mencegah history entry baru, remount, dan race yang menimpa view active | Spec AC-F3-14 |
| 2026-10-22 | Kode kontrol retry terpisah dari `OcrErrorCode` | `job.error_code` tetap hanya kegagalan model A-10 | Spec AC-F3-10..13 |

### Keputusan PM (Resolved)

| ID | Keputusan | Status | Hasil |
|---|---|---|---|
| D-1 | Apakah recovery same-job (`Unggah struk yang sama`) masuk T-012? | **Resolved PM 2026-10-22** | Tidak. Tidak ada multipart, tidak ada penulisan byte, tidak ada `Receipt` baru. |
| D-2 | Apakah `receiptImageAvailable` dan `BlobStore.exists` masuk kontrak? | **Resolved PM 2026-10-22** | Tidak. Baca Blob lazy saat retry; kegagalan menjadi `OCR_IMAGE_UNAVAILABLE`. |
| D-3 | Apakah `attempt` perlu ditambahkan sekarang? | **Resolved PM 2026-10-22** | Ya. `attempt` additive, unik per receipt, menjadi urutan percobaan dan dasar klaim. |
| D-4 | Apakah penutupan Add harus mempertahankan bulan/trash dan Add bisa dibuka lagi? | **Resolved PM 2026-10-22** | Ya. `router.replace` tanpa history baru; state mengikuti transisi intent; satu penulis URL saat simpan. |
| D-5 | Label final dan sign-off design §3.5 | **Resolved untuk perilaku; sign-off visual pending** | Perilaku memakai `Isi manual` dan `Pilih struk lain`; label aksi retry mengikuti design (`Pindai ulang`) sampai sign-off desainer. |

### PM Approval and Readiness

- [x] PM menyetujui Spec AC-F3-10 sampai AC-F3-14 dan PRD AC-9 sampai AC-13 (2026-10-22).
- [x] PM menyetujui `OcrJob.attempt` beserta migrasi additive, backfill, unique,
  dan index.
- [x] PM menyetujui kontrak `POST /api/ocr/jobs/{id}/retry` tanpa body dan
  kode kontrolnya.
- [x] PM menyetujui perilaku lazy Blob dan UX `OCR_IMAGE_UNAVAILABLE` dengan
  `Isi manual` / `Pilih struk lain`.
- [x] PM menyetujui perilaku Add intent: replace tanpa history, preservasi
  bulan/trash, transisi intent, dan satu penulis URL.
- [x] UI/UX Designer memberi sign-off final untuk label dan salinan design 03
  §3.5, PM-approved UX 2026-10-22.
- [x] QA menjalankan verifikasi independen (dua ronde) dan menyimpan laporan di
  `docs/qa/t012-ocr-retry-qa-report-round2.md`; tidak ada test scenario baru di
  Dev Plan ini.
- [x] PM menyetujui amandemen Spec dan Dev Plan sebagai Ready for Development (2026-10-22).
- [x] Tiket implementasi dibuat dan `TASK-PLAN.md` diperbarui.

**DDD approval:** diberikan untuk T-012 pada 2026-10-22. Developer boleh mulai
implementasi sesuai scope dan acceptance criteria. QA dan release approval tetap
terpisah; T-008 tetap menjadi release gate.

### Risiko dan Catatan

- Row lock `Receipt` dipegang selama panggilan provider. Ini mencegah dua retry
  paralel tetapi menahan lock sampai provider selesai; timeout transaksi 20 detik
  dan `maxDuration` 30 detik harus dipantau. Alternatif melepas lock sebelum
  provider akan membuka risiko job `PROCESSING` menggantung bila proses berhenti.
- Migrasi backfill harus diuji pada data dengan lebih dari satu `OcrJob` per
  receipt, bukan hanya data satu job. Deploy migrasi sebelum kode baru.
- Tanpa preflight, pengguna bisa menekan retry lalu mendapat
  `OCR_IMAGE_UNAVAILABLE`. Ini disengaja: UI tidak menjanjikan retry sebelum byte
  terbukti ada.
- Upload byte yang sama setelah gambar hilang tetap mengikuti dedup existing dan
  dapat mengembalikan job `FAILED` yang sama. UI tidak boleh memperlakukan itu
  sebagai recovery; retry tetap akan gagal tanpa byte tersimpan.
- Retry manual berulang tetap memanggil Gemini dan dapat menghabiskan kuota.
  Tidak ada retry otomatis; idempotency, row lock, dan attempt mencegah panggilan
  ganda untuk klaim yang sama.
- Pemetaan `P2002` harus memeriksa constraint partial unique OCR, bukan menelan
  semua unique violation sebagai `OCR_RETRY_IN_PROGRESS`.
- Perbaikan Add intent bergantung pada satu penulis URL. Dua `router.replace`
  yang bersamaan dari `handleCreated` dan `close` dapat menimpa view active.
- Fokus setelah navigasi lintas halaman perlu fallback eksplisit karena trigger
  asal sudah tidak terpasang.
- Tidak ada verifikasi production, Neon, Vercel Blob nyata, atau Gemini nyata
  dalam handoff dokumentasi ini.

### Proposed Architecture Contract (bukan ADR)

Usulan ini tidak mengubah ADR-003 atau ADR-008 yang sudah Accepted:

- Objek Blob tetap `access: "private"`; retry hanya membaca byte melalui server.
  Tidak ada penulisan byte pada retry T-012.
- Tidak ada URL publik, signed URL, atau `storage_key` ke client.
- Route retry adalah route API baru, bukan route halaman atau item navigasi.
- Satu kolom additive `ocr_job.attempt` dan index/unique-nya adalah perubahan
  schema; tidak ada perubahan destruktif pada `Receipt` atau tabel lain.
- Kontrak ini dapat dicatat sebagai amandemen arsitektur terpisah setelah review
  PM bila diperlukan. Tidak perlu ADR baru pada tahap Draft ini.

### Hasil Implementasi dan QA (2026-10-22)

- Backend: `POST /api/ocr/jobs/{id}/retry`, `OcrJob.attempt`, migrasi
  `20261022140000_ocr_job_attempt`, row lock `Receipt`, dan lazy Blob read.
  Migrasi diuji pada DB lokal disposable dengan receipt satu job dan banyak job.
- Frontend: state `Pindai ulang`, varian `OCR_IMAGE_UNAVAILABLE`, intent Add
  sinkron lewat `lib/transaction-add-intent.ts`, dan satu penulis URL.
- QA ronde 1: FAIL pada race close lalu Add cepat dan dead end konflik retry.
  Keduanya diperbaiki; QA ronde 2: **PASS WITH RISKS**.
- Bukti QA ronde 2: `tsc` bersih, unit 395/395, E2E 63/63 (mobile/tablet/desktop),
  race Add 768/768, dua tab 8/8, integrasi retry 4/4.
- Terbuka di luar T-012: duplikat transaksi saat submit sintetis satu tick
  (BUG-3, pre-existing, dicatat sebagai WO terpisah) dan polling `PROCESSING`
  tanpa batas waktu.
- Verifikasi production, Neon, Vercel Blob nyata, dan Gemini nyata belum
  dilakukan. T-012 hanya task acceptance, bukan release approval.

## Open Questions

- Tidak ada pertanyaan keputusan yang tersisa; D-1 sampai D-5 sudah resolved
  dengan keputusan PM 2026-10-22.
- T-012 diterima PM pada 2026-10-22 sebagai task acceptance. Release tetap
  menunggu T-008.
