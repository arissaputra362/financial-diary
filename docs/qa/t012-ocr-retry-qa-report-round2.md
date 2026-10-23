# T-012 Round 2 QA Report: OCR retry conflict + add-intent race

- Date: 2026-10-22
- Scope: re-verify BUG-1 (global Add intent race after closing the sheet) and BUG-2 (retry conflict dead end), plus regression of the touched flows.
- Ticket: `../tickets/15-T-012-ocr-retry.md`
- Environment: Next dev server on port 3033, local PostgreSQL `financial_planner_t003`, Playwright mobile-390 and desktop-1280. OCR responses mocked at the browser boundary (no live Gemini or Vercel Blob calls).
- Production code changed during QA: none.

## Verdict

**PASS WITH RISKS**

BUG-1 and BUG-2 are fixed and hold under measurement. All required gates are green. Two non-blocking risks remain (unbounded PROCESSING polling, same-tick duplicate submit, tracked as BUG-3 and out of this ticket's scope). T-012 is ready for PM acceptance; the ticket is not marked done by QA.

## Defect verification

### BUG-1: global Add race after close: RESOLVED

768/768 measured attempts passed (384 mobile-390, 384 desktop-1280).

| Counter | mobile-390 | desktop-1280 |
|---|---|---|
| attempts | 384 | 384 |
| opened | 384 | 384 |
| stayedOpen | 384 | 384 |
| cleanUrl (no `add=1`) | 384 | 384 |
| historyStable | 384 | 384 |
| viewPreserved (month/Trash) | 384 | 384 |
| reopen latency median / max | 4-5 ms / 15 ms | 4-5 ms / 11 ms |

- Matrix: close via X, Batal, Escape, backdrop; month and Trash views; Add tapped at 0/50/100/150 ms with no URL-cleanup wait.
- At 0 ms the sheet opens while `add=1` is still present (`addPresentAtClose` up to 12/12 for X, 11/12 for Batal), proving the fix does not depend on URL cleanup.
- Round 1 baseline was 5/12 failures at 0 ms; round 2 has 0 failures in 48 zero-delay attempts per viewport.
- Mechanism: synchronous add-intent channel (`lib/transaction-add-intent.ts`) consumed by `ActivityView`, plus a fallback in `BottomNav`/`FloatingNavbar`. Global Add no longer relies on the URL.

Lifecycle and save checks (both viewports):
- Two close/reopen cycles, then a third open after save: clean empty manual form, history length unchanged.
- Save writes the URL exactly once (`replaceState` count +1), settles at `/transactions?month=2025-03`, and creates exactly one 12500 transaction.
- Global Add tapped immediately after save (no settle wait) opens a clean sheet.
- Cycles suite repeated with `--repeat-each=2`: 8/8 passed.

### BUG-2: retry conflict dead end: RESOLVED

8/8 scenarios passed (4 scenarios x 2 viewports), plus server-side integration evidence.

| Scenario | Result |
|---|---|
| Tab A retry succeeds, tab B taps `Pindai ulang` | Tab B reaches editable review, no dead end |
| Tab A retry lands FAILED | Tab B hydrates the newest FAILED attempt and retries `job-2` |
| Latest attempt stays PROCESSING | In-progress notice, no `Pindai ulang`, poll paced >= 1.5 s, poll stops after close |
| Two tabs race | In-progress first, then resolves to editable review |

- Server service evidence: `lib/server/services/ocr-retry.integration.test.ts` 4/4 passed against real PostgreSQL.

## Remaining and out-of-scope defects

### BUG-3: same-tick duplicate manual save (confirmed, out of scope)

- Severity: Minor (P3). Pre-existing, unrelated to BUG-1/BUG-2, not fixed by this ticket.
- Repro: two `form.requestSubmit()` calls in the same task while save is in flight.
- Expected: one transaction. Actual: two transactions (amount 8888). A real Playwright `dblclick()` produced one transaction, so the guard holds for normal user input.
- Likely cause: `idempotencyHeaders()` in `lib/api-client.ts` mints a new key per call, so the second submit is a distinct idempotent request.
- Impact: duplicate transaction only via synthetic/same-tick double submit; recommend a separate ticket.

## Suspected risks and gaps

- P3: PROCESSING polling has no cap or timeout and re-uploads the full multipart body every ~2 s. It stops on close/unmount, but a server-side stuck PROCESSING job keeps tab B in the notice and blocks retry (already a documented dev-plan risk).
- P4: post-save URL cleanup lands roughly 100-300 ms after the success toast (Next RSC round trip). `add=1` can be transiently visible; no data impact.
- P4: `handleSheetClose` writes the URL for locally opened sheets too, so closing can add `?month=` even when the sheet was not opened through the URL. `replaceState` keeps history stable.
- Harness-only flake: one intermediate combined run failed the cycles test on both viewports (mobile ledger returned `[]`, desktop replaceState counter 0). The 12500 rows from that run exist in PostgreSQL, and three subsequent runs passed (isolated 2/2, full harness 4/4, repeat-each 8/8). Not filed as a product defect; triage only if it recurs.
- No live Gemini or Vercel Blob validation. No real second device or network partition; the two-tab conflict is simulated with two pages and per-page route mocks.
- Race timing was measured on a dev server, not a production build. The synchronous intent logic is unchanged by bundling, but the latency numbers are dev-mode numbers.
- `docs/qa/harness` is excluded from `tsconfig.json`, so QA harness specs are not type-checked by `tsc --noEmit`.

## Commands executed

| Command | Result |
|---|---|
| `bunx tsc --noEmit` | exit 0, clean |
| targeted `bunx eslint` on touched files and both e2e specs | exit 0 |
| `bun run test` | 42 files, 395 tests passed |
| `bunx playwright test e2e/transaction-add-intent.spec.ts e2e/ocr-retry.spec.ts --workers=1` | 63/63 passed (1.6 m, mobile/tablet/desktop) |
| harness: race spec (both viewports) | 768/768 attempts passed |
| harness: two-tab spec (both viewports) | 8/8 passed |
| harness: cycles spec (both viewports) | 4/4 passed; repeat-each=2 run 8/8 |
| harness: a11y spec (both viewports) | 6/6 passed |
| harness: BUG-3 probe (non-gating) | real dblclick 1 txn; same-task double submit 2 txns |
| `bunx vitest run -c vitest.integration.config.mts lib/server/services/ocr-retry.integration.test.ts` | 1 file, 4 tests passed |

## Evidence

- `docs/qa/harness/t012-round2/results-race-round2.json`: combined race totals, both projects.
- `docs/qa/harness/t012-round2/logs/qa-t012r2-harness.log`: race JSON per project, cycles, a11y, BUG-3.
- `docs/qa/harness/t012-round2/logs/qa-t012r2-twotab.log`: BUG-2 8/8 after the pacing-assertion fix.
- `docs/qa/harness/t012-round2/logs/qa-e2e-round2.log`: official 63/63.
- Harness specs: `t012-race`, `t012-two-tab`, `t012-cycles`, `t012-a11y`, `t012-bug3` under `docs/qa/harness/t012-round2/`.

Harness iterations (for audit): the first race spec omitted the reopen click (0/384 false failures); the first two-tab pacing assertion counted the hydration request (2 false failures). Both were QA harness bugs, fixed before the green runs above.
