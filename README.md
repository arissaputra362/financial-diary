# Financial Diary

Aplikasi web untuk mencatat dan memahami keuangan keluarga. Pengguna dapat
mengelola transaksi, dompet, anggaran, target tabungan, serta aset emas pribadi
dan bersama. Laporan bulanan menyajikan ringkasan saldo dan rincian transaksi
yang dapat dicetak atau disimpan sebagai PDF.

Production: [financial-planner-nu-lake.vercel.app](https://financial-planner-nu-lake.vercel.app)

## Fitur

- Autentikasi email dan password dengan session JWT `httpOnly` yang terhubung
  ke session database dan dapat dicabut.
- Household keluarga, undangan anggota, persetujuan owner, serta role owner
  dan member.
- Transaksi pemasukan, pengeluaran, dan transfer antar dompet. Nominal
  mendukung hingga dua angka desimal dan disimpan sebagai PostgreSQL `NUMERIC`.
- Dompet personal/bersama, arsip dompet, serta pilihan institusi bank resmi dan
  institusi khusus pengguna.
- Anggaran bulanan personal dan keluarga.
- Target tabungan dengan progres dan insight dari AI advisor.
- Pemindaian struk transaksi serta certicard/nota emas menggunakan Gemini.
  Hasil pindai berupa draft untuk ditinjau sebelum disimpan. Foto kamera besar
  dikompres di browser sebelum diunggah.
- Tabungan emas batangan dan perhiasan, estimasi nilai, serta harga pasar yang
  diambil dari provider dan disimpan sebagai snapshot harian di database.
- Laporan bulanan dengan filter cakupan/dompet dan print-to-PDF.
- Trash dan pemulihan untuk data yang mendukung soft delete.
- PWA installable.

Rincian kondisi implementasi terkini ada di
[`docs/current-state.md`](./docs/current-state.md). Spesifikasi produk dan
riwayat keputusan ada di [`docs/`](./docs/).

## Teknologi

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- Prisma 7 dengan PostgreSQL; Neon atau PostgreSQL lokal
- Bun 1.4.2
- Gemini API untuk pemindaian gambar dan advisor (opsional)
- Vercel Blob untuk penyimpanan gambar struk (diperlukan untuk OCR struk)
- Vitest dan Playwright

## Menjalankan secara lokal

Prasyarat: Bun 1.4.2, Node.js yang kompatibel dengan Next.js, dan PostgreSQL
15+ lokal atau database Neon.

```bash
bun install
```

Salin `.env.example` menjadi `.env` atau `.env.local`, lalu isi setidaknya
`DATABASE_URL` dan `AUTH_SECRET`. Isi `GEMINI_API_KEY` dan
`BLOB_READ_WRITE_TOKEN` bila ingin memakai fitur AI/pemindaian. Variabel harga
emas dapat dibiarkan pada nilai default kecuali menggunakan provider lain.

```bash
bunx prisma generate
bunx prisma migrate deploy
bun run seed:institutions
bun run dev
```

Buka [http://localhost:3000](http://localhost:3000). Langkah rinci database
lokal ada di [`docs/dev-setup-local.md`](./docs/dev-setup-local.md).

## Perintah

```bash
bun run dev              # server development
bun run lint             # ESLint
bun run test             # unit test
bun run test:integration # integration test
bun run test:e2e         # Playwright
bun run build            # prisma generate + Next.js build
bun run start            # server production lokal
```

Playwright menggunakan port `3010`. Integration test memerlukan database dan
environment test terpisah. Build tidak menjalankan migrasi database.

## Struktur proyek

- `app/` — halaman, API Route Handlers, layout, dan manifest PWA.
- `components/` — komponen UI per fitur.
- `lib/server/` — service, repository, autentikasi, dan provider server.
- `lib/` — utilitas dan koneksi database.
- `prisma/` — schema, migrasi, dan seed.
- `types/` — DTO dan tipe lintas fitur.
- `docs/` — setup, kondisi implementasi, spesifikasi, desain, ADR, dan QA.
- `e2e/` — skenario browser Playwright.

## Deployment

Target deployment saat ini adalah Vercel dengan PostgreSQL (Neon didukung),
Gemini, dan Vercel Blob sebagai layanan opsional sesuai fitur yang digunakan.
Atur `DATABASE_URL`, `AUTH_SECRET`, dan kredensial provider melalui environment
deployment. Jalankan `prisma migrate deploy` melalui langkah operasional/CI
sebelum memakai schema baru; migrasi tidak dijalankan otomatis oleh build.

Panduan PWA/APK ada di [`docs/BUILD-APK-PWA.md`](./docs/BUILD-APK-PWA.md), dan
keputusan deployment di
[`docs/adr/ADR-007-free-tier-deployment.md`](./docs/adr/ADR-007-free-tier-deployment.md).

## Dokumentasi

- [`docs/current-state.md`](./docs/current-state.md) — peta fitur dan batas
  integrasi yang ada di kode saat ini.
- [`docs/PRD.md`](./docs/PRD.md) dan [`docs/spec/`](./docs/spec/) — kebutuhan
  produk; dokumen ini menjelaskan target dan dapat memuat item yang belum
  diimplementasikan.
- [`docs/adr/`](./docs/adr/) — keputusan arsitektur.
- [`docs/erd/`](./docs/erd/) — model data dan alur.
- [`docs/qa/`](./docs/qa/) — matriks, fixture, dan laporan QA historis.

## Keamanan

Jangan commit `.env`, API key, secret autentikasi, atau token Blob. Secret harus
tetap server-side dan tidak menggunakan prefix `NEXT_PUBLIC_`. Gunakan HTTPS di
production; jangan simpan password di browser.
