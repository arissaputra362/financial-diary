# ADR-006: Pola Layer Service → Repository → Model

**Status:** Accepted
**Tanggal:** 2026-09-30 · **Engineer:** Developer

## Konteks

Aplikasi multi-tenant: setiap record ledger membawa `household_id`, dan isolasi tenant
harus di-enforce di kode, bukan hanya di ERD. ERD menetapkan isolasi di layer repository
(injeksi `householdId` + extended unique where), bukan RLS (D-9). Dibutuhkan pemisahan
tanggung jawab yang jelas antara HTTP, business logic, akses data, dan skema.

## Keputusan

Gunakan pola **Service → Repository → Model** dengan struktur
`lib/server/services/`, `lib/server/repositories/`, `lib/server/errors.ts`,
`prisma/schema.prisma`, dan `types/` (DTO camelCase). Repository **wajib** menerima
`householdId` scope; Prisma client extension menginjeksi scope; single-record ops memakai
extended-unique where.

## Alasan & Alternatif

- Dipilih karena: memisahkan business rules dari akses data, memusatkan enforcement
  isolasi tenant di satu layer, dan menjaga route handler tipis.
- Alternatif A — **query DB langsung di route handler** (tidak dipilih): menyebar logika
  isolasi dan business rules; rawan kebocoran lintas household.
- Alternatif B — **RLS (Row-Level Security) Postgres** (tidak dipilih): overkill untuk
  MVP; menambah kompleksitas operasional tanpa manfaat proporsional (D-9).

## Trade-off

- Positif: isolasi tenant terpusat, business logic teruji terpisah, route handler tipis.
- Negatif: lebih banyak file/indirection; disiplin layer wajib dijaga (repository tidak
  boleh mengekspos method unscoped).

## Aturan Layer (siapa boleh apa)

| Layer | Boleh | Dilarang |
|---|---|---|
| Route Handler (`app/api`) | auth check, validasi Zod, panggil service, mapping error → HTTP | query DB langsung, business logic |
| Service (`lib/server/services/`) | business rules, soft delete semantics, kalkulasi, idempotency, audit event | import Prisma client |
| Repository (`lib/server/repositories/`) | akses Prisma, **WAJIB terima `householdId` scope**, default filter `deleted_at IS NULL` | ekspos method unscoped ke route handler |
| Model (`prisma/schema.prisma`) | schema, constraint, index, relasi | logika apa pun |

## Detail Implementasi (kontrak)

- **Struktur:** `lib/server/services/`, `lib/server/repositories/`, `lib/server/errors.ts`,
  `prisma/schema.prisma`, `types/` (DTO camelCase).
- **Isolasi tenant:** repository **wajib** menerima `householdId` scope; **Prisma client
  extension** menginjeksi scope otomatis; **extended-unique where** untuk single-record
  ops (mis. `where: { id, household_id }`) sehingga record household lain → 404 tanpa
  membocorkan keberadaan.
- **DTO camelCase:** API JSON memakai camelCase meski DB snake_case; field uang memakai
  suffix `*Minor` (integer); tanggal `YYYY-MM-DD`; timestamp ISO 8601 UTC; nullable
  dikembalikan `null` (bukan dihilangkan).
- **Error terpusat:** `lib/server/errors.ts` mendefinisikan error bertipe dan mapping ke
  HTTP (`{ error: { code, message, fieldErrors } }`).
- **Tabel route kanonik (A-31):** halaman = `/login`, `/signup`, `/waiting-for-approval`,
  `/home`, `/budget`, `/transactions` (label nav "Activity"), `/family`, `/profile`;
  drawer = advisor di `/budget`; **`/savings` dan `/add` DIHAPUS** (Add adalah sheet/aksi,
  bukan halaman; goals ada di `/budget`); trash = `/transactions?view=trash`. Tabel ini
  yang berlaku (menggantikan A-18/A-25 yang saling bertentangan).
- **Idempotency:** claim key dieksekusi di dalam transaksi service (single-transaction
  idempotency); scope per user (A-22/D-2).

## Referensi

- `docs/erd/flowcharts.md` §2 (Request Lifecycle + aturan layer)
- `docs/erd/erd-database-schema.md` §4 (D-9), §3.13
- `docs/architecture-decisions.md` — Frontend handoff contract, A-22, A-31
