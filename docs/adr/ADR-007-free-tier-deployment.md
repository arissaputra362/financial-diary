# ADR-007: Deployment Gratis — Vercel Hobby + Neon Free

**Status:** Accepted
**Tanggal:** 2026-09-30 · **Engineer:** Developer

## Konteks

MVP harus berjalan **gratis** (Vercel Hobby + Neon free tier + Gemini free tier) tanpa
dependensi berbayar. Vercel Hobby tidak menyediakan background worker, dan build tidak
boleh bergantung pada koneksi DB yang tersedia saat build. Secret harus tetap server-side.

## Keputusan

Deploy ke **Vercel Hobby** dengan **Neon free tier**; build **tanpa DB** (hanya
`prisma generate`; `migrate deploy` dijalankan manual/CI); route Prisma memakai **runtime
Node.js**; secret hanya env server-side; retensi data dikelola agar sesuai kuota free tier.

## Alasan & Alternatif

- Dipilih karena: memenuhi target zero-cost MVP; cocok dengan stack Next.js 16 + Neon.
- Alternatif A — **plan berbayar** (tidak dipilih): melanggar batasan "gratis dijalankan".
- Alternatif B — **background worker untuk OCR** (tidak dipilih): Vercel Hobby tidak
  menyediakannya; OCR dibuat synchronous-within-request (D-8).

## Trade-off

- Positif: nol biaya, deploy sederhana, cocok dengan arsitektur serverless.
- Negatif: kuota free tier terbatas (rate limit Gemini, storage Blob, koneksi Neon);
  cold start Neon; tanpa worker → OCR harus selesai dalam satu request.

## Detail Implementasi (kontrak)

- **Build tanpa DB:** `next build` hanya menjalankan `prisma generate`; **tidak** ada
  `migrate` saat build. `prisma migrate deploy` dijalankan **manual/CI** dengan direct URL.
- **Runtime Node.js** untuk route yang memakai Prisma (bukan edge).
- **Secrets server-side saja:** `DATABASE_URL`, `AUTH_SECRET`, `GEMINI_API_KEY`,
  `BLOB_READ_WRITE_TOKEN` — **tanpa** prefix `NEXT_PUBLIC_`.
- **Tanpa layanan berbayar.** Kuota free tier **tidak ditulis sebagai angka permanen**
  (dapat berubah); perlakukan sebagai batas lunak yang dipantau.
- **Retensi (kontrol pertumbuhan free tier):**
  - **Idempotency:** TTL 24 jam + **purge oportunistik** (`DELETE WHERE user_id = ? AND
    expires_at < now()`) saat insert.
  - **Session:** purge baris expired/revoked (index `idx(expires_at)`).
  - **Advisor insight:** prune-on-create, simpan **maks ~10 terbaru per household**,
    hapus yang expired > 30 hari.
- **OCR synchronous-within-request:** `PROCESSING` bersifat transient dalam request upload
  (bukan model worker-polling) — konsekuensi tidak adanya background worker di Hobby.
- **Orphan blob cleanup** (upload sukses tapi insert DB gagal) = **backlog**, tidak
  memblokir MVP.

## Referensi

- `docs/erd/erd-database-schema.md` §3.10, §3.11, §3.13, §4 (D-7, D-8), §5.7
- `docs/PRD.md` — Non-Functional Requirements
- `docs/architecture-decisions.md` — Next.js/runtime, A-24
