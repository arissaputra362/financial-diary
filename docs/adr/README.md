# Architecture Decision Records (ADR)

Indeks keputusan arsitektur MVP Financial Planner. Setiap ADR mengikuti
`docs/templates/adr-template.md` (Konteks / Keputusan / Alasan & Alternatif / Trade-off).
Semua keputusan bersifat **FINAL** dan menutup konflik arsitektur F-1..F-4 (WO-002).

| ADR | Judul | Ringkasan |
|---|---|---|
| [ADR-001](ADR-001-prisma-neon-adapter.md) | Prisma 7.10 + `@prisma/adapter-neon` | ORM + driver tunggal ke Neon; driver-adapter mode, `prisma.config.ts`, pooled runtime + direct URL migrate, partial index/CHECK via raw SQL; IDR minor = 1 rupiah (scale 0). |
| [ADR-002](ADR-002-auth-jwt-session.md) | Auth custom JWT `jose` + session DB | Claims `{sub, sid, token_version, iat, exp}` tanpa `role`; sliding session (JWT 15 menit, reissue cookie, sesi absolut 7 hari, tanpa route refresh); tanpa `session.household_id`; login selalu session baru; cookie HttpOnly+Secure+SameSite=Lax; verifikasi di `proxy.ts`, revalidasi penuh di route handler; mutasi via Route Handlers. |
| [ADR-003](ADR-003-gemini-structured-output.md) | Gemini `gemini-2.5-flash` fail-closed | Model via env `GEMINI_MODEL`; structured output JSON + re-validasi zod; `thinkingConfig` tidak dikirim untuk OCR (`gemini-3.5-flash-lite` menolak `thinkingBudget: 0` dengan HTTP 400); timeout 8–10s; rantai model berbatas via `GEMINI_MODEL_FALLBACKS` (fallback maks satu tahap ke model berikutnya hanya pada HTTP 429/404/503, rantai maks 3 model; tanpa fallback pada 400/timeout); timezone aplikasi `Asia/Jakarta` untuk period math. |
| [ADR-004](ADR-004-invite-lifecycle.md) | Invite lifecycle | Single-use, hash-only (sha256), 7 hari, redeem conditional update anti-race + rowcount; `INVALID_INVITE` = 400 body identik; rejoin DECLINED/REVOKED ditunda. |
| [ADR-005](ADR-005-soft-delete.md) | Soft delete | `deleted_at` + `deleted_by_user_id` pada transaction & savings_goal; default scope `deleted_at IS NULL`; restore idempotent (`ALREADY_ACTIVE`, `ALREADY_DELETED`); tanpa hard delete; undo = client-triggered restore. |
| [ADR-006](ADR-006-service-repository-model.md) | Service → Repository → Model | `lib/server/services/`, `lib/server/repositories/`, `lib/server/errors.ts`, `prisma/schema.prisma`, `types/` (DTO camelCase); repository wajib terima `householdId` scope; Prisma client extension + extended-unique where; tabel aturan layer; tabel route kanonik A-31. |
| [ADR-007](ADR-007-free-tier-deployment.md) | Deployment gratis Vercel + Neon | Vercel Hobby + Neon free; build tanpa DB (`prisma generate` saja, `migrate deploy` manual/CI); runtime Node.js untuk route Prisma; secret server-side; retensi idempotency 24 jam + purge, session purge, insight maks ~10/household. |
| [ADR-008](ADR-008-receipt-storage-blob.md) | Storage struk Vercel Blob | ≤4.194.304 byte (4MB) — A-02; mime jpeg/png/webp; dedup `UNIQUE(household_id, content_sha256)`; upload server-proxied; orphan-blob cleanup = backlog. |

## Sumber

- Kontrak: `docs/architecture-decisions.md` (Amendments A-01..A-35)
- ERD: `docs/erd/erd-database-schema.md` (keputusan D-1..D-9)
- Flow: `docs/erd/flowcharts.md`
- Spec: `docs/spec/feat-*.md`
