# ERD & Skema Database — Financial Diary MVP

**Penulis:** PM / System Analyst
**Tanggal:** 2026-09-30
**Status:** Draft — menunggu review backend dev (T-001/T-003)
**Sumber kontrak:** `docs/architecture-decisions.md` + keputusan PM 2026-09-30 (Prisma, custom JWT auth, arsip requirements.md)
**Input desain:** hasil diskusi review dengan agent Brainstorm (2026-09-30)

Dokumen ini adalah **input untuk Dev Plan** (Langkah 3 DDD), bukan pengganti dev plan.
Detail teknis final (Prisma schema file, migration SQL) ditulis oleh backend dev di
`docs/dev-plan/` dan diverifikasi QA terhadap dokumen ini.

---

## 1. Ringkasan Desain

- **16 tabel**, PostgreSQL via Neon (free tier), Prisma 7.10.0 + `@prisma/adapter-neon`.
  - 13 tabel dasar (bagian §3), ditambah `wallet` dari T-009 (§8) dan `bank_institution` + `user_custom_institution` dari T-011 (§9).
- PK: UUID (`uuid(7)` bila didukung Prisma 7.10; fallback generate di aplikasi).
- Timestamps: `timestamptz` UTC (eksplisit `@db.Timestamptz` — jangan pakai default Prisma).
- Uang: `Int` minor units. **Skala IDR: minor = 1 rupiah (scale 0)** — `integer` Postgres
  aman sampai ~2,1 miliar rupiah per baris. Dilarang pakai `Decimal`/`Float` untuk uang.
- Soft delete: data pengguna yang dapat dihapus memakai `deleted_at`, termasuk
  `transaction`, `savings_goal`, `household_budget`, dan `personal_budget`. Tidak ada hard delete.
  untuk data user di MVP.
- Multi-tenant: semua tabel data ledger membawa `household_id`. Isolasi di-enforce di
  layer repository (injeksi `householdId`), bukan hanya di ERD.
- `onDelete`/`onUpdate`: RESTRICT di semua FK. Tidak ada cascade di dunia soft-delete.

## 2. ERD (Mermaid)

```mermaid
erDiagram
    USER ||--o{ HOUSEHOLD : owns
    USER ||--o{ MEMBERSHIP : has
    USER ||--o{ SESSION : has
    USER ||--o{ IDEMPOTENCY_KEY : issues
    HOUSEHOLD ||--o{ MEMBERSHIP : has
    HOUSEHOLD ||--o{ INVITE : issues
    HOUSEHOLD ||--o{ MEMBERSHIP_EVENT : logs
    HOUSEHOLD ||--o{ TRANSACTION : owns
    HOUSEHOLD ||--o{ SAVINGS_GOAL : owns
    HOUSEHOLD ||--o{ RECEIPT : owns
    HOUSEHOLD ||--o{ HOUSEHOLD_BUDGET : sets
    HOUSEHOLD ||--o{ ADVISOR_INSIGHT : caches
    INVITE |o--o| MEMBERSHIP : redeems
    MEMBERSHIP ||--o{ MEMBERSHIP_EVENT : appends
    RECEIPT ||--o{ OCR_JOB : produces
    RECEIPT |o--o| TRANSACTION : evidences

    USER {
        uuid id PK
        varchar email UK "normalized lowercase"
        varchar password_hash
        varchar display_name
        timestamptz created_at
        timestamptz updated_at
    }
    HOUSEHOLD {
        uuid id PK
        varchar name
        uuid owner_user_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    MEMBERSHIP {
        uuid id PK
        uuid household_id FK
        uuid user_id FK
        enum role "OWNER|MEMBER"
        enum status "PENDING|APPROVED|DECLINED|REVOKED"
        uuid invited_by_user_id FK "nullable"
        uuid invite_id FK "nullable"
        timestamptz requested_at "nullable"
        timestamptz approved_at "nullable"
        uuid approved_by_user_id FK "nullable"
        timestamptz declined_at "nullable"
        uuid declined_by_user_id FK "nullable"
        timestamptz revoked_at "nullable"
        uuid revoked_by_user_id FK "nullable"
        varchar decision_reason "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    INVITE {
        uuid id PK
        uuid household_id FK
        varchar code_hash UK "sha256, plaintext never stored"
        uuid created_by_user_id FK
        timestamptz expires_at "created_at + 7 days"
        timestamptz redeemed_at "nullable"
        uuid redeemed_by_user_id FK "nullable"
        timestamptz revoked_at "nullable"
        timestamptz created_at
    }
    MEMBERSHIP_EVENT {
        uuid id PK
        uuid membership_id FK
        uuid household_id FK
        uuid actor_user_id FK
        enum event_type "REQUESTED|APPROVED|DECLINED|REVOKED"
        enum previous_status "nullable"
        enum next_status "nullable"
        varchar reason "nullable"
        timestamptz created_at "immutable, no updated_at"
    }
    SESSION {
        uuid id PK "sama dengan JWT sid"
        uuid user_id FK
        varchar token_version
        timestamptz expires_at
        timestamptz revoked_at "nullable"
        timestamptz created_at
        timestamptz last_seen_at
    }
    TRANSACTION {
        uuid id PK
        uuid household_id FK
        uuid created_by_user_id FK
        enum type "MONEY_IN|MONEY_OUT"
        int amount_minor "positive, IDR scale 0"
        char currency_code "IDR"
        varchar category "nullable"
        varchar merchant "nullable"
        text note "nullable"
        timestamptz occurred_at
        enum source "MANUAL|OCR"
        uuid receipt_id FK "nullable"
        uuid transfer_group_id "nullable, NO FK"
        timestamptz deleted_at "nullable, soft delete"
        uuid deleted_by_user_id FK "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    SAVINGS_GOAL {
        uuid id PK
        uuid household_id FK
        uuid created_by_user_id FK
        varchar name
        int target_amount_minor "CHECK > 0"
        int saved_amount_minor "manual counter"
        char currency_code "IDR"
        date deadline "nullable"
        timestamptz deleted_at "nullable, soft delete"
        uuid deleted_by_user_id FK "nullable"
        timestamptz created_at
        timestamptz updated_at
    }
    RECEIPT {
        uuid id PK
        uuid household_id FK
        uuid uploaded_by_user_id FK
        varchar content_sha256 UK "unique per household"
        varchar mime_type
        int size_bytes
        varchar storage_key "Vercel Blob key, bytes never in DB"
        timestamptz created_at
    }
    OCR_JOB {
        uuid id PK
        uuid receipt_id FK
        enum status "PROCESSING|SUCCEEDED|FAILED"
        varchar model "nullable"
        jsonb result_json "nullable, draft only"
        float confidence "nullable"
        varchar error_code "nullable"
        timestamptz created_at
        timestamptz completed_at "nullable"
    }
    ADVISOR_INSIGHT {
        uuid id PK
        uuid household_id FK
        uuid requested_by_user_id FK
        date source_period_start
        date source_period_end
        varchar model
        varchar headline
        text summary
        jsonb actions_json
        text limitations "nullable"
        timestamptz generated_at
        timestamptz expires_at
    }
    HOUSEHOLD_BUDGET {
        uuid id PK
        uuid household_id FK
        date period_start "month start, app timezone"
        int amount_minor "CHECK > 0"
        char currency_code "IDR"
        uuid created_by_user_id FK
        timestamptz created_at
        timestamptz updated_at
    }
    IDEMPOTENCY_KEY {
        uuid id PK
        uuid user_id FK
        varchar key
        varchar request_hash "sha256(method+path+canonical JSON)"
        int response_status
        jsonb response_body
        timestamptz created_at
        timestamptz expires_at "created_at + 24h"
    }
```

## 3. Tabel Detail (13 tabel dasar; amendment wallet/institusi di §8 dan §9)

> Tanda `*` = constraint yang TIDAK bisa diekspresikan di `schema.prisma`
> (partial index / CHECK) — wajib ditambahkan sebagai raw SQL di migration.

### 3.1 `user`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | uuid(7) |
| email | varchar | **UNIQUE**, NOT NULL | dinormalisasi (lowercase + trim) di aplikasi |
| password_hash | varchar | NOT NULL | hash server-side, jangan pernah plaintext |
| display_name | varchar | NOT NULL | |
| personal_budget_cycle_mode | enum `BudgetCycleMode` | NOT NULL, default `CALENDAR_MONTH` | siklus budget Pribadi (AC-F2-2d) |
| personal_budget_cycle_day | int | nullable, CHECK 1-28 saat `FIXED_DAY` | anchor tanggal |
| personal_budget_cycle_pending_mode | enum `BudgetCycleMode` | nullable | perubahan menunggu |
| personal_budget_cycle_pending_day | int | nullable | anchor perubahan |
| personal_budget_cycle_pending_effective_from | date | nullable | batas siklus baru |
| created_at / updated_at | timestamptz | NOT NULL | UTC |

### 3.2 `household`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| name | varchar | NOT NULL | |
| owner_user_id | uuid | FK → user, NOT NULL | owner juga punya membership APPROVED |
| budget_cycle_mode | enum `BudgetCycleMode` | NOT NULL, default `CALENDAR_MONTH` | siklus budget Bersama (AC-F2-2d) |
| budget_cycle_day | int | nullable, CHECK 1-28 saat `FIXED_DAY` | anchor tanggal |
| budget_cycle_pending_mode | enum `BudgetCycleMode` | nullable | perubahan menunggu |
| budget_cycle_pending_day | int | nullable | anchor perubahan |
| budget_cycle_pending_effective_from | date | nullable | batas siklus baru |
| created_at / updated_at | timestamptz | NOT NULL | |

Index: `idx(owner_user_id)`.

### 3.3 `membership`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| user_id | uuid | FK → user, NOT NULL | |
| role | enum | NOT NULL | `OWNER \| MEMBER` |
| status | enum | NOT NULL | `PENDING \| APPROVED \| DECLINED \| REVOKED` |
| invited_by_user_id | uuid | FK → user, nullable | |
| invite_id | uuid | FK → invite, nullable | |
| requested_at | timestamptz | nullable | |
| approved_at / approved_by_user_id | | nullable | |
| declined_at / declined_by_user_id | | nullable | |
| revoked_at / revoked_by_user_id | | nullable | |
| decision_reason | varchar | nullable | |
| created_at / updated_at | timestamptz | NOT NULL | |

**Constraint (koreksi penting dari review):**

- `UNIQUE(user_id, household_id)` — satu baris per pasangan user-household.
  User yang DECLINED/REVOKED bisa re-request dengan flip status baris yang sama
  (audit trail tetap utuh di membership_event).
- `UNIQUE(user_id) WHERE status IN ('PENDING','APPROVED')` `*` — partial unique index,
  menegakkan "satu membership aktif per user" di level DB, termasuk race concurrent request.
  DILARANG memakai plain `UNIQUE(user_id)` — itu mengunci user permanen ke household
  pertamanya dan membuat user REVOKED tidak bisa join household lain.
- `idx(household_id, status)` — untuk daftar anggota + pending request.

### 3.4 `invite`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| code_hash | varchar | **UNIQUE**, NOT NULL | sha256; plaintext code hanya di response create |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| expires_at | timestamptz | NOT NULL | created_at + 7 hari |
| redeemed_at | timestamptz | nullable | |
| redeemed_by_user_id | uuid | FK → user, nullable | |
| revoked_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL | |

Index: `idx(household_id, created_at desc)` untuk UI daftar invite.

**Aturan redeem (anti-race):** redeem wajib conditional update
`UPDATE ... WHERE id = ? AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now()`
dengan cek rowcount — bukan read-then-write.

### 3.5 `membership_event`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| membership_id | uuid | FK → membership, NOT NULL | |
| household_id | uuid | FK → household, NOT NULL | |
| actor_user_id | uuid | FK → user, NOT NULL | |
| event_type | enum | NOT NULL | `REQUESTED \| APPROVED \| DECLINED \| REVOKED` |
| previous_status | enum | nullable | |
| next_status | enum | nullable | |
| reason | varchar | nullable | |
| created_at | timestamptz | NOT NULL | **immutable — tanpa updated_at** |

Index: `idx(membership_id)`, `idx(household_id, created_at desc)`.
Append-only audit log; tidak ada retention/trimming.

### 3.6 `session`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | **sama dengan claim `sid` di JWT** |
| user_id | uuid | FK → user, NOT NULL | |
| token_version | varchar | NOT NULL | |
| expires_at | timestamptz | NOT NULL | |
| revoked_at | timestamptz | nullable | |
| created_at | timestamptz | NOT NULL | |
| last_seen_at | timestamptz | NOT NULL | |

Index: `idx(user_id)`, `idx(expires_at)` untuk purge.

**Koreksi penting: TIDAK ADA `household_id` di session.** Dengan satu household per user,
nilai itu 100% derivable dari membership saat request. Menyimpannya = risiko stale data
(setelah REVOKED, baris session masih menunjuk household) → potensi kebocoran lintas
household jika ada code path yang mempercayainya. JWT claims: `{sub, sid, token_version}`.
Per request: session by sid (PK) → membership by user_id → household_id.
Ini adalah **amandemen terhadap kontrak Session di `architecture-decisions.md`** —
backend dev wajib mencatatnya di ADR-002 dan tabel Keputusan Teknis dev plan.

### 3.7 `transaction`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| type | enum | NOT NULL | `MONEY_IN \| MONEY_OUT` (TRANSFER dihapus) |
| amount_minor | int | NOT NULL, CHECK > 0 | skala IDR = 1 rupiah |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| category | varchar | nullable | |
| merchant | varchar | nullable | |
| note | text | nullable | |
| occurred_at | timestamptz | NOT NULL | |
| source | enum | NOT NULL | `MANUAL \| OCR` |
| receipt_id | uuid | FK → receipt, nullable | |
| transfer_group_id | uuid | nullable, **TANPA FK** | server-generated; NULL untuk non-transfer |
| deleted_at | timestamptz | nullable | soft delete |
| deleted_by_user_id | uuid | FK → user, nullable | |
| created_at / updated_at | timestamptz | NOT NULL | |

**Constraint:**

- `idx(household_id, deleted_at, occurred_at desc)` — query utama daftar aktivitas.
- `UNIQUE(household_id, transfer_group_id, type)` — mencegah duplikasi kaki transfer;
  NULL group dianggap distinct oleh Postgres sehingga baris non-transfer bebas.
  Sekaligus jadi lookup "kaki pasangan transfer":
  `WHERE household_id = ? AND transfer_group_id = ? AND id != ?`.
- `CHECK (type IN ('MONEY_IN', 'MONEY_OUT'))` — validasi enum.
- **DELETED:** `CHECK ((type = 'TRANSFER') = (transfer_group_id IS NOT NULL))` — tidak
  dipakai lagi karena model transfer berubah.
- Invariant "tepat 2 kaki (satu MONEY_IN + satu MONEY_OUT), dibuat atomik" di-enforce
  di **service layer** dalam satu transaksi, bukan di ERD.

**Model Transfer:**
Transfer = 2 transaksi: `MONEY_OUT` + `MONEY_IN` dengan `transfer_group_id` sama.
Balance tidak terpengaruh (net 0). Enum `TRANSFER` dihapus karena tidak dipakai di MVP.

### 3.8 `savings_goal`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| name | varchar | NOT NULL | |
| target_amount_minor | int | NOT NULL, **CHECK > 0** `*` | |
| saved_amount_minor | int | NOT NULL, default 0 | counter manual |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| deadline | date | nullable | |
| deleted_at | timestamptz | nullable | soft delete |
| deleted_by_user_id | uuid | FK → user, nullable | |
| created_at / updated_at | timestamptz | NOT NULL | |

Index: `idx(household_id, deleted_at, deadline)` (daftar goal urut deadline).
CHECK tambahan (raw SQL): `CHECK (saved_amount_minor >= 0)` — keputusan rapat D-18.

**Aturan update saved_amount:** atomic increment
`UPDATE ... SET saved_amount_minor = saved_amount_minor + X` (bukan read-modify-write)
karena dua anggota bisa mengedit bersamaan. Cap 100% hanya di DTO display, tidak di DB.
`saved_amount_minor` TIDAK terhubung ke Transaction (tidak ada `goal_id` di transaction)
— keputusan apakah kontribusi goal jadi transaksi nyata = open question PM (lihat §6).

### 3.9 `receipt`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| uploaded_by_user_id | uuid | FK → user, NOT NULL | |
| content_sha256 | varchar | NOT NULL | dedup |
| mime_type | varchar | NOT NULL | |
| size_bytes | int | NOT NULL | |
| storage_key | varchar | NOT NULL | key Vercel Blob; byte gambar TIDAK di DB |
| created_at | timestamptz | NOT NULL | |

**Constraint:** `UNIQUE(household_id, content_sha256)` — dedup struk per household;
duplikat → `409 DUPLICATE_RECEIPT` sesuai kontrak.

### 3.10 `ocr_job`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| receipt_id | uuid | FK → receipt, NOT NULL | |
| status | enum | NOT NULL | `PROCESSING \| SUCCEEDED \| FAILED` |
| model | varchar | nullable | |
| result_json | jsonb | nullable | draft; TIDAK pernah auto-save jadi transaction |
| confidence | float | nullable | |
| error_code | varchar | nullable | |
| created_at | timestamptz | NOT NULL | |
| completed_at | timestamptz | nullable | |

Index: `idx(receipt_id)`. Opsional `*`: partial `UNIQUE(receipt_id) WHERE status = 'PROCESSING'`
untuk mencegah OCR ganda concurrent per receipt.

**Catatan Vercel Hobby:** tidak ada background worker. `PROCESSING` bersifat transient
dalam request upload (synchronous-within-request), bukan model worker-polling.

### 3.11 `advisor_insight`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| requested_by_user_id | uuid | FK → user, NOT NULL | |
| source_period_start | date | NOT NULL | |
| source_period_end | date | NOT NULL | |
| model | varchar | NOT NULL | |
| headline | varchar | NOT NULL | |
| summary | text | NOT NULL | |
| actions_json | jsonb | NOT NULL | |
| limitations | text | nullable | |
| generated_at | timestamptz | NOT NULL | |
| expires_at | timestamptz | NOT NULL | |

Index: `idx(household_id, generated_at desc)` — lookup cache "latest successful unexpired".

**Keputusan:** hanya insight SUKSES yang dipersist (gagal tidak di-cache). Karena itu
tabel ini tidak butuh kolom status. Retention: prune-on-create — simpan maksimal ~10
insight terbaru per household, hapus yang expired > 30 hari.

### 3.12 `household_budget` (tabel BARU — mengisi gap kontrak DashboardDTO)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| period_start | date | NOT NULL | awal periode menurut siklus, timezone aplikasi |
| amount_minor | int | NOT NULL, CHECK > 0 | |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| created_at / updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | nullable | budget dihapus secara non-destruktif |

**Constraint:** `UNIQUE(household_id, period_start)` - sekaligus lookup index.
`period_end` TIDAK disimpan (derived dari siklus scope pada `household`/`user`) —
tanggal akhir yang disimpan cenderung drift. Upsert by `(household_id, period_start)`.

### 3.12b `personal_budget` (tabel BARU, T-015)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | |
| user_id | uuid | FK → user, NOT NULL | pemilik budget pribadi |
| period_start | date | NOT NULL | awal periode menurut siklus, timezone aplikasi |
| amount_minor | int | NOT NULL, CHECK > 0 | |
| currency_code | char(3) | NOT NULL, default `IDR` | |
| created_by_user_id | uuid | FK → user, NOT NULL | |
| created_at / updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | nullable | budget dihapus secara non-destruktif |

**Constraint:** `UNIQUE(household_id, user_id, period_start)` - lookup sekaligus
pengaman satu baris per user per periode. Index tambahan `(user_id, period_start)`.
`period_end` tidak disimpan (derived dari siklus pribadi user).

**Akses:** hanya `user_id` pemilik yang boleh membaca atau menulis. Tidak ada
owner override dan tidak ada parameter `userId` dari client; scope personal
selalu berasal dari session.

### 3.13 `idempotency_key`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK → user, NOT NULL | **scope per user, bukan per household** |
| key | varchar | NOT NULL | dari header `Idempotency-Key` |
| request_hash | varchar | NOT NULL | sha256(method + path + canonical JSON body) |
| response_status | int | nullable | |
| response_body | jsonb | nullable | snapshot response penuh |
| created_at | timestamptz | NOT NULL | |
| expires_at | timestamptz | NOT NULL | created_at + 24 jam |

**Constraint:** `UNIQUE(user_id, key)`, `idx(expires_at)`.

**Pola (single-transaction idempotency):** dalam satu transaksi Prisma — insert baris key
(unique constraint = claim) → jalankan mutasi → tulis `response_status` + `response_body`
→ commit. Hash mismatch pada key existing → `409 IDEMPOTENCY_CONFLICT`. Duplicate
concurrent → P2002 → rollback → re-read → replay bila hash match. Mutasi gagal → seluruh
transaksi rollback (key ikut hilang) → retry mengeksekusi ulang (benar: kegagalan tidak
di-replay). Tanpa status PENDING, tanpa takeover logic. Retention: purge oportunistik
`DELETE WHERE user_id = ? AND expires_at < now()` saat insert.

## 4. Keputusan Desain (ringkas, untuk ADR backend dev)

| # | Keputusan | Alasan |
|---|---|---|
| D-1 | Transfer tanpa tabel TransferGroup; `transfer_group_id` uuid tanpa FK + `UNIQUE(household_id, transfer_group_id, type)` | FK tidak bisa menegakkan invariant 2-kaki; unique constraint lebih kuat; hemat 1 insert + 1 relasi |
| D-2 | `IdempotencyKey` sebagai tabel, scope `UNIQUE(user_id, key)`, simpan response penuh, TTL 24 jam | Redis menambah vendor; scope household bisa me-replay response user lain ke user lain |
| D-3 | Budget disimpan di tabel `household_budget` `UNIQUE(household_id, period_start)`, tanpa kolom period_end | DashboardDTO wajib punya budgetMinor; period_end derived agar tidak drift |
| D-4 | Drop `session.household_id` | Stale-data hazard; derivable dari membership per request |
| D-5 | Membership: `UNIQUE(user_id, household_id)` + partial `UNIQUE(user_id) WHERE status IN (PENDING, APPROVED)` | Plain unique(user_id) mengunci user ke household pertama selamanya |
| D-6 | Uang = Int minor, skala IDR = 1 rupiah | Integer Postgres aman ~2,1 miliar; sen akan overflow |
| D-7 | Insight sukses saja yang dipersist; prune maks ~10/household | Tanpa kolom status; kontrol pertumbuhan di free tier |
| D-8 | OCR PROCESSING bersifat transient dalam request | Vercel Hobby tidak punya background worker |
| D-9 | Isolasi tenant di-enforce di repository (injeksi householdId + extended unique where), bukan RLS | RLS overkill untuk MVP |

## 5. Risiko yang Perlu Perhatian Dev

1. **Timezone period math:** `occurred_at` UTC, tapi budget bulanan/byDay/period advisor
   adalah konsep kalender. Fix satu timezone aplikasi (rekomendasi: `Asia/Jakarta`),
   bucket hari/periode dihitung di aplikasi; kolom period disimpan sebagai `DATE`.
2. **`spentMinor` wajib mengecualikan kaki TRANSFER** (hanya MONEY_OUT yang dihitung).
3. **Owner bootstrap:** insert household + membership OWNER dalam SATU transaksi.
4. **Redeem invite:** conditional update + rowcount check (anti-race).
5. **FK yang sengaja tidak dibuat:** `transaction.transfer_group_id`, (dan `session.household_id`
   yang dihapus). Aturan masa depan: jalur hard-delete (mis. GDPR purge, GC blob) wajib
   null-out dependen dulu — receipt adalah kandidat offender berikutnya.
6. **Prisma 7 + Neon:** relationMode foreignKeys-only; `@db.Timestamptz` eksplisit;
   `Json` → jsonb (jangan filter di dalam JSON, jangan GIN index); partial index & CHECK
   via raw SQL di migration; interactive transaction didukung tapi mahal round-trip —
   singkat dan single-purpose; pakai pooled connection string; antisipasi cold start.
7. **Vercel Blob:** dedup via `content_sha256`; tambahkan backlog pembersihan orphan blob
   (upload sukses tapi transaksi DB gagal).

## 6. Open Questions untuk PM (perlu keputusan, tidak memblokir Langkah 0–3)

| ID | Pertanyaan | Rekomendasi PM |
|---|---|---|
| OQ-1 | Apakah kontribusi ke savings goal menjadi transaksi nyata (tambah `goal_id` di transaction) atau tetap counter manual? | Tetap counter manual untuk MVP (sederhana); catat sebagai deferred scope |
| OQ-2 | Timezone aplikasi untuk period math | `Asia/Jakarta` |
| OQ-3 | Siapa yang boleh mengubah `household_budget` (owner saja atau semua member APPROVED)? | Owner saja untuk MVP |

## 7. Acceptance Criteria ERD (untuk QA)

- [ ] Migration berjalan bersih pada database kosong (Neon).
- [ ] Semua 13 tabel ada dengan kolom sesuai §3.
- [ ] Partial unique index membership dan CHECK constraint transaction/goal/budget terpasang (raw SQL di migration).
- [ ] Query aktif transaction/goal mengecualikan `deleted_at IS NOT NULL`.
- [ ] Dua user dari household berbeda tidak bisa saling membaca data (uji isolasi).
- [ ] Redeem invite ganda concurrent hanya berhasil satu kali.
- [ ] Idempotency: key sama + payload sama → response asli; key sama + payload beda → 409.
- [ ] Transfer menghasilkan tepat 2 baris dengan transfer_group_id sama; kaki TRANSFER tidak dihitung sebagai spending.

---

## 8. Draft Amendment — Wallet F6 (T-009)

**Status:** Draft, Developer (T-009) · **2026-10-09** · **Pending PM approval.**
**Sumber:** `docs/architecture-decisions.md` "Draft Amendment — Wallet F6 (T-009)" (A-36..A-49), Spec `docs/spec/feat-wallets.md`, design `docs/design/06-wallets.md`.
**Efek:** section ini MENGAMANDEMEN §2 (ERD) dan §3.7 (`transaction`); bila bertentangan, section ini menang. Tidak ada perubahan destruktif; arsip wallet non-destruktif dan tanpa hard delete.

### 8.1 ERD tambahan (Mermaid)

```mermaid
erDiagram
    HOUSEHOLD ||--o{ WALLET : owns
    USER ||--o{ WALLET : creates
    WALLET ||--o{ TRANSACTION : "receives wallet_id"
    WALLET {
        uuid id PK
        uuid household_id FK
        uuid created_by_user_id FK "creator; owner if PERSONAL"
        enum scope "PERSONAL|SHARING"
        varchar name "<=80"
        varchar purpose "nullable, <=80"
        int opening_balance_minor "default 0, CHECK >= 0"
        timestamptz archived_at "nullable = active"
        uuid archived_by_user_id FK "nullable"
        varchar system_key "nullable, migration marker"
        timestamptz created_at
        timestamptz updated_at
    }
```

Relasi `WALLET ||--o{ TRANSACTION` adalah relasi yang **household-qualified**: FK `(household_id, wallet_id) → wallet(household_id, id)` ditambahkan via raw SQL (A-37).

### 8.2 Tabel: `wallet`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | scope isolasi |
| created_by_user_id | uuid | FK → user, NOT NULL | pembuat; untuk `PERSONAL` sekaligus pemilik |
| scope | enum | NOT NULL | `PERSONAL \| SHARING` (immutable setelah create) |
| name | varchar | NOT NULL | ≤80 (app-enforced) |
| purpose | varchar | nullable | ≤80, tujuan penggunaan user (bukan tipe rekening) |
| opening_balance_minor | int | NOT NULL, default 0, CHECK >= 0 `*` | IDR scale 0; bukan transaksi |
| archived_at | timestamptz | nullable | null = aktif |
| archived_by_user_id | uuid | FK → user, nullable | |
| system_key | varchar | nullable | penanda migrasi (A-48); NULL untuk wallet buatan user |
| created_at / updated_at | timestamptz | NOT NULL | |

**Constraint:**
- `UNIQUE(household_id, system_key)` `*` — idempotensi wallet default hasil migrasi (A-48).
- `UNIQUE(household_id, id)` — target FK household-qualified untuk `transaction.wallet_id` (A-37); redundan dengan PK tetapi diperlukan.
- `idx(household_id, scope, archived_at)` — picker/carousel/ringkasan.
- **Invariant (service-enforced):** `scope = PERSONAL` ⇒ hanya `created_by_user_id` yang boleh lihat/gunakan/ubah/arsip/pulihkan; `scope = SHARING` ⇒ semua APPROVED boleh lihat/gunakan/ubah nama+tujuan, arsip/pulihkan hanya `created_by_user_id` atau Owner household. Tidak bisa diekspresikan sebagai CHECK lintas-tabel.
- Tidak ada hard delete; arsip tidak menghapus riwayat.

### 8.3 Amandemen `transaction` (§3.7)

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| wallet_id | uuid | FK → wallet, NOT NULL (setelah backfill) | wajib untuk MONEY_IN/MONEY_OUT dan kedua kaki transfer |

**Constraint:**
- FK household-qualified via raw SQL: `FOREIGN KEY (household_id, wallet_id) REFERENCES wallet(household_id, id)` (A-37); relasi Prisma tetap single-column, service tetap memverifikasi `wallet.household_id = transaction.household_id`.
- Index tambahan: `idx(household_id, wallet_id, deleted_at, occurred_at desc)` — aktivitas/saldo per wallet.
- `UNIQUE(household_id, transfer_group_id, type)` dan `idx(household_id, deleted_at, occurred_at desc)` yang ada **tidak diubah dan tidak diduplikasi**.
- Invariant transfer: dua kaki (`MONEY_OUT` dari `fromWalletId`, `MONEY_IN` ke `toWalletId`), `transfer_group_id` sama, jumlah+tanggal konsisten, `fromWalletId != toWalletId`, atomic di service; bukan CHECK (tidak bisa dinyatakan per-baris).

### 8.4 Migrasi (ringkas; kontrak penuh di A-48)

1. Additive: buat `wallet` + enum + `transaction.wallet_id` nullable + index.
2. Backfill idempotent: satu wallet default SHARING per household lama (`system_key = 'legacy_default'`, opening 0, `created_by_user_id = owner`); `UPDATE transaction ... WHERE household_id = ? AND wallet_id IS NULL`; termasuk baris trashed dan kedua kaki transfer; household tanpa transaksi tetap mendapat wallet default.
3. Verifikasi: nol `wallet_id IS NULL`; paritas ledger pre/post; pasangan transfer utuh; tidak ada tautan lintas household.
4. Enforce: `NOT NULL` + composite FK + index per-wallet.

### 8.5 Acceptance tambahan untuk QA (rencana, bukan eksekusi)

- [ ] `wallet` dan `transaction.wallet_id` terpasang dengan composite FK household-qualified dan index per-wallet.
- [ ] `CHECK opening_balance_minor >= 0` dan `UNIQUE(household_id, system_key)` terpasang (raw SQL).
- [ ] Backfill idempoten (rerun tidak membuat wallet/tautan duplikat) dan paritas ledger pre/post sama.
- [ ] Tidak ada transaksi household A tertaut ke wallet household B (FK + verifikasi).
## 9. Draft Amendment - Bank Institutions (T-011)

**Sumber:** `docs/architecture-decisions.md` A-52..A-59 (Accepted 2026-10-21), Spec `docs/spec/feat-bank-institutions.md`, Dev Plan `docs/dev-plan/feat-bank-institutions.md`, migration `20261021120000_bank_institutions`, dan migration provenance `20261022120000_institution_source_period`.
**Efek:** menambah dua tabel dan dua kolom nullable pada `wallet`. Tidak mengubah �3.7 `transaction`, saldo, budget, goal, atau agregat uang.

### 9.1 ERD tambahan

```mermaid
erDiagram
    USER ||--o{ USER_CUSTOM_INSTITUTION : owns
    BANK_INSTITUTION ||--o{ WALLET : "official reference"
    USER_CUSTOM_INSTITUTION ||--o{ WALLET : "custom reference"

    BANK_INSTITUTION {
        uuid id PK
        varchar display_name
        varchar normalized_name UK
        varchar source
        varchar source_url
        varchar source_period
        varchar source_ref "OJK sandi bank"
        varchar seed_version
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }
    USER_CUSTOM_INSTITUTION {
        uuid id PK
        uuid user_id FK
        varchar display_name
        varchar normalized_name
        timestamptz archived_at "nullable = active"
        timestamptz created_at
        timestamptz updated_at
    }
    WALLET {
        uuid official_institution_id FK "nullable"
        uuid custom_institution_id FK "nullable"
    }
```

### 9.2 Tabel: `bank_institution`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| display_name | varchar(160) | NOT NULL | Nama resmi OJK apa adanya. |
| normalized_name | varchar(160) | NOT NULL, UNIQUE | NFKC, trim, collapse whitespace, case-fold. |
| source | varchar(40) | NOT NULL, default `OJK_OFFICE_LIST` | Penanda provenance. |
| source_url | varchar(500) | NOT NULL | Halaman resmi OJK. |
| source_period | varchar(7) | NOT NULL, CHECK `YYYY-MM` | Periode publikasi sumber; seed Juni 2026 mencatat `2026-06`. Tidak ada hari yang dikarang. |
| source_ref | varchar(255) | nullable | `Sandi Bank` OJK (stable match key). |
| seed_version | varchar(40) | NOT NULL | `ojk-office-list-2026-06-v1`. |
| is_active | boolean | NOT NULL, default true | Bank yang hilang dari snapshot dinonaktifkan, tidak dihapus. |
| created_at / updated_at | timestamptz | NOT NULL | |

- `UNIQUE(normalized_name)` mencegah dua baris katalog dengan nama sama. Konflik di file sumber harus menghentikan seed.
- `INDEX(is_active, normalized_name)` untuk pencarian katalog aktif.
- Global, tanpa `household_id`. Tidak ada write route user; hanya seed terkontrol.
- Tidak ada kolom logo, rekening, nomor kartu, atau klasifikasi bank.

### 9.3 Tabel: `user_custom_institution`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK -> user, NOT NULL, ON DELETE RESTRICT | Pemilik entri privat. |
| display_name | varchar(80) | NOT NULL | Input user yang sudah di-trim. |
| normalized_name | varchar(80) | NOT NULL | Hasil normalisasi server. |
| archived_at | timestamptz | nullable | null = aktif; arsip non-destruktif. |
| created_at / updated_at | timestamptz | NOT NULL | |

```sql
CREATE UNIQUE INDEX user_custom_institution_active_name_uq
  ON user_custom_institution (user_id, normalized_name)
  WHERE archived_at IS NULL;

CREATE INDEX user_custom_institution_user_id_archived_at_normalized_name_idx
  ON user_custom_institution (user_id, archived_at, normalized_name);
```

- Partial unique index memberi paling banyak satu baris aktif per `(user_id, normalized_name)`, tanpa memblokir re-add setelah arsip.
- Re-add nama ternormalisasi sama mengaktifkan kembali baris arsip; tidak membuat baris aktif kedua.
- Tidak ada rename atau hard delete pada v1.

### 9.4 Amandemen `wallet`

| Kolom | Tipe | Constraint | Keterangan |
|---|---|---|---|
| official_institution_id | uuid | FK -> bank_institution, nullable, RESTRICT | Referensi katalog resmi. |
| custom_institution_id | uuid | FK -> user_custom_institution, nullable, RESTRICT | Referensi entri privat. |

```sql
ALTER TABLE wallet
  ADD CONSTRAINT wallet_institution_at_most_one
  CHECK (official_institution_id IS NULL OR custom_institution_id IS NULL);
```

- Manual = kedua kolom NULL. Tidak ada backfill; semua wallet existing tetap manual.
- Wallet hanya boleh merujuk satu institusi. Service juga menolak dua referensi dan memvalidasi kepemilikan/status saat write.
- `custom_institution_id` boleh merujuk entri milik anggota lain pada wallet SHARING; label tetap tampil, tetapi ID privat tidak dikirim ke non-pemilik.
- Tidak ada index "wallet by institution" pada v1 karena belum ada kebutuhan filter produk.

### 9.5 Seed katalog

- File resmi: `Daftar Alamat Kantor Pusat Bank Umum Dan Syariah - Juni 2026.xlsx`, worksheet `Daftar Bank Umum`.
- SHA-256: `4e87b30794245952ecb982bb03cf9ccdb294ed1b08498ab3715621a313d63b50`.
- 105 baris bank unik: 4 Bank Umum Persero, 67 Bank Umum Swasta Nasional (termasuk BUS yang dicantumkan OJK di grup ini), 27 Bank Pembangunan Daerah, 7 Kantor Cabang Bank Luar Negeri.
- Seed repeatable, match key `source_ref` (Sandi Bank), menonaktifkan baris yang hilang, dan tidak pernah hard-delete.
- Tidak ada runtime/external/automatic sync ke OJK.

### 9.6 Migrasi dan verifikasi

1. Additive: dua tabel, dua kolom nullable, FK, CHECK XOR, partial unique index, dan index pencarian.
2. Follow-up provenance `20261022120000_institution_source_period`: tambah `source_period` VARCHAR(7), backfill existing rows dengan `to_char(source_as_of, 'YYYY-MM')`, set NOT NULL, tambah CHECK format, lalu drop `source_as_of`. Migration 10/21 yang sudah applied tidak ditulis ulang; tidak ada hari publikasi yang dikarang.
3. Tanpa backfill wallet dan tanpa institusi default.
4. Seed dijalankan terpisah setelah migrasi (`bun run seed:institutions`).
5. Verifikasi: jumlah wallet tidak berubah; semua wallet existing kedua kolom NULL; CHECK dan partial index ada; seed kedua menghasilkan 0 insert/0 deactivate.

### 9.7 Acceptance tambahan untuk QA (rencana, bukan eksekusi)

- [ ] `bank_institution` dan `user_custom_institution` terpasang dengan constraint/index di �9.2-9.3.
- [ ] `wallet_institution_at_most_one` menolak dua referensi.
- [ ] Seed idempoten dan provenance (`source`, `source_url`, `source_period`, `source_ref`, `seed_version`) terisi.
- [ ] Daftar custom user A tidak pernah muncul untuk user B; label wallet SHARING tidak membocorkan ID privat.
