# Catatan Keuangan Keluarga

Aplikasi web mobile-first untuk membantu keluarga mencatat pemasukan,
pengeluaran, anggaran, dompet, target tabungan, dan aktivitas keuangan dalam
satu tempat. Aplikasi juga menyediakan OCR struk dan panel advisor berbasis AI
ketika konfigurasi provider-nya tersedia.

Production: [financial-planner-nu-lake.vercel.app](https://financial-planner-nu-lake.vercel.app)

## Fitur utama

- Autentikasi email dan password dengan bcrypt.
- Session JWT `httpOnly` yang dipasangkan dengan session database yang dapat
  direvoke.
- Akun keluarga, undangan anggota, approval, dan role owner/member.
- Pencatatan transaksi pemasukan dan pengeluaran.
- Dompet personal dan bersama.
- Anggaran personal dan bersama.
- Target tabungan dan advisor keuangan.
- Upload/OCR struk menggunakan Gemini dan Vercel Blob.
- Katalog institusi bank dengan seed data versioned.
- PWA installable dengan icon aplikasi dan manifest.
- Mode nyaman: email login dapat diingat di perangkat, tetapi password tidak
  pernah disimpan di browser.

## Teknologi

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Prisma 7 dengan driver adapter
- PostgreSQL lokal atau Neon PostgreSQL
- Bun 1.4.2
- Vitest dan Playwright
- Vercel Hobby sebagai target deployment

## Prasyarat

- Bun 1.4.2 atau versi kompatibel.
- PostgreSQL 15+ lokal, atau database Neon PostgreSQL.
- Node.js yang didukung oleh Next.js/Prisma untuk tooling yang dijalankan Bun.
- Git, bila mengambil source dari repository.

Untuk setup PostgreSQL lokal yang lebih rinci, lihat
[`docs/dev-setup-local.md`](./docs/dev-setup-local.md).

## Menjalankan secara lokal

### 1. Pasang dependency

```bash
bun install
```

### 2. Konfigurasi environment

Salin [`.env.example`](./.env.example) menjadi `.env` atau `.env.local`, lalu
isi nilai sebenarnya. Jangan commit file environment.

Variable wajib:

| Variable | Kegunaan |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL/Neon |
| `AUTH_SECRET` | Secret minimal 32 karakter untuk JWT session |

Variable fitur opsional:

| Variable | Kegunaan |
|---|---|
| `GEMINI_API_KEY` | OCR struk dan advisor |
| `GEMINI_MODEL` | Model Gemini utama |
| `GEMINI_MODEL_FALLBACKS` | Model fallback saat provider utama gagal |
| `BLOB_READ_WRITE_TOKEN` | Penyimpanan foto struk di Vercel Blob |

Generate `AUTH_SECRET` di PowerShell:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Jangan memakai prefix `NEXT_PUBLIC_` untuk secret server-side.

### 3. Siapkan database

Generate Prisma Client dan apply migration:

```bash
bunx prisma generate
bunx prisma migrate deploy
```

Untuk katalog bank resmi:

```bash
bun run seed:institutions
```

Build aplikasi tidak menjalankan migration dan tidak memerlukan koneksi
database. Migration dijalankan manual atau melalui CI/deployment job.

### 4. Jalankan development server

```bash
bun run dev
```

Buka [http://localhost:3000](http://localhost:3000).

## Perintah pengembangan

```bash
bun run dev              # development server
bun run lint             # ESLint
bun run test             # unit test Vitest
bun run test:integration # integration test
bun run test:e2e         # Playwright responsive smoke test
bun run build            # prisma generate + next build
bun run start            # jalankan hasil production build
```

Playwright memakai port `3010` agar tidak bertabrakan dengan service lain pada
port `3000`. E2E dapat memerlukan database dan environment test yang sesuai.

## Struktur direktori

- `app/` — route, halaman, API route, layout, dan manifest PWA.
- `components/` — komponen UI dan feature view.
- `lib/` — database, auth, service, repository, provider, dan utility.
- `prisma/` — schema serta migration database.
- `public/` — logo dan icon PWA.
- `e2e/` — test Playwright.
- `docs/` — PRD, spesifikasi, ADR, setup, QA, dan panduan deployment.

## Deployment ke Vercel

Arsitektur deployment yang dipakai:

```text
Vercel Hobby (Next.js)
        |
        +-- Neon PostgreSQL
        +-- Gemini API (opsional)
        +-- Vercel Blob (opsional)
```

Langkah umum:

1. Import repository ke Vercel.
2. Set framework ke Next.js dan package manager ke Bun bila diperlukan.
3. Tambahkan `DATABASE_URL`, `AUTH_SECRET`, dan variable provider yang
   diperlukan di Vercel Project Settings.
4. Deploy.
5. Jalankan `prisma migrate deploy` dari environment yang memiliki akses ke
   database sebelum fitur yang membutuhkan schema digunakan.
6. Verifikasi login, route API, upload struk, manifest, dan PWA install.

Perhatikan:

- Secret hanya disimpan di Vercel Environment Variables.
- Build production menjalankan `prisma generate && next build`.
- Jangan menambahkan `prisma migrate deploy` ke build command tanpa memastikan
  direct database connection dan strategi locking CI sudah benar.
- Neon free tier, Gemini, dan Blob memiliki kuota yang dapat berubah.

Detail keputusan deployment ada di
[`docs/adr/ADR-007-free-tier-deployment.md`](./docs/adr/ADR-007-free-tier-deployment.md).

## PWA dan APK

Aplikasi sudah menyediakan manifest di `/manifest.webmanifest` serta icon:

- `/icon-192.png`
- `/icon-512.png`
- `/logo.svg`

Panduan resmi untuk install PWA dan membuat APK yang membuka URL production ada
di [`docs/BUILD-APK-PWA.md`](./docs/BUILD-APK-PWA.md).

## Dokumentasi lanjutan

- [`AGENTS.md`](./AGENTS.md) — aturan kontribusi dan konteks repository.
- [`docs/PRD.md`](./docs/PRD.md) — product requirements.
- [`docs/dev-setup-local.md`](./docs/dev-setup-local.md) — setup PostgreSQL
  lokal.
- [`docs/adr/ADR-002-auth-jwt-session.md`](./docs/adr/ADR-002-auth-jwt-session.md)
  — desain session dan auth.
- [`docs/adr/ADR-007-free-tier-deployment.md`](./docs/adr/ADR-007-free-tier-deployment.md)
  — keputusan deployment.

## Keamanan penting

- Jangan menyimpan password di `localStorage`, cookie biasa, atau parameter URL.
- Fitur “ingat email” hanya menyimpan alamat email jika pengguna memilihnya.
- `AUTH_SECRET`, database URL, Gemini key, dan Blob token tidak boleh masuk ke
  source control atau log.
- Gunakan HTTPS untuk production dan APK.
- Setelah mengganti secret atau mencurigai kebocoran, lakukan rotasi secret dan
  revoke session sesuai prosedur operasional.
