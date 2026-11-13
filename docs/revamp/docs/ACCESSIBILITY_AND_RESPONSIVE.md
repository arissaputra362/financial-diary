# FinDiary — Accessibility, Responsive & Theme Requirements

## 1. Responsive strategy

Mobile-first is mandatory. Use the project's existing breakpoint system where possible; do not introduce conflicting breakpoints.

Suggested validation widths:
- 320 px: minimum narrow mobile.
- 360–390 px: common mobile.
- 430 px: large mobile.
- 768 px: tablet portrait.
- 1024 px: tablet/compact laptop.
- 1280–1440 px: desktop.

These are test widths, not rigid breakpoint mandates.

## 2. Mobile requirements

- No unintended horizontal overflow.
- Primary actions reachable without awkward scrolling where practical.
- Touch targets ideally at least 44 × 44 CSS px.
- Forms remain usable with the on-screen keyboard.
- Bottom navigation respects safe areas.
- Sticky controls must not obscure content.
- Dense tables should become readable cards or intentionally scrollable regions.
- Charts must remain legible and provide summaries.

## 3. Tablet and desktop

- Use available width intentionally.
- Keep readable line lengths.
- Use multi-column layouts only when they improve scanning.
- Do not stretch transaction rows or charts excessively.
- Desktop navigation must remain discoverable.
- Preserve feature parity across breakpoints.

## 4. Accessibility

- Semantic headings and landmarks.
- Keyboard navigation for interactive controls.
- Visible focus states.
- Labels for form fields.
- Accessible names for icon-only buttons.
- Sufficient text/background contrast.
- Do not use color alone to convey status or transaction type.
- Respect reduced-motion preferences.
- Support screen readers for charts through textual summaries or equivalent data.
- Error messages must be programmatically associated with fields where applicable.

## 5. Theme parity

Verify every discovered screen in both light and dark themes:
- Text and muted text.
- Borders and dividers.
- Input surfaces and placeholders.
- Focus, hover, active, disabled states.
- Charts and legends.
- Alerts and status indicators.
- Dialogs, menus, bottom sheets.
- Images and illustrations.

Do not simply invert colors. Dark mode should use layered surfaces and carefully controlled contrast.

## 6. Visual QA matrix

For each screen, test:
- Mobile light.
- Mobile dark.
- Tablet light.
- Tablet dark.
- Desktop light.
- Desktop dark.

Prioritize all primary workflows. If a combination is not tested, record it as a gap rather than claiming full verification.
