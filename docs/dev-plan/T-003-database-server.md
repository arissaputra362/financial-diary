# Dev Plan: T-003 Database Schema + Server Contracts

Detail teknis implementasi T-003: Prisma schema (13 tabel, ERD D-1..D-9), migration
+ raw SQL appendix, repository layer ter-scope household, dan typed contracts (Zod)
untuk 5 domain. Living document: Progress Log dan Keputusan Teknis diperbarui setiap
sesi coding.

## Referensi

- Tiket: `../tickets/06-T-003-database-contracts.md`
- ERD (sumber schema tunggal): `docs/erd/erd-database-schema.md` §3 (13 tabel), §4 (D-1..D-9)
- Arch-dec: A-02 (4MB = 4.194.304 byte), A-05 (IDR scale 0), A-09 (kategori kanonik),
  A-10 (error namespace OCR), A-11 (idempotency precedence), A-13 (Asia/Jakarta),
  A-14 (cursor keyset), A-16 (saved amount atomic), A-17 (ALREADY_DELETED/ACTIVE),
  A-20 (batas panjang), A-21 (mime allowlist), A-22 (idempotency per user),
  A-23 (test stack), A-24 (paket per task), A-25 (service→repository→model),
  A-31 (route kanonik), A-32 (write-lock)
- ADR: ADR-001 (Prisma 7 + adapter Neon), ADR-002 (auth/session), ADR-005 (soft delete),
  ADR-006 (service→repository→model)
- Dev plan feat-*: `feat-auth-approval.md`, `feat-transactions-ocr.md`,
  `feat-goals-advisor.md`, `feat-trash-restore.md`, `feat-dashboard.md`
- AGENTS.md §5 (Data Format), §6 (konvensi kode), §9.1 (DDD)
- Engineer: Developer · Estimasi: 1 sesi · Status: In Progress

## Ringkasan Teknis

Tiga lapisan: (1) `prisma/schema.prisma` — 13 model + 8 enum persis ERD §3, dengan
constraint yang tidak bisa diekspresikan Prisma (partial unique index, CHECK) sebagai
raw SQL appendix di migration; (2) `lib/server/repositories/` — akses Prisma dengan
aturan wajib: setiap method menerima `householdId` scope dan query aktif selalu
mengecualikan `deleted_at != null`; (3) `lib/server/contracts/` — Zod schema payload +
tipe hasil `z.infer` untuk auth, transactions, goals, OCR, advisor, dengan error
eksplisit terstruktur (bukan 500 generik). Tidak ada service layer, route handler,
atau auth di T-003 (T-004/T-005/T-006).

## Schema Database

Sumber tunggal: ERD §3.1–3.13. Ringkasan model (detail kolom = ERD, tidak diduplikasi):

| Model | Tabel | Catatan kunci |
|---|---|---|
| User | `user` | email unique normalized lowercase |
| Household | `household` | owner_user_id FK |
| Membership | `membership` | UNIQUE(user_id, household_id) + partial unique aktif |
| Invite | `invite` | code_hash unique (sha256) |
| MembershipEvent | `membership_event` | immutable, tanpa updated_at |
| Session | `session` | TANPA household_id (D-4) |
| Transaction | `transaction` | soft delete, transfer_group_id tanpa FK |
| SavingsGoal | `savings_goal` | soft delete, CHECK target > 0, saved >= 0 |
| Receipt | `receipt` | UNIQUE(household_id, content_sha256) |
| OcrJob | `ocr_job` | partial unique PROCESSING per receipt |
| AdvisorInsight | `advisor_insight` | cache insight sukses |
| HouseholdBudget | `household_budget` | UNIQUE(household_id, period_start) |
| IdempotencyKey | `idempotency_key` | UNIQUE(user_id, key), scope per user (A-22) |

Raw SQL appendix di migration (tanda `*` ERD §3):
- `UNIQUE(user_id) WHERE status IN ('PENDING','APPROVED')` (membership)
- `CHECK (amount_minor > 0)` (transaction)
- `CHECK ((type = 'TRANSFER') = (transfer_group_id IS NOT NULL))` (transaction)
- `CHECK (target_amount_minor > 0)` dan `CHECK (saved_amount_minor >= 0)` (savings_goal)
- `CHECK (amount_minor > 0)` (household_budget)
- Partial `UNIQUE(receipt_id) WHERE status = 'PROCESSING'` (ocr_job)

Semua FK `onDelete: Restrict` / `onUpdate: Restrict`. `@db.Timestamptz` eksplisit.
Uang `Int` minor, IDR scale 0 (A-05). PK UUID v4 default Prisma (uuid(7) tidak
didukung Prisma 7.10 — fallback generate di aplikasi, sesuai catatan ERD §1).

## Interface & Contract

### Repository Interface (`lib/server/repositories/`)

Kontrak method mengikuti dev plan feat-* (sumber interface). T-003 mengimplementasikan
repository yang dirujuk lintas fitur, digabung per agregat:

- `UserRepository`: `findByEmail`, `create`
- `HouseholdRepository`: `create`, `findById`
- `MembershipRepository`: `findActiveByUserId`, `findByUserAndHousehold`, `create`,
  `updateStatus`, `listByHousehold`
- `MembershipEventRepository`: `append`
- `InviteRepository`: `create`, `findByCodeHash`, `redeemConditional`, `revoke`
- `SessionRepository`: `create`, `findActiveById`, `touch`, `revoke`, `purgeExpired`
- `TransactionRepository`: `create`, `createTransferPair`, `findById`, `listActive`,
  `sumByType`, `listByDay`, `softDelete`, `restore`, `listTrash`
- `GoalRepository`: `create`, `listActive`, `findById`, `incrementSaved`, `softDelete`,
  `restore`, `listTrash`
- `ReceiptRepository`: `findByHash`, `create`
- `OcrJobRepository`: `create`, `findById`, `update`
- `AdvisorInsightRepository`: `findLatestUnexpired`, `create`, `prune`
- `BudgetRepository`: `findByPeriod`, `upsert`
- `IdempotencyRepository`: `claim`, `complete`, `purgeExpired`

Aturan wajib (ADR-006, AC T-003):
- Semua method ledger menerima `householdId` scope; single-record ops memakai
  extended-unique where (`{ id, householdId }`) → cross-household = tidak ditemukan.
- Query aktif SELALU `deletedAt: null`; trash terpisah (`listTrash`, `softDelete`,
  `restore`) — tidak pernah dicampur dengan metode aktif.
- Tidak ada logika bisnis di repository (A-25).

### Contracts (`lib/server/contracts/`)

Zod schema + `z.infer` types per domain (payload masuk; DTO keluar didefinisikan di
`types/` pada T-004+):

| File | Isi |
|---|---|
| `auth.ts` | `signupSchema`, `loginSchema`, `decisionSchema` (reason ≤200) |
| `transactions.ts` | `createTransactionSchema` (type/amountMinor/category/occurredAt/note/merchant/source/receiptId), `listQuerySchema` (type/source/from/to/cursor/limit), `idSchema` (path uuid), `trashQuerySchema` |
| `goals.ts` | `createGoalSchema`, `adjustSavedSchema` (savedDelta ≠ 0), `goalTrashQuerySchema` |
| `ocr.ts` | `ocrUploadMetaSchema` (mime allowlist A-21, ≤4.194.304 byte A-02), `ocrJobParamsSchema`, `OcrErrorCode` (A-10) |
| `advisor.ts` | `advisorInsightRequestSchema` (period start/end, span ≤90 hari), `AdvisorErrorCode` |
| `common.ts` | `idempotencyKeyHeaderSchema`, `cursorSchema`, `limitSchema` (default 20, max 50 → 422 di atas), `errorEnvelopeSchema` |

Payload invalid → `ZodError` dipetakan ke error eksplisit terstruktur
(`{ error: { code, message, fieldErrors } }`) oleh helper `parseJsonBody` /
`formatFieldErrors` — bukan 500 generik. Mapping ke HTTP status dilakukan route handler
(T-004+); T-003 menyediakan kontrak + helper murni.

### Error namespace (kontrak saja di T-003)

- OCR (A-10): `OCR_TIMEOUT | OCR_RATE_LIMITED | OCR_INVALID_OUTPUT | OCR_MODEL_UNAVAILABLE`
  — HTTP 200 + envelope `{ job: { status: FAILED, errorCode }, draft: null }`.
- Idempotency (A-11): precedence claim key dulu → dedup di dalam; key sama + payload
  beda → `409 IDEMPOTENCY_CONFLICT`. Implementasi runtime di T-006; T-003 menyediakan
  kontrak header + hash request.

## Async & Queue

Tidak ada. Semua sinkron dalam request (Vercel Hobby tanpa worker, ADR-007).

## Test Scenario (BDD)

### Unit — kontrak Zod (`lib/server/contracts/*.test.ts`)

- it accepts a valid signup payload and normalizes email to lowercase
- it rejects a signup password shorter than 8 with an explicit field error
- it rejects a login payload without password
- it rejects a transaction with amountMinor 0 / negative / above int32 max
- it rejects a MONEY_IN transaction with a non-income category (A-09)
- it rejects occurredAt in the future (Asia/Jakarta calendar, A-13)
- it rejects a note longer than 500 and merchant longer than 120 (A-20)
- it rejects a goal with targetAmountMinor 0 and an empty name
- it rejects savedDelta 0 (A-16)
- it rejects an OCR file above 4.194.304 byte and a disallowed mime (A-02, A-21)
- it rejects an advisor period where start > end or span > 90 days
- it rejects limit above 50 (A-14) and a malformed cursor
- it exposes the OCR error namespace codes (A-10) and advisor codes

### Unit — repository (`lib/server/repositories/*.test.ts`)

- it excludes soft-deleted transactions from active queries (AC)
- it excludes soft-deleted goals from active queries (AC)
- it returns trash rows only from listTrash
- it denies cross-household reads by id (returns null, not the record) (AC)
- it denies cross-household writes (update/increment affect 0 rows) (AC)
- it scopes listActive/listByDay/sumByType to the household
- it creates a transfer pair with one shared transfer_group_id in one transaction
- it increments saved amount atomically and refuses a negative result (A-16)
- it soft-deletes idempotently (second call → alreadyDeleted) (A-17)
- it restores idempotently (second call → alreadyActive) (A-17)
- it claims an idempotency key once per user (A-22) and purges expired keys

Strategi DB: lihat Keputusan Teknis (mock Prisma client vs DB nyata).

## Task Breakdown

### Database & Model

- [x] `prisma/schema.prisma`: 13 model + 8 enum persis ERD §3
- [x] Raw SQL appendix di migration (partial unique, CHECK)
- [x] `prisma7.config.ts` + `.env` lokal (DATABASE_URL, gitignored)
- [x] `prisma migrate dev` sukses di DB lokal disposable

### Repository

- [x] 13 repository di `lib/server/repositories/` sesuai §Interface
- [x] Household scoping + soft-delete filter di setiap method aktif
- [x] Trash/restore terpisah dari metode aktif

### Contracts

- [x] Zod schema 5 domain + common (cursor/limit/idempotency/error envelope)
- [x] Helper error eksplisit (`formatFieldErrors`, `parseJsonBody`)

### Test

- [x] Unit test kontrak per domain (valid/invalid, pesan eksplisit)
- [x] Unit test repository (soft-delete exclusion, cross-household denial)
- [x] `bun run test` hijau (format.ts lama tidak rusak)

### Dokumentasi

- [x] Progress Log feat-* terisi (tanggal, task, catatan)

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-01 | Dev plan dibuat | Format template, adaptasi Next.js (tanpa istilah Laravel) |
| 2026-10-01 | Prisma schema 13 model + 8 enum | Persis ERD §3; uuid(7) tidak tersedia → default uuid() Prisma (catatan ERD §1 mengizinkan fallback) |
| 2026-10-01 | Migration awal + raw SQL appendix | DB lokal Postgres 18.1 disposable (`financial_planner_t003`); output di laporan PM |
| 2026-10-01 | Repository layer 13 repository | Household scoping + soft-delete filter; trash/restore terpisah |
| 2026-10-01 | Zod contracts 5 domain + common | Error eksplisit terstruktur; OCR/advisor error namespace sebagai kontrak |
| 2026-10-01 | Unit test kontrak + repository | Strategi: mock Prisma client (lihat Keputusan Teknis) |
| 2026-10-01 | Validasi test/lint/build | Output di laporan PM |
| 2026-10-07 | Perbaikan timezone sesi `PrismaPg` (temuan QA T-008) | Adapter pg meng-encode/decode `timestamptz` dengan asumsi sesi UTC; pada DB non-UTC (lokal `Asia/Bangkok`, +07) setiap instant bergeser sebesar offset sesi, sehingga app self-consistent tetapi raw SQL/`now()` berbeda 7 jam. Fix: `options: '-c TimeZone=UTC'` di `lib/db.ts` (branch pg) dan `lib/server/testing/integration-db.ts`; branch Neon tidak diubah. Regression test: `lib/server/repositories/timestamp.integration.test.ts`. Tanpa migration/perubahan skema. |

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-01 | Password hashing = `bcryptjs` (untuk T-004; TIDAK dipasang di T-003) | ADR-002 sudah memilih bcryptjs di atas scrypt node:crypto (murni JS, tanpa native build, runtime Node Vercel); A-24 menyerahkan finalisasi ke dev plan — keputusan ini mengonfirmasi ADR-002 | Tidak (ADR-002 sudah mencatat) |
| 2026-10-01 | Provider Prisma = postgresql via `@prisma/adapter-neon` (ADR-001); migration lokal memakai Postgres 18.1 lokal disposable | ADR-001 menetapkan driver-adapter mode; migration hanya butuh koneksi langsung Postgres-compatible | Tidak |
| 2026-10-01 | Strategi migration: `prisma migrate dev` dengan raw SQL appendix di file migration yang sama | Constraint `*` (partial index, CHECK) tidak bisa diekspresikan di schema.prisma (ERD §3) | Tidak |
| 2026-10-01 | Strategi test DB: **mock Prisma client** (bukan DB nyata / Neon branch) | Tidak ada kredensial Neon di mesin dev ini; Postgres lokal tersedia tetapi mock menjaga unit test cepat, deterministik, dan tanpa state DB; integration DB via Neon branch disposable (A-23) menjadi tanggung jawab QA/T-008 | Tidak |
| 2026-10-01 | PK UUID = `uuid()` default Prisma (bukan uuid(7)) | Prisma 7.10 belum mendukung `uuid(7)`; ERD §1 menyatakan "fallback generate di aplikasi" | Tidak |
| 2026-10-01 | Kontrak disimpan di `lib/server/contracts/` (bukan `lib/server/validation/`) | AGENTS.md §3 menetapkan `lib/server/` untuk server-only; pola yang ada belum punya folder validasi; `contracts` mencerminkan isi tiket (typed API contracts) | Tidak |
| 2026-10-01 | `prisma7.config.ts` memuat `dotenv/config` | Prisma 7 tidak memuat .env otomatis; file config hasil `prisma init` sudah memakai pola ini | Tidak |
| 2026-10-07 | Pin sesi koneksi `@prisma/adapter-pg` ke UTC via `options: '-c TimeZone=UTC'` (branch Postgres lokal/self-hosted di `lib/db.ts` + `integration-db.ts`); branch Neon (`@prisma/adapter-neon`) dibiarkan | Adapter pg melakukan encode/decode `timestamptz` dengan asumsi `+00:00` (`formatDateTime` + `normalize_timestamptz`); bila `TimeZone` sesi bukan UTC, semua instant bergeser sebesar offset sesi (temuan QA T-008 di DB `Asia/Bangkok`). Neon default UTC sehingga aman tanpa opsi. Alternatif "ubah timezone DB global" ditolak (di luar boundary, menyentuh konfigurasi DB). Tanpa perubahan skema/migration. | Tidak |

## QA Log

| Tanggal | AC diuji | Hasil | Catatan |
|---|---|---|---|
| 2026-10-08 | T-008 cross-cutting timestamp persistence (bounded) | Pass, bounded local evidence | Independent retest: local DB default timezone `Asia/Bangkok`; actual app `lib/db.ts` `PrismaPg` session `SHOW TIME ZONE=UTC`; `timestamp.integration.test.ts` 1/1; real `POST /api/transactions` date-only persisted with API, Prisma readback, and raw SQL all at epoch `1791349200000`. Cleanup counts 0; ports 3000/3010/3011 had no listeners. Local only; no Neon/production validation. Does not establish full calendar/filter semantics. Evidence: `../agent-comms/2026-10-08-qa-t008-timezone-fix.md`. |

## Open Questions

- Tidak ada yang memblokir. OQ ERD (goal_id di transaction, timezone, siapa boleh
  ubah budget) sudah dijawab di ERD §6 (counter manual, Asia/Jakarta, owner-only).