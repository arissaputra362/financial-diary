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

