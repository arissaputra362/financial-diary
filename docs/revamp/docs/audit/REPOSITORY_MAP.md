# Repository Map — Phase 0

**As of:** 2026-11-11  
**Scope:** Read-only discovery for the approved FinDiary full redesign.  
**Repository:** financial-planner-project/  
**Method:** Reviewed repository guidance and project documentation, queried the repository CodeGraph index, inspected current route/UI/data sources, compared prior QA/design evidence, and ran the current unit, type, and lint baselines. No application source was changed.

## Project summary

Financial Diary is an Indonesian-language personal and household finance web application. The current implementation includes dashboard, budgets and savings goals, transactions and receipt OCR, wallets and bank/provider labels, monthly reports, gold assets, household membership, profile/preferences, and an advisor. Financial values and access boundaries are server-backed.

## Framework and tooling

| Area | Current implementation |
|---|---|
| Framework | Next.js 16.3.6 App Router |
| UI/runtime | React 19.2.8, TypeScript |
| Styling | Tailwind CSS v4, semantic CSS variables in app/globals.css |
| Package manager | Bun |
| Database/ORM | PostgreSQL and Prisma 7.10 with driver adapters |
| Authentication | Application-managed jose JWT plus revocable database sessions |
| AI/image integrations | Gemini for OCR/advisor/gold scan; private Vercel Blob storage for receipt images |
| Gold pricing | Server-side provider, with database snapshots and a previous-snapshot fallback |
| Main scripts | bun dev, bun run build, bun run lint, bun run test, bun run test:integration, bun run test:e2e |

The build script runs prisma generate and next build. The application root route redirects to /home; the request proxy and auth flow handle protected access. The project has 10 App Router page.tsx files, 47 API route.ts handlers, 61 discovered Vitest test files, and 14 Playwright E2E spec files. The default unit run collected 52 test files.

## Application structure

- app/: App Router entry points, auth routes, API route handlers, global loading/error/not-found states, metadata, manifest, and theme bootstrap.
- components/: Dashboard, activity/report, budget/goals/advisor, family, gold, wallet, profile, shared layout, and UI primitives.
- hooks/: Dialog focus and other shared UI hooks.
- lib/: Formatting, date/money utilities, API client, server auth, contracts, services, repositories, providers, and test seams.
- prisma/: Schema, migrations, seed data, and seed tests.
- types/: API/DTO contracts.
- e2e/: Playwright user-flow and responsive/theme tests.
- docs/: Product requirements, design decisions, feature specs/plans, QA matrices/reports, architecture records, setup, and current-state summary.
- docs/revamp/: Isolated redesign instructions, specifications, and this Phase 0 audit.

There is no standalone wallet route. Wallet creation, editing, selection, detail, archive, and restore are embedded flows surfaced from dashboard and transaction screens.

## Current product surfaces

| Surface | Entry |
|---|---|
| Home/dashboard | /home |
| Budget and savings goals | /budget |
| Activities, trash, monthly summary, print/PDF, add flow | /transactions and query-state views |
| Household members/invites | /family |
| Gold assets and scan | /gold |
| Account/profile/theme | /profile |
| Authentication | /login, /signup, /waiting-for-approval |
| Root redirect | / |
| System states | App-level loading, error, and not-found boundaries |

The transaction route carries active/trash/monthly-summary state, month, filters, scope, wallet IDs, and add intent in query parameters. The monthly report and wallet management remain embedded rather than separate routes.

## Data and integration boundaries

The Prisma schema contains User, Household, Membership, Invite, MembershipEvent, Session, Transaction, Wallet, BankInstitution, UserCustomInstitution, SavingsGoal, Receipt, OcrJob, AdvisorInsight, HouseholdBudget, PersonalBudget, IdempotencyKey, GoldAsset, GoldMarketPrice, and GoldPriceFetchState models.

Money uses PostgreSQL NUMERIC(18,2) and IDR. Transaction/date period rules use Asia/Jakarta; timestamps are stored as instants. Gold weights are persisted in milligrams and purity in permille. API handlers call validated contracts and server services/repositories; UI components do not own authoritative balances or household permissions.

Primary API areas are auth, family, dashboard, budget, goals, transactions, reports, wallets, institutions, OCR, gold, and advisor. See DATA_AND_INTEGRATION_MAP.md for the concrete boundaries and protected calculations.

## Existing instructions and documentation examined

- Root AGENTS.md contains project conventions, current design guidance, DDD requirements, and the additive redesign entry point.
- Root CLAUDE.md imports AGENTS.md.
- Root .agent/MASTER_REVAMP_INSTRUCTIONS.md and docs/revamp/.agent/MASTER_REVAMP_INSTRUCTIONS.md are byte-identical copies. Keep both in place; the package copy is isolated and the root copy is existing agent configuration.
- .agents/ contains Prisma skills/reference material, not project-level product or UI instructions.
- .claude/ exists and is empty.
- docs/current-state.md is the most useful current capability summary; it explicitly warns that QA documents are dated snapshots.
- docs/qa/verification-matrix.md, feature QA reports, docs/spec/, docs/dev-plan/, docs/design/, docs/PRD.md, and architecture records supply historical acceptance and constraints.
- The previous user journey and visual audit are in the workspace sibling ../docs/qa/, outside this repository. The journey map is dated 2026-10-05 with later T-009 addenda. The visual-refresh audit is dated October 2026 and contains evidence/mockups through R-18 (2026-10-22).
- A requested docs copy/ directory was not found in the repository or workspace root. Do not infer its contents.
- A second prepared redesign package exists at workspace sibling ../docs/FinDiary_Revamp_Documentation/. The application repository’s docs/revamp/ package is the active location for this audit; the sibling copy was not modified.
- No pre-existing Phase 0 deliverables with the required filenames were found. docs/revamp/docs/audit/README.md and DELIVERABLE_TEMPLATES.md were the only files in that destination before this audit.

## Prior design direction versus current authorization

The existing application and the 2026-10-20 T-010 approval use a blue/white/green system. The product owner explicitly approved a total redesign on 2026-11-11 and directed that the earlier design standard be disregarded for the redesign. Therefore the former palette and T-010 visual acceptance are historical context, not a constraint on the new visual direction. Existing feature, data, privacy, and business-rule evidence remains relevant.

## Baseline outcomes

> The failure counts below are the historical Phase 0 snapshot. See
> `TEST_BASELINE.md` and the revamp README for the current closeout results.

Current checks run during Phase 0:

- bun run test: failed, 556 passed and 7 failed across 52 files.
- bunx tsc --noEmit: failed because .next/dev/types/validator.ts references seven missing route modules under app/financial-health and app/api/financial-intelligence/.
- bun run lint -- --max-warnings=0: failed, 7 errors and 21 warnings. The 7 errors are in GoldSavingsCard.tsx, GoldAssetModal.tsx (three), GoldPageView.tsx, BottomNav.tsx, and MonthlyReport.tsx.

See TEST_BASELINE.md for details and the distinction between current runs and dated QA evidence. Integration tests, E2E, and a build were not run in this discovery pass.

## Main redesign risks

1. The Phase 0 test baseline was not green; report transfer and money precision mismatches were triaged and resolved during closeout.
2. Current contracts and tests support up to two decimal places as required by the current NUMERIC(18,2) model; remaining integer-only E2E assertions are historical test-contract maintenance.
3. The generated .next/dev/types issue was cleared by the current clean type-check/build.
4. Historical visual and QA evidence is mostly from October; current browser behavior is covered by the dated Phase 3–5 focused gates.
5. Finny naming/artwork and any new product capability still require product decisions; the redesign approval does not establish those individual decisions.
6. Third-party live behavior (Gemini, Blob, gold-price provider, production database/deployment) has not been verified in this Phase 0 run.
