# Dev Plan: Savings Goals & AI Advisor

Detail teknis implementasi. Ini dokumen utama yang dibaca saat generate kode. Berisi
keputusan teknis: schema, interface, validasi, testing, dan task breakdown.

## Referensi

- Spec: `docs/spec/feat-goals-advisor.md`
- PRD: `docs/PRD.md#fitur-4-savings-goals-ai-advisor`
- ADR terkait: ADR-001 (Prisma/Neon), ADR-003 (Gemini structured output), ADR-005 (soft delete), ADR-006 (layer), ADR-007 (free tier)
- ERD: `docs/erd/erd-database-schema.md` §3.8 (savings_goal), §3.11 (advisor_insight), §4 (D-7)
- Keputusan rapat: `agent-comms/2026-09-30-pm-spec-review-minutes.md` (D-16 cache key, D-18 increment)
- Flow: `docs/erd/flowcharts.md` §7, §8
- AC (verification-matrix): AC-F4-1 … AC-F4-8
- Engineer: Developer · Estimasi: 4 hari · Status: Draft

## Ringkasan Teknis

Target tabungan keluarga dengan progres jujur (cap 100% hanya di DTO) dan panel advisor
berbahasa awam yang menganalisis periode pengeluaran. Insight sukses terbaru dipersist
sebagai cache fallback (key per periode, TTL 24 jam). Layer terdampak: Route Handler
(`app/api/goals`, `app/api/advisor`) → Service (`GoalService`, `AdvisorService`) →
Repository → Prisma; seam `AdvisorProvider` di-inject ke service (mock-seams §1). Increment
saved amount memakai atomic conditional update (A-16). Advisor memakai Gemini structured
output fail-closed (ADR-003).

## Schema Database

> Disalin dari ERD §3.8, §3.11. Tidak ada kolom baru.

### Tabel: `savings_goal`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| name | varchar | NOT NULL | ≤80 |
| target_amount_minor | int | NOT NULL, CHECK > 0 `*` | |
| saved_amount_minor | int | NOT NULL, default 0, CHECK >= 0 `*` | counter manual |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| deadline | date | nullable | lampau boleh (penanda terlambat) |
| deleted_at | timestamptz | nullable | soft delete |
| deleted_by_user_id | uuid | FK → user, nullable | |
| created_at / updated_at | timestamptz | NOT NULL | |

Index: `idx(household_id, deleted_at, deadline)`.
CHECK tambahan (raw SQL): `CHECK (saved_amount_minor >= 0)` (D-18).

### Tabel: `advisor_insight`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| requested_by_user_id | uuid | FK → user, NOT NULL | |
| source_period_start | date | NOT NULL | |
| source_period_end | date | NOT NULL | |
| model | varchar | NOT NULL | |
| headline | varchar | NOT NULL | ≤120 |
| summary | text | NOT NULL | ≤600 |
| actions_json | jsonb | NOT NULL | ≥1 item |
| limitations | text | nullable | ≤300 |
| generated_at | timestamptz | NOT NULL | |
| expires_at | timestamptz | NOT NULL | generated_at + 24 jam |

Index: `idx(household_id, generated_at desc)` — lookup cache "latest successful unexpired".
Hanya insight SUKSES yang dipersist (tanpa kolom status). Retensi: prune-on-create, maks
~10 terbaru per household, hapus expired > 30 hari (D-7/D-16).

## Interface & Contract

### Repository Interface (`lib/server/repositories/`)

- `GoalRepository.create(householdId, data): SavingsGoal`
- `GoalRepository.listActive(householdId): SavingsGoal[]`
- `GoalRepository.findById(householdId, id): SavingsGoal | null`
- `GoalRepository.incrementSaved(householdId, id, delta): number` — conditional update + rowcount
- `GoalRepository.softDelete(householdId, id, userId): SavingsGoal`
- `GoalRepository.restore(householdId, id): SavingsGoal`
- `GoalRepository.listTrash(householdId, cursor): { rows, nextCursor }`
- `AdvisorInsightRepository.findLatestUnexpired(householdId, periodStart, periodEnd): AdvisorInsight | null`
- `AdvisorInsightRepository.create(data): AdvisorInsight`
- `AdvisorInsightRepository.prune(householdId, keep): void`

Semua method **wajib** menerima `householdId` scope dan default filter `deleted_at IS NULL`
(ADR-006). `incrementSaved` memakai `UPDATE ... SET saved_amount_minor = saved_amount_minor + X
WHERE id = ? AND household_id = ? AND deleted_at IS NULL AND saved_amount_minor + X >= 0`
dengan cek rowcount (A-16).

### Service Interface (`lib/server/services/`)

- `GoalService.create(actor, householdId, input): GoalDTO`
- `GoalService.list(householdId): GoalDTO[]`
- `GoalService.adjustSaved(actor, householdId, id, delta): GoalDTO`
- `GoalService.trash(actor, householdId, id): GoalDTO`
- `GoalService.restore(actor, householdId, id): GoalDTO`
- `AdvisorService.getInsight(actor, householdId, period): { insight, delivery }`
- `AdvisorProvider.insight(period, aggregate): AdvisorInsight | AdvisorError` (seam)

### HTTP Contract

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/goals` | GET | Approved | - | `GoalDTO[]` |
| `/api/goals` | POST | Approved | `{ name, targetAmountMinor, deadline? }` | `201 GoalDTO` |
| `/api/goals/{id}` | PATCH | Approved | `{ savedDelta }` | `GoalDTO` |
| `/api/goals/{id}/trash` | POST | Approved | - | `GoalDTO` |
| `/api/goals/{id}/restore` | POST | Approved | - | `GoalDTO` |
| `/api/goals/trash` | GET | Approved | query: `cursor, limit` | `{ rows, nextCursor }` |
| `/api/advisor/insights` | POST | Approved | `{ period: { start, end } }` | `{ insight, delivery }` |

`GoalDTO` = `{ id, name, targetAmountMinor, savedAmountMinor, currencyCode, deadline, progressPercent, createdByUser, deletedAt, createdAt, updatedAt }`.
`AdvisorInsightDTO` = `{ headline, summary, actions, limitations, sourcePeriod: { start, end }, model, generatedAt, expiresAt }`.
`delivery` ∈ `FRESH | CACHE`.

### Validasi Rules (Zod)

| Field | Rules | Pesan error (bahasa awam) |
|---|---|---|
| name | required, trim, 1..80 | "Nama target maksimal 80 karakter." |
| targetAmountMinor | required, int, > 0 | "Target harus lebih dari 0." |
| deadline | optional, `YYYY-MM-DD` | "Tanggal tidak valid." |
| savedDelta | required, int, ≠ 0 | "Jumlah perubahan tidak valid." |
| period.start / period.end | required, `YYYY-MM-DD`, start ≤ end, span ≤ 90 hari | "Rentang tanggal tidak valid." |

### Error namespace advisor (ADR-003) — WAJIB

`429 ADVISOR_RATE_LIMITED` / `503 ADVISOR_UNAVAILABLE` / `422 ADVISOR_INVALID_OUTPUT`.
Bila cache unexpired untuk periode yang diminta ada → kembalikan `delivery=CACHE`.
`actions` ≥1 item, tiap `label` ≤80 char + `type` ∈ `VIEW_GOAL|REVIEW_SPENDING|NONE`.
Teks tanpa frasa terlarang ("dijamin", "pasti hemat", "sesuai OJK").

## Async & Queue

Tidak ada background worker (ADR-007). Advisor dipanggil sinkron dalam request dengan
timeout eksplisit 8–10 detik. Prune insight dilakukan sinkron saat create (prune-on-create).

## Test Scenario (BDD)

### Unit (Service — mock Repository + seam)

- it creates a goal with saved=0 and rejects target 0/negative (AC-F4-1)
- it allows duplicate goal names (two 201) (AC-F4-1)
- it caps `progressPercent` at 100 in the DTO without changing the DB value (AC-F4-2)
- it returns 100% (not 99%) when saved == target (AC-F4-2)
- it applies delta via atomic conditional update and counts both concurrent increments (AC-F4-3)
- it rejects a negative result with `SAVED_AMOUNT_INVALID` and no change (AC-F4-3)
- it returns 404 when incrementing a trashed goal (AC-F4-3)
- it soft-deletes a goal and removes it from active lists (AC-F4-4)
- it builds the insight response with all required fields and no raw per-record data (AC-F4-5)
- it rejects period > 90 days and start > end (AC-F4-5)
- it returns `delivery=CACHE` only for the same period + unexpired (AC-F4-6)
- it maps rate limit/timeout/invalid output to typed errors with cache fallback (AC-F4-7)
- it ensures `actions` ≥1 with valid `type` and no forbidden phrases (AC-F4-8)

### Feature (Route Handler)

- it returns 422 for target 0/negative (AC-F4-1)
- it returns 201 for two goals with the same name (AC-F4-1)
- it returns 422 `SAVED_AMOUNT_INVALID` for a negative result (AC-F4-3)
- it returns 404 for a goal in another household (AC-F4-3, AC-F5-7 cross-ref)
- it returns `{ insight, delivery }` with `FRESH` on a new insight (AC-F4-5, AC-F4-6)
- it returns `delivery=CACHE` with the cached insight for a repeat period (AC-F4-6)
- it returns typed 429/503/422 with cache fallback when the model fails (AC-F4-7)
- it never leaks raw model prompts or per-record transactions (AC-F4-5, AC-F3-9 cross-ref)

### Integration

- it completes create → increment → progress → trash → restore end-to-end (AC-F4-1..AC-F4-4)
- it prunes the oldest insight when an 11th is created (AC-F4-6)
- it isolates household A from household B (AC-F4-1, AC-F4-6)

### E2E (Playwright)

- it shows limitations + sourcePeriod at 390px without interaction (AC-F4-8)

## Task Breakdown

### Database & Model

- [ ] `prisma/schema.prisma`: model `SavingsGoal`, `AdvisorInsight` sesuai §Schema Database
- [ ] Migration + raw SQL: CHECK `target_amount_minor > 0`, CHECK `saved_amount_minor >= 0`, indexes
- [ ] Fixture: 4 goal statuses + insight FRESH/EXPIRED/OTHER-PERIOD (fixtures-seed-plan §5, §7)

### Repository

- [ ] Interface + implementasi Prisma untuk 2 repository di §Repository Interface
- [ ] `incrementSaved` conditional update + rowcount (A-16)
- [ ] `findLatestUnexpired` key per `(household_id, period_start, period_end)` (A-15)

### Service

- [ ] `GoalService`, `AdvisorService`
- [ ] Seam `AdvisorProvider` (interface + implementasi Gemini + fake untuk test)
- [ ] `lib/server/errors.ts`: namespace `ADVISOR_*` + mapping HTTP
- [ ] Unit test: sesuai §Test Scenario > Unit

### HTTP

- [ ] Zod schema: sesuai §Validasi Rules
- [ ] Route Handlers `app/api/goals/*`, `app/api/advisor/insights` (Node runtime)
- [ ] Feature test: sesuai §Test Scenario > Feature

### Frontend

- [ ] Halaman `/budget` (goals + budget) + advisor drawer (milik T-007; konsumsi kontrak ini)
- [ ] State advisor: FRESH/CACHE/PROCESSING/RATE_LIMITED/UNAVAILABLE/INVALID_OUTPUT (T-007)

### Async (jika ada)

- [ ] Tidak ada.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-01 | T-003: schema SavingsGoal/AdvisorInsight + repository (goal CRUD aktif, incrementSaved atomic, trash/restore; insight findLatestUnexpired/create/prune) | Persis ERD §3.8/3.11; CHECK target>0 & saved>=0 via raw SQL; incrementSaved conditional update + rowcount (A-16); kontrak Zod goals+advisor di `lib/server/contracts/goals.ts` + `advisor.ts` |

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
