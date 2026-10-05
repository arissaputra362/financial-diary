# Dev Plan: Dashboard & Overview

Detail teknis implementasi. Ini dokumen utama yang dibaca saat generate kode. Berisi
keputusan teknis: schema, interface, validasi, testing, dan task breakdown.

## Referensi

- Spec: `docs/spec/feat-dashboard.md`
- PRD: `docs/PRD.md#fitur-2-dashboard-overview`
- ADR terkait: ADR-001 (Prisma/Neon), ADR-006 (layer), ADR-007 (free tier)
- ERD: `docs/erd/erd-database-schema.md` §3.7 (transaction), §3.8 (savings_goal), §3.12 (household_budget), §4 (D-3)
- Keputusan rapat: `agent-comms/2026-09-30-pm-spec-review-minutes.md` (D-7 timezone, D-23 agregasi)
- Flow: `docs/erd/flowcharts.md` §9
- AC (verification-matrix): AC-F2-1 … AC-F2-10
- Engineer: Developer · Estimasi: 3 hari · Status: Draft

## Ringkasan Teknis

Satu endpoint agregasi `GET /api/dashboard` yang menghitung saldo, budget bulan berjalan,
grafik per hari, ringkasan goals, dan aktivitas terbaru — server adalah sumber kebenaran,
client tidak menghitung ulang. Layer terdampak: Route Handler (`app/api/dashboard`,
`app/api/budget`, `app/api/transactions`) → Service (`DashboardService`, `BudgetService`,
`TransactionService`) → Repository → Prisma. Semua period math memakai kalender
**Asia/Jakarta** (A-13/D-7). Daftar aktivitas memakai endpoint terpisah
`GET /api/transactions` dengan filter lokal + cursor keyset (A-14).

## Schema Database

> Disalin dari ERD §3.7, §3.8, §3.12. Tidak ada kolom baru.

### Tabel: `transaction` (dipakai untuk saldo, spent, byDay, aktivitas)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | scope isolasi |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| type | enum | NOT NULL | `MONEY_IN \| MONEY_OUT \| TRANSFER` |
| amount_minor | int | NOT NULL, CHECK > 0 `*` | IDR scale 0 |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| category | varchar | nullable | |
| merchant | varchar | nullable | |
| note | text | nullable | |
| occurred_at | timestamptz | NOT NULL | UTC |
| source | enum | NOT NULL | `MANUAL \| OCR` |
| receipt_id | uuid | FK → receipt, nullable | |
| transfer_group_id | uuid | nullable, TANPA FK | |
| deleted_at | timestamptz | nullable | soft delete |
| deleted_by_user_id | uuid | FK → user, nullable | |
| created_at / updated_at | timestamptz | NOT NULL | |

Constraint: `idx(household_id, deleted_at, occurred_at desc)`;
`UNIQUE(household_id, transfer_group_id, type)`;
`CHECK ((type = 'TRANSFER') = (transfer_group_id IS NOT NULL))` `*`.

### Tabel: `household_budget`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| period_start | date | NOT NULL | awal bulan, timezone aplikasi |
| amount_minor | int | NOT NULL, CHECK > 0 `*` | |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| created_at / updated_at | timestamptz | NOT NULL | |

Constraint: `UNIQUE(household_id, period_start)` (sekaligus lookup index). `period_end`
TIDAK disimpan (derived: period_start + 1 bulan).

### Tabel: `savings_goal` (ringkasan goals di dashboard)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| name | varchar | NOT NULL | ≤80 |
| target_amount_minor | int | NOT NULL, CHECK > 0 `*` | |
| saved_amount_minor | int | NOT NULL, default 0, CHECK >= 0 `*` | |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| deadline | date | nullable | |
| deleted_at | timestamptz | nullable | soft delete |
| deleted_by_user_id | uuid | FK → user, nullable | |
| created_at / updated_at | timestamptz | NOT NULL | |

Index: `idx(household_id, deleted_at, deadline)`.

## Interface & Contract

### Repository Interface (`lib/server/repositories/`)

- `TransactionRepository.sumByType(householdId, { type, from, to }): number` — agregat aktif
- `TransactionRepository.listActive(householdId, filters): { rows, nextCursor }` — keyset
- `TransactionRepository.listByDay(householdId, { from, to }): { date, amountMinor }[]`
- `BudgetRepository.findByPeriod(householdId, periodStart): HouseholdBudget | null`
- `BudgetRepository.upsert(householdId, periodStart, amountMinor, userId): HouseholdBudget`
- `GoalRepository.listActive(householdId): SavingsGoal[]`

Semua method **wajib** menerima `householdId` scope dan default filter `deleted_at IS NULL`
(ADR-006). Agregat memakai `bigint` Postgres (tanpa cast int32 di aplikasi — D-23).

### Service Interface (`lib/server/services/`)

- `DashboardService.get(householdId): DashboardDTO`
- `BudgetService.get(householdId): MonthlyBudgetDTO`
- `BudgetService.upsert(actor, householdId, amountMinor): MonthlyBudgetDTO` (owner-only)
- `TransactionService.list(householdId, filters): { rows: TransactionDTO[], nextCursor }`
- `PeriodService.currentMonth(now): { start, end }` — kalender Asia/Jakarta
- `PeriodService.lastNDays(now, n): { start, end, buckets }`

### HTTP Contract

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/dashboard` | GET | Approved | - | `DashboardDTO` |
| `/api/budget` | GET | Approved | - | `MonthlyBudgetDTO` |
| `/api/budget` | PUT | Owner | `{ amountMinor }` | `MonthlyBudgetDTO` |
| `/api/transactions` | GET | Approved | query: `type, source, from, to, cursor, limit` | `{ rows, nextCursor }` |

`DashboardDTO` = `{ balanceMinor, currencyCode, monthlyBudget: { periodStart, periodEnd, budgetMinor, spentMinor, remainingMinor }, spending: { periodStart, periodEnd, totalOutMinor, byDay: [{ date, amountMinor }] }, goals: GoalDTO[], recentActivity: TransactionDTO[] }`.
`GoalDTO.progressPercent` = `min(100, saved/target×100)` (cap di DTO, bukan DB).

### Validasi Rules (Zod)

| Field | Rules | Pesan error (bahasa awam) |
|---|---|---|
| amountMinor (PUT /api/budget) | required, int, > 0 | "Budget harus lebih dari 0." |
| type (query) | optional, in `MONEY_IN\|MONEY_OUT` | "Jenis transaksi tidak dikenal." |
| source (query) | optional, in `MANUAL\|OCR` | "Sumber transaksi tidak dikenal." |
| from / to (query) | optional, `YYYY-MM-DD` (kalender Asia/Jakarta) | "Tanggal tidak valid." |
| cursor (query) | optional, base64 opaque | "Penanda halaman tidak valid." |
| limit (query) | optional, int, default 20, max 50 | "Jumlah per halaman maksimal 50." |

## Async & Queue

Tidak ada async. Agregasi dihitung sinkron dalam request. `byDay` dihitung di aplikasi
(bucket kalender Asia/Jakarta), bukan di DB.

## Test Scenario (BDD)

### Unit (Service — mock Repository)

- it computes `balanceMinor = sum(MONEY_IN) − sum(MONEY_OUT)` over active records only (AC-F2-1)
- it excludes soft-deleted records from balance (AC-F2-1)
- it treats TRANSFER legs as net-zero for balance (AC-F2-1)
- it computes `spentMinor` from MONEY_OUT only and excludes TRANSFER (AC-F2-2, AC-F2-3)
- it returns "atur budget" state (not 0) when no budget row exists (AC-F2-2)
- it buckets MONEY_OUT by Asia/Jakarta calendar day; empty days = 0 (AC-F2-5)
- it maps `occurred_at=2026-09-30T17:30:00Z` to the 1 Oct bucket (AC-F2-5)
- it caps `progressPercent` at 100 and excludes deleted goals (AC-F2-9)
- it builds an opaque base64 keyset cursor `(occurred_at DESC, id DESC)` (AC-F2-6)

### Feature (Route Handler)

- it returns the full DashboardDTO for an approved member (AC-F2-1..AC-F2-9)
- it returns 403 for a non-approved membership (AC-F1-4 cross-ref)
- it upserts budget for owner and returns 403 for member (AC-F2-3)
- it rejects amount 0/negative with 422 (AC-F2-3)
- it applies type/source/from/to/cursor/limit filters to rows (AC-F2-6)
- it rejects limit > 50 with 422 (AC-F2-6)
- it returns no duplicates/missing rows across pages including `occurred_at` ties (AC-F2-6)
- it returns a single full error state (no partial cards) when aggregation fails (AC-F2-8)

### Integration

- it computes balance/budget/byDay correctly against seeded fixtures (AC-F2-1, AC-F2-2, AC-F2-5)
- it isolates household A from household B (AC-F2-1)
- it keeps `spentMinor=0` when the household only has transfers (AC-F2-4)

### E2E (Playwright)

- it changes rows or shows filtered-empty on every filter change (AC-F2-7)
- it shows loading→skeleton, empty→empty state, error→error+retry, filtered-empty (AC-F2-8)
- it shows one nav per breakpoint with no horizontal overflow at 390px (AC-F2-10)

## Task Breakdown

### Database & Model

- [ ] `prisma/schema.prisma`: model `Transaction`, `HouseholdBudget`, `SavingsGoal` sesuai §Schema Database
- [ ] Enums: `TransactionType`, `TransactionSource`
- [ ] Migration + raw SQL: CHECK `amount_minor > 0`, CHECK transfer group, CHECK `saved_amount_minor >= 0`, indexes
- [ ] Fixture: boundary timezone + transfer pair + budget set/unset (fixtures-seed-plan §3, §4)

### Repository

- [ ] Interface + implementasi Prisma untuk 4 repository di §Repository Interface
- [ ] Agregat memakai `bigint` (tanpa cast int32)
- [ ] Keyset pagination `(occurred_at DESC, id DESC)` dengan tie-breaker id

### Service

- [ ] `DashboardService`, `BudgetService`, `TransactionService`, `PeriodService`
- [ ] Period math Asia/Jakarta (A-13); `byDay` bucket di aplikasi
- [ ] Unit test: sesuai §Test Scenario > Unit

### HTTP

- [ ] Zod schema: sesuai §Validasi Rules
- [ ] Route Handlers `app/api/dashboard`, `app/api/budget`, `app/api/transactions` (GET)
- [ ] Feature test: sesuai §Test Scenario > Feature

### Frontend

- [ ] Halaman `/home` + `/budget` (milik T-005; konsumsi kontrak ini)
- [ ] Filter lokal aktivitas + tab periode grafik 7D/30D/90D (T-005)
- [ ] State loading/empty/error/filtered-empty (T-005)

### Async (jika ada)

- [ ] Tidak ada.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-01 | T-003: schema Transaction/HouseholdBudget/SavingsGoal + repository (listActive, sumByType, listByDay, budget findByPeriod/upsert, goal listActive) | Persis ERD §3.7/3.8/3.12; agregat aktif selalu exclude deleted_at; UNIQUE(household_id, period_start); kontrak list query (cursor/limit A-14) di `lib/server/contracts/transactions.ts` |

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
