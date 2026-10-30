# Dev Plan: Dashboard & Overview

Detail teknis implementasi. Ini dokumen utama yang dibaca saat generate kode. Berisi
keputusan teknis: schema, interface, validasi, testing, dan task breakdown.

## Referensi

- Spec: `docs/spec/feat-dashboard.md`
- PRD: `docs/PRD.md#fitur-2-dashboard-overview`
- ADR terkait: ADR-001 (Prisma/Neon), ADR-006 (layer), ADR-007 (free tier)
- ERD: `docs/erd/erd-database-schema.md` §3.7 (transaction), §3.8 (savings_goal), §3.12 (household_budget/personal_budget), §4 (D-3)
- Keputusan rapat: `agent-comms/2026-09-30-pm-spec-review-minutes.md` (D-7 timezone, D-23 agregasi)
- Flow: `docs/erd/flowcharts.md` §9
- AC (verification-matrix): AC-F2-1 … AC-F2-10
- Engineer: Developer · Estimasi: 3 hari · Status: Implemented (including T-015 scope split)

## Ringkasan Teknis

Satu endpoint agregasi `GET /api/dashboard` yang menghitung saldo, budget bulan berjalan,
grafik per hari, ringkasan goals, dan aktivitas terbaru — server adalah sumber kebenaran,
client tidak menghitung ulang. Budget dan grafik tersedia dalam dua scope independen:
`SHARING` (Bersama) dan `PERSONAL` milik user yang sedang login. Layer terdampak:
Route Handler (`app/api/dashboard`, `app/api/budget`, `app/api/transactions`) →
Service (`DashboardService`, `BudgetService`, `TransactionService`) → Repository →
Prisma. Semua period math memakai kalender **Asia/Jakarta** (A-13/D-7). Daftar
aktivitas memakai endpoint terpisah `GET /api/transactions` dengan filter lokal +
cursor keyset (A-14).

## Schema Database

> Disalin dari ERD §3.7, §3.8, §3.12. T-015 menambahkan tabel `personal_budget`;
> tabel `household_budget` tetap menjadi sumber budget Bersama.

### Tabel: `transaction` (dipakai untuk saldo, spent, byDay, aktivitas)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | scope isolasi |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| type | enum | NOT NULL | `MONEY_IN \| MONEY_OUT` (TRANSFER dihapus oleh migrasi `20261006120000_fix_transfer_enum`) |
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
`UNIQUE(household_id, transfer_group_id, type)`.
CHECK lama `transaction_transfer_group_consistency` dihapus oleh migrasi
`20261006120000_fix_transfer_enum` (BUG-001).

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
| deleted_at | timestamptz | nullable | soft delete budget periode |

Constraint: `UNIQUE(household_id, period_start)` (sekaligus lookup index). `period_end`
TIDAK disimpan (derived: period_start + 1 bulan).

### Tabel: `personal_budget` (budget Pribadi — T-015)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | scope isolasi |
| user_id | uuid | FK → user, NOT NULL | pemilik budget pribadi |
| period_start | date | NOT NULL | awal bulan, timezone aplikasi |
| amount_minor | int | NOT NULL, CHECK > 0 | |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| created_by_user_id | uuid | FK → user, NOT NULL | selalu user session |
| created_at / updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | nullable | soft delete budget periode |

Constraint: `UNIQUE(household_id, user_id, period_start)`. Akses budget pribadi
selalu memakai `user_id` dari session; tidak ada parameter client untuk memilih
user lain.

### Siklus budget per scope (AC-F2-2d — migrasi `20261030090000_budget_cycle`)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| `household.budget_cycle_mode` / `user.personal_budget_cycle_mode` | enum `BudgetCycleMode` | NOT NULL, default `CALENDAR_MONTH` | siklus aktif |
| `..._cycle_day` | int | nullable, CHECK 1-28 saat `FIXED_DAY`, null untuk mode lain | anchor `FIXED_DAY` |
| `..._cycle_pending_mode` | enum, nullable | CHECK konsisten dengan pending day/date | perubahan yang menunggu |
| `..._cycle_pending_day` | int, nullable | CHECK 1-28 saat pending `FIXED_DAY` | anchor pending |
| `..._cycle_pending_effective_from` | date, nullable | CHECK terisi bersama pending mode | batas siklus baru |

Siklus aktif dan pending disimpan terpisah supaya perubahan tidak menulis ulang
periode yang sudah punya budget. `pending_effective_from` = batas pertama siklus
baru **setelah hari ini**; untuk `FIXED_DAY` tanggal 10 yang diubah 15 Oktober,
nilainya 10 November. Saat tanggal itu tiba, service memakai siklus pending sebagai
siklus aktif (dan mempromosikannya saat ada perubahan berikutnya).

Kalau periode berjalan belum punya baris budget, perubahan siklus tidak dijadwalkan
sebagai pending: siklus baru langsung disimpan sebagai aktif, karena tidak ada
nominal periode berjalan yang perlu dilindungi.

`period_start` tetap menjadi kunci budget; periode baru dengan siklus baru tidak
mewarisi nominal periode lama.

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

- `TransactionRepository.sumByType(householdId, { type, from, to }, scope?): number` — agregat MONEY_IN/OUT reguler aktif tanpa kaki transfer; scope membatasi `SHARING` atau `PERSONAL` milik user
- `TransactionRepository.sumTransfersFromSharedToPersonal(householdId, { from, to }): number` — kaki keluar transfer aktif dari wallet Sharing yang pasangan masuknya menuju wallet Personal, khusus tambahan spent budget Bersama
- `TransactionRepository.listActive(householdId, filters): { rows, nextCursor }` — keyset
- `TransactionRepository.listByDay(householdId, { from, to }, scope?): { date, amountMinor }[]` — **exclude transfer legs** (AC-F2-4); `scope` membatasi `SHARING` atau `PERSONAL` milik user
- `BudgetRepository.findByPeriod(householdId, periodStart): HouseholdBudget | null`
- `BudgetRepository.upsert(householdId, periodStart, amountMinor, userId): HouseholdBudget`
- `PersonalBudgetRepository.findByPeriod(householdId, userId, periodStart): PersonalBudget | null`
- `PersonalBudgetRepository.upsert(householdId, userId, periodStart, amountMinor, createdByUserId): PersonalBudget`
- `BudgetCycleRepository.findHousehold(householdId)` + `updateHousehold(householdId, write)`
- `PersonalBudgetCycleRepository.findByUser(householdId, userId)` + `updateUser(userId, write)`
- `GoalRepository.listActive(householdId): SavingsGoal[]`

Semua method **wajib** menerima `householdId` scope dan default filter `deleted_at IS NULL`
(ADR-006). Agregat memakai `bigint` Postgres (tanpa cast int32 di aplikasi — D-23).

> **Catatan BUG-001 follow-up (T-006 QA):** Method `sumByType` dan `listByDay` saat ini
> TIDAK exclude transfer legs. T-005 WAJIB menambahkan filter `transferGroupId: null`
> pada kedua method. Integration test: "spentMinor = 0 when household only has transfers"
> (AC-F2-4) — lihat `agent-comms/2026-10-06-qa-t006-retest-report.md` §Risiko #1.

### Service Interface (`lib/server/services/`)

- `DashboardService.get(householdId): DashboardDTO`
- `BudgetService.get(householdId): MonthlyBudgetDTO`
- `BudgetService.getPersonal(actor): MonthlyBudgetDTO`
- `BudgetService.upsert(actor, householdId, amountMinor, scope?): MonthlyBudgetDTO` (shared owner-only)
- `BudgetService.updateCycle(actor, householdId, cycle, scope?): MonthlyBudgetDTO`
- `TransactionService.list(householdId, filters): { rows: TransactionDTO[], nextCursor }`
- `PeriodService.currentMonth(now): { start, end }` — kalender Asia/Jakarta
- `PeriodService.periodFor(now, cycle): MonthPeriod` — periode menurut siklus
- `PeriodService.nextStartFor(today, cycle): YYYY-MM-DD` — batas siklus berikutnya
- `PeriodService.lastNDays(now, n): { start, end, buckets }`

### HTTP Contract

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/dashboard` | GET | Approved | - | `DashboardDTO` |
| `/api/budget` | GET | Approved | `scope=shared\|personal` (default `shared`) | `MonthlyBudgetDTO` |
| `/api/budget` | PUT | Approved / Owner untuk shared | `{ amountMinor, scope? }` | `MonthlyBudgetDTO` |
| `/api/budget/cycle` | PUT | Approved / Owner untuk shared | `{ scope?, mode, day? }` | `MonthlyBudgetDTO` |
| `/api/transactions` | GET | Approved | query: `type, source, from, to, cursor, limit` | `{ rows, nextCursor }` |

`DashboardDTO` mempertahankan `monthlyBudget` dan `spending` sebagai scope Bersama,
serta menambahkan `personalMonthlyBudget` dan `personalSpending` untuk scope Pribadi.
Mode pada kartu budget dan grafik independen, keduanya default Bersama.
`GoalDTO.progressPercent` = `min(100, saved/target×100)` (cap di DTO, bukan DB).

### Validasi Rules (Zod)

| Field | Rules | Pesan error (bahasa awam) |
|---|---|---|
| amountMinor (PUT /api/budget) | required, int, > 0 | "Budget harus lebih dari 0." |
| mode (PUT /api/budget/cycle) | required, in `CALENDAR_MONTH\|FIXED_DAY\|END_OF_MONTH` | "Siklus budget tidak dikenal." |
| day (PUT /api/budget/cycle) | `FIXED_DAY` wajib int 1-28; mode lain null/absen | "Tanggal harus antara 1 dan 28." |
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

## Amendment T-015: Budget Pribadi dan scope Pribadi/Bersama

**PM-approved 2026-10-23.** Spec: `docs/spec/feat-dashboard.md` AC-2c dan AC-4b.
Design: doc 02 §5 Card 7/8 dan §5b. Ticket: `../tickets/18-T-015-personal-budget.md`.

### Schema

Tabel baru `personal_budget`:

| Kolom | Tipe | Constraint |
|---|---|---|
| id | uuid | PK |
| household_id | uuid | FK → household, NOT NULL |
| user_id | uuid | FK → user, NOT NULL |
| period_start | date | NOT NULL |
| amount_minor | int | NOT NULL, CHECK > 0 |
| currency_code | char(3) | NOT NULL, default `IDR` |
| created_by_user_id | uuid | FK → user, NOT NULL |
| created_at / updated_at | timestamptz | NOT NULL |

`UNIQUE(household_id, user_id, period_start)` dan index `(user_id, period_start)`.
Tidak ada soft delete.

### Repository

- `BudgetRepository` tetap untuk `household_budget`.
- `PersonalBudgetRepository.findByPeriod(householdId, userId, periodStart)` dan
  `upsert(householdId, userId, periodStart, amountMinor, createdByUserId)`.
- `AggregateScope` ditambah `walletOwnerUserId?: string`. Filter wallet menjadi
  `{ scope, createdByUserId }` bila diisi. Ini yang membatasi scope personal ke
  wallet milik user, bukan semua wallet PERSONAL di household.

### Service

- `BudgetService.get(householdId)` tetap scope Bersama.
- `BudgetService.getPersonal(actor)` memakai `actor.userId`, periode yang sama.
- `BudgetService.upsert(actor, householdId, amountMinor, scope)`:
  `shared` mempertahankan OWNER-only; `personal` menulis baris milik actor.
  Tidak ada parameter `userId` dari request.
- `DashboardService.get` menambah agregasi personal: budget pribadi dan
  `listByDay` dengan scope `{ walletScope: "PERSONAL", walletOwnerUserId: actor.userId }`.
  Field lama tidak berubah arti.

### HTTP

- `GET /api/budget?scope=shared|personal` (default `shared`).
- `PUT /api/budget` body `{ amountMinor, scope? }` (default `shared`).
- `GET /api/dashboard` menambah `personalMonthlyBudget` dan `personalSpending`
  (additive, bukan breaking change).
- Validasi scope memakai Zod enum; nilai lain 422.

### Frontend

- `BudgetCard`, `BudgetView`, dan `SpendingChart` memakai segmented control yang
  sama, default `Bersama`, dan state scope terpisah per komponen.
- BudgetView mengambil kedua scope (dua request paralel) dan mengirim scope saat
  menyimpan.
- Member melihat mode Bersama read-only dan dapat mengisi mode Pribadi.
- BudgetView menambah kartu siklus per scope: tiga pilihan mode, input tanggal
  1-28 untuk `FIXED_DAY`, dan pesan `nextCycle.effectiveFrom`. Member melihat
  siklus Bersama read-only; siklus Pribadi dapat diubah sendiri.
- Label budget menampilkan rentang `periodStart` sampai `periodEnd` (juga di
  `BudgetCard` dan ringkasan pengeluaran dashboard), bukan hanya nama bulan.
- Label dan helper mengikuti design 02 §5 Card 7/8.

### Test

- Unit: BudgetService shared vs personal, permission, cross-user isolation.
- Unit siklus: `PeriodService.periodFor` untuk `FIXED_DAY`/`END_OF_MONTH` termasuk
  leap February dan `nextStartFor`; jadwal perubahan tidak menggeser periode aktif;
  periode baru berstatus `isSet:false`; member tidak bisa mengubah siklus Bersama;
  siklus Pribadi hanya milik user session.
- Integration: unique per user/periode, agregasi personal hanya wallet milik user,
  wallet terarsip tetap dihitung, transfer dikecualikan, constraint siklus.
- Route: scope invalid, member PUT shared 403, member PUT personal 200, validasi
  `day` 1-28, `PUT /api/budget/cycle` mengembalikan `nextCycle`.
- E2E: toggle independen, default Bersama, persistence reload, read-only member,
  390/768/1280 tanpa overflow.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-30 | AC-F2-2d siklus budget: enum + kolom siklus/pending pada `household`/`user`, repository siklus, `PeriodService.periodFor`/`nextStartFor`, `PUT /api/budget/cycle`, field `cycle`/`nextCycle`, kartu siklus di `/budget`, label rentang tanggal di BudgetCard dan ringkasan pengeluaran dashboard | Saat periode berjalan sudah punya budget, perubahan dijadwalkan pada batas siklus baru pertama setelah hari ini (mis. tanggal 10 diubah 15 Okt berlaku 10 Nov). Saat periode berjalan belum punya budget, siklus baru langsung berlaku karena tidak ada nominal yang dilindungi. Periode baru berstatus belum diatur. Laporan bulanan tetap kalender bulan karena kontrak `MonthlyReportDTO` tidak diubah; rentang aktualnya sudah tampil di catatan laporan. |
| 2026-10-30 | Form budget pertama menggabungkan pilihan siklus dan nominal dengan satu aksi `Simpan budget`; siklus disimpan dahulu ketika periode masih kosong, lalu nominal ditulis ke periode aktual. Budget yang sudah berjalan tetap memakai aksi terpisah untuk nominal dan jadwal siklus. | UX pembuatan tidak lagi memaksa dua proses simpan; perubahan siklus yang punya nominal tetap menunjukkan tanggal efektif dan tidak menggeser angka periode berjalan. |
| 2026-10-30 | Penghapusan budget periode aktif: kolom `deleted_at`, repository soft delete/restore, `DELETE /api/budget?scope=...`, `POST /api/budget/restore`, konfirmasi scope/periode dan toast undo 5 detik di `/budget` | AC-F2-2e: hanya budget scope/periode aktif yang diarsipkan; transaksi tidak berubah. Owner-only untuk Bersama dan self-only untuk Pribadi. |
| 2026-10-30 | Budget Bersama menambah agregat transfer keluar Sharing→Personal berdasarkan pasangan `transfer_group_id`; transfer Sharing→Sharing tetap netral dan transfer masuk Pribadi tidak dihitung ulang | AC-F2-4 / AC-F6-8: uang yang keluar dari dana bersama ke dompet pribadi mengurangi budget bersama, tanpa menganggapnya sebagai expense di grafik atau budget pribadi. |
| 2026-10-25 | Ringkasan Beranda disatukan dalam satu kartu dengan tab Bersama/Pribadi | Atas arahan pengguna, tab kini mengganti saldo, taksiran emas, pengeluaran bulan ini, pengeluaran hari ini, dan sisa anggaran dalam scope yang sama. Kartu saldo berulang di bawah dihapus; daftar dompet dan akses dompet arsip tetap tersedia. |
| 2026-10-01 | T-003: schema Transaction/HouseholdBudget/SavingsGoal + repository (listActive, sumByType, listByDay, budget findByPeriod/upsert, goal listActive) | Persis ERD §3.7/3.8/3.12; agregat aktif selalu exclude deleted_at; UNIQUE(household_id, period_start); kontrak list query (cursor/limit A-14) di `lib/server/contracts/transactions.ts` |
| 2026-10-06 | PM update: dev plan diselaraskan dengan BUG-001 fix T-006 — enum TRANSFER dihapus dari schema doc, CHECK lama dihapus, catatan transfer exclusion (AC-F2-4) ditambahkan ke Repository Interface | `sumByType` + `listByDay` WAJIB exclude `transferGroupId: null` saat T-005 implementasi. QA flag: `agent-comms/2026-10-06-qa-t006-retest-report.md` §Risiko #1 |
| 2026-10-06 | T-005 selesai: (1) repository transfer exclusion `sumByType` + `listByDay` filter `transferGroupId: null` (AC-F2-4); (2) `lib/server/jakarta.ts` + `PeriodService` (kalender Asia/Jakarta); (3) `DashboardService`, `BudgetService`, `TransactionService.list`; (4) route `GET /api/dashboard`, `GET/PUT /api/budget`, `GET /api/transactions`; (5) halaman `/home` + `/budget`; (6) komponen `components/dashboard/*` (BalanceCard, BudgetCard, SpendingChart, GoalsSummaryCard, RecentActivityCard, DashboardView, BudgetView); (7) navigasi 1-per-breakpoint (`BottomNav`, `FloatingNavbar`, `AppShell`); (8) unit + feature + integration (`dashboard.integration.test.ts`) + E2E (`e2e/dashboard.spec.ts`) | Unit 213 lulus / 24 file, lint + tsc + build hijau. Deviasi tooling: E2E dev server pindah ke port 3010 (bukan 3000) karena WSL2 meneruskan nginx ke localhost:3000. Cursor list memakai UUID baris sebagai token opaque (Prisma `cursor: { id }` di bawah `orderBy [occurredAt desc, id desc]`), bukan composite base64; perilaku setara (opaque + id tie-break, AC-F2-6). Tidak ada deviasi perilaku dari spec. |
| 2026-10-07 | Resume T-005: perbaikan environment E2E + verifikasi static-render | `playwright.config.ts`: port 3010, `reuseExistingServer: false`, `globalSetup` pre-warm route, expect timeout 15s => `bun run test:e2e` 39/39 lulus (2x). `bun run test:integration` 8/8 lulus (PostgreSQL lokal `financial_planner_t003` via `DATABASE_URL`). `/home` + `/budget` tetap static (○) dan aman: shell tanpa data household, angka di-fetch per-request lewat `/api/*` yang dijaga `proxy.ts`, plus redirect client saat 401. |
| 2026-10-23 | T-015 backend/data layer: tabel `personal_budget` + migrasi, repository/service budget pribadi, scope `shared|personal` pada `GET/PUT /api/budget`, dan field additive `personalMonthlyBudget`/`personalSpending` pada `GET /api/dashboard`; unit, route, dan integration test | Frontend (`BudgetCard`, `BudgetView`, `SpendingChart`) belum dikerjakan di handoff ini; T-015 belum selesai. Catatan tooling: `bunx prisma migrate dev` sempat membuat migrasi korektif `20261023021854_personal_budget` (drop FK composite `transaction_household_id_wallet_id_fkey`) karena constraint raw SQL tidak ada di schema; migrasi korektif dihapus, FK composite dipulihkan, `prisma migrate status` up to date. |

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-06 | Dashboard = satu endpoint agregasi `GET /api/dashboard?period=7D\|30D\|90D`; client merender angka verbatim tanpa recompute | Spec AC-F2-1/AC-F2-5/AC-F2-6: server sumber kebenaran; `period` hanya mengubah window grafik, tidak mengubah kartu saldo/budget/goals | Tidak (sesuai spec) |
| 2026-10-06 | Transfer leg dikecualikan di repository: `sumByType` dan `listByDay` menambah filter `transferGroupId: null` | AC-F2-4: transfer bukan spending; saldo tetap net nol karena kedua kaki dikecualikan dari agregat. Follow-up BUG-001 (QA T-006 §Risiko #1) | Tidak |
| 2026-10-06 | `PeriodService` menurunkan semua batas periode dari kalender Asia/Jakarta (offset tetap +07:00, tanpa DST): `start`/`end` = instant UTC inklusif untuk filter `occurred_at`, `budgetPeriodStart` = UTC-midnight untuk key `@db.Date`; bucketing `byDay` dilakukan di aplikasi, bukan DB | D-7/A-13: hindari timezone proses server (UTC) dan jam perangkat; hari tanpa pengeluaran tetap muncul bernilai 0 (AC-F2-5) | Tidak |
| 2026-10-30 | Siklus budget disimpan sebagai pasangan aktif + pending dengan `pending_effective_from`; `nextStartFor` memakai batas pertama siklus baru setelah hari ini; bila periode berjalan belum punya budget, siklus baru langsung menjadi aktif | AC-F2-2d: periode yang sudah punya budget tidak boleh ditulis ulang; anchor baru (tanggal 10/akhir bulan) harus mulai pada batasnya sendiri, bukan tanggal 1. Tanpa budget berjalan tidak ada nominal yang dilindungi, jadi menunggu periode berikutnya hanya menunda pengaturan yang diinginkan user. Pada tanggal efektif, service memakai pending sebagai aktif tanpa mengubah baris budget lama | Ya (spec AC-F2-2d) |
| 2026-10-30 | Form create budget mengirim perubahan siklus sebelum nominal hanya ketika periode belum di-set; siklus edit pada periode yang sudah memiliki budget tetap lewat endpoint terpisah | Satu aksi pembuatan awal terasa langsung; perilaku penjadwalan yang melindungi periode berjalan tetap eksplisit dan tidak tercampur dengan edit nominal | Ya (spec AC-F2-2d) |
| 2026-10-06 | Bentuk DTO: `DashboardDTO { balanceMinor, currencyCode, monthlyBudget{...}, spending{periodStart, periodEnd, totalOutMinor, byDay[]}, goals[], recentActivity[] }`; `MonthlyBudgetDTO.isSet=false` + `budgetMinor/remainingMinor=null` saat budget belum di-set; `GoalSummaryDTO.progressPercent` di-cap 100 di DTO | AC-F2-2: state "atur budget" (bukan Rp0 yang menyesatkan); AC-F2-9: progress bar tidak pernah >100%; satu kontrak agregasi dikonsumsi `/home` | Tidak |
| 2026-10-06 | Cursor list = UUID baris sebagai token opaque; Prisma `cursor: { id }` dengan `orderBy [occurredAt desc, id desc]` dan `take: limit + 1` | AC-F2-6: stabil termasuk `occurredAt` yang sama (fallback tie-break `id`), tanpa duplikat/hilang. Plan menyebut "base64 composite", implementasi ini setara secara perilaku | Tidak (perilaku setara; kontrak eksternal tidak berubah) |
| 2026-10-06 | `/home` dan `/budget` tetap static shell (○); komponen view `"use client"` fetch per-request lewat `lib/api-client.ts`; auth ditegakkan `proxy.ts` pada `/api/*` (kecuali signup/login) + redirect client saat 401 | Tidak ada data household dirender saat build, jadi prerender aman dan shell lebih cepat; isolasi household + revalidasi session penuh tetap di route handler Node | Tidak |
| 2026-10-07 | E2E: dev server port 3010, `reuseExistingServer: false`, `globalSetup` pre-warm semua route, expect timeout 15s | WSL2 meneruskan nginx ke localhost:3000 sehingga health check `reuseExistingServer` menempel ke nginx (semua request 404). Port terdedikasi + pre-warm menghilangkan race cold-compile Next dev antar 6 worker | Tidak (hanya tooling test) |
| 2026-10-07 | Integration test berjalan terhadap PostgreSQL lokal lewat `DATABASE_URL` di `.env` memakai `@prisma/adapter-pg` | `integration-db.ts` selalu adapter-pg; `.env` menunjuk `financial_planner_t003` (14 tabel, 2 migrasi ter-apply) | Tidak |

## QA Log

| Tanggal | AC diuji | Hasil | Catatan |
|---|---|---|---|
| 2026-10-07 | AC-F2-1..AC-F2-10 | Pass | Harness QA independen 9/9 (cross-check DTO vs raw SQL: balance, budget unset, transfer exclusion, boundary WIB, pagination ties, isolasi, int32); unit 213; integration 8; E2E 39 (mobile/tablet/desktop); lint/tsc/build hijau. Residual (audit visual penuh, matriks state UI, deployment Neon/Vercel) defer T-008. Detail: agent-comms/2026-10-07-qa-t005-report.md |

## Open Questions

- Tidak ada. Semua kontrak merujuk A-01..A-35, ERD, dan ADR-001..008.
