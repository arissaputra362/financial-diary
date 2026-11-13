# FinDiary — QA & Acceptance Criteria

## 1. Global acceptance

A revamp is accepted only when:
- All discovered screens are listed in the feature parity matrix.
- No existing feature has been silently removed.
- All navigation destinations resolve correctly.
- Primary user workflows work end-to-end.
- Business logic and financial calculations remain correct.
- Both themes are usable and visually coherent.
- Mobile-first layouts work without unintended overflow.
- Tablet and desktop remain usable.
- Loading, empty, error, and success states are intentional.
- No high-severity accessibility issue remains.
- Build, lint, type checks, and relevant tests pass or exceptions are documented.

## 2. Functional regression

Verify all existing behavior for:
- Authentication and session.
- Navigation and deep links.
- Transaction create/read/update/delete where supported.
- Income/expense/transfer handling.
- Category selection and management.
- Budget creation, editing, monitoring, and calculations.
- Wallet creation, editing, balance, and transfers where supported.
- Receipt capture/upload, extraction, review, and save.
- Gold asset recording, history, and calculations.
- Shared finance, invitations, roles, permissions, and approvals.
- Reports, exports, and print flows.
- Profile, settings, and theme persistence.

Only test flows that exist; add discovered flows to this checklist.

## 3. Visual acceptance

- Clear page hierarchy.
- Consistent typography and spacing.
- Semantic color usage.
- No excessive cards or decoration.
- Consistent icon family.
- Proper alignment of currency amounts.
- Clear labels and date ranges.
- Charts are meaningful and readable.
- Empty states guide the next action.
- Mascot use is restrained and consistent.
- Light/dark mode both receive visual review.

## 4. Responsive acceptance

- Test at widths listed in `ACCESSIBILITY_AND_RESPONSIVE.md`.
- No clipped controls or overlapping text.
- No accidental horizontal scrolling.
- Forms and bottom sheets fit available height.
- Navigation remains usable.
- Data visualizations remain understandable.

## 5. Technical acceptance

Run available:
- Unit tests.
- Integration tests.
- End-to-end tests.
- Lint.
- Type check.
- Production build.
- Dependency/security checks where already configured.

Do not add a large testing dependency solely for cosmetic reasons. Prefer existing tooling and add targeted coverage where needed.

## 6. Required evidence

For each milestone, provide:
- Changed files.
- Screens completed.
- Before/after screenshots where possible.
- Test commands and results.
- Known issues.
- Unverified combinations.
- Updated feature parity matrix.

## 7. Severity

- Critical: data loss, unauthorized data access, broken core workflow.
- High: financial values incorrect, primary workflow blocked, route inaccessible.
- Medium: significant UX or responsive defect with workaround.
- Low: cosmetic inconsistency or minor polish.

No Critical or High issues may remain at release.
