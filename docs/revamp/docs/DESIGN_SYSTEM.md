# FinDiary — Design System

This document defines the intended visual foundation. The agent must first inspect existing styles and dependencies, then map these tokens into the project's current styling approach. Do not introduce a second styling system.

## 1. Design principles

- Mobile-first.
- Clear hierarchy.
- Restrained use of color.
- Consistent spacing and shape.
- Strong readability in both themes.
- Financial data must be easy to scan.
- Motion is subtle and purposeful.

## 2. Color tokens

Treat these as initial design targets. Validate contrast and adjust only with documented reason.

### Light theme

| Token | Suggested value | Usage |
|---|---|---|
| `background` | `#F7F9F7` | App canvas |
| `surface` | `#FFFFFF` | Cards, sheets, menus |
| `surface-subtle` | `#EFF4F0` | Secondary regions |
| `primary` | `#16764F` | Primary actions and brand |
| `primary-hover` | `#105E3E` | Hover/pressed |
| `primary-soft` | `#E3F3EA` | Subtle highlights |
| `text-primary` | `#202923` | Main text |
| `text-secondary` | `#68776E` | Supporting text |
| `border` | `#E2EAE4` | Dividers and outlines |
| `income` | `#168653` | Income semantics |
| `expense` | `#D95E54` | Expense semantics |
| `warning` | `#B7791F` | Warning |
| `info` | `#3478B9` | Informational |
| `shared` | `#3979C8` | Shared scope accent |
| `gold` | `#B88A2E` | Gold asset semantics |

### Dark theme

| Token | Suggested value | Usage |
|---|---|---|
| `background` | `#101713` | App canvas |
| `surface` | `#19231E` | Cards, sheets |
| `surface-subtle` | `#202D26` | Secondary regions |
| `primary` | `#55C995` | Primary actions and brand |
| `primary-hover` | `#70D9A8` | Hover/pressed |
| `primary-soft` | `#203F30` | Subtle highlights |
| `text-primary` | `#EDF4EF` | Main text |
| `text-secondary` | `#A2B1A8` | Supporting text |
| `border` | `#2A3931` | Dividers and outlines |
| `income` | `#55C995` | Income semantics |
| `expense` | `#FF8176` | Expense semantics |
| `warning` | `#E6B65C` | Warning |
| `info` | `#75AEE8` | Informational |
| `shared` | `#79ADEC` | Shared scope accent |
| `gold` | `#E1BC65` | Gold asset semantics |

Do not communicate income/expense/shared status using color alone; include labels, signs, icons, or other cues.

## 3. Typography

Use the existing font if it is legible and consistent. If choosing a new font, prefer a modern sans-serif with good Indonesian glyph support, numerals, and variable weights. Avoid loading multiple font families without reason.

Suggested hierarchy:
- Display: 28–32 px mobile, used sparingly.
- Page title: 22–26 px.
- Section title: 16–18 px.
- Body: 14–16 px.
- Supporting: 12–13 px.
- Numeric emphasis: tabular numerals where supported.

Use clear weight contrast rather than oversized text. Financial amounts should align consistently.

## 4. Spacing and layout

Use a consistent 4 px base scale:
- 4, 8, 12, 16, 20, 24, 32, 40, 48.

Suggested mobile page padding: 16–20 px, adjusted for device safe areas. Desktop content should have a readable max width and not stretch data across excessively wide screens.

## 5. Shape and elevation

- Small control radius: 10–12 px.
- Standard card radius: 16–20 px.
- Large feature surface: 20–24 px.
- Pill radius only for chips and compact status labels.
- Prefer subtle borders and surface contrast over heavy shadows.
- Use elevation only when it clarifies layering.

Avoid every element becoming a rounded card. Use section headings, dividers, spacing, and typography to create hierarchy.

## 6. Icons

- Use one consistent icon family already installed in the project where possible.
- Prefer simple outline icons with consistent stroke weight.
- Use filled variants only for active navigation or meaningful emphasis.
- Never mix arbitrary icon packs.
- Do not use emoji as a substitute for functional interface icons.

## 7. Data visualization

Charts must:
- Represent real data and label periods/units.
- Include a legend where needed.
- Support empty and insufficient-data states.
- Use accessible colors and textual summaries.
- Avoid 3D effects, excessive gradients, and decorative chart noise.
- Respect theme colors.
- Clearly distinguish actual values from estimates.

## 8. Surfaces and cards

Use cards when grouping information or actions materially improves comprehension. Do not wrap every label and value in separate cards. Prioritize:
1. Primary financial summary.
2. Important trend or progress.
3. Actionable insight.
4. Supporting activity.

## 9. Motion

- Use short, subtle transitions for state changes.
- Avoid continuous decorative animation.
- Respect reduced-motion preferences.
- Mascot animation, if approved, must be optional and non-blocking.

## 10. Theme implementation

Use semantic tokens rather than hardcoded colors in components. Theme must cover:
- App shell and navigation.
- Cards, dialogs, bottom sheets, dropdowns.
- Inputs, validation, focus states.
- Charts and data visualization.
- Toasts, alerts, badges.
- Empty/loading/error states.
- Mascot and illustration assets.

Theme preference should follow the existing persistence mechanism if available. Do not introduce a new persistence dependency without need.

## 11. Implemented foundation (2026-11-11)

The application now uses the following semantic values in `app/globals.css`. They replace the initial targets above where contrast or dark-theme comfort required an adjustment, and they are the source of truth for new screens.

| Light token | Value | Usage |
|---|---|---|
| `canvas` | `#F6F9F7` | App canvas |
| `card` | `#FFFFFF` | Cards and sheets |
| `surface-subtle` | `#F1F5F2` | Secondary wells |
| `primary` | `#16764F` | Brand, primary actions, income |
| `primary-hover` | `#105E3E` | Hover and pressed |
| `primary-soft` | `#E3F3EA` | Mint highlights |
| `ink` | `#17231C` | Main text |
| `ink-2` | `#52635A` | Supporting text |
| `ink-3` | `#5F6E65` | Muted text |
| `border` | `#E2EAE5` | Card outlines and dividers |
| `expense` | `#D95E54` | Expense bars and signs |
| `danger` | `#B91C1C` | Expense text and errors |
| `warning` | `#8A5A00` on `#FDF3D7` | Budget warnings |
| `gold` | `#8A5A00` | Gold asset text |
| `shared` | `#0F766E` | Shared-scope secondary accent |

| Dark token | Value | Usage |
|---|---|---|
| `canvas` | `#08140E` | App canvas |
| `card` | `#0F2218` | Cards and sheets |
| `surface-subtle` | `#13291E` | Secondary wells |
| `primary` | `#16764F` | Solid primary buttons |
| `primary-text` | `#4ADE80` | Green text and icons |
| `ink` | `#ECFDF3` | Main text |
| `ink-2` | `#B7C9BE` | Supporting text |
| `ink-3` | `#93A99C` | Muted text |
| `border` | `#1E3A2A` | Card outlines and dividers |
| `expense` | `#FB7185` | Expense bars and signs |
| `warning` | `#FBBF24` | Budget warnings |
| `gold` | `#F2C56D` | Gold asset text |
| `shared` | `#5EEAD4` | Shared-scope secondary accent |

Documented adjustments:
- `ink-3` is `#5F6E65` instead of `#68776E` so 12 px helper text reaches about 5.0:1 on the canvas.
- The dark canvas is `#08140E` and cards are `#0F2218` for a calmer night surface.
- Expense bars use `#D95E54`; expense text uses the darker `#B91C1C` so small labels pass AA.
- Hero secondary labels use white at 90% opacity or dark translucent chips, never white/75, white/80, or white/85 on green.

## 12. Screen status

| Screen | Status | Evidence |
|---|---|---|
| Beranda | Implemented; light/dark at 390 and 1440 | `docs/revamp/screenshots/home/` |
| Budget | Not started; needs a category-budget decision | n/a |
| Aktivitas | Not started; data and filters exist | n/a |
| Wallet | Not started; data and wallet management exist | n/a |

Home deliberately shows the household balance as the hero and the personal balance as a separate amount. The two scopes are never summed. The monthly summary is shared scope, and the recent list keeps all scopes so personal rows remain visible.
