# ADR-001: Prisma 7.10 + `@prisma/adapter-neon` sebagai ORM dan Driver Database

**Status:** Accepted
**Tanggal:** 2026-09-30 · **Engineer:** Developer

## Konteks

MVP Financial Planner membutuhkan akses PostgreSQL di Neon (serverless) dengan
constraint relasional eksplisit, migration yang dapat direview, dan boundary repository
yang bertipe. Requirement menyediakan dua alternatif ORM: Prisma atau Drizzle. Paket
`prisma@7.10.0`, `@prisma/client@^7.10.0`, dan `@prisma/adapter-neon@^7.10.0` sudah
terpasang di `package.json`. ERD (`docs/erd/erd-database-schema.md`) menetapkan 13 tabel,
`timestamptz` UTC eksplisit, uang sebagai `Int` minor, dan beberapa constraint yang tidak
dapat diekspresikan di `schema.prisma` (partial index, CHECK).

## Keputusan

Gunakan **Prisma 7.10** dengan **`@prisma/adapter-neon`** (driver-adapter mode) sebagai
ORM dan driver tunggal ke Neon PostgreSQL; Drizzle ditolak.

## Alasan & Alternatif

- Dipilih karena: Prisma memberi migration terkelola, client TypeScript bertipe penuh,
  dan `relationMode` yang cocok untuk Neon; adapter Neon memakai driver serverless resmi
  sehingga cocok dengan pooled connection dan cold start Neon.
- Alternatif A — **Drizzle ORM** (tidak dipilih): lebih ringan, tetapi requirement
  memilih Prisma untuk constraint relasional eksplisit dan boundary repository bertipe;
  memigrasikan skema yang sudah dirancang untuk Prisma menambah risiko tanpa manfaat MVP.
- Alternatif B — **`pg`/`postgres.js` mentah** (tidak dipilih): kehilangan migration
  terkelola dan tipe generatif; lebih banyak kode boilerplate untuk 13 tabel.

## Trade-off

- Positif: satu sumber skema (`prisma/schema.prisma`), migration dapat direview, tipe
  end-to-end, adapter resmi Neon.
- Negatif: Prisma 7 mewajibkan driver-adapter mode (bukan engine biner lama), sehingga
  konfigurasi lebih eksplisit; interactive transaction mahal round-trip dan harus singkat.

## Detail Implementasi (kontrak)

- **Driver-adapter mode wajib di Prisma 7.** Client dibuat dengan `@prisma/adapter-neon`
  dan connection string pooled; tidak memakai engine biner legacy.
- **Generator `prisma-client`** (generator baru Prisma 7) untuk output client bertipe.
- **`prisma.config.ts`** di root repo sebagai konfigurasi Prisma 7 (lokasi schema,
  datasource, dan hook migration).
- **Koneksi:** `DATABASE_URL` = pooled connection untuk runtime; **direct URL** (non-pooled)
  dipakai khusus `prisma migrate`/`migrate deploy` karena migration butuh koneksi langsung.
- **Interactive transaction** dipakai hanya untuk operasi multi-tulis yang benar-benar
  atomik (bootstrap owner, redeem invite, transfer 2 kaki, idempotency claim); dijaga
  **singkat dan single-purpose** karena round-trip mahal di serverless.
- **Partial index & CHECK via raw SQL appendix:** constraint yang tidak dapat
  diekspresikan di `schema.prisma` (partial unique index membership, CHECK
  `amount_minor > 0`, CHECK `saved_amount_minor >= 0`, CHECK transfer group, partial
  unique OCR PROCESSING) ditambahkan sebagai raw SQL di file migration.
- **`relationMode`:** `foreignKeys` (FK nyata di DB); `@db.Timestamptz` eksplisit untuk
  semua kolom waktu; `Json` → `jsonb` (tanpa filter di dalam JSON, tanpa GIN index).
- **Uang:** `Int` minor units. **Skala IDR: 1 minor unit = 1 rupiah (scale 0)** — tidak
  ada pembagian 100; `integer` Postgres aman sampai ~2,1 miliar rupiah per baris.
  Dilarang `Decimal`/`Float` untuk uang.
- **PK:** UUID (`uuid(7)` bila didukung Prisma 7.10; fallback generate di aplikasi).
- **`onDelete`/`onUpdate`:** RESTRICT di semua FK (tidak ada cascade di dunia soft-delete).

## Referensi

- `docs/erd/erd-database-schema.md` §1, §3, §4 (D-6), §5.6
- `docs/architecture-decisions.md` — Decision summary (ORM), A-24
