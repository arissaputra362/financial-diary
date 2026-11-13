# Data and Integration Map — Phase 0

**As of:** 2026-11-11  
**Sources:** Prisma schema/migrations, route handlers, contracts, server services/repositories, docs/current-state.md, specs and QA evidence.

## Domain map

| Domain | Screens | API / server boundary | Data entities and calculations | Permissions / external dependency | Risk to preserve |
|---|---|---|---|---|---|
| Auth and household | Login, signup, waiting room, family | /api/auth/*, /api/family/*; auth/session/family services and repositories | User, Household, Membership, Invite, MembershipEvent, Session; invitation and status lifecycle | Owner/member/pending status; jose JWT and DB session | Session revocation, invite acceptance, approval/decline/revoke and cross-household isolation |
| Ledger and activity | Dashboard activity, Activity, add/detail/trash | /api/transactions/*; transaction service and ledger repository | Transaction; MONEY_IN/MONEY_OUT and paired TRANSFER legs; soft delete, cursor and idempotency | Household + wallet access; no client-supplied ownership authority | Money precision, transfer pairing, dates, history semantics, filters, cursor continuation |
| Wallets | Dashboard cards, detail/manage/form/picker sheets | /api/wallets/*; wallet service/repository | Wallet; opening balance, scope, archive metadata and server-computed balance | Personal owner and household shared roles; scope immutable on update | Never sum personal/shared totals implicitly; preserve wallet access and paired transfer behavior |
| Bank/provider labels | Wallet create/edit and nested picker | /api/institutions/*; institution service/repository | BankInstitution, UserCustomInstitution; versioned OJK seed and user-private entries | Private list filtered from session user; no bank connectivity | Keep labels as metadata; preserve private IDs, XOR references, archive/restore, seed provenance |
| Budget | Dashboard card, /budget | /api/budget and /api/budget/cycle; budget service/repository | HouseholdBudget, PersonalBudget; period usage and remaining total from active in-scope ledger | Personal self-only; shared Owner/member rules | Period boundary, cycles, active rows, personal/shared independence |
| Savings goals | Dashboard summary, /budget | /api/goals/*; goal service/repository | SavingsGoal; target, saved amount, progress, soft-delete/restore | Household membership; no cross-user personal leakage beyond existing behavior | Goal progress and saved edits are distinct from wallet ledger; precision and restore semantics |
| Receipts/OCR | Add scanner, review, receipt detail | /api/ocr/receipts, /api/ocr/jobs/*, private image endpoints; OCR service/provider | Receipt, OcrJob; hash dedup, retry attempts, reviewed draft → transaction link | Gemini API, private Vercel Blob; uploader and linked-wallet visibility | Review before save, image privacy, payload/size, retries and original association |
| Reports | Monthly summary and print | /api/reports/monthly; ReportService and SQL repository | Aggregates opening/new-wallet opening, money in/out, transfer in/out/net, closing, categories and daily series | Wallet/scope selection; server authoritative totals | Arithmetic identity, scope filters, transfer neutral treatment, cursor-complete print detail |
| Gold | /gold, asset detail/form/scan | /api/gold/assets*, /api/gold/prices, /api/gold/scan; gold service/repositories/providers | GoldAsset, GoldMarketPrice, GoldPriceFetchState; milligrams, permille, estimated value/profit | Gemini vision and external price provider with DB snapshot fallback | Units, purity, price source/date, fallback/staleness and owner/shared access |
| Advisor | Budget panel and dashboard insight | /api/advisor/insights; advisor service/provider | AdvisorInsight and server aggregate context; schema-validated output/cache | Gemini; model/quota failure and source limits | Never show fabricated values or exceed data scope; explain fallback/limits |
| Profile/theme | /profile, layout bootstrap | /api/profile, /api/profile/password; local theme storage | User account fields; local preference key financial-diary-theme | Authenticated session; system media query and localStorage | Password/session behavior; theme state across reload, OS changes and tabs |
| PWA/boot | App shell | app/layout.tsx and manifest | Static metadata and browser boot state; no offline ledger sync | Browser/OS capabilities | Maintain honest loading/error recovery and do not imply offline ledger support |

## API route groups found

The repository currently has 47 API route handler files across:

- Auth: login, logout, me, signup.
- Family: household, members, invitations, approve, decline, revoke.
- Dashboard and budget: dashboard, budget, cycle.
- Goals: list/create, item update/delete, trash, restore.
- Transactions: list/create, item update/delete, trash/restore, trash listing.
- Reports: monthly aggregate and summary.
- Wallets: list/create, item update/delete, archive/restore.
- Institutions: official/custom listing and custom archive/restore.
- OCR: receipt upload, job/status/retry, private image retrieval.
- Gold: assets, individual asset, asset image, prices, scan.
- Advisor: insights.

Individual handler verbs and route params should be checked from app/api before any API-touching work; the above is a domain map, not an API contract replacement.

## Data invariants from current source/documentation

1. Currency is IDR; database monetary columns use NUMERIC(18,2). UI and contracts support up to two fractional digits even though several legacy names still end in Minor.
2. Calendar periods and user-facing date grouping use Asia/Jakarta. Database timestamps remain instants.
3. Balances, budget totals, and report aggregates come from server-side data/services; do not reconstruct authoritative totals from a paginated UI list.
4. Transfer is represented as linked ledger legs. It changes wallet balances but is not ordinary income/expense; personal/shared transfers must respect selection scope.
5. User-owned data uses soft-delete/archive where specified; trash/restore and institutional archive have different semantics.
6. Household/wallet authorization is enforced server-side. Hiding a control in UI is not a security boundary.
7. UserCustomInstitution is session-owner private. A shared wallet may expose a label as permitted metadata, but not another user’s private institution ID/list.
8. Receipt visibility is calculated by server-side receipt links and wallet scopes; OCR draft image access has separate uploader rules.
9. Gold weight and purity units are not display-only: persisted milligrams and permille feed valuation.
10. The gold provider’s data is an estimate with source date and snapshot fallback, not a guaranteed sale price.

## External dependencies and unverified behavior

| Dependency | Used by | Audit status |
|---|---|---|
| PostgreSQL | All persisted product domains | Schema/migration source inspected; no live DB query or migration run in this audit. |
| Gemini | Receipt OCR, gold scan, advisor | Prior QA reports explicitly did not exercise live calls; not called in this audit. |
| Vercel Blob | Private receipt images | Prior QA reports did not exercise the production Blob path; not called in this audit. |
| Gold price provider | Gold market estimates | Source/fallback logic and current-state documentation inspected; no live fetch performed. |
| Browser print | Monthly report export | Current flow calls browser print/save PDF; no fresh print rendering test in this audit. |
| Browser localStorage/media query | Theme preference | Source and historical theme E2E evidence inspected; full viewport/theme matrix not rerun. |

See OPEN_QUESTIONS_AND_RISKS.md for current static-check and report-flow risks.
