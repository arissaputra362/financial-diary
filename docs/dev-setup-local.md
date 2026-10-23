# Local Development Setup — Financial Planner MVP

**Tanggal:** 2026-10-06  
**Status:** Active  
**Tujuan:** Panduan setup PostgreSQL lokal untuk testing (tanpa Neon cloud)

---

## Overview

Untuk testing lokal dengan PostgreSQL lokal (bukan Neon cloud), ikuti panduan ini. Setup ini berguna untuk:
- QA testing cepat (tidak perlu deploy ke Vercel)
- Developer testing fitur baru
- Debugging masalah database

**Catatan:** Prisma adapter Neon (`@prisma/adapter-neon`) hanya bisa konek ke Neon cloud. Untuk PostgreSQL lokal, pakai `@prisma/adapter-pg` (Prisma 7 mewajibkan driver adapter).

---

## Prerequisites

1. **PostgreSQL 15+ installed**
   - Windows: Download dari https://www.postgresql.org/download/windows/
   - macOS: `brew install postgresql@15`
   - Linux: `sudo apt-get install postgresql-15`

2. **Bun installed** (sudah ada di project)

3. **Project dependencies installed**
   ```bash
   bun install
   ```

---

## Step 1: Create Local Database

```bash
# Create database untuk testing
createdb -U postgres financial_planner_test

# Atau via psql:
psql -U postgres
CREATE DATABASE financial_planner_test;
\q
```

**Verifikasi:**
```bash
psql -U postgres -l | grep financial_planner_test
```

---

## Step 2: Configure Environment

Buat file `.env.local`:

```env
# Database lokal (bukan Neon)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/financial_planner_test

# Auth
AUTH_SECRET=<generate: [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))>

# Gemini (optional, untuk testing OCR)
GEMINI_API_KEY=<dari Google AI Studio>
GEMINI_MODEL=gemini-3.5-flash-lite

# Vercel Blob (optional, untuk testing upload struk)
BLOB_READ_WRITE_TOKEN=<dari Vercel Dashboard>
```

**Generate AUTH_SECRET (PowerShell):**
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

**Catatan:** Jangan commit `.env.local` ke git (sudah di-gitignore).

---

## Step 3: Database Client untuk Testing

Aplikasi (`bun dev`) memakai `lib/db.ts`, yang memilih adapter dari `DATABASE_URL`:

- Host `*.neon.tech` → `@prisma/adapter-neon` (Neon cloud).
- Selain itu (PostgreSQL lokal/self-hosted) → `@prisma/adapter-pg`.

Artinya `lib/db.ts` sudah otomatis memakai adapter yang tepat untuk DB lokal, tanpa edit file. Integration test memakai file terpisah `lib/server/testing/integration-db.ts` (selalu `@prisma/adapter-pg`) lewat `bun run test:integration`.

---

## Step 4: Run Migration

```bash
# Generate Prisma client
bunx prisma generate

# Run migration (apply schema ke database lokal)
bunx prisma migrate deploy
```

**Verifikasi:**
```bash
psql -U postgres -d financial_planner_test -c "\dt"
```

Harus melihat tabel: user, household, membership, transaction, dll.

---

## Step 5: Seed Data (Optional)

Untuk testing, bisa seed data awal:

```bash
# Jalankan seed script (jika ada)
bun prisma/seed.ts

# Atau manual insert via psql
psql -U postgres -d financial_planner_test
```

### Katalog bank resmi (wajib untuk picker/E2E T-011)

Seed katalog adalah langkah operasional terkontrol, bukan route aplikasi dan
bukan sinkronisasi otomatis. Jalankan setelah migrasi:

```bash
bun run seed:institutions
# atau: bun prisma/seed-bank-institutions.ts
```

- Snapshot: OJK "Daftar Alamat Kantor Pusat Bank Umum Dan Syariah", Juni 2026
  (SHA-256 `4e87b30794245952ecb982bb03cf9ccdb294ed1b08498ab3715621a313d63b50`),
  105 baris bank unik.
- Versi: `ojk-office-list-2026-06-v1`; `source_period` = `2026-06` karena file
  hanya menyebut bulan (tanpa hari yang dikarang).
- Repeatable: run kedua menghasilkan `inserted=0, deactivated=0, unchanged=105`.
- Untuk update katalog di masa depan: unduh file resmi terbaru, parse dengan
  `bun prisma/scripts/parse-ojk-workbook.ts <extracted-xlsx-dir>`, review diff
  data, lalu jalankan seed. Baris yang hilang dinonaktifkan, tidak dihapus.
- Tidak ada cron, job refresh, tombol sync, atau admin UI katalog.

**Contoh seed data:**
```sql
-- Create user
INSERT INTO "user" (id, email, display_name, password_hash)
VALUES (
  gen_random_uuid(),
  'test@example.com',
  'Test User',
  '$2a$10$...' -- bcrypt hash dari 'password123'
);

-- Create household
INSERT INTO household (id, name, owner_user_id)
VALUES (
  gen_random_uuid(),
  'Test Household',
  (SELECT id FROM "user" WHERE email = 'test@example.com')
);
```

---

## Step 6: Start Development Server

```bash
bun dev
```

**Akses:**
- App: http://localhost:3000
- Database: psql -U postgres -d financial_planner_test

---

## Testing Scenarios

### Scenario 1: Manual Transaction

1. Login dengan user test
2. Klik "Tambah transaksi"
3. Isi form: type=MONEY_OUT, amount=50000, category=food
4. Klik "Simpan"
5. Verifikasi: transaksi muncul di daftar

**Check database:**
```sql
SELECT * FROM transaction WHERE household_id = '...';
```

### Scenario 2: Transfer

1. Login dengan user test
2. Klik "Tambah transaksi"
3. Pilih type=TRANSFER, amount=300000
4. Klik "Simpan"
5. Verifikasi: 2 transaksi tercipta (MONEY_OUT + MONEY_IN) dengan transfer_group_id sama

**Check database:**
```sql
SELECT type, amount_minor, transfer_group_id 
FROM transaction 
WHERE transfer_group_id IS NOT NULL;
```

### Scenario 3: OCR Upload

1. Login dengan user test
2. Klik "Scan struk"
3. Upload foto struk
4. Verifikasi: draft OCR muncul

**Check database:**
```sql
SELECT * FROM receipt ORDER BY created_at DESC LIMIT 1;
SELECT * FROM ocr_job WHERE receipt_id = '...';
```

---

## Troubleshooting

### Error: "connection refused"

**Penyebab:** PostgreSQL tidak running

**Solusi:**
```bash
# Windows
net start postgresql-x64-15

# macOS
brew services start postgresql@15

# Linux
sudo systemctl start postgresql
```

### Error: "database does not exist"

**Penyebab:** Database belum dibuat

**Solusi:**
```bash
createdb -U postgres financial_planner_test
```

### Error: "relation does not exist"

**Penyebab:** Migration belum dijalankan

**Solusi:**
```bash
bunx prisma migrate deploy
```

### Error: aplikasi terhubung ke database yang salah

**Penyebab:** `lib/db.ts` memilih adapter dari host `DATABASE_URL`: `*.neon.tech` → adapter Neon; selain itu → adapter `pg` (lokal/self-hosted). Host yang keliru membuat koneksi menuju DB yang tidak diinginkan.

**Solusi:** Periksa `DATABASE_URL` di `.env.local`. PostgreSQL lokal memakai host `localhost`/IP lokal; Neon memakai host `ep-xxx.region.aws.neon.tech`.

### Error: "migration failed"

**Penyebab:** Schema tidak kompatibel dengan database existing

**Solusi:**
```bash
# Reset database (HAPUS SEMUA DATA)
dropdb -U postgres financial_planner_test
createdb -U postgres financial_planner_test
bunx prisma migrate deploy
```

---

## Comparison: Lokal vs Neon

| Aspek | PostgreSQL Lokal | Neon Cloud |
|-------|------------------|------------|
| **Speed** | Cepat (local) | Lambat (network) |
| **Data Persistence** | Local only | Cloud persistent |
| **Setup** | Simple | Need account |
| **Cost** | Free | Free tier available |
| **Use Case** | Development, QA | Production, staging |
| **Adapter** | @prisma/adapter-pg | @prisma/adapter-neon |

---

## Best Practices

1. **Jangan pakai database lokal untuk production**
   - Database lokal hanya untuk development dan testing
   - Production harus pakai Neon cloud

2. **Reset database secara berkala**
   - Untuk testing, reset database agar data bersih
   - `dropdb` + `createdb` + `bunx prisma migrate deploy`

3. **Gunakan seed data yang realistis**
   - Test dengan data yang mirip production
   - Include edge cases (boundary values, unicode, etc.)

4. **Test di kedua environment**
   - Development: PostgreSQL lokal
   - Staging/Production: Neon cloud
   - Pastikan behavior konsisten

5. **Backup database lokal sebelum reset**
   - `pg_dump -U postgres financial_planner_test > backup.sql`
   - Restore: `psql -U postgres -d financial_planner_test < backup.sql`

---

## Integration dengan QA

QA engineer bisa pakai setup ini untuk testing:

1. **Setup database lokal** (Step 1-4)
2. **Seed data QA** (sesuai `docs/qa/fixtures-seed-plan.md`)
3. **Run test scenarios** (sesuai `agent-comms/prompts/qa-t006-retroactive.md`)
4. **Report bugs** (sesuai format di prompt)

**Keuntungan:**
- Testing cepat (tidak perlu deploy)
- Data bisa di-reset dengan mudah
- Bisa test edge cases tanpa affect production

---

## Rollback

Untuk rollback ke Neon cloud (production):

1. Update `.env.local`:
   ```env
   DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
   ```

2. Restart dev server:
   ```bash
   bun dev
   ```

3. `lib/db.ts` otomatis memilih adapter Neon karena host `DATABASE_URL` adalah `*.neon.tech`

**Catatan:** Integration test selalu memakai `lib/server/testing/integration-db.ts` (`@prisma/adapter-pg`), terlepas dari nilai `DATABASE_URL`.

---

## Referensi

- **QA Guide:** `agent-comms/prompts/qa-t006-retroactive.md`
- **Fixtures Seed Plan:** `docs/qa/fixtures-seed-plan.md`
- **ERD:** `docs/erd/erd-database-schema.md`
- **Migration:** `prisma/migrations/`
- **Prisma Schema:** `prisma/schema.prisma`

---

**Dibuat:** 2026-10-06 (sebagai follow-up dari QA T-006 environment gap)  
**Owner:** Developer  
**Last Updated:** 2026-10-06
