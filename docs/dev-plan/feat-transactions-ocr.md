# Dev Plan: Transaksi Manual & OCR Review

Detail teknis implementasi. Ini dokumen utama yang dibaca saat generate kode. Berisi
keputusan teknis: schema, interface, validasi, testing, dan task breakdown.

## Referensi

- Spec: `docs/spec/feat-transactions-ocr.md`
- PRD: `docs/PRD.md#fitur-3-transaksi-manual-ocr-review`
- ADR terkait: ADR-001 (Prisma/Neon), ADR-003 (Gemini structured output), ADR-006 (layer), ADR-007 (free tier), ADR-008 (Blob)
- ERD: `docs/erd/erd-database-schema.md` §3.7 (transaction), §3.9 (receipt), §3.10 (ocr_job), §3.13 (idempotency_key), §4 (D-1, D-2, D-8)
- Flow: `docs/erd/flowcharts.md` §4, §5
- AC (verification-matrix): AC-F3-1 … AC-F3-9
- Engineer: Developer · Estimasi: 4 hari · Status: Draft

## Ringkasan Teknis

Dua jalur masuk data: form manual (money in/out/transfer) dan upload struk yang diekstrak
Gemini Vision menjadi draft yang WAJIB direview user sebelum disimpan. Semua POST mutation
mendukung `Idempotency-Key` (claim key dulu, dedup di dalamnya — A-11). Endpoint OCR
**tidak pernah** membuat transaction. Layer terdampak: Route Handler (`app/api/transactions`,
`app/api/ocr`) → Service (`TransactionService`, `OcrService`, `IdempotencyService`) →
Repository → Prisma; seam `OcrProvider` + `BlobStore` di-inject ke service (mock-seams §1, §2).

## Schema Database

> Disalin dari ERD §3.7, §3.9, §3.10, §3.13. Tidak ada kolom baru.

### Tabel: `transaction`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| type | enum | NOT NULL | `MONEY_IN \| MONEY_OUT \| TRANSFER` |
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
`UNIQUE(household_id, transfer_group_id, type)`;
`CHECK ((type = 'TRANSFER') = (transfer_group_id IS NOT NULL))` `*`.

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

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| (diisi saat coding berjalan) | | | |

## QA Log

| Tanggal | AC diuji | Hasil | Catatan |
|---|---|---|---|
| (diisi QA) | | | |

## Open Questions

- Tidak ada. Semua kontrak merujuk A-01..A-35, ERD, dan ADR-001..008.
