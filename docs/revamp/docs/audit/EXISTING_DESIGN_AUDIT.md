# Existing Design Audit — Phase 0

**As of:** 2026-11-11  
**Scope:** Existing design documents, QA findings, and current implementation cross-check. This reuses and evaluates prior evidence; it does not reproduce the large October mockup/audit package.

## Existing source set and status

| Source | What it contributes | Current assessment |
|---|---|---|
| docs/design/01–08 | Approved T-010 tokens, page flows, wallets, bank institutions and reporting; docs/design/README.md identifies canonical docs versus evidence-only artifacts. | Valuable for current interactions, constraints and route history. Its old palette approval was explicitly superseded for the total redesign on 2026-11-11. |
| Workspace sibling ../docs/qa/audit-2026-10-visual-refresh/README.md and HTML/PNG evidence | Detailed visual review through R-18 (2026-10-22), route/state mockup catalogs, contrast and viewport review logs. | Evidence-only, explicitly non-canonical. Useful for identifying real data/UI states and past layout pitfalls; do not treat mockup values or old palette as requirements. |
| Workspace sibling ../docs/qa/user-journey-map.md | Auth, household, transaction/OCR, trash, and wallet journey scenarios. | Living-document header is dated 2026-10-05, with T-009 addenda through 2026-10-09. Scenarios remain useful, but top-level scope/status is outdated against current code. |
| docs/qa/verification-matrix.md | QA-owned acceptance/evidence matrix across feature tickets. | Keep as QA source. Its Pass results are date/environment-specific, and it contains explicit risks and not-tested states. |
| docs/qa/t009-f6-qa-report.md | Wallet/OCR behavior and responsive/accessibility retest. | Historical 2026-10-09 evidence; later T-011 and current implementation add capabilities. |
| docs/qa/t011-bank-institutions-qa-report.md | Private institution catalog, archive/restore, authorization and seed verification. | Historical 2026-10-22 PASS WITH RISKS; useful for scope/privacy and flow parity. It did not validate production/live OJK and remains non-release evidence. |
| docs/qa/t012-ocr-retry-qa-report-round2.md | OCR retry and add-intent race retest. | Historical 2026-10-22 PASS WITH RISKS. It records a same-tick duplicate manual-submit probe as out of scope; recheck current code during later QA. |
| reports/state-coverage.json | Automated lexical marker scan of 267 files for state-related terms. | Presence scan only; not proof that each screen has correct or reachable states. Do not substitute it for screen review. |
| docs/current-state.md | Current implemented product summary and API map. | Best written baseline for current product scope; source cross-check mostly agrees. It warns that QA docs are snapshots. |

## What remains valid from prior findings

- Preserve the full route and embedded-flow scope: authentication, onboarding/account lifecycle, activity details, sheets/dialogs, wallet selectors, role-specific family screens, empty/error states and nested flows.
- Keep financial totals grounded in server data. Never copy sample/mockup figures as live data or infer unsupported budget thresholds/status chips.
- Preserve separate personal/shared balances and scopes, authorization, transaction transfer semantics, OCR review-before-save, and server-computed report totals.
- Wallet metadata must not imply bank connectivity or expose account/card identifiers.
- Cursor-based activity uses “load more,” not fabricated page counts.
- Narrow-width testing must check long rupiah values, picker rows, modal/sheet overlap, safe-area/navigation overlap, and focus behavior.
- Older QA correctly distinguishes a test/harness defect from a product defect and records live integration limitations; keep that evidence discipline.

## Findings compared with current implementation

| Area | Historical finding / decision | Current implementation check | Redesign disposition |
|---|---|---|---|
| Visual language | T-010 and docs 01–06 approved blue/white/green and ATM-style wallet cards. | Current tokens and wallet cards implement that direction. | Product owner explicitly said to disregard the old design standard and pursue a total revamp. Palette, card metaphor, layout and typography can be reconsidered. Preserve wallet meaning and data integrity. |
| Dark theme | T-010 excluded a new dark-mode/theme scope; later source/specs include system/light/dark theme control and bootstrap. | ThemeControl, app layout bootstrap and theme E2E files exist. | Old T-010 exclusion is outdated. Treat existing theme preference as behavior to preserve while redesigning both themes. |
| Wallets | Early user-journey map says F6 was not implemented; later audit adds bank selection/archive flows. | Current wallet components, 47 API routes, institution service, schema models and T-009/T-011 evidence confirm implementation. | Mark early “not started” status obsolete; later behavior evidence remains useful. |
| Reporting | T-010 visual audit predates reporting; design 08 documents a monthly report and print details. | Current Activity query view, MonthlyReport component and report API exist. Current report unit/API tests fail on transfer cases. | Do not treat older visual evidence as report coverage. Resolve current report test discrepancies before claiming report parity. |
| Responsive/a11y | R-13/R-16/R-18 evidence records corrections at narrow viewports and prior wallet focus/touch defects. | Source includes responsive breakpoints, focus traps, role/ARIA states; current lint errors remain. No fresh visual or screen-reader run was performed. | Reuse defect scenarios, rerun current screens later. Historical PASS does not establish current PASS. |
| Status markers | reports/state-coverage.json says all lexical state markers were found. | Actual source has states, but a term scan cannot validate branch reachability/copy/recovery. | Retain as an inventory hint only; verify each state functionally in later QA. |

## Duplicate audit control

- The existing sibling journey map remains the detailed QA journey source; USER_FLOW_MAP.md is a current-state cross-check, not a replacement or verbatim copy.
- The October visual audit and image catalogs remain evidence-only and untouched.
- docs/qa/verification-matrix.md remains the acceptance/results record. This redesign audit points to it rather than reproducing its test-case rows.
- The new Phase 0 deliverables live only under docs/revamp/docs/audit/, as required by the redesign package.

## Current visual observations from source

- Signed-in pages use AppShell with mobile bottom navigation and a desktop/tablet floating navigation.
- Page content uses shared PageHeader, card/button/form primitives, responsive breakpoints, semantic color tokens, and Plus Jakarta Sans.
- Current theme preferences support system/light/dark.
- Dashboard and wallet components deliberately render separate personal/shared amounts; budget status threshold chips are not rendered.
- Wallet cards are abstract ATM-like surfaces with scope, name, purpose, balance and actions, without bank card/account identifiers.
- These describe the present baseline, not a prescribed destination for the new design.

## Limits

This was a source/document review plus automated checks, not fresh screenshot review of every route. Theme, mobile, tablet, desktop, screen-reader, keyboard, browser-console, live provider and production behavior remain unverified in this Phase 0 pass.
