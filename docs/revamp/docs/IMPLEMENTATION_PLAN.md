# FinDiary — Implementation Plan

## 1. Strategy

Use incremental redesign, not a blind rewrite. Preserve the current architecture unless discovery demonstrates a concrete need to change it.

## 2. Phase gates

### Gate 0 — Discovery complete
Required:
- Repository map.
- Route/screen inventory.
- Feature parity matrix.
- User flow map.
- Data/integration map.
- Existing design audit.
- Test baseline.
- Risks/open questions.

Product owner reviews before implementation.

### Gate 1 — Design foundation
Implement:
- Semantic color tokens.
- Typography and spacing tokens.
- Light/dark theme behavior.
- Core primitives.
- Focus and accessibility states.

Verify tokens against representative screens in both themes.

### Gate 2 — App shell
Implement:
- Responsive navigation.
- Page container and headers.
- Context selectors.
- Quick action entry point.
- Theme control if existing or approved.

Verify every discovered route remains reachable.

### Gate 3 — Core daily workflows
Prioritize the most frequently used screens discovered in audit, likely:
- Home.
- Transaction capture.
- Activity list/detail.
- Budget.

Do not assume priority without checking product usage signals if available.

### Gate 4 — Asset and wallet workflows
Implement discovered wallet and gold asset pages and their detail/create/edit flows.

### Gate 5 — Shared finance
Implement household/shared views, member and permission states, and approval flows where they exist.

### Gate 6 — Remaining product surfaces
Complete every other discovered route:
- Authentication.
- Onboarding.
- Settings.
- Reports.
- Categories.
- Notifications.
- Exports.
- Other discovered functionality.

### Gate 7 — Final QA and polish
- Responsive matrix.
- Theme matrix.
- Accessibility.
- Regression.
- Visual consistency.
- Documentation update.

## 3. Work slicing

Each task should be small enough to review. A task must specify:
- Screen/component IDs.
- Scope and non-scope.
- Existing behavior to preserve.
- Dependencies.
- Tests.
- Acceptance criteria.

Avoid broad tasks such as “redesign the whole app” in one agent execution.

## 4. Git and safety

- Inspect current branch and working tree first.
- Do not overwrite unrelated user changes.
- Use existing branch conventions.
- Keep commits or changes logically grouped if requested.
- Avoid mass formatting unrelated files.
- Do not delete old components until all references and replacement coverage are verified.

## 5. Rollback

For high-risk changes, document:
- Files/routes affected.
- Previous behavior.
- How to revert.
- Data/API compatibility implications.

## 6. Progress tracking

Maintain a table in the audit feature parity matrix:
- Not audited.
- Audited.
- Specified.
- In progress.
- Implemented.
- Verified.
- Blocked.

A screen is not “Verified” until functional and visual checks have both passed.

## 7. Phase 0 audit-derived proposal (2026-11-11)

This section appends a project-specific proposal to the existing plan; it does not authorize implementation. The product owner approved a total redesign and explicitly superseded the previous design standard. Existing capabilities and business/data/privacy behavior remain the baseline.

### Before implementation

1. Review the eight Phase 0 deliverables under docs/revamp/docs/audit/.
2. Triage the report-transfer behavior and reconcile the decimal-money contract with its tests/comments. **Completed 2026-11-13:** transfer behavior and two-decimal money support are covered by current tests.
3. Establish a clean, recorded type/lint/test baseline, separating stale generated output and legacy test expectations from application defects. **Completed 2026-11-13:** current unit, integration, type, lint, build, and focused browser gates are green.
4. Confirm the full route and embedded-flow inventory, including wallets, reports, institution picker, OCR retry, gold, profile/theme, and role-dependent family states.

### Proposed redesign sequence after approval

1. Approve visual direction, brand decisions, typography, semantic tokens, and light/dark system as one coherent foundation.
2. Redesign the shared app shell and navigation while preserving every current destination and add intent.
3. Redesign Home, Activity/manual transaction, and report workflows; treat transfer totals, print detail, money precision, and personal/shared boundaries as protected acceptance checks.
4. Redesign Budget/goals/advisor, wallets/institution selection, Family, Gold, authentication, and Profile using the parity matrix; keep routes and API contracts stable unless separately approved.
5. Verify all embedded forms, sheets, dialogs, error/empty/loading states, and role-based controls at mobile, tablet, and desktop sizes in both themes.
6. Run regression and visual QA, update parity status with evidence, and record unverified external/live integrations explicitly.

### Scope gates and closeout

- Phase 1 or implementation is not approved by this proposed order.
- Any new product capability, data/API/auth change, money formula/precision change, permission change, or feature removal needs a separate decision.
- The existing generic plan remains intact above; this proposal is additive and should be revised after product review.
- Phases 1–5 are complete. Remaining broad legacy Playwright failures are test-contract maintenance and are documented separately from revamp acceptance.
