# Test Baseline — Revamp closeout

**Historical baseline run:** 2026-11-11  
**Environment:** Local Windows workspace, Bun, repository dependencies already present.  
**Scope:** The original Phase 0 snapshot is retained below for audit history. The
current closeout status is recorded first and supersedes the historical failure
counts for release-readiness decisions.

## Current revamp closeout (2026-11-13)

| Command / gate | Result |
|---|---|
| `bunx vitest run` | **PASS — 563/563 tests** |
| `bun run test:integration` | **PASS — 39/39 tests** |
| Focused Phase 4 browser gates | **PASS — 45/45 tests** |
| Visual refresh browser gates | **PASS — 12/12 tests** |
| OCR regression browser gates | **PASS — 27/27 tests** |
| `bunx tsc --noEmit` | **PASS** |
| `bun run lint` | **PASS — 0 errors; legacy warnings remain** |
| `bun run build` | **PASS** |

The broad legacy Playwright command remains non-green because older specs
assert superseded dashboard labels, navigation structure, and integer-only
money input behavior. Those failures are tracked as test-contract maintenance,
not as current revamp acceptance failures.

## Historical Phase 0 checks executed

| Command | Result | Evidence / notes |
|---|---|---|
| bun run test | **FAIL** — 52 files; 556 passed, 7 failed (563 tests total). | Full Vitest unit run completed. Failures detailed below. |
| bunx tsc --noEmit | **FAIL** — 7 TS2307 missing-module errors. | All errors originate from generated .next/dev/types/validator.ts references to absent app/financial-health/page and app/api/financial-intelligence/{health,insights,simulations/cashflow,simulations/purchase,simulations/savings-goal,summary}/route modules. No matching source route was found. Likely stale generated route types; do not delete or regenerate during this read-only audit. |
| bun run lint -- --max-warnings=0 | **FAIL** — 7 errors, 21 warnings. | Errors: components/dashboard/GoldSavingsCard.tsx (setState synchronously in effect); components/gold/GoldAssetModal.tsx (setState in effect and two explicit any types); components/gold/GoldPageView.tsx (setState in effect); components/layout/BottomNav.tsx (setState in effect); components/reports/MonthlyReport.tsx (setState in effect). Warnings include unused values, effect dependencies, and img optimization. |

## Historical unit test failures

| Test area | Failed assertion | Current code/document evidence | Initial classification |
|---|---|---|---|
| lib/server/contracts/goals.test.ts | Historical assertion expected savedDelta 1.5 to be rejected. | Current adjustSavedSchema accepts up to two decimal places via hasAtMostTwoDecimals; current schema uses NUMERIC(18,2). | Resolved by aligning the test with the authoritative two-decimal contract. |
| lib/server/services/goal.test.ts | Historical assertion expected non-integer saved delta to throw. | Same two-decimal contract behavior. | Resolved by aligning the test with the authoritative two-decimal contract. |
| lib/server/contracts/transactions.test.ts | Historical assertion expected amount 1.5 to be rejected. | createTransactionSchema validates at most two decimals; current money model supports two decimals. | Resolved by aligning the test with the authoritative two-decimal contract. |
| lib/server/contracts/wallets.test.ts | Historical assertion expected opening balance 1.5 to be rejected. | Wallet contract validates at most two decimals. | Resolved by aligning the test with the authoritative two-decimal contract. |
| app/api/reports/monthly/report-routes.test.ts | Same-scope transfer expected transferInMinor=200000; received 0. | Current report SQL/service and docs/design/08 describe transfer totals and neutral balance behavior; this route test uses an in-memory report seam. | Unresolved implementation/test-seam regression. Validate against the report fake and real repository in an isolated test environment before calling this a production bug. |
| components/reports/reportDetail.test.ts | Expected paired transfer rows to appear in the printable Transfer section; received no rows. | Current helper groupReportDetailRows skips every row when a transfer group has more than one visible row; current docs/design/08 requires printable Transfer details. | Strong likely implementation/spec regression affecting printed detail; triage before redesign report changes. |
| components/reports/reportDetail.test.ts | Expected a Transfer section and subtotal; only income section was produced. | Same grouping behavior; docs/design/08 requires the section when transfer detail exists. | Same likely regression, not a separate feature. |

The four integer-only tests were inconsistent with the decimal-aware contracts.
They were updated during closeout so the authoritative contract now accepts up
to two decimal places. Do not reintroduce integer-only validation.

## Existing QA and test evidence (historical snapshots)

These reports were inspected and are not re-executed by the current baseline:

- docs/qa/t009-f6-qa-report.md: rounds dated 2026-10-09; wallet/OCR flows passed with risks after fixes, with live external-service and some accessibility limitations.
- docs/dev-plan/feat-visual-refresh.md and docs/qa verification evidence: T-010 visual refresh acceptance dated 2026-10-21, recorded PASS WITH RISKS; tests/results and visual viewport captures are historical.
- docs/qa/t011-bank-institutions-qa-report.md: 2026-10-22 PASS WITH RISKS; 45/45 targeted tests and local viewport probes, but no production/Neon/live OJK validation and full integration suite had a stale T-008 harness failure.
- docs/qa/t012-ocr-retry-qa-report-round2.md: 2026-10-22 PASS WITH RISKS; focused tests/E2E/harness evidence recorded. A same-task duplicate manual submit produced two transactions in a non-gating probe and was explicitly left out of scope.
- docs/qa/verification-matrix.md: QA-owned matrix with feature evidence and risks; statuses are dated, not a current blanket pass.
- Workspace sibling ../docs/qa/audit-2026-10-visual-refresh/: visual/evidence gates through 2026-10-22, not a current application QA run.
- reports/state-coverage.json: lexical marker scan over 267 files; useful for locating state code, not evidence that each state renders correctly.
- test-results/: historical Playwright screenshot artifacts exist, including theme images; timestamped artifacts do not replace current visual review.

## Available but not run

- bun run test:integration — Vitest integration configuration; database environment/fixture requirements must be reviewed before execution.
- bun run test:e2e — Playwright routes and user flows; requires suitable app/database fixtures and may create state.
- bun run build — Prisma generation plus Next production build; writes generated/build artifacts.
- Targeted tests exist for auth, dashboard, budget, goals, transactions, OCR, wallets/institutions, reports, gold, and theme.

## Historical baseline conclusion

This section records the pre-revamp baseline only. Report transfer behavior,
money precision, type-checking, and lint blockers were resolved or reclassified
during the 2026-11-13 closeout; use the current revamp closeout table above for
release-readiness decisions.
