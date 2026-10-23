# Architecture Decisions and Shared Contracts

**Feature:** FP-MVP
**Task:** T-001
**Status:** Proposed for PM, frontend, and backend approval
**Updated:** 2026-09-27

This document is the implementation contract for the MVP. It records decisions made from the requirements and design documents. It contains no credentials, tokens, receipt images, or personal financial data.

## Decision summary

| Area | Decision | Rationale |
| --- | --- | --- |
| ORM | Prisma with PostgreSQL migrations and generated TypeScript client | The MVP needs explicit relational constraints, migrations, and a typed repository boundary for Neon PostgreSQL. Prisma is the selected option from the requirement's Prisma/Drizzle alternatives. |
| Auth/session | Custom server-side auth using `jose`-signed JWTs in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; JWT contains `sub`, `sid`, `role`, `iat`, and `exp` and expires after 15 minutes | Meets the JWT requirement while keeping secrets server-side. `sid` maps to a revocable database session, so logout, approval revocation, and incident response do not depend on waiting for JWT expiry. |
| Session revalidation | Protected handlers verify the signature and expiry, then load the session and membership from the database on every request | Prevents pending, declined, or revoked members from retaining household access through an otherwise valid token. |
| Next.js/runtime | Next.js `16.3.6`, App Router, TypeScript, server-side Route Handlers/server actions as appropriate, deployed to Vercel with Neon PostgreSQL | Matches the generated workspace and the stated zero-cost MVP target. Deployment-specific environment values remain external configuration. |
| Gemini model | `gemini-2.5-flash`, selected through the server-only `GEMINI_MODEL` environment variable with this value as the documented default | Flash is suitable for low-latency receipt extraction and short advisor responses. The integration must fail closed if the configured model is unavailable; it must not silently substitute a fake response. |
| Gemini output | `application/json` structured output constrained by the schemas below; validate again at the route boundary | Model output is untrusted input. Invalid or incomplete output becomes a typed OCR/advisor error, never an automatic save or fabricated advice. |
| Advisor persistence | Persist the latest successful household insight as a cache record, not chat history or raw transaction snapshots. Return fresh data when available and the unexpired cached insight on rate limit/unavailability. | Supports the designed offline/cache state without expanding MVP into a conversation store. Each record includes source period, model, generated time, expiry, and limitation text. |
| Invite lifecycle | Owner-created invite is a single-use, random 128-bit code stored only as a hash, expires after 7 days, and is revocable. Redemption creates a pending membership; it never grants data access. | Makes invite use auditable and limits leaked-code exposure. An owner may issue a replacement invite; prior unused invites can be revoked. |
| Approval audit | Membership state is `PENDING`, `APPROVED`, `DECLINED`, or `REVOKED`; every request/approve/decline/revoke action appends an immutable membership event with actor, timestamp, previous state, next state, and optional reason. | Current membership controls access; the event log preserves who changed access and when. |

## Approval and remaining blocker

These are concrete technical decisions, but T-001 is **not approved** in this repository. The required `pm-approval` (single gate; roster agent saat ini: PM, Brainstorm, Developer, QA) is not recorded. The pre-implementation gate therefore remains closed and T-002/T-003 remain blocked. The external availability of `gemini-2.5-flash` for the eventual Google project must also be checked before implementation; no API key is required for this documentation task.

## Domain contract

All protected records carry `household_id`. Repositories receive the authenticated household scope and must not expose an unscoped read/write method to route handlers. IDs are opaque UUIDs. Timestamps are UTC.

### User

`id`, `email` (normalized, unique), `password_hash`, `display_name`, `created_at`, `updated_at`.

### Household

`id`, `name`, `owner_user_id`, `created_at`, `updated_at`.

The owner is also an approved membership. A user may belong to one household in the MVP.

### Membership

`id`, `household_id`, `user_id`, `role` (`OWNER` or `MEMBER`), `status`, `invited_by_user_id`, `invite_id`, `requested_at`, `approved_at`, `approved_by_user_id`, `declined_at`, `declined_by_user_id`, `revoked_at`, `revoked_by_user_id`, `decision_reason`, `created_at`, `updated_at`.

Only `APPROVED` memberships may read or mutate household ledger data. The owner cannot be declined or revoked through the MVP member flow.

### Invite

`id`, `household_id`, `code_hash`, `created_by_user_id`, `expires_at`, `redeemed_at`, `redeemed_by_user_id`, `revoked_at`, `created_at`.

Only the hash is persisted. Codes are never returned after creation except in the one-time create response.

### Membership event

`id`, `membership_id`, `household_id`, `actor_user_id`, `event_type` (`REQUESTED`, `APPROVED`, `DECLINED`, `REVOKED`), `previous_status`, `next_status`, `reason`, `created_at`.

### Transaction

`id`, `household_id`, `created_by_user_id`, `type` (`MONEY_IN`, `MONEY_OUT`, `TRANSFER`), `amount_minor` (positive integer), `currency_code` (`IDR` for MVP), `category`, `merchant`, `note`, `occurred_at`, `source` (`MANUAL` or `OCR`), `receipt_id`, `transfer_group_id` (nullable), `deleted_at`, `deleted_by_user_id`, `created_at`, `updated_at`.

`amount_minor` avoids floating-point money errors. Active queries require `deleted_at IS NULL`; restore clears `deleted_at` and `deleted_by_user_id`. Permanent deletion is out of scope for MVP. A transfer is represented by a paired money-out/money-in record sharing a server-created `transfer_group_id`; it has no external bank-account semantics.

### Savings goal

`id`, `household_id`, `created_by_user_id`, `name`, `target_amount_minor`, `saved_amount_minor`, `currency_code` (`IDR` for MVP), `deadline`, `deleted_at`, `deleted_by_user_id`, `created_at`, `updated_at`.

`target_amount_minor` must be greater than zero. Progress is calculated and capped for display at 100%; the stored saved amount is not silently changed.

### Receipt and OCR job

Receipt metadata is private and server-owned: `id`, `household_id`, `uploaded_by_user_id`, `content_sha256`, `mime_type`, `size_bytes`, `storage_key`, `created_at`. The image bytes are not part of API responses.

An OCR job has `id`, `receipt_id`, `status` (`PROCESSING`, `SUCCEEDED`, `FAILED`), `model`, `result_json`, `confidence`, `error_code`, `created_at`, `completed_at`. OCR results are drafts and do not create a transaction.

### Advisor insight

`id`, `household_id`, `requested_by_user_id`, `source_period_start`, `source_period_end`, `model`, `headline`, `summary`, `actions_json`, `limitations`, `generated_at`, `expires_at`.

Only the latest unexpired successful insight is used as a cache fallback. Raw prompts, raw model text, and transaction-level snapshots are not persisted in the MVP.

### Session

`id`, `user_id`, `household_id`, `token_version`, `expires_at`, `revoked_at`, `created_at`, `last_seen_at`.

The JWT `sid` must resolve to an active session whose expiry has not passed. Membership status is checked separately on every protected request.

## Frontend handoff contract

API JSON uses camelCase DTO fields even when the database uses snake_case. Monetary DTO fields keep the `*Minor` suffix and are integers; dates are `YYYY-MM-DD`, timestamps are ISO 8601 UTC strings, and nullable values are returned as `null` rather than omitted. Collection responses use `{ "items": [], "nextCursor": null }`; `nextCursor` is `null` when there is no next page. Clients must not infer access or record ownership from display labels.

### Shared DTOs and access states

`UserDTO` is `{ id, email, displayName }`. `HouseholdSummaryDTO` is `{ id, name, memberCount }`. `MembershipDTO` is `{ id, user: UserDTO, role, status, requestedAt, approvedAt, declinedAt, revokedAt, decisionReason }`; actor and audit fields are included only in owner member-management responses. `AuthStateDTO` is `{ user, household, role, membershipStatus }`, where `household` and `role` are `null` for a public account with no household. Signup and login return `AuthStateDTO` plus `nextAction` (`CREATE_HOUSEHOLD`, `WAIT_FOR_APPROVAL`, `OPEN_HOME`, or `SIGN_IN_AGAIN`).

`PENDING`, `DECLINED`, and `REVOKED` are authenticated access states, not ledger data states. They may call `/api/auth/me`, `/api/auth/logout`, and the relevant status refresh flow, but protected ledger routes return `403` with `ACCESS_PENDING`, `ACCESS_DECLINED`, or `ACCESS_REVOKED`. A `401` means the client must sign in again; a successful approval does not grant access until the next protected request revalidates membership.

### Dashboard and activity DTOs

`TransactionDTO` is `{ id, type, amountMinor, currencyCode, category, merchant, note, occurredAt, source, receiptId, transferGroupId, createdByUser, deletedAt, createdAt, updatedAt }`. Active transaction responses have `deletedAt: null`; trash responses contain only deleted records. `GoalDTO` is `{ id, name, targetAmountMinor, savedAmountMinor, currencyCode, deadline, progressPercent, createdByUser, deletedAt, createdAt, updatedAt }`, where `progressPercent` is capped at `100` for display.

`DashboardDTO` is `{ balanceMinor, currencyCode, monthlyBudget: { periodStart, periodEnd, budgetMinor, spentMinor, remainingMinor }, spending: { periodStart, periodEnd, totalOutMinor, byDay: [{ date, amountMinor }] }, goals: GoalDTO[], recentActivity: TransactionDTO[] }`. The dashboard endpoint returns the server's current period; clients do not recalculate the balance or budget from the recent-activity subset. Activity filters are local query parameters: `type=MONEY_IN|MONEY_OUT`, `source=MANUAL|OCR`, `from`, `to`, `cursor`, and `limit`; `Scanned receipts` maps to `source=OCR`, while `Everything` sends no type/source filter. Chart period tabs map to server dates: `7D` is the last 7 calendar days, `30D` the last 30, and `90D` the last 90, each ending on the server's current date.

### Auth, trash, and idempotency routes

The frontend route names are `/login`, `/signup`, `/waiting-for-approval`, `/home`, `/budget`, `/transactions` (nav label "Activity"), `/family`, and `/profile`; the advisor is a drawer/sheet inside `/budget`, not a separate page or mobile navigation item; Add is an action/sheet, not a page; `/savings` does not exist (goals live on `/budget`). Trash is `/transactions?view=trash`. This table is authoritative — see amendment A-31, which supersedes the earlier `/activity` and `/savings` strings. Mobile uses only the bottom navigation (`Home`, `Budget`, `Add`, `Activity`, `Family`); desktop uses the same destinations in a top navigation plus an "Add a transaction" pill action.

`GET /api/transactions/trash` and `GET /api/goals/trash` return the collection envelope for soft-deleted records. `POST /api/goals/{id}/trash` and `POST /api/goals/{id}/restore` mirror the transaction trash/restore semantics and return `ALREADY_ACTIVE` when restore is requested for an active goal. `POST` mutations accept an `Idempotency-Key`; a repeated key with the same household and payload returns the original result, while a reused key with a different payload returns `409 IDEMPOTENCY_CONFLICT`. Permanent deletion has no MVP route or UI, including for owners.

### OCR and advisor UI states

`POST /api/ocr/receipts` returns `{ job: { id, status, receiptId, createdAt }, draft: OcrDraftDTO|null }`; `GET /api/ocr/jobs/{id}` returns the same job with `status` `PROCESSING|SUCCEEDED|FAILED`. A succeeded draft is editable client data only. The client must send the edited values in a separate `POST /api/transactions` with `source=OCR` and `receiptId`; OCR endpoints never persist a transaction. Duplicate content returns the existing household job with `409 DUPLICATE_RECEIPT` unless the client supplies the same idempotency key.

`POST /api/advisor/insights` accepts `{ period: { start, end } }` and returns `{ insight: AdvisorInsightDTO, delivery: FRESH|CACHE }` on success. `AdvisorInsightDTO` is `{ headline, summary, actions, limitations, sourcePeriod: { start, end }, model, generatedAt, expiresAt }`. When no unexpired cache exists, rate limit, timeout, unavailable model, and invalid model output return typed `429 ADVISOR_RATE_LIMITED`, `503 ADVISOR_UNAVAILABLE`, or `422 ADVISOR_INVALID_OUTPUT`; when a cache exists, the route returns it with `delivery=CACHE` and the UI must show that it is cached. There is no chat-history contract in the MVP.

### Responsive handoff

T-002 owns shared tokens and focus/loading/error boundaries. T-005 owns the dashboard response-to-card mapping and local activity filters. T-006 owns the manual form, OCR review-before-save boundary, and transaction trash/undo states. T-007 owns goal progress/trash recovery and advisor `FRESH`, `CACHE`, `PROCESSING`, `RATE_LIMITED`, `UNAVAILABLE`, and `INVALID_OUTPUT` states. All slices must support `<768px` single-column layout, `768-1023px` two-column layout, and `>=1024px` desktop layout, with no horizontal overflow at 390px and a minimum 48px touch target.

## API contract

All JSON errors use:

```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Plain-language safe message",
    "fieldErrors": {}
  }
}
```

`fieldErrors` is optional. Error messages never include secrets, raw receipt bytes, model prompts, or cross-household record existence.

### Auth and approval

| Method | Route | Auth | Contract |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | Public | Create the first household owner, or redeem an invite into `PENDING`; return a safe user/access state, never a household ledger. |
| POST | `/api/auth/login` | Public | Set the session cookie; return `APPROVED`, `PENDING`, or `DECLINED` state. |
| POST | `/api/auth/logout` | Authenticated | Revoke the database session and clear the cookie. |
| GET | `/api/auth/me` | Authenticated | Return user, household summary, role, and membership status only. |
| GET | `/api/family/members` | Approved owner/member | Return members in the caller's household; pending requests are owner-visible. |
| POST | `/api/family/invites` | Owner | Create one invite and return the one-time plaintext code. |
| POST | `/api/family/members/{membershipId}/approve` | Owner | Transition `PENDING -> APPROVED`, append event, return membership. |
| POST | `/api/family/members/{membershipId}/decline` | Owner | Transition `PENDING -> DECLINED`, append event, return membership. |
| POST | `/api/family/members/{membershipId}/revoke` | Owner | Transition `APPROVED -> REVOKED`, revoke access, append event. |

### Ledger, goals, OCR, and advisor

| Method | Route | Auth | Contract |
| --- | --- | --- | --- |
| GET | `/api/dashboard` | Approved | Return balance, budget summary, goals, and active recent activity scoped to the household. |
| GET | `/api/transactions` | Approved | Return active transactions by default; support `type`, `source`, `from`, `to`, `cursor`, and `limit`. |
| POST | `/api/transactions` | Approved | Validate and create a manual transaction only after explicit client submission. |
| POST | `/api/transactions/{id}/trash` | Approved | Set soft-delete fields and return the deleted record summary. |
| POST | `/api/transactions/{id}/restore` | Approved | Clear soft-delete fields; reject an already active record with `ALREADY_ACTIVE`. |
| GET/POST/PATCH | `/api/goals` and `/api/goals/{id}` | Approved | CRUD active goals, validate positive target, and exclude soft-deleted goals from normal reads. |
| POST | `/api/ocr/receipts` | Approved | Accept one supported image, de-duplicate by household and content hash, and return an OCR job/draft. Never creates a transaction. |
| GET | `/api/ocr/jobs/{id}` | Approved | Return job status and validated editable draft fields. |
| POST | `/api/advisor/insights` | Approved | Aggregate only the caller's household period, request Gemini structured output, validate it, persist the cache record, and return insight plus source period and limitations. |

Protected routes return `401` for absent/expired sessions, `403` for pending/declined/revoked access or insufficient role, `404` for a record outside the caller's household, `409` for invite/idempotency/state conflicts, `422` for validation or incomplete model output, and `429` for Gemini rate limiting.

## Structured model schemas

### OCR draft

```json
{
  "merchant": "string|null",
  "totalAmountMinor": "integer|null",
  "currencyCode": "IDR|null",
  "occurredAt": "YYYY-MM-DD|null",
  "category": "string|null",
  "taxAmountMinor": "integer|null",
  "confidence": "number 0..1",
  "missingFields": ["merchant|totalAmountMinor|occurredAt|category"],
  "notes": "string|null"
}
```

The route rejects negative amounts, unsupported currencies, invalid dates, confidence outside `0..1`, and missing required fields for a save-ready draft. A low-confidence draft may be shown for editing but remains a draft.

### Advisor insight

```json
{
  "headline": "string, max 120 chars",
  "summary": "string, max 600 chars",
  "actions": [
    { "label": "string, max 80 chars", "type": "VIEW_GOAL|REVIEW_SPENDING|NONE" }
  ],
  "limitations": "string, max 300 chars",
  "sourcePeriod": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }
}
```

Advisor output is informational, must include limitations, and must not claim guaranteed outcomes, investment advice, or an automated money movement.

## Invariants and acceptance matrix

| Invariant | Required check |
| --- | --- |
| Household isolation | Every protected repository query includes authenticated `household_id`; cross-household IDs do not reveal existence. |
| Approval gate | `PENDING`, `DECLINED`, and `REVOKED` memberships cannot access dashboard, transactions, goals, OCR, or advisor data. |
| Owner auditability | Every approval state mutation writes both current membership audit fields and an immutable membership event. |
| Explicit persistence | OCR creates only a draft/job; transaction creation requires a separate explicit request. |
| Soft delete | Active queries exclude records with `deleted_at`; restore is idempotence-aware and permanent delete is absent from MVP routes. |
| Money correctness | Monetary values are positive integer minor units; calculations do not use floating-point storage. |
| AI failure safety | Timeout, rate limit, unavailable model, invalid JSON, or schema failure returns a typed fallback/error and never fabricated financial data. |
| Privacy | Database and Gemini credentials are server-only; receipt bytes and raw model prompts never reach the browser. |

## Amendments (Spec Review All-Hands, 2026-09-30)

Keputusan rapat PM + Brainstorm + Developer + QA (notulen: `agent-comms/2026-09-30-pm-spec-review-minutes.md`).
Amendment berikut MENGUBAH kontrak di atas; bila bertentangan, amendment menang.
Semua menjadi bahan ADR-001..008 di Langkah 0.

| ID | Amendment | Mengubah |
| --- | --- | --- |
| A-01 | Budget punya write path: `GET /api/budget` + `PUT /api/budget` (owner-only, upsert per `(household_id, period_start)`). Halaman `/budget` memakainya. | API contract (route baru) |
| A-02 | Batas upload struk = 4.194.304 byte (4MB), bukan 5MB — batas body function Vercel ≈4,5MB membuat 5MB mustahil. Upload tetap server-proxied. | Receipt/OCR contract, OQ-4/ADR-008 |
| A-03 | Sliding session: JWT TTL 15 menit, reissue cookie pada setiap request protected yang lolos revalidasi (sid sama); sesi absolut 7 hari (`session.expires_at`); tanpa route refresh terpisah. | Auth/session contract |
| A-04 | JWT claims = `{sub, sid, token_version, iat, exp}` — TANPA `role`; role selalu dari DB per request. `token_version` = "v1" konstanta di MVP. | Auth/session contract |
| A-05 | `INVALID_INVITE` = 400 (bukan 409), body identik untuk semua penyebab. | API contract error table |
| A-06 | Rejoin user DECLINED/REVOKED ditunda pasca-MVP (skema mendukung flip status; flow/route tidak ada di MVP). | Membership lifecycle |
| A-07 | Signup tanpa invite tetap terbuka untuk MEMBUKA household baru (Owner); bergabung household existing wajib invite. `nextAction` enum: `CREATE_HOUSEHOLD` dihapus (nilai mati). | Auth contract |
| A-08 | `PATCH /api/transactions/{id}` DITUNDA pasca-MVP — dihapus dari route berlaku; koreksi lewat trash + entry ulang. | API contract |
| A-09 | Kategori kanonik: `food, transport, bills, shopping, health, education, entertainment, income, gift_donation, other`. MONEY_OUT: semua kecuali `income`; MONEY_IN: `income, gift_donation, other`. | Domain contract |
| A-10 | OCR gagal tetap HTTP 200: `{ job: { status: FAILED, errorCode }, draft: null }`; namespace `OCR_TIMEOUT, OCR_RATE_LIMITED, OCR_INVALID_OUTPUT, OCR_MODEL_UNAVAILABLE`. | OCR contract |
| A-11 | Precedence idempotency: claim key dulu, dedup receipt di dalamnya; retry dengan key sama me-replay response asli (termasuk replay 409 DUPLICATE_RECEIPT). | OCR/idempotency contract |
| A-12 | Konversi tanggal date-only → `occurred_at` = 12:00 Asia/Jakarta (draft OCR dan form manual). | Domain contract |
| A-13 | Semua periode kalender (budget, byDay, tab 7D/30D/90D, filter from/to, validasi masa depan) memakai kalender Asia/Jakarta — bukan jam proses server (UTC). | Dashboard/chart contract |
| A-14 | Cursor opaque base64 keyset `(occurred_at DESC, id DESC)`; limit default 20, maks 50 (di atas → 422). Berlaku semua endpoint list. | Collection contract |
| A-15 | Cache insight di-key `(household_id, source_period_start, source_period_end)` + unexpired (TTL 24 jam), terbaru dulu; retensi maks ~10/household. | Advisor contract |
| A-16 | Saved amount: delta-based atomic conditional update (`+ X >= 0` di WHERE); gagal → 422 SAVED_AMOUNT_INVALID; DB `CHECK (saved_amount_minor >= 0)`. | Goals contract |
| A-17 | `ALREADY_DELETED` ditambahkan: trash ganda pada record sama → 200 ALREADY_DELETED (idempotent). | Trash contract |
| A-18 | Trash entry point: tab "Trash" di `/activity` (`/activity?view=trash`), urutan `deleted_at DESC`. Route `/savings` dihapus; goals di `/budget`. | Frontend route contract |
| A-19 | Rate limit advisor = pass-through Gemini saja (tanpa app-level limit di MVP). Race dua insight bersamaan = dobel panggil diterima (known free-tier risk). | Advisor contract |
| A-20 | Batas panjang: display_name ≤60, household name ≤80, goal name ≤80, decision_reason ≤200, merchant ≤120, note ≤500. Password min 8 karakter. | Validation contract |
| A-21 | Mime allowlist struk: jpeg/png/webp. Confidence threshold low-confidence: 0,70. | OCR contract |
| A-22 | Idempotency scope per USER (bukan per household) — ratifikasi keputusan ERD D-2; kalimat "same household and payload" di dokumen ini tidak berlaku lagi. | Idempotency contract |
| A-23 | Test stack T-002: vitest + @playwright/test; seam mock Gemini wajib; integration DB via Neon branch disposable. | Verification policy |
| A-24 | Paket baru: `jose`, `bcryptjs` (atau scrypt node:crypto — dipilih di dev plan), `@google/genai`, `@vercel/blob`, `vitest`, `@playwright/test`. | Stack |
| A-25 | Route halaman aktivitas tetap `/transactions` (kode sudah ada), label nav "Activity"; trash = `/transactions?view=trash`. Spec dashboard/trash disesuaikan. | Frontend route contract |
| A-26 | Roster agent resmi: PM, UI/UX Designer, Developer, QA (+ Brainstorm sebagai reviewer). `docs/design/` dimiliki UI/UX Designer; fitur UI butuh `design-signoff` sebelum dev plan. | Governance |
| A-27 | Desktop top nav = Home, Budget, Activity, Family + tombol pill "Add a transaction" (aksi, bukan link); tanpa item "Goals"/"Overview". | Navigation contract |
| A-28 | Kartu advisor di dashboard = kartu statis (lavender, badge Finny, satu CTA ke drawer advisor di `/budget`) tanpa data server — tidak ada angka yang dikarang. | Dashboard contract |
| A-29 | Waiting room: tanpa menampilkan email owner (privasi); polling = tombol manual "Check again" + satu auto-recheck; perubahan status diumumkan aria-live polite. | Auth UX contract |
| A-30 | Bahasa UI ship = **Indonesia** (target user + IDR); vocabulary table design 01 dan semua microcopy design diterjemahkan sebagai string kanonik. Copy teknis (OCR/Gemini/JWT/admin) dilarang di UI. | Copy/language contract |
| A-31 | **Tabel route kanonik** (menggantikan A-18/A-25 yang saling bertentangan; tabel ini yang berlaku): halaman = `/login`, `/signup`, `/waiting-for-approval`, `/home`, `/budget`, `/transactions` (label nav "Activity"), `/family`, `/profile`; drawer = advisor di `/budget`; **`/savings` dan `/add` DIHAPUS** (Add adalah sheet/aksi, bukan halaman; goals ada di `/budget`). Trash = `/transactions?view=trash`. | Frontend route contract |
| A-32 | **Write-lock dokumen kontrol:** hanya PM yang mengedit `docs/architecture-decisions.md`, `docs/PRD.md`, dan `docs/spec/*` (serta dokumen kontrol di luar repo: `../tickets/TASK-PLAN.md`); hanya UI/UX Designer yang mengedit `docs/design/*`; Developer hanya menulis file baru (`docs/adr/*`, `docs/dev-plan/*`) + kode. Alasan: arch-dec pernah terkorupsi 468 baris karena edit bersamaan. | Governance |
| A-33 | **Struktur tiket dua tingkat:** `tickets/TASK-PLAN.md` § Task Register = satu-satunya sumber status untuk T-001..T-008; work order `WO-*.md` = unit kerja untuk gelombang siap-jalan (punya `binds_to` dan DoD, boleh selesai independen). Tiket lama 01–03 diarsipkan; 04–11 tidak lagi menyimpan Status (merujuk Task Register). | Governance |
| A-34 | **Dokumen operasional tinggal DI LUAR repo.** Tiket (T-001..T-008, WO-*) DAN `TASK-PLAN.md` (control/status document) tinggal di `e:\Project\financial_planner\tickets\`, sejajar dengan `agent-comms/`. Yang menjadi living documentation dan tinggal di dalam repo hanya PRD, Spec, Dev Plan (+ ADR/ERD/design sebagai referensi). Alasan: repo berisi dokumen produk yang stabil; tiket dan task-plan bersifat operasional dan sering berubah. | Doc structure |
| A-35 | **TASK-PLAN v2.0 dirampingkan:** body task T-001..T-008 dihapus (duplikat file tiket; sumber desync). TASK-PLAN menyimpan Feature Layer, Alarms, Execution/Verification Policy, Task Register, Work Order Register, dan Delivery Gate saja. Detail per task hanya di file tiket. | Governance |

## Verification plan for T-001

This task has no implementation test evidence. The review check is document-only:

1. Compare every decision and contract against `docs/PRD.md`, `docs/spec/feat-*.md`, `docs/erd/erd-database-schema.md`, the relevant design documents, and T-003/T-004/T-006/T-007. (`docs/FEATURE-PREPARATION.md` was removed and `docs/requirements.md` archived to `docs/archive/requirements-2026-09-30.md` on 2026-09-30.)
2. Confirm no required architecture choice is `TBD`.
3. Record PM approval (single gate; roster: PM, UI/UX Designer, Developer, QA) before changing the gate to ready.
4. Before implementation, verify the selected Gemini model is enabled for the deployment's Google project without recording credentials.

## Amendment — Wallet F6 (T-009)

**Status:** Accepted by PM · **2026-10-09** (final owner: PM per A-32).
**Behaviour source of truth:** `docs/spec/feat-wallets.md` (Spec Ready, PM 2026-10-08), `docs/design/06-wallets.md` (PM UX sign-off 2026-10-08 + PM decision C-28 2026-10-09), PRD F6, `docs/spec/feat-transactions-ocr.md` (F3 multi-transaction-per-receipt).
**PM decisions folded in (2026-10-09):** C-28 (receipt **image** visibility = union of linked transactions; multi-link preserved), **C-29 (receipt image stays union-visible per C-28, but the OCR job + extracted `draft`/`result_json` stay uploader-only before AND after save; the image union never widens job/draft access)**, **C-30 (authorized users can open receipt images from transaction detail through an authenticated server stream; no public Blob URL)**, **C-31 (wallet `scope` `PERSONAL|SHARING` is immutable after create; a desired scope change requires a new wallet plus an explicit transfer of funds, never an in-place conversion that could shift history visibility)**, C-19 duplicate contract (409 `DUPLICATE_RECEIPT` accepted as-is), and migrated default wallet name "Dompet Keluarga" (final). All are recorded below.
**Nature of this block:** ratified technical/governance contract for T-009. It does not create or change confirmed business rules; every business rule is referenced by its Spec AC or design C ID. No item in A-36..A-51 is left marked **PM decision required**. Numbering continues the amendment table above (A-36+).

This block amends the confirmed contract above. Where it conflicts, this block wins for F6.

### A-36 — `wallet` table (schema + owner/scope invariant)

New enum `WalletScope = PERSONAL | SHARING`.

| Column | Type | Constraint | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| household_id | uuid | FK → household, NOT NULL | tenant scope |
| created_by_user_id | uuid | FK → user, NOT NULL | creator ("pembuat"); for PERSONAL also the owner |
| scope | enum | NOT NULL | `PERSONAL \| SHARING` |
| name | varchar | NOT NULL | ≤80, app-enforced (A-20 pattern) |
| purpose | varchar | nullable | ≤80, user-defined intent, not an account type (C-6) |
| opening_balance_minor | int | NOT NULL, default 0, CHECK >= 0 `*` | IDR scale 0; not a transaction (C-5, AC-F6-4) |
| archived_at | timestamptz | nullable | null = active (non-destructive archive, C-4) |
| archived_by_user_id | uuid | FK → user, nullable | |
| system_key | varchar | nullable | migration marker only (A-48); NULL for user-created wallets |
| created_at / updated_at | timestamptz | NOT NULL | |

- Constraint `UNIQUE(household_id, system_key)` `*` — idempotency key for the migrated default wallet (A-48).
- Constraint `UNIQUE(household_id, id)` — FK target enabling the household-qualified `transaction.wallet_id` (A-37). Redundant with PK but required by the composite FK.
- Index `idx(household_id, scope, archived_at)` — picker/carousel/summary reads.
- **Invariant (service-enforced):** `scope = PERSONAL` ⇒ the effective owner is `created_by_user_id`; only that user may read/use/edit/archive/restore it. `scope = SHARING` ⇒ every APPROVED member of the household may read/use and edit name/purpose; archive/restore is limited to `created_by_user_id` or the household Owner. This is a cross-table/role rule and is enforced in the service layer, not by a CHECK.
- No hard delete. Archive never removes history (AC-F6-3, ADR-005).
- `scope` is **immutable after creation — PM-confirmed C-31 (2026-10-09), not merely a technical assumption** (Spec AC-F6-3; also listed Out of Scope in `docs/spec/feat-wallets.md`). The edit surface is `name`/`purpose` only (plus `opening_balance_minor` while unlocked, A-42); any `scope` supplied to `PATCH /api/wallets/{id}` is rejected by validation (`422 VALIDATION_ERROR`, `fieldErrors.scope`). Changing the desired scope requires creating a **new** wallet with the target scope and performing an **explicit transfer** of funds between the old and new wallet (A-40). There is no in-place scope conversion, and no operation may reclassify existing history: creating the new wallet or transferring funds must **never** change the visibility of past transactions, receipts, balances, or aggregates (AC-F6-2, AC-F6-3, AC-F6-11). This holds for PERSONAL owners and household Owners alike; role never grants a scope flip.

### A-37 — `transaction.wallet_id` (household-qualified relation + index)

- Add `wallet_id uuid` to `transaction`; nullable in migration step 1, `NOT NULL` after backfill (A-48).
- **Household-qualified FK (raw SQL):** `FOREIGN KEY (household_id, wallet_id) REFERENCES wallet(household_id, id)`. This makes a cross-household transaction↔wallet link impossible at the DB level. Keep the Prisma relation single-column (`wallet_id → wallet(id)`) and add the composite FK in raw SQL to avoid Prisma dual-use of `household_id` in two relations; the service MUST still assert `wallet.household_id = transaction.household_id` (defense in depth).
- Index `idx(household_id, wallet_id, deleted_at, occurred_at desc)` — per-wallet activity and balance.
- Keep the existing `UNIQUE(household_id, transfer_group_id, type)` and `idx(household_id, deleted_at, occurred_at desc)` unchanged; do not duplicate them.
- `wallet_id` is mandatory for MONEY_IN/MONEY_OUT and for both transfer legs (AC-F6-4, AC-F6-5).

### A-38 — Wallet visibility ACL (householdId alone is insufficient)

Define the visibility predicate used by every wallet-scoped path:

```
visibleWallet(actor, wallet) :=
  wallet.household_id == actor.householdId
  AND actor membership == APPROVED
  AND (wallet.scope == 'SHARING' OR wallet.created_by_user_id == actor.userId)
```

- Repositories that read/mutate wallet-scoped data MUST receive the actor (`userId` + `householdId` + `role`), not `householdId` alone, so the predicate can be applied in the query (`wallet: { is: { ...visibility... } }`).
- Applies to: wallet list/detail/update/archive/restore; transaction list/detail/trash/restore; receipt and OCR job access; dashboard/budget/chart/advisor aggregates; transfer-pair resolution.
- Unknown id, foreign-household id, or another user's PERSONAL id → **404 `NOT_FOUND`** with a generic message (never confirm existence). Unauthorized mutation of a visible resource → **403 `ACCESS_DENIED`**.
- No route may serialize a private leg's wallet id/name/note/receipt or a usable `transfer_group_id` to an actor who cannot see the private side (A-39).

### A-39 — Cross-scope transfer privacy (generic-activity redaction)

- The **owner of the PERSONAL wallet** sees both legs in full. The household role Owner does not gain read access to another member's PERSONAL wallet; if not the wallet owner, the Owner sees only the generic SHARING-side projection (A-38/A-41).
- Any other actor sees only the SHARING leg, projected as a **generic activity**. The projection is built server-side and is restricted to the allowlist `{ id, type (explicit generic direction of the visible SHARING leg), amountMinor, currencyCode, occurredAt }`, plus at most a non-identifying scope-direction marker. Safe shared-side context may remain only when it cannot carry private data.
- The generic projection MUST null (or omit) every optional/private field not on the allowlist, at minimum: `merchant`, `category`, `note`, `receiptId`, `transferGroupId`, `wallet` (neither a private nor a correlatable wallet id/name may appear), `source`, and `createdByUser`/any creator or other-user identity. No PII. Redaction happens in the server DTO builder, not in UI styling (AC-F6-6, AC-F6-11).
- Withholding `transferGroupId` (and every other correlatable identifier) is required so the two legs cannot be correlated to trace personal activity.
- The private-side leg must not be returned in any collection for an actor without access to it, and the generic projection must not be recomputable to the private side from the fields that remain.

### A-40 — Transfer creation and atomic pair trash/restore (supersedes ADR-005 per-leg behaviour)

Creation (AC-F6-5):
- Input: `{ type: 'TRANSFER', amountMinor, occurredAt, note?, fromWalletId, toWalletId }`, one amount. No category.
- Validate: `fromWalletId != toWalletId`; both wallets exist, are in `actor.householdId`, are visible to the actor, and are active (`archived_at IS NULL`); amount > 0; date not future (existing rules).
- Persist atomically in one interactive transaction: `MONEY_OUT` leg with `wallet_id = fromWalletId` and `MONEY_IN` leg with `wallet_id = toWalletId`, one shared `transfer_group_id`, identical amount and `occurred_at`, `source = MANUAL`.
- Idempotency precedence unchanged (A-11); key claim wraps the pair insert.

Trash/restore (AC-F6-5, C-9, C-20):
- `POST /api/transactions/{id}/trash` (and `/restore`) resolves the row; if `transfer_group_id IS NULL` the existing single-row behaviour applies.
- If `transfer_group_id IS NOT NULL`, the operation targets **all rows sharing `(household_id, transfer_group_id)` (exactly 2)** in one interactive transaction, regardless of which leg id was supplied. A single-leg mutation is never exposed.
- Idempotent: all legs already trashed → 200 `ALREADY_DELETED`; all already active on restore → 200 `ALREADY_ACTIVE`. A partial state (possible only from legacy ADR-005 per-leg deletes) is reconciled to a consistent state inside the same transaction.
- **Supersedes ADR-005** "Transfer: menghapus satu kaki transfer hanya men-soft-delete kaki itu; pasangan tetap aktif". ADR-005 is amended accordingly.

### A-41 — Transfer trash/restore authorization matrix

| Transfer | Who may trash/restore the pair |
| --- | --- |
| PERSONAL↔PERSONAL (same owner) | that owner (both wallets' `created_by_user_id`) |
| SHARING↔SHARING | any APPROVED member who can access both SHARING wallets (all APPROVED) |
| PERSONAL↔SHARING (cross-scope) | the transfer creator (either leg's `created_by_user_id`) OR the household Owner |

- The Owner may authorize even when their UI shows only the SHARING leg; authorization uses role + creator only and never returns personal metadata.
- An actor who can see only the SHARING leg and is neither creator nor Owner → 403 `ACCESS_DENIED` on mutate; the generic activity row stays readable.
- Foreign/unknown id → 404 `NOT_FOUND`. Responses never reveal the personal leg's existence.

### A-42 — Opening balance: correction window, lock, and race

- `opening_balance_minor >= 0`; negative rejected with 422 and a DB CHECK as defense (AC-F6-1).
- Correctable only while **no** `transaction` row references the wallet: `NOT EXISTS (SELECT 1 FROM transaction WHERE wallet_id = ?)`, with **no `deleted_at` filter** (trashed rows and a single transfer leg both lock it, C-21).
- Enforcement inside a transaction that locks the wallet row (`SELECT ... FOR UPDATE`), re-checks `NOT EXISTS`, then updates. Transaction creation must acquire the same wallet row lock before inserting any leg, so the two operations serialize; otherwise READ COMMITTED permits a leg to commit between the check and the update. Fallback if row-locking proves too costly: a Postgres advisory lock keyed by wallet id. (Technical decision; no PM input required.)
- Locked edit → 422 `WALLET_OPENING_BALANCE_LOCKED`. UI renders the field disabled; the server is authoritative.
- Opening balance is never a transaction and never spending (AC-F6-4, AC-F6-8).

### A-43 — Wallet archive / restore

- Edit name/purpose: SHARING = any APPROVED; PERSONAL = owner. Scope immutable (C-31; no `scope` in `PATCH`, changing it requires a new wallet + explicit transfer, A-36/A-40).
- Archive/restore: SHARING = wallet creator OR household Owner; PERSONAL = owner (C-4, C-22).
- Archive sets `archived_at` + `archived_by_user_id`; restore clears both. No hard delete.
- Archived wallets are excluded from picker, carousel, and any new MONEY_IN/MONEY_OUT/transfer selection; they remain in activity history and in balance totals (C-18).
- If the SHARING wallet creator is no longer APPROVED, only the Owner can archive/restore.
- Selecting an archived/unavailable wallet at submit → 422 `WALLET_UNAVAILABLE` (design §7).

### A-44 — Dashboard DTO (split totals + wallet cards)

- `DashboardDTO`: replace `balanceMinor` with `sharedBalanceMinor` and `personalBalanceMinor`, and add `wallets: WalletCardDTO[]`. Breaking change; the dashboard client is updated in the same slice (AC-F6-7).
- `sharedBalanceMinor` = Σ over SHARING wallets (active **and** archived) of `opening_balance_minor + Σ active MONEY_IN − Σ active MONEY_OUT` for that wallet.
- `personalBalanceMinor` = the same over PERSONAL wallets where `created_by_user_id = caller`.
- The two values are never summed. Archived balances are always included; `wallets` (carousel) contains **active only**. All values are server-computed (C-11, C-18).
- `recentActivity` uses the wallet visibility filter and the A-39 redaction.

### A-45 — Budget, chart, and advisor aggregation (SHARING only)

- `monthlyBudget.spentMinor`, `spending.totalOutMinor`, and `spending.byDay`: active `MONEY_OUT` on **SHARING** wallets, **including archived**, transfer legs excluded (AC-F6-8, C-12).
- Advisor aggregate: SHARING only (including archived), transfer excluded; the persisted cache row is built from SHARING-only data so no personal data is ever cached; cache key `(household_id, period_start, period_end)` is unchanged (A-15).
- Opening balance is excluded from spending and from `totalIn`/`totalOut` (it is not activity). If a balance figure is ever sent to the advisor it must be the shared balance only.
- No PERSONAL wallet name/id/note/receipt may appear in any household/advisor payload (AC-F6-11).

### A-46 — OCR wallet assignment; receipt-image access (union, C-28) vs OCR job/draft access (uploader-only, C-29)

- OCR never selects a wallet; the user selects/confirms it on the review screen before save (AC-F6-10, C-7).
- OCR does not support transfers (unchanged). An uploader may still create a second transaction from a receipt/job **they own** (existing feat-transactions-ocr rule).
- **Two distinct access predicates (C-28/C-29, PM-confirmed 2026-10-09).** The receipt **image/Blob bytes** and the **OCR job + extracted `draft`/`result_json`** are separate resources with separate visibility. They must never be conflated in one query or one DTO.
  - **Receipt image (Blob bytes) — union predicate (C-28).** After save, read access to the image is the **union over ALL linked transaction rows** of each row's wallet visibility, derived via `receipt → transaction → wallet` using the A-38 wallet predicate. The union MUST NOT apply an `active`/`deleted_at IS NULL` filter: every saved link counts, including a row whose transaction is soft-deleted/trashed (trash is a recoverable visibility path, ADR-005/A-17).
    - links to PERSONAL wallets only → uploader only;
    - any link to a SHARING wallet → all APPROVED household members may read the receipt image, even if the receipt is also linked to PERSONAL transactions, or is later reused for a new PERSONAL transaction (the union never shrinks);
    - before any link exists (draft/unlinked) → uploader only.
  - **Secure image read path (C-30, PM-approved).** Code inspection confirms F3 returns no receipt bytes: `BlobStore` exposes only `put`, no route returns receipt bytes, and `TransactionDetailSheet` renders receipt text only. Serving the C-28 image therefore uses the new authenticated server route `GET /api/ocr/receipts/{id}/image`; it must never expose a public/direct Blob URL.
    - Auth: APPROVED session + the image-union predicate above; unauthorized, foreign-household, or no-link → **404** generic with no existence leak. No public/direct Blob URL, `storage_key`, or token is ever returned.
    - Response: bytes only, `Content-Type` = the stored allowlisted `mime_type` (jpeg/png/webp, A-21) and `Cache-Control: private, no-store`; no JSON body, no OCR job/draft (`result_json`), and no linked transaction row.
     - The route streams the private Blob read server-side through `BlobStore.get/stream` using the verified `@vercel/blob@2.8.0` `get(pathname, { access: "private", token })` API; it never issues a signed/public Blob URL.
    - Independent of the job endpoint: `GET /api/ocr/jobs/{id}` stays uploader-only and `receiptSharedWithHousehold` stays uploader-only (below); the image route never widens either. ADR-008 carries the matching Draft amendment.
  - **OCR job + extracted draft (`result_json`) — uploader-only predicate (C-29).** `GET /api/ocr/jobs/{id}` and draft access are computed **solely** from `receipt.uploaded_by_user_id == actor.userId`, and are uploader-only **before AND after** any transaction save. A household member who can read the image through a SHARING-linked transaction still does **not** receive the OCR job, the extracted `draft`/`result_json`, confidence/error detail, or the share flag. Seeing the image never grants job/draft access, and job/draft access never grants the image. The visibility endpoint (design §12) therefore resolves to two predicates, not one.
- **Cardinality (C-28, PM-confirmed 2026-10-09; no PM decision pending):** one receipt **may** link to multiple transaction rows; do not add a one-transaction constraint. This preserves the existing feat-transactions-ocr behaviour (AC-5 / Constraint Bisnis: dedup scope = upload only, second transaction allowed).
- **No transaction-row exposure (C-28/C-29).** Neither predicate may surface a linked **transaction row**. A PERSONAL transaction row stays private to its owner: it is never returned, mutated, correlated, or counted through the receipt's shared image status (A-39/§8). The image may be shared; the transaction record and the OCR job/draft are not.
- **Trash/soft-delete links (C-28; no new feature):** a linked transaction that is soft-deleted still counts as a link for the **image** union; soft-delete does not remove the link and the row stays accessible via trash (ADR-005/A-17). A receipt image made household-visible through a SHARING link therefore stays household-visible while that link exists (including in trash). This affects the image predicate **only**: the OCR job/draft remains uploader-only regardless of trashed links (C-29). No relink/restore semantics are introduced here; if a future constraint forbids a trashed link from qualifying, that must be an explicit decision, not an implicit default.
- **Server-computed share flag (uploader only):** the server exposes a receipt share-state **to the uploader only** (on the OCR job/review response) instead of the client inferring visibility; the review screen renders the C-28 disclosure variants from this flag (variant 2 = already share-visible). `receiptId` is never treated as ownership proof in the UI. Contract field: `OcrJobDTO.receiptSharedWithHousehold` (A-49). Other household members never receive the OCR job/draft or this flag; the flag describes the **image** union, not job visibility.
- **Disclosure (design §10):** when the review screen selects a SHARING wallet → variant 1 before the confirm CTA; when the receipt is already share-visible and a PERSONAL wallet is selected → variant 2. Disclosure copy/placement is owned by `docs/design/06-wallets.md`; this document only fixes the access rules and the flag. The flag is rendered by the uploader's own client only (C-29); no cross-member path returns it.

### A-47 — OCR duplicate response by uploader (C-19; PM-confirmed 2026-10-09)

- Keep `UNIQUE(household_id, content_sha256)` and the household-scoped dedup; cross-household duplicates remain allowed (no existence leak).
- **Same uploader** retry → reuse own job/draft (current behaviour).
- **Different uploader (same household)** → generic HTTP **409** with `{ error: { code: "DUPLICATE_RECEIPT", message: "Struk ini sudah pernah diproses." } }`, with no `job`, `draft`, `receiptId`, uploader, or prior-receipt detail. **PM-confirmed (2026-10-09):** the existing 409 code/status is accepted as the contract; this is no longer a "technical recommendation". Design leaves the payload to this document; the generic body above is final.
- Race: two concurrent uploads of the same content both miss `findByHash`; one insert wins and the loser gets P2002 on the unique constraint. On P2002 the loser re-reads the receipt and applies the same same-uploader/other-uploader branching; it must not create a second job. The Blob key is deterministic (`receipts/{householdId}/{sha256}`), so a concurrent duplicate writes the same key rather than orphaning a new one.
- Do not weaken or drop the unique constraint (C-19).

### A-48 — Migration and rollout

- **Step 1 (additive):** create `wallet` + `WalletScope`; add nullable `transaction.wallet_id`; create indexes. No NOT NULL, no backfill.
- **Step 2 (backfill, idempotent SQL):** for every household existing at migration time, ensure exactly one default SHARING wallet with `system_key = 'legacy_default'`, `opening_balance_minor = 0`, `created_by_user_id = household.owner_user_id`; then `UPDATE transaction SET wallet_id = <default.id> WHERE household_id = ? AND wallet_id IS NULL`. Include trashed rows and both legs of historical transfers; filter by `household_id` only (no cross-household linking). Households with **zero** transactions still get a default wallet (AC-F6-9).
- **Step 3 (verify, pre-cutover):** zero rows with `transaction.wallet_id IS NULL`; every household has ≥1 wallet; transaction row count unchanged; per-household ledger parity `Σ active MONEY_IN − Σ active MONEY_OUT` unchanged (opening 0); transfer pairs intact.
- **Step 4 (enforce):** set `transaction.wallet_id NOT NULL`; add the composite household-qualified FK and the per-wallet index (A-37).
- **Rollback / safe repeat:** steps 1–2 are additive and re-runnable (guarded by `system_key`); step 4 is a constraint that can be reverted by dropping NOT NULL/FK with no data loss. No hard delete anywhere.
- Default display name: **"Dompet Keluarga"** is the final PM-accepted name (2026-10-09). It is written as the migrated default wallet's `name` and is editable afterwards like any wallet name (A-43). This closes the previously open naming proposal (Spec C-17 / design note §18); no further naming decision is pending.

### A-49 — APIs, DTOs, and error codes

New routes (all APPROVED; visibility/role per A-38/A-43):

| Method | Route | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| POST | `/api/wallets` | Approved | `{ name, purpose?, scope, openingBalanceMinor? }` + `Idempotency-Key` | 201 `WalletDTO` |
| GET | `/api/wallets` | Approved | `?view=active\|archived\|all` | `{ wallets: WalletDTO[] }` |
| GET | `/api/wallets/{id}` | Approved + visible | - | `WalletDTO` |
| PATCH | `/api/wallets/{id}` | Approved + permission | `{ name?, purpose?, openingBalanceMinor? }` | `WalletDTO` |
| POST | `/api/wallets/{id}/archive` | Permission (A-43) | - | `WalletDTO` |
| POST | `/api/wallets/{id}/restore` | Permission (A-43) | - | `WalletDTO` |
| GET | `/api/ocr/receipts/{id}/image` | Approved + receipt-image union visible (A-46) | - | private image bytes only; allowlisted MIME + `private, no-store`; no Blob URL/job/draft/transaction data (C-30) |

Changed routes:

| Method | Route | Change |
| --- | --- | --- |
| POST | `/api/transactions` | `walletId` required for MONEY_IN/MONEY_OUT; `fromWalletId` + `toWalletId` required for TRANSFER (A-40) |
| GET | `/api/transactions` | add `walletId` filter; A-39 redaction in DTOs |
| POST | `/api/transactions/{id}/trash` / `/restore` | atomic pair semantics (A-40/A-41) |
| GET | `/api/transactions/trash` | authorized transfer pair presented as one logical row; unauthorized cross-scope actors receive only the generic visible Sharing leg (no private metadata) |
| GET | `/api/dashboard` | `sharedBalanceMinor` + `personalBalanceMinor` + `wallets` (A-44) |
| GET/PUT | `/api/budget` | spent is SHARING-only (A-45) |
| POST | `/api/advisor/insights` | aggregate is SHARING-only (A-45) |
| POST | `/api/ocr/receipts` | same-uploader retry reuses own job/draft; different uploader (same household) → 409 generic `DUPLICATE_RECEIPT` (A-47; unchanged by C-29) |
| GET | `/api/ocr/jobs/{id}` | access = **uploader only** (C-29): `receipt.uploaded_by_user_id == actor.userId`; returns job + draft; never widened by the receipt-image union, even when the image is share-visible via a SHARING-linked transaction; never exposes a linked transaction row; uploader response includes the server-computed receipt share flag |

> **Secure receipt-image route (C-30).** No existing route serves receipt bytes. `GET /api/ocr/receipts/{id}/image` is the ratified authenticated route. Authorization uses the A-46/C-28 image-union predicate, including soft-deleted links; response is private-Blob bytes streamed server-side with allowlisted `Content-Type` and `Cache-Control: private, no-store`, generic **404** on unauthorized/foreign/no-link, and no OCR job/draft/`result_json`, linked transaction row, `storage_key`, Blob URL, or token. `GET /api/ocr/jobs/{id}` stays uploader-only (C-29) and `receiptSharedWithHousehold` stays uploader-only; image access never widens either.

> **Separate image/Blob-serving predicate (C-28 vs C-29).** Any path that streams receipt **image bytes** is authorized by the image union predicate (`ReceiptRepository.findByIdForActor` / `isSharedWithHousehold`, A-46 C-28: union over ALL linked transactions, incl. soft-deleted links, never exposing a transaction row). The OCR job API (`GET /api/ocr/jobs/{id}`) is authorized only by uploadership and is **never** widened by that union. Serving the image must not return or imply the job/draft, and the job/draft response must not include any linked transaction row. No existing route serves receipt bytes today, so the Draft image route above is the recommended new path; this block fixes the predicate wherever receipt bytes are served and must not be read as an existing path.

DTOs:
- `WalletDTO = { id, name, purpose, scope, openingBalanceMinor, balanceMinor, archivedAt, createdBy: UserDTO|null, canEdit, canArchive, canRestore, createdAt, updatedAt }`. `createdBy` is exposed for SHARING only; PERSONAL never shows the creator.
- `WalletCardDTO` = lean `{ id, name, purpose, scope, balanceMinor, archivedAt, canEdit, canArchive, canRestore }` for the carousel.
- `TransactionDTO`: add `wallet: WalletRefDTO | null`; cross-scope generic rows retain only the generic direction/amount/date and null out `merchant`, `category`, `note`, `receiptId`, `transferGroupId`, `wallet`, `source`, and `createdByUser` (A-39). No PII.
- `OcrJobDTO = { id, status, receiptId, createdAt, receiptSharedWithHousehold }` (A-46/C-29). Returned to the **uploader only**; other household members receive no OCR job, draft, or this DTO. `receiptSharedWithHousehold` is server-computed from the **image** union of linked transactions (true when any linked transaction, **including a soft-deleted link**, points to a SHARING wallet); it is returned to the uploader only and drives the C-28 disclosure variant 2. It describes image visibility, not job visibility. Clients never compute receipt visibility themselves.

Error codes:
- `WALLET_UNAVAILABLE` (422) — selected wallet archived/unavailable at submit.
- `WALLET_OPENING_BALANCE_LOCKED` (422) — opening balance edit after the first row.
- Same source/destination wallet id → 422 `VALIDATION_ERROR` with `fieldErrors.toWalletId`; missing/malformed IDs → 422 `VALIDATION_ERROR`; archived wallet → `WALLET_UNAVAILABLE` (422); unknown/foreign/private-inaccessible wallet → generic `NOT_FOUND` (404); unauthorized mutation of a visible resource → `ACCESS_DENIED` (403).
- Reuse `ACCESS_DENIED` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), and `DUPLICATE_RECEIPT` (409) — the duplicate code/status is PM-accepted as the OCR dedup contract (A-47); body has no `job`/`draft`/`receiptId`/uploader metadata.

### A-50 — T-009 task register and release-gate sequencing

- **PM decision (2026-10-09):** wallet F6 is included in the current MVP release scope, not deferred post-MVP.
- `tickets/TASK-PLAN.md` remains the single source of status; its task register now covers T-001..T-009 (amendment to A-33). T-009 is the implementation task for F6; T-008 remains the final QA/release gate.
- T-008 is `blocked` until T-009 implementation and F6 QA are complete. T-008 also retains its existing unresolved AC-F4-5 gate; adding F6 does not close or waive that criterion.
- The T-009 task ticket and task-plan dependency order are external operational artifacts. No release approval is implied by this amendment.

### A-51 — Transfer validation error mapping (QA/implementation reconciliation)

- **PM decision (2026-10-09):** same-wallet transfer rejection uses the existing Zod/API `VALIDATION_ERROR` with `fieldErrors.toWalletId`, matching current implementation and user-facing validation. No new `TRANSFER_INVALID` error code is introduced.
- Missing/malformed source/destination fields remain `VALIDATION_ERROR`; archived wallets use `WALLET_UNAVAILABLE`; unknown, foreign-household, or inaccessible PERSONAL wallets use generic `NOT_FOUND` to preserve privacy; a visible transfer pair mutation without sufficient role uses `ACCESS_DENIED`.
- This narrows/removes the draft `TRANSFER_INVALID` wording from A-49; it does not change Spec behavior or any confirmed business rule.

## Amendment - Bank Institutions and Private Quick Add (ACCEPTED 2026-10-21)

**Status:** Accepted by PM 2026-10-21 for product behavior and high-level architecture direction. Technical implementation contracts remain proposed until the Dev Plan is reviewed.
**Does not modify:** A-36 through A-51 remain accepted and unchanged. This block adds a separate, optional institution feature on top of the wallet contract.
**Product source:** PM decisions 2026-10-21 (Q1 through Q9), `docs/spec/feat-bank-institutions.md` (Spec Ready / PM-approved 2026-10-21), `docs/design/07-bank-institutions.md` (PM-approved 2026-10-21), and PRD F6 extension.
**Scope of PM acceptance (2026-10-21):**

- Official catalog scope is Bank Umum and Bank Umum Syariah from the OJK directory, delivered as a static, versioned seed. No runtime, external, or automatic synchronization to OJK; future changes only through an explicit controlled seed/data update.
- Separate official global table and private per-user table, plus at most one wallet reference with mutually exclusive references. Manual means neither reference.
- Custom lists stay private to their owner. Authorized shared-wallet readers see only the selected label as wallet metadata, never the private list.
- Duplicate normalization (trim, collapse whitespace, case-insensitive), official-match routing, private duplicate reuse/block, and per-user private list.
- Soft archive with no hard delete, label retention for old wallet references, and reactivation of an archived row on re-add.
- Quick Add persists immediately even when wallet creation is canceled.
- Shared wallet institution edit follows existing wallet edit permission: preserve/clear the current label, select an official row, or select the editor's own custom entry. No access to another user's private list.
- No custom classification field, custom name limit of 80 characters, no custom rename in v1, and PRD placement as an F6 extension.

**Not decided by PM (implementation contract, proposed):** endpoint names, request/response field names, column types, index and constraint SQL, DTO field names, error codes, and seed tooling internals. These are reviewed in the Dev Plan and are not PM product decisions.
**Nature of this block:** no code, schema, migration, API, or fixture is created by this amendment. A-52 through A-56 and A-58 record the accepted direction plus the proposed implementation contract that realizes it. A-57 is explicitly an implementation contract. A-59 records the resolved decisions and the remaining Dev Plan gate.

### A-52 - Two list scopes and label-only institution model (Accepted 2026-10-21)

**Accepted product direction (PM, 2026-10-21):**

- A user may choose an Indonesian bank when creating a wallet, or keep the wallet manual.
- A user may add a bank/provider that is not in the official list through Quick Add. This includes non-bank providers and institutions not listed by OJK.
- Quick Added entries belong to a **private per-user list**. They are never inserted into the shared catalog and are never listed to other users.
- The official reference list covers Bank Umum and Bank Umum Syariah from the public OJK directory.
- The catalog is a static, versioned seed of the local database. There is no runtime, external, or automatic synchronization. Changes only through a controlled seed/data update.
- Institution is a wallet label/attribute, not a bank connection. No account number, logo, card number, balance, credential, or verification is stored.
- The wallet label follows the local catalog row or local custom row. No external live sync. Custom names are not renameable in v1.

**Accepted architecture direction (PM, 2026-10-21):**

- The official catalog is global and read-only for users; only a controlled seed/data process may write it.
- Two distinct persistence scopes: a global read-only `bank_institution` catalog and a user-scoped `user_custom_institution` list.
- `wallet` may reference at most one of them; manual means neither.
- Shared-wallet readers may see the selected label as wallet metadata, but never the owner's custom list.
- No custom classification field.
- Alternative of a single free-text `wallet.institution_name` is rejected because it cannot preserve official catalog identity, source provenance, or a private-list boundary.

### A-53 - `bank_institution` official catalog (Accepted 2026-10-21; columns are implementation contract)

PM accepted a global, read-only official catalog table. Column-level details below are the implementation contract proposed for the Dev Plan; they are not separate PM decisions.

Global, read-only table. No `household_id`; the catalog is shared by all users.

| Column | Type | Constraint | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| display_name | varchar(160) | NOT NULL | Official display name. Longer than the 80-char wallet name because official legal names can be long. |
| normalized_name | varchar(160) | NOT NULL, UNIQUE | Search and duplicate key. Server/seed computed. |
| source | varchar(40) | NOT NULL, default `OJK_OFFICE_LIST` | Provenance marker. |
| source_url | varchar(500) | NOT NULL | Official source page. |
| source_period | varchar(7) | NOT NULL, CHECK `YYYY-MM` | Publication period stated by the official source. No inferred calendar day. Actual import time lives in `created_at` / `updated_at`. |
| source_ref | varchar(255) | nullable | Sheet/row reference or stable source identifier for audit and seed matching. |
| is_active | boolean | NOT NULL, default true | Delisted banks are deactivated, never deleted. |
| created_at / updated_at | timestamptz | NOT NULL | |

- `UNIQUE(normalized_name)` prevents two selectable catalog rows with the same normalized name. If the official file contains a collision, the seed must stop and report it; it must not pick one silently.
- `INDEX(is_active, normalized_name)` supports the picker search. If the picker uses substring search (`%q%`), the btree index will not be used; the official catalog is expected to be small, so this is acceptable for v1. Add a trigram index only if measurement shows a need.
- The catalog is populated by a static, versioned seed built from the official OJK file verified during implementation. The seed must carry a version, the source URL/file hash, and `source_period` so the dataset is reproducible and auditable. `source_period` is month-level (`YYYY-MM`) because the source states only the month; no day may be synthesized. The operational import timestamp is recorded separately from the publication period.
- No runtime, external, or automatic synchronization with OJK. No cron, no refresh job, no sync button. Updates are explicit controlled seed/data changes.
- No user-facing write route. Only the controlled seed process may write. No admin UI in this feature.
- No hard delete. A bank missing from a later official file gets `is_active = false`; wallets that already reference it keep a resolvable label.
- No classification field (`GENERAL`/`SHARIAH`/etc.) in v1. The official source may group rows, but the product only needs a name. A classification field would be a separate decision.
- If the official file exposes a stable identifier (for example a bank code), store it in `source_ref` and use it as the seed match key. If no stable identifier exists, match by `normalized_name`; a rename then becomes deactivate-old plus insert-new, and old wallets keep their old label.
- `display_name` is the name from the official source. Do not derive abbreviations, logos, or common names from the mockup. If the official file does not contain a common abbreviation (for example BCA), search aliases are a separate data-quality decision and must not be invented by the seed.
- No logo, account, card, network, or brand asset columns.

### A-54 - `user_custom_institution` private list (Accepted 2026-10-21; columns are implementation contract)

Per-user table. Never global, never household-shared, never joined into another user's list response.

| Column | Type | Constraint | Notes |
| --- | --- | --- | --- |
| id | uuid | PK | |
| user_id | uuid | FK -> user, NOT NULL, ON DELETE RESTRICT | Owner. |
| display_name | varchar(80) | NOT NULL | Trimmed user input. Same proposed limit as wallet name. |
| normalized_name | varchar(80) | NOT NULL | Server-computed normalization. |
| archived_at | timestamptz | nullable | null = active; soft archive. |
| created_at / updated_at | timestamptz | NOT NULL | |

- **No classification field.** Quick Add has one required name, per confirmed UX direction R-15.
- Normalization is server-side and authoritative: NFKC, trim, collapse internal whitespace, case-fold. The same helper is used for create, re-add, and search. UI validation is not authoritative.
- **Partial unique index is required and must be raw SQL:**

```sql
CREATE UNIQUE INDEX user_custom_institution_active_name_uq
  ON user_custom_institution (user_id, normalized_name)
  WHERE archived_at IS NULL;
```

- A plain Prisma `@@unique([userId, normalizedName])` is **not acceptable**: the archived row remains in the table, so the same name could never be added again after archive. The partial index permits at most one active row per `(user_id, normalized_name)` while preserving archived history.
- Re-add behavior (PM-confirmed 2026-10-21): if an archived row with the same normalized name exists, reactivate it (clear `archived_at`) instead of inserting a second active row. If multiple archived matches exist, reactivate the most recently archived row. No hard delete.
- Restore is the same reactivation rule as re-add (QA correction 2026-10-22): before clearing `archived_at`, reject if an active official row has the same normalized name (`409 INSTITUTION_ALREADY_EXISTS`, `existing.kind = OFFICIAL`). The custom row stays archived and no private owner/list data is returned. An active private duplicate is rejected the same way.
- Duplicate behavior (PM-confirmed 2026-10-21): reject an active private duplicate with `409 INSTITUTION_ALREADY_EXISTS`; reuse the existing entry or block the new one. Reject a private entry whose normalized name equals an active official bank and direct the user to the official catalog. The private list remains per user.
- Race: two concurrent inserts with the same normalized name are serialized by the partial unique index. Catch the unique violation and re-read the active row; do not create a second active entry.
- Archive is non-destructive (PM-confirmed 2026-10-21). Wallet references to an archived entry remain valid and the label remains resolvable. Picker/list reads filter `archived_at IS NULL`; wallet read must join the custom row **without** an active filter so an archived label still renders.
- No rename in v1 (PM-confirmed 2026-10-21). If rename is later allowed, label stability and referenced wallets must be decided first.
- The custom name limit is 80 characters (PM-confirmed 2026-10-21).

### A-55 - Wallet institution references and XOR constraint (Accepted 2026-10-21; SQL is implementation contract)

Add two nullable columns to `wallet`:

| Column | Type | Constraint | Notes |
| --- | --- | --- | --- |
| official_institution_id | uuid | FK -> bank_institution, nullable, ON DELETE RESTRICT | Official catalog reference. |
| custom_institution_id | uuid | FK -> user_custom_institution, nullable, ON DELETE RESTRICT | Private custom reference. |

Raw SQL constraint (Prisma does not express a CHECK constraint):

```sql
ALTER TABLE wallet
  ADD CONSTRAINT wallet_institution_at_most_one
  CHECK (official_institution_id IS NULL OR custom_institution_id IS NULL);
```

- Manual = both columns null. There is no separate "manual" enum or required selection.
- No backfill. Every existing wallet remains valid and manual. No default institution is created.
- No `institution_name` snapshot column in v1. The label is resolved from the referenced row. Official name corrections follow the catalog; private display names are immutable because rename is out of v1.
- `custom_institution_id` may point to another household member's private row on a SHARED wallet. A DB CHECK cannot enforce "selected by the owner" because the wallet editor is not necessarily the custom-entry owner. Service enforcement is required:
  - on create/update, the actor may select only an active custom row with `user_id = actor.userId`;
  - a different editor may preserve or clear an existing custom reference, but may not select another user's row;
  - wallet read resolves the label without exposing the private row's owner or ID to non-owners.
- Selection and wallet write should run in one interactive transaction so a concurrently archived custom row cannot be selected after validation. A `SELECT ... FOR SHARE` on the custom row is the strict option; if omitted, archive-versus-select is an accepted narrow race, but the reference remains a valid historical label.
- No index for "wallet by institution" in v1 because no product filter requires it. Add one only if such a query is approved.

### A-56 - Authorization, privacy, and DTO exposure (Accepted 2026-10-21; DTO shape is implementation contract)

| Action | Rule |
| --- | --- |
| List official catalog | APPROVED session. Read-only. |
| Write official catalog | No app route or role. Controlled seed/data process only. |
| List/create/archive own custom entries | Owner only, derived from session `userId`. |
| List another user's custom entries | Never. No endpoint, no join, no count. |
| Read wallet institution label | Existing A-38 wallet visibility. Any actor who may read the wallet may see the label. |
| Edit wallet institution on PERSONAL | Owner only. |
| Edit wallet institution on SHARING | PM-confirmed 2026-10-21: any APPROVED member who may edit the wallet's name/purpose (C-4). May preserve/clear the existing label, select an active official bank, or select their own active custom entry. May not enumerate or select another member's custom entry. |
| Custom ID in DTO | Official ID may be returned. Custom ID is returned only when `custom.user_id = actor.userId`; otherwise `id = null` while the label name may remain. |
| Unknown/foreign custom ID | Generic `404 NOT_FOUND`; no existence leak. |
| Non-APPROVED member | Denied by the existing auth/membership gate before this feature runs. |

- `userId` is never accepted from the client for custom-list operations. It is taken from the authenticated session.
- Selecting a custom entry for a wallet also requires the actor to be an APPROVED member of that wallet's household. The custom row must belong to the actor.
- Repository queries must include the ownership predicate, not only a post-fetch service check.
- The shared-wallet label is metadata of the wallet. It does not grant access to the custom list, the private entry row, or the owner's other entries.
- Institution is an optional metadata field on wallet update, added with the existing wallet edit permission (PM-confirmed 2026-10-21). PERSONAL is owner-only. SHARING follows C-4. Wallet `scope` remains immutable and no label change may alter wallet visibility or history.
- An editor on a SHARING wallet may preserve or clear a label that belongs to another member, but the response for that label carries no private ID. Selecting a new custom entry is limited to the editor's own active entries.
- No endpoint returns a household-wide custom list or counts.
- DTO proposal:

```ts
type InstitutionKind = "OFFICIAL" | "CUSTOM";
type WalletInstitutionDTO = {
  kind: InstitutionKind;
  id: string | null;
  name: string;
};
```

`WalletDTO.institution` is `WalletInstitutionDTO | null`. `WalletCardDTO` may carry `{ kind, name }` only. For a custom label viewed by a non-owner, `id` is null. `UserCustomInstitutionDTO` never includes `userId`.

### A-57 - API shape, validation, and fallback (Implementation contract, proposed; not a PM decision)

Implementation contract, not ratified by PM. Endpoint names and payload shapes are proposals for the Dev Plan review:

| Method | Route | Auth | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/api/institutions` | APPROVED | `?q=` optional, trim, max 80 | `{ official: BankInstitutionDTO[], custom: UserCustomInstitutionDTO[] }` |
| POST | `/api/institutions/custom` | APPROVED | `{ name }` + `Idempotency-Key` | `201 UserCustomInstitutionDTO` for a new row; `200 UserCustomInstitutionDTO` for a reactivated archived row; `409 INSTITUTION_ALREADY_EXISTS` for an active duplicate |
| POST | `/api/institutions/custom/{id}/archive` | APPROVED + owner | - | `200 UserCustomInstitutionDTO` |
| POST | `/api/institutions/custom/{id}/restore` | APPROVED + owner | - | `200 UserCustomInstitutionDTO` |
| POST | `/api/wallets` | APPROVED | Existing fields + optional `institution` | `201 WalletDTO` with `institution` |
| PATCH | `/api/wallets/{id}` | Existing wallet permission | Optional `institution` | `200 WalletDTO` with `institution` |

Wallet institution request shape:

```ts
institution?:
  | { kind: "OFFICIAL"; id: string }
  | { kind: "CUSTOM"; id: string }
  | { kind: "NONE" };
```

- Omitted on create = manual. Omitted on update = unchanged.
- `NONE` on create = manual. `NONE` on update clears both references.
- `OFFICIAL`/`CUSTOM` sets one and clears the other atomically. The API never accepts two references in one request.
- Official ID must exist and be active. Inactive/unknown -> `422 INSTITUTION_UNAVAILABLE` with a field error.
- Custom ID must exist, belong to the actor, and be active. Foreign/unknown -> generic `404 NOT_FOUND`; archived -> `422 INSTITUTION_UNAVAILABLE`.
- Duplicate private name -> `409 INSTITUTION_ALREADY_EXISTS`; body may include the actor's existing entry or the public official match only.
- Malformed payload, missing kind/id, or unknown keys -> `422 VALIDATION_ERROR`.
- `GET /api/institutions` filters official `is_active = true`, custom `user_id = actor.userId` and `archived_at IS NULL`. No client-side ACL. No pagination in v1; add it only if the catalog size requires it.
- Quick Add is saved independently of the parent wallet (PM-confirmed 2026-10-21): a canceled wallet does not roll back the private entry. The entry is created in its own transaction and is available for later wallet creation.
- No official write route, no admin route, no bank sync route.
- Endpoint names, error code names, and the exact DTO field names above remain implementation contract. The PM decisions cover behavior (who may do what, what persists, what is private), not these names.

### A-58 - Migration, seed, and rollback (Accepted 2026-10-21; procedure is implementation contract)

**Migration (additive only):**

1. Create `bank_institution` and `user_custom_institution`; add nullable `wallet.official_institution_id` and `wallet.custom_institution_id`; add FKs, CHECK, partial unique index, and search index.
2. Do not backfill wallets. Do not insert a default institution. Do not touch transactions.
3. Populate the official catalog with the versioned static seed after migration via a separate, repeatable seed step. The seed is not part of the migration transaction and is not a `prisma migrate` seed by default.
4. Verify: wallet count unchanged; every existing wallet has both institution columns null; no transaction change; XOR CHECK and partial unique index present.
5. Provenance correction (2026-10-22): a follow-up migration adds `source_period` VARCHAR(7), backfills existing rows from `source_as_of` with `to_char(source_as_of, 'YYYY-MM')`, enforces the `YYYY-MM` CHECK, then drops `source_as_of`. The already-applied T-011 migration is not rewritten. No day is synthesized.

**Seed governance (PM-confirmed 2026-10-21):**

- The catalog is a static, versioned snapshot built from the latest official OJK "Daftar Alamat Kantor Pusat Bank Umum dan Syariah" file, downloaded and verified during implementation. Mockup names are representative only and must not be seeded as the list.
- The seed carries a version and `source_period` (`YYYY-MM`), and records `source`, `source_url`, file hash, and `source_ref` (or the implementation's equivalent provenance fields). It must not synthesize a publication day from a month-only source; the operational import timestamp is stored separately.
- Match by the chosen seed key; if the official file exposes a stable identifier, use it. Otherwise normalize the name and treat a rename as deactivate-old plus insert-new, so old wallet labels remain resolvable.
- Deactivate rows absent from the new seed; never delete.
- Report insert/update/deactivate/conflict counts. Fail on name collisions in the source.
- No runtime, external, or automatic synchronization. No live API sync, no cron, no refresh job, no sync button. Changes only through an explicit controlled seed/data update.
- Seed owner is developer/ops. Workbook parsing, field selection, and row validation are implementation tasks, not pending PM decisions.

**Rollback:**

- Before any references exist, drop the new columns/tables. After references exist, use a forward fix or deactivate rows; do not hard delete referenced rows.
- Existing wallet behavior is unaffected because all existing wallets are manual.

### A-59 - Readiness gate and resolved decisions (Accepted 2026-10-21)

The product decisions and high-level architecture direction are accepted. This feature is **not Ready for Development until PM approves the Dev Plan** `docs/dev-plan/feat-bank-institutions.md`.

| ID | Decision | PM decision 2026-10-21 | Status |
| --- | --- | --- | --- |
| Q1 | OJK catalog scope, seed owner, refresh cadence | Bank Umum + Bank Umum Syariah from the official OJK directory. Static, versioned seed verified during implementation. Developer/ops owns the seed. No runtime, external, or automatic synchronization. Changes only through a controlled seed/data update. | Resolved |
| Q2 | Normalized duplicate behavior | Trim, collapse whitespace, case-insensitive. Official match routes the user to the official row. Active private duplicate reuses the existing entry or blocks a new duplicate. Private list remains per user. | Resolved |
| Q3 | Archive and re-add private entries | Soft archive, no hard delete. Old wallet references keep the label. Re-add of the same normalized name reactivates the archived row. | Resolved |
| Q4 | Quick Add persistence when wallet create is canceled | Persist the private entry immediately; do not roll it back with the canceled wallet. | Resolved |
| Q5 | Institution edit permission on SHARED wallets | Same as name/purpose edit (C-4): preserve/clear, select official, or select own custom; never enumerate or use another member's custom list. | Resolved |
| Q6 | Live reference vs snapshot label | Wallet references the local catalog or custom row and displays that row's current label. No external live sync. Official changes only through a controlled data update. Custom names are not renameable in v1. | Resolved |
| Q7 | Rename/hard delete private entries | No rename, no hard delete in v1; create/list/archive/restore only. | Resolved |
| Q8 | Private entry duplicating an official bank | Reject and redirect to the official catalog. | Resolved |
| Q9 | Schema/API shape | Two separate tables (`bank_institution` global read-only, `user_custom_institution` per user) plus two nullable, mutually exclusive wallet references; manual = both null; no classification field on custom entries. Column names, constraints, endpoints, and DTOs are implementation contract. | Resolved (high level) |

**Remaining gate:** PM approval of the Dev Plan. Implementation contract items (endpoints, column types, indexes, CHECK/partial-index SQL, DTO field names, error codes, seed parsing) are reviewed there and are not reopened as product decisions. No implementation, migration, API, seed, or fixture may start before that approval.

**Not part of this amendment:** aggregate money precision strategy. That is a separate architecture proposal. T-011 does not change money DTOs, aggregate arithmetic, or API contracts for money.

