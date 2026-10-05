# Dev Plan: Soft Delete, Trash & Restore

Detail teknis implementasi. Ini dokumen utama yang dibaca saat generate kode. Berisi
keputusan teknis: schema, interface, validasi, testing, dan task breakdown.

## Referensi

- Spec: `docs/spec/feat-trash-restore.md`
- PRD: `docs/PRD.md#fitur-5-soft-delete-trash-restore`
- ADR terkait: ADR-005 (soft delete), ADR-006 (layer), ADR-007 (free tier)
- ERD: `docs/erd/erd-database-schema.md` §3.7 (transaction), §3.8 (savings_goal)
- Keputusan rapat: `agent-comms/2026-09-30-pm-spec-review-minutes.md` (D-20 ALREADY_DELETED)
- Flow: `docs/erd/flowcharts.md` §6
- AC (verification-matrix): AC-F5-1 … AC-F5-8
- Engineer: Developer · Estimasi: 2 hari · Status: Draft

## Ringkasan Teknis

Proteksi terhadap penghapusan tidak sengaja: `transaction` dan `savings_goal` hanya
soft-delete (`deleted_at` + `deleted_by_user_id`), dengan undo toast 5 detik, trash view
per household, dan restore idempotent. Tidak ada permanent deletion di MVP. Layer
terdampak: Route Handler (`app/api/transactions/{id}/trash|restore`,
`app/api/goals/{id}/trash|restore`, `GET .../trash`) → Service (`TrashService`) →
Repository → Prisma. Repository **default scope `deleted_at IS NULL`**; trash view
memfilter `deleted_at IS NOT NULL` (ADR-005).

## Schema Database

> Disalin dari ERD §3.7, §3.8. Tidak ada kolom baru. Fitur ini memakai kolom soft-delete
> yang sudah ada di kedua tabel.

### Tabel: `transaction` (kolom soft-delete)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | scope isolasi |
| deleted_at | timestamptz | nullable | null = aktif |
| deleted_by_user_id | uuid | FK → user, nullable | |
| occurred_at | timestamptz | NOT NULL | tidak berubah saat restore |
| amount_minor | int | NOT NULL, CHECK > 0 `*` | tidak berubah saat restore |
| created_by_user_id | uuid | FK → user, NOT NULL | tidak berubah saat restore |
| updated_at | timestamptz | NOT NULL | berubah saat trash/restore |

Index: `idx(household_id, deleted_at, occurred_at desc)`.

### Tabel: `savings_goal` (kolom soft-delete)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | scope isolasi |
| deleted_at | timestamptz | nullable | null = aktif |
| deleted_by_user_id | uuid | FK → user, nullable | |
| updated_at | timestamptz | NOT NULL | berubah saat trash/restore |

Index: `idx(household_id, deleted_at, deadline)`.

## Interface & Contract

### Repository Interface (`lib/server/repositories/`)

- `TransactionRepository.softDelete(householdId, id, userId): { row, alreadyDeleted: boolean }`
- `TransactionRepository.restore(householdId, id): { row, alreadyActive: boolean }`
- `TransactionRepository.listTrash(householdId, cursor): { rows, nextCursor }`
- `GoalRepository.softDelete(householdId, id, userId): { row, alreadyDeleted: boolean }`
- `GoalRepository.restore(householdId, id): { row, alreadyActive: boolean }`
- `GoalRepository.listTrash(householdId, cursor): { rows, nextCursor }`

Semua method **wajib** menerima `householdId` scope (ADR-006). Soft delete/restore memakai
conditional update + cek rowcount agar idempotent (A-17/D-20):
`UPDATE ... SET deleted_at = now(), deleted_by_user_id = ? WHERE id = ? AND household_id = ?
AND deleted_at IS NULL` (rowcount 0 → cek apakah sudah deleted → `ALREADY_DELETED`).

### Service Interface (`lib/server/services/`)

- `TrashService.trashTransaction(actor, householdId, id): { dto, alreadyDeleted }`
- `TrashService.restoreTransaction(actor, householdId, id): { dto, alreadyActive }`
- `TrashService.listTrashTransactions(householdId, cursor): { rows, nextCursor }`
- `TrashService.trashGoal(actor, householdId, id): { dto, alreadyDeleted }`
- `TrashService.restoreGoal(actor, householdId, id): { dto, alreadyActive }`
- `TrashService.listTrashGoals(householdId, cursor): { rows, nextCursor }`

### HTTP Contract

| Route | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/transactions/{id}/trash` | POST | Approved | - | `200 TransactionDTO` (atau `ALREADY_DELETED`) |
| `/api/transactions/{id}/restore` | POST | Approved | - | `200 TransactionDTO` (atau `ALREADY_ACTIVE`) |
| `/api/transactions/trash` | GET | Approved | query: `cursor, limit` | `{ rows, nextCursor }` |
| `/api/goals/{id}/trash` | POST | Approved | - | `200 GoalDTO` (atau `ALREADY_DELETED`) |
| `/api/goals/{id}/restore` | POST | Approved | - | `200 GoalDTO` (atau `ALREADY_ACTIVE`) |
| `/api/goals/trash` | GET | Approved | query: `cursor, limit` | `{ rows, nextCursor }` |

Idempotent outcomes (A-17/D-20): trash ganda → `200 ALREADY_DELETED`; restore record aktif
→ `200 ALREADY_ACTIVE`. Cross-household by id → `404 NOT_FOUND` (pesan generik, bukan 403).

### Validasi Rules (Zod)

| Field | Rules | Pesan error (bahasa awam) |
|---|---|---|
| id (path) | required, uuid | "Data tidak ditemukan." |
| cursor (query) | optional, base64 opaque | "Penanda halaman tidak valid." |
| limit (query) | optional, int, default 20, max 50 | "Jumlah per halaman maksimal 50." |

## Async & Queue

Tidak ada async. Undo adalah restore yang dipicu client (bukan penundaan commit di server);
server langsung commit soft delete (ADR-005). Tidak ada auto-purge trash di MVP.

## Test Scenario (BDD)

### Unit (Service — mock Repository)

- it sets `deleted_at` + `deleted_by_user_id` and removes the record from active lists (AC-F5-1)
- it excludes deleted records from balance/budget/chart/progress calculations (AC-F5-1)
- it returns `ALREADY_DELETED` on a second trash without double-setting `deleted_at` (AC-F5-6)
- it clears soft-delete fields on restore and keeps `occurred_at`/`amount`/`created_by` (AC-F5-4)
- it returns `ALREADY_ACTIVE` when restoring an active record (AC-F5-5)
- it returns 404 (not 403) for a record in another household (AC-F5-7)
- it lists only deleted records of the caller's household, ordered `deleted_at DESC` (AC-F5-3)

### Feature (Route Handler)

- it returns 200 with the deleted summary on trash (AC-F5-1)
- it returns 200 `ALREADY_DELETED` on double trash (AC-F5-6)
- it returns 200 `ALREADY_ACTIVE` on restore of an active record (AC-F5-5)
- it returns 404 generic for cross-household id (AC-F5-7)
- it returns only deleted records in the trash collection (AC-F5-3)
- it exposes no permanent-delete route (AC-F5-8)

### Integration

- it completes trash → undo (restore) → active end-to-end (AC-F5-1, AC-F5-2, AC-F5-4)
- it keeps the transfer partner active when one leg is trashed (AC-F5-1 edge)
- it isolates household A trash from household B (AC-F5-3, AC-F5-7)
- it handles two concurrent trashes as one 200 + one `ALREADY_DELETED` (AC-F5-6)

### E2E (Playwright)

- it shows the undo toast after 200 and hides it within 4.5–5.5s; undo restores (AC-F5-2)

### Smoke

- it greps for a physical DELETE route and a "hapus permanen" button (must be absent) (AC-F5-8)

## Task Breakdown

### Database & Model

- [ ] Kolom soft-delete sudah ada di `Transaction`/`SavingsGoal` (dari dev plan dashboard/goals)
- [ ] Index `idx(household_id, deleted_at, ...)` terpasang
- [ ] Fixture: TX-DEL-1/2 + GOAL-DELETED (fixtures-seed-plan §3.3, §5)

### Repository

- [ ] Interface + implementasi soft delete/restore/listTrash untuk transaction + goal
- [ ] Conditional update + rowcount untuk idempotensi (A-17/D-20)
- [ ] Default scope `deleted_at IS NULL`; trash scope `deleted_at IS NOT NULL`

### Service

- [ ] `TrashService` (transaction + goal) sesuai §Service Interface
- [ ] Unit test: sesuai §Test Scenario > Unit

### HTTP

- [ ] Zod schema: sesuai §Validasi Rules
- [ ] Route Handlers trash/restore/list untuk transaction + goal (Node runtime)
- [ ] Feature test: sesuai §Test Scenario > Feature

### Frontend

- [ ] Undo toast 5 detik + tab "Trash" di `/transactions?view=trash` (milik T-006; konsumsi kontrak ini)
- [ ] State trash empty + restore (T-006)

### Async (jika ada)

- [ ] Tidak ada.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-01 | T-003: repository softDelete/restore/listTrash untuk transaction + savings_goal (conditional update + rowcount, idempotent) | Terpisah dari metode aktif; active query selalu exclude deleted_at; cross-household by id → tidak ditemukan (extended-unique where); unit test isolation + soft-delete hijau |

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
