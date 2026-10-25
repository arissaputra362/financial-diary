# Design System Tokens & Guidelines: Bento Financial Planner

## 0. Canonical status & change note

- **Status: PM-approved for T-010 visual refresh (2026-10-20).** This sign-off covers palette, typography hierarchy, icon/nav language, and wallet card treatment. Business behavior and feature scope remain governed by their Specs.
- **Author role:** UI/UX Designer (owner of `docs/design/`).
- **Last updated:** 2026-10-20 (typography correction: single font family, Plus Jakarta Sans, with `tabular-nums` for money, per T-010 final review). Earlier same-day: token parity with the active mockup CSS, R-25; all readable text pairs now measured and canonical, including disabled-state text; money-out semantics synced to the active blue/neutral treatment.
- **Supersedes:** the warm pastel palette (peach/lavender/coral, canvas `#F7F4EF`) that earlier versions of this document prescribed. Those colors are removed from all active tokens. History of the change lives in `docs/design/audit-2026-10-visual-refresh/` (revisions R-9 to R-16), which is **evidence-only**, not canonical.
- **User-approved direction being encoded (2026-10-19/20):** overall theme **blue, white, green** (R-10); wallet card uses a **generic ATM/debit-style card metaphor** (R-11); home ordering follows R-9 (see doc 02). These are user decisions recorded in the audit README; they are treated here as approved design direction pending formal PM sign-off of this document.
- **Scope guardrail:** these tokens are visual only. They do not change business rules, permissions, routes, or vocabulary. Ticket references: **T-010** (UI visual refresh, blocked pending canonical sign-off), **T-011** (bank institutions feature, see `07-bank-institutions.md`).
- **Change pass revision (2026-10-22, second pass, PM review requested; not a rewrite of the T-010 sign-off):** this pass incorporates the user's confirmed decisions and the technical review of the first 2026-10-22 proposal. Changes since the first pass: (a) the 90D chart now uses **date-aligned weekly buckets (about 13 bars)** aggregated client-side from the existing daily values, replacing the earlier 90 thin daily bars (§5.4); (b) the bottom navigation spec moves to its own numbered subsection **§5.2a** so cross-references resolve (README previously cited §5.2a without a heading existing); (c) the chart-scope default matches the code (`7D`, §5.3a); (d) the contribution form drops its optional note field (scope trim, user decision, doc 02 §8). No token values change; all T-010 approved values are untouched.
- **Proposed change pass (2026-10-22, designer-authored, PM review requested; not a rewrite of the T-010 sign-off):** four token-level additions, all inside the existing blue-white-green system with no new palette, no new route, and no new nav destination:
  1. **§5.2a Bottom navigation upgrade.** The mobile bottom nav keeps its five existing items and navy shell (A-27/A-31), but current labels render at 10px and the active treatment reads weak. New floor: full item touch area `min-h-[56px]`, label `text-[11px]`, and a two-signal active state (tint pill + label weight). Hierarchy rationale and the item-by-item spec live in §5.2a and doc 02 §7.
  2. **§5.3a Scope mode control (`Pribadi / Bersama`).** The budget mode and the spending-chart scope each use their own independent segmented pill, built from the existing segmented-control pattern (§5.3) plus the wallet scope language from doc 06 (C-23). No new component family.
  3. **§5.4 90D weekly buckets.** The 90D mobile chart moves from 90 daily bars to about 13 weekly bars computed client-side from the daily values the chart already receives. The weekly sum is exact; this is a display grouping, not a changed finance calculation.
  4. **§5.8 IDR live grouping for money inputs.** Amount fields in budget targets, savings goal targets, add-to-savings, and manual entry accept up to two decimal digits with Indonesian live formatting.
  All four are **proposed for PM review**; nothing here auto-changes business rules.

## 1. Overview & Aesthetic Philosophy

The Financial Planner MVP is built around a **Modern Bento Box** dashboard layout. It reads as a real finance app: calm, trustworthy, blue-white-green. Tailored for everyday laypeople, families, and students.

### Core Principles
1. **Calm Yet Reassuring:** a blue-white canvas with green as the single action accent. Color is functional: blue carries money/structure identity, green carries action and positive money, yellow and red appear only as status. No decorative gradients (no generic blue-purple gradient; antislop R-01, R-29).
2. **Softness & Touchability:** high corner radii (`rounded-3xl` for cards, `rounded-full` for buttons and badges). Everything feels approachable, not corporate.
3. **Bento Organization:** information sits in distinct, bite-sized container cards, creating clear visual hierarchy and effortless scanning.
4. **No Accounting Jargon:** replace *Accounts Payable/Receivable, Debit/Credit, Reconciliation* with *Uang masuk, Uang keluar, Uang tersedia, Target tabungan*.

### 1.1 Plain-language interaction contract
The interface must be understandable without a guide. Every visible action follows these rules:

| Rule | Use | Avoid |
| :--- | :--- | :--- |
| Name the result | `Tambah transaksi`, `Simpan perubahan`, `Izinkan bergabung` | `Submit`, `Continue`, `Approve access` |
| Use everyday money language | `Uang masuk`, `Uang keluar`, `Mau menabung untuk apa?` | `Income`, `Expense`, `Ledger` |
| Explain AI in the helper text | `Scan struk` + `AI membaca detailnya untukmu` | `AI OCR`, nama model AI |
| Keep one primary action per area | One filled green pill per section | Several filled buttons with equal emphasis |
| Make the next step obvious | `Periksa detail ini`, lalu `Simpan ke catatan keluarga` | `Review`, `Confirm`, or an unlabeled icon |

**Button formula:** `[verb] + [plain object or outcome]`. Keep labels to two to five words when possible. Put nuance in a short supporting sentence, not in a technical button label.

**Approved vocabulary (Bahasa Indonesia kanonik, A-30):**

| Konsep | String kanonik (UI) | Jangan pakai |
| :--- | :--- | :--- |
| Dashboard | **Beranda** | Dashboard, Overview |
| Household | **Keluarga** | Household, Ledger |
| Pending approval | **Menunggu persetujuan** | Pending, Waiting room |
| Expense | **Uang keluar** | Expense, Debit |
| Income | **Uang masuk** | Income, Kredit |
| Transfer | **Transfer** | Internal transfer |
| Available money | **Uang tersedia** | Saldo, Balance |
| Monthly budget | **Budget bulan ini** | Anggaran |
| Savings target | **Target tabungan** | Savings goal, Goal |
| Recent activity | **Aktivitas terbaru** | Recent transactions, History |
| OCR/AI extraction | **Scan struk** / **AI membaca struk** | OCR, nama model AI |
| Soft delete | **Pindahkan ke Trash** | Soft delete, Delete |
| Trash | **Trash** | Deleted items, Sampah |
| Restore | **Pulihkan** | Restore, Undo (kecuali toast) |
| Owner | **Pemilik keluarga** | Admin, Admin keluarga |
| Member | **Anggota** | User, Member |
| Invite code | **Kode undangan** | Invite, Token |

Vocabulary additions from doc 06 (confirmed C-23): **Dompet**, **Bersama**, **Pribadi**, **Buat dompet**, **Arsipkan dompet**, **Arsip**, **Tujuan penggunaan**, **Saldo awal (opsional)**, **Pilih dompet**, **Dari dompet** / **Ke dompet**, **Lihat struk**. Label teknis "Sharing" never appears in the UI.

**Copy teknis dilarang di UI:** istilah OCR, JWT, ledger, admin, dan nama model AI tidak boleh muncul di teks yang dilihat user (A-30). Istilah teknis hanya boleh ada di catatan implementasi.

---

## 2. Color Palette & Design Tokens

### 2.1. Brand core: blue, white, green (R-10, user-approved)

Each token has one functional role. Blue identifies structure and money context; green identifies action and positive money; white surfaces carry content.

| Token | Hex | Tailwind sketch | Role / Usage |
| :--- | :--- | :--- | :--- |
| `surface-canvas` | `#F1F5FA` | page background | Primary app page background (blue-white). |
| `card-surface` | `#FFFFFF` | `bg-white` | Base card and sheet surface. |
| `brand-navy` | `#14273F` | `bg-[#14273F] text-white` | Structural dark: floating top nav, bottom nav shell, Finny panel, Dompet Bersama card surface, toast base. |
| `brand-blue` | `#1D4F87` | `bg-[#1D4F87] text-white` | "Uang biru": uang keluar chart bars, selected/state emphasis, wallet Dompet Pribadi card surface, scan/AI filled accent, input focus border. |
| `brand-blue-tint` | `#DCEBFA` | `bg-[#DCEBFA]` | Light blue wash: info blocks, wallet family/Bersama accents, icons on tint. |
| `brand-blue-tint-subtle` | `#EFF4FA` | `bg-[#EFF4FA]` | Very light blue well: Dompet Pribadi band, inert wells, table stripes. |
| `brand-green` | `#166534` | `bg-[#166534] text-white` | Primary action (CTA/filled pill), FAB, uang masuk text only when paired with `+`, target progress bars, wallet ATM chip. |
| `mint-tint-well` | `#DCFCE7` | `bg-[#DCFCE7]` | Soft green well: Target tabungan card background, success info blocks, Target baru chip. Measured readable pairs on this tint: `#46597A` text 6.44:1, `#166534` text 6.49:1 (audit contrast check, §6.1). Chosen over the unmeasured `#EDF6EE` alternative so the green well matches the live evidence token and keeps the same mint as income/positive surfaces: one green family, no unmeasured second tint. |
| `bar-track` | `#E5EDF5` | `bg-[#E5EDF5]` | Neutral track for budget, target, and spending bars on white cards. Measured 3:1 non-text pairs: `#1D4F87` fill 7.05:1, `#166534` fill 6.03:1 (WCAG 1.4.11). |
| `focus-ring` | `#1D4F87` at 30% `ring` | `focus:ring-[#1D4F87]/30` | Visible keyboard focus for every interactive element (combined with an outline on tint backgrounds). |

### 2.2. Structural text colors

Values in this table are the **measured tokens from the active mockup CSS** (`mockup-shared.css`, verbatim `--ink`, `--ink-2`, `--ink-3`, `--ph`); no parallel alternatives are kept. Every pair below is documented in `audit-2026-10-visual-refresh/evidence/contrast-check.js` (all PASS) and applies at 4.5:1, because antislop R-25 applies to **all readable text with no disabled-text exemption**.

| Token | Hex | Usage | Measured contrast |
| :--- | :--- | :--- | :--- |
| `text-primary` (ink) | `#17304F` | headings, main money numbers | 13.36:1 on white; 12.20:1 on canvas `#F1F5FA`; also used on blue tints. |
| `text-secondary` (ink-2) | `#46597A` | subtitles, labels, descriptions, **disabled but readable button/label text** | 7.07:1 on white; 6.46:1 on canvas; 6.39:1 on `#EFF4FA`; 6.44:1 on `#DCFCE7`; 5.83:1 on `#DCEBFA`; 5.95:1 on chip slate `#E6ECF4`. |
| `text-muted` (ink-3) | `#5C7191` | helper text, timestamps, footnotes, axis/meta text | 4.97:1 on white; 4.54:1 on canvas. **Measured restriction (QA R-15): do not use ink-3 on `#EFF4FA` or other darker tints; use ink-2 there.** Never on `brand-navy` or `brand-blue` (use white/`#D9E6F5`/`#9FB9D6` there). |
| `text-placeholder` (ph) | `#5C6C86` | input placeholders and helper text | 5.32:1 on white; 4.86:1 on canvas. |
| `text-on-dark` | `#FFFFFF` (text) / `#D9E6F5` (secondary) / `#9FB9D6` (muted) | text on `brand-navy` and `brand-blue` surfaces | 15.09:1, 11.92:1/6.58:1, and 7.46:1 measured in the audit. |

**Disabled controls (R-25):** disabled text keeps the readable `text-secondary` `#46597A` pair and communicates the disabled state through cues other than low contrast: `disabled` attribute + reduced affordance (no hover, no pointer feedback), an explicit state label, or inline status copy (pattern already used by the inactive `Simpan` CTA on the duplicate state of the Bank picker, doc 07 §4). Low-contrast gray that fails 4.5:1 is never used for text the user is expected to read.

### 2.3. Semantic status colors (separate from the brand palette)

Amber and red are **status colors, not brand colors** (R-29). They never appear as decoration, section identity, or active-state fills. Green is the only color that plays both roles (action accent and money-in/success), and it always carries a sign or label where the meaning matters.

| Token | Hex | Meaning | Rule |
| :--- | :--- | :--- | :--- |
| `warning-amber` | text `#8A5A00` on `#FDF3D7`; filled icon `#F59E0B` only as a non-text glyph with an adjacent text label | Pending approval, budget approaching limit | Always icon + text label + color (3-signal rule, §7). Text pair measured 5.36:1. Small amber text never uses `#F59E0B` on white (fails AA); use the `#8A5A00` pair. |
| `danger-red` | text `#B91C1C` on `#FDECEC` (6.47:1 on white) | Error, denied, destructive action confirmations | Destructive/pill fill uses `#B91C1C` with white text (same measured text pair); buttons keep explicit consequence copy; red is never the sole signal. Red is reserved for errors and destructive actions, never for ordinary uang-keluar amounts. |
| `success` | `brand-green` `#166534` | Approved, money in (`+`), target complete | Small text uses `#166534` on white/tint, paired with `+`/label. |

Status chips use tint background + dark semantic text + leading icon + Indonesian label. Example: `Mendekati limit` (amber), `Menunggu persetujuan` (amber), `Gagal memuat` (red). Thresholds for budget status labels are a pending PM decision: **do not implement status chips with invented cutoffs** (audit R-13 finding 4).

**Money-out color semantics (aligned to the active mockup, no PM re-decision needed):** ordinary uang-keluar **amounts in activity lists and hero figures are neutral ink** (`text-secondary`/`text-primary` with a `-` sign) in the live mockup and in the actual UI; the **chart and budget identities for money out are blue** (`brand-blue` bars, doc §5.4). Red/rose stays exclusively on errors and destructive actions. If a future direction wants rose (or another tint) for expense amounts, that is an **open PM decision** and is not encoded here.

### 2.4. Interface neutrals

| Token | Hex | Usage | Measured evidence |
| :--- | :--- | :--- | :--- |
| `card-border` | `#D8E2EE` | subtle card outline on white and tint surfaces (live `--card-line`) | decorative hairline; uses the same blue family as the canvas. |
| `input-border` | `#C9D6E4` | form input/resting borders | non-text boundary, 3:1 not required (paired label + placeholder text are readable pairs). |
| `row-divider` | `#EAEEF4` | hairline separators inside lists | decorative. |
| `chip-slate` | bg `#E6ECF4` with `#46597A` text (5.95:1) | neutral pills (`Bulan ini` default chip, counts) | measured PASS. |
| `divider-nav` | `rgba(255,255,255,0.14)` | separators inside navy surfaces |

Heavier borders on tinted cards follow the active mockup: `#BCD6EF` for Bersama-tint cards, `#BBE5C7` for mint wells, `#F3C2C2` for danger wells.

### 2.5. Superseded palette (do not use)

The following are explicitly **retired** from the active system and may appear only inside archived/evidence artifacts: warm peach `#FFE8D6/#FED7AA`, soft lavender `#F3E8FF`, coral `#EA580C`, sand `#f5efe6`, cream canvas `#F7F4EF`, purple lavenders `purple-100/indigo-50` fills, and any violet-to-fuchsia gradient. Screens or code using them are out of conformance with the current tokens. Grid/chart bars in violet or fuchsia (`from-violet-500 to-fuchsia-500` families) are likewise forbidden.

---

## 3. Typography Scale & Hierarchy

### Recommended Fonts (updated 2026-10-20)
- **Single family: `Plus Jakarta Sans`** for display, headings, body, and numerical figures (results in a friendly, geometric, highly legible UI).
- **Financial figures:** same family with tabular figures enabled via `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`) for column alignment of money values.
- **Reason for the one-family decision:** `app/layout.tsx` already loads only `Plus Jakarta Sans` via `next/font`, and the active mockup previews render in Plus Jakarta Sans. Adding a second family (Inter) would introduce an extra font download and potential layout shift with no user-observed benefit; single-family keeps the code, mockups, and this doc consistent. Inter must not be added unless a future PM decision explicitly requires it.

### Hierarchy rules (title/number contrast)
- **Section and card titles are normal-case Medium/SemiBold text**, not uppercase, and are visually quieter than the money number on the same card. Small uppercase `tracking-wider` is reserved for micro-labels (eyebrows, form field labels), never for card titles.
- On every money card the **number is the dominant element**; its title is a small normal-case label above it.
- Two title levels + one level of number hierarchy; do not add further levels.

| Level | Size | Weight | Line Height | Tailwind sketch | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Money number (hero)** | 2.25rem / 36px mobile, up to 2.5rem / 40px | Bold (700), `tabular-nums`, `tracking-tight`, `white-space: nowrap` | 1.1 | `text-4xl font-bold tabular-nums` | Hero pengeluaran, big balance figures (IDR integers, e.g. `Rp14.250.800` with no space). |
| **Money number (card)** | 1.5rem / 24px | SemiBold (600), `tabular-nums` | 1.25 | `text-2xl font-semibold tabular-nums` | Per-wallet card balance. |
| **Title 1 (cards)** | 1.125rem / 18px | SemiBold (600), normal case | 1.3 | `text-lg font-semibold` | Bento card titles, modal headers, sheet titles. |
| **Body (Strong)** | 0.938rem / 15px | Medium (500) | 1.5 | `text-[15px] font-medium` | List item titles, merchants. |
| **Body (Regular)** | 0.938rem / 15px | Normal (400) | 1.5 | `text-[15px]` | Notes, descriptions, form inputs. |
| **Caption / micro-label** | 0.75rem / 12px | Medium (500), uppercase `tracking-wider` allowed | 1.4 | `text-xs font-medium` | Form labels, eyebrow tags, timestamps. Uppercase is allowed here only. |

---

## 4. Radii, Spacing & Shadows

### 4.1. Corner radii
- **Bento containers, modals, sheets:** `rounded-3xl` (24px to 28px).
- **Buttons, badges, tabs, search bars:** `rounded-full` (pill).
- **Form inputs:** `rounded-2xl` (16px).
- **Circular category/icon badges:** `rounded-full`, `w-11 h-11` (44px).

### 4.2. Elevation & shadows
Soft, ambient shadows; no heavy outlines, no glow:
```css
--shadow-bento: 0 10px 30px -5px rgba(20, 39, 63, 0.06), 0 0 1px 1px rgba(20, 39, 63, 0.03);
--shadow-floating-nav: 0 20px 40px -10px rgba(20, 39, 63, 0.35);
--shadow-pill: 0 4px 14px 0 rgba(20, 39, 63, 0.10);
--shadow-hover: 0 14px 28px rgba(20, 39, 63, 0.10);
```

---

## 5. UI Component Primitives

### 5.0 Action hierarchy and button labels
- **Primary action:** one filled **green** pill per section (`brand-green`), stating the outcome (`Simpan transaksi`, `Izinkan bergabung`).
- **Secondary action:** outlined or white pill (`Simpan nanti`, `Periksa lagi`, `Isi manual` style pathways).
- **Tertiary action:** text or icon-only control for low-frequency actions. Icon-only buttons include `aria-label`, `title`, and a minimum 44px touch area.
- **Destructive action:** state the consequence (`Tolak permintaan`, `Pindahkan ke Trash`, `Hapus akses`); never an unlabeled trash icon. Filled destructive pill uses `danger-rose` fill only with confirmatory copy.
- **Dark/navy fills** are reserved for structural surfaces (nav, panels, wallet Bersama cards) and toast, not for general CTAs.

### 5.1. Buttons

| Variant | Tailwind sketch | Usage |
| :--- | :--- | :--- |
| **Primary (green)** | `bg-[#166534] text-white hover:bg-[#155C30] px-5 py-2.5 rounded-full font-medium shadow-pill transition-all active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#DCEBFA]` | One per section: Simpan, Buat, Izinkan bergabung. Recommended 48px min-height on mobile primary CTAs (target, not floor). |
| **Secondary (outlined)** | `bg-white text-[#1D4F87] border border-[#BFD3E8] hover:bg-[#EFF4FA] px-4 py-2 rounded-full font-medium` | Alternatives, cancel-adjacent actions. |
| **Ghost** | `text-[#46597A] hover:bg-[#EFF4FA] px-3 py-1.5 rounded-full transition-all` | Tertiary, footer links. |
| **Scan / AI accent** | `bg-[#1D4F87] text-white hover:bg-[#173F6C] px-5 py-2.5 rounded-full font-medium flex items-center gap-2` with ✨ glyph | Only the Scan struk entry and Finny affordances. |
| **Destructive** | `bg-[#B91C1C] text-white` (6.47:1) or ghost with `text-[#B91C1C]` on white (6.47:1) | Only with consequence copy and confirmation (doc 03 §4, doc 04 §4.3). |

### 5.2. Floating navigation (top bar) and bottom navigation
- **Top bar (desktop):** fixed/sticky, centered, `w-full max-w-4xl`, background `bg-[#14273F]/95 backdrop-blur-md text-white`, `rounded-full shadow-floating-nav`, hairline `border border-white/10`.
- **Bottom nav (mobile):** floating pill `bg-[#14273F]/95 backdrop-blur-md text-white rounded-full shadow-floating-nav`, `inset-x-3 bottom-3`; **5 items total**: `Beranda`, `Budget`, the `Tambah` action button in the center (filling the FAB slot, green fill, same Add action it already serves), `Aktivitas`, `Keluarga`.
- **Item anatomy (both):** meaningful **inline SVG line icon + text label**. Icons are never blank boxes or emoji-only. Active item: `bg-[#DCEBFA] text-[#14273F] font-medium` pill inside navy shell; inactive: `text-white/60 hover:text-white`.
- **Bottom navigation upgrade (proposed 2026-10-22, pending PM review; details in §5.2a):** the five-item spec, rationale, wireframe, and states live in **§5.2a** below and doc 02 §7; this bullet keeps only the shared token sources: navy shell, inline SVG icon + text label item anatomy, and the tint-pill active pattern §5.2a strengthens.
  - **Touch target floor rises to 56px** every full nav item (`min-h-[56px]`; the §6.4 44px floor stays the minimum, not the target). Item labels move from 10px to `text-[11px] font-semibold`; icons `h-5 w-5`.
  - **Active state keeps two signals:** tint pill `bg-[#DCEBFA]` with navy icon AND label weight up to `font-bold`; inactive items stay `text-white/60 hover:text-white`, `font-medium`. Color alone never carries the state.
  - **`Tambah` center grows to a 60px green disc** (`h-[60px] w-[60px]`, `bg-[#166534]`, shadow-pill, white `Plus` at `h-7 w-7`, label `Tambah` under the disc in `text-[11px]`), raised `-mt-6`. Same single add-sheet action as today; not a fifth route.
  - **Shell:** unchanged navy floating pill, inner padding `p-1.5`, column gap `gap-1.5` so the larger items fit 390px (no clipped label, no horizontal overflow, R-03).
  - Safe-area: shell offset adds `env(safe-area-inset-bottom)` on top of `bottom-3`.
  - Full mobile wireframe and item-by-item column spec: doc 02 §7. Rationale for the hierarchy (structure / place / action treatment), §5.2a.
- **Desktop items (4 route links + 2 actions, not a 5-destination bar):** the bar mirrors the actual `FloatingNavbar.tsx` (`components/layout/FloatingNavbar.tsx`): brand block, the four labeled route destinations `Beranda, Budget, Aktivitas, Keluarga` (icon + text label), the `Tambah transaksi` pill action (opens the Add sheet), and a **round avatar/profile action** that links to `/profile`. There is no separate text "Profil" tab or new destination; this is the only navigation system per breakpoint (A-27/A-31; no routes/nav beyond current plan).

### 5.2a. Bottom navigation upgrade (proposed 2026-10-22, pending PM review)

**Hierarchy and visual intent (why this is not just a size bump).** The nav carries three distinct roles and the tokens express each one differently (R-31 reasons recorded per decision):

1. **Structure (shell):** the unchanged navy floating pill (§2.1 `brand-navy`) is the stable frame the user anchors to; it does not move, grow, or change color.
2. **Places (route items):** `Beranda / Budget / Aktivitas / Keluarga` are defined by icon + label exactly as today; the upgrade makes the *current place* unmistakable with a two-signal active state (tint pill `#DCEBFA` plus label weight), so the selected state survives color-blind viewing and reads at arm's length (§6.2, no-sole-color rule).
3. **Action (`Tambah`):** the center item is the only *verb* in the bar, so it alone earns the action token (`brand-green` `#166534` filled disc). One larger green disc among calm navy/white items gives the nav a single focal point without a second FAB layer or a new route.

**Item spec (mobile `< 768px` only; desktop stays the §5.2 top bar):**

| Property | Value | Token source / reason |
| :--- | :--- | :--- |
| Route item touch target | full item `min-h-[56px]` (the §6.4 44px floor stays the minimum; 56 is the taller nav floor) | §6.4 |
| Labels | `text-[11px] font-semibold` (from 10px regular today); icons `h-5 w-5` | smallest scale that fixes the "too small/plain" complaint inside 390px (R-25/R-03) |
| Active route item | `bg-[#DCEBFA] text-[#14273F]`, icon full opacity, label `font-bold` (two signals: tint pill + weight) | §6.2 |
| Inactive route item | `text-white/60` `hover:text-white`, `font-medium` | unchanged measured pair |
| `Tambah` center | `h-[60px] w-[60px] rounded-full bg-[#166534] shadow-pill`, white `Plus` `h-7 w-7`, raised `-mt-6`, label `Tambah` `text-[11px]` under the disc; same single add-sheet action as today, never a fifth route | §5.1 primary green; single focal point |
| Shell geometry | same pill shell; inner padding `p-1.5`, column gap `gap-1.5` so the larger items fit 390px | §5.2 |
| Safe area | shell offset adds `env(safe-area-inset-bottom)` on top of `bottom-3` | R-03 |

**Verification (R-03):** at 390px, five columns render with no clipped label and no horizontal overflow. The mobile wireframe and item-by-item column table live in doc 02 §7. No sixth item, no relabel, no route change (off-limits list: doc 02 §7.6).

### 5.3. Segmented controls (tabs)
- Container: `bg-[#EFF4FA] p-1 rounded-full flex items-center gap-1`.
- Selected tab: `bg-white text-[#14273F] font-medium px-4 py-1.5 rounded-full shadow-sm`.
- Unselected: `text-[#46597A] hover:text-[#14273F] px-4 py-1.5 rounded-full text-sm font-medium`.

### 5.3a. Scope mode control: `Pribadi / Bersama` (proposed 2026-10-22, pending PM review)
Two features need a wallet-scope switch: the **Budget bulan ini** card (mode) and the **Rincian Pengeluaran** chart (scope filter). Both use the same control anatomy so the two learnings transfer; each control stays independently settable, they never sync each other.

- **Anatomy:** reuse the segmented pill container from §5.3 (`bg-[#EFF4FA] p-1 rounded-full`); two options only: `Pribadi` and `Bersama`.
  - Selected: `bg-white text-[#17304F] shadow-sm px-4 py-1.5 rounded-full font-semibold`.
  - Unselected: `text-[#46597A] hover:text-[#17304F] font-medium px-4 py-1.5`.
  - Every tab gets `min-h-11` (44px) per §6.4; `role=tablist/tab` with `aria-label` naming what it scopes (`Mode budget`, `Lingkup grafik`).
- **Optional leading icon:** match the wallet scope identity from doc 06 §4 (small person icon for `Pribadi`, small household/users icon for `Bersama` inside a `w-4 h-4` inline SVG); icon + label + meaning, color is not the only signal (§6.2).
- **Placement rules:**
  - Budget card: the mode control sits directly under the card title, full control width on mobile.
  - Chart card: the scope control sits in the same header row as the existing `7D/30D/90D` period tabs; on mobile it moves to its own row above the period tabs so the header never forces horizontal squeeze (doc 02 §5 Card 8).
- **Semantics (product decisions already confirmed by PM, encoded here for review):**
  - `Pribadi` includes only the current user's personal wallets; budget shown under `Pribadi` is a per-user monthly cap independent of the household cap. **Personal budget data is self-only:** a member sees and edits only their own personal cap; the household Owner has no read or edit access to another member's personal budget (no exception of any kind).
  - `Bersama` includes household Sharing wallets; the household monthly cap stays what it is today (C-12 counting rule and doc 06 §11 helpers still govern the `Bersama` view). Shared-cap visibility and edit rights are unchanged from the existing household budget rules.
  - Transfer legs stay excluded on both views (existing rules); nothing here adds data fields.
- **State memory:** each control keeps its own selection during the session; changing one does not change the other. Default on load: the chart period matches the code (`7D`, `DashboardView.tsx` initial state; the first-pass doc text said `30D` and is corrected here to match shipped behavior, with no behavior change asserted) with the existing default scope; budget card defaults to the household mode that exists today so no data appears to vanish on first paint.
- **States:** loading data under a mode keeps skeletons scoped to the card; a mode empty of wallets shows the per-mode empty state defined in doc 02 (not a generic Rp0). Members without edit rights still see the mode control on `/budget` (it filters a read-only view, doc 06 §11 read-only variant).

### 5.4. Chart bars & progress
- Bars use **solid colors with pill caps** (`rounded-t-xl`/`rounded-full`) and a light cap inset; **no gradients**.
- **Uang keluar bar:** `brand-blue` `#1D4F87` (occupied budget bar uses the same blue family so spending reads consistently blue).
- **Uang masuk bar:** `brand-green` family (`#166534` / lighter `#3D8A57` for stacked contexts; verify pair contrast if used as fill behind text).
- **Target progress:** track tint (`bar-track #E5EDF5`) with `brand-green` fill (fill vs track measured 6.03:1, WCAG 1.4.11).
- **Tooltip pill (revised 2026-10-22):** floating pill with the selection's exact range and exact IDR integer. Daily bars: exact date (`Sab, 22 Sep: Rp214.500`); 90D weekly buckets: the bucket's real covered range and its exact total (`21 to 27 Sep: Rp1.482.300 (contoh)`), partial buckets show their real shorter range. Details and the keyboard path below.
- **Legend, `+`/`-` signs, and text labels accompany color (WCAG 1.4.1; 3:1 non-text contrast for the bars themselves, WCAG 1.4.11).**
- **Mobile readability rule for 7D/30D/90D (revised 2026-10-22 per confirmed user decision, pending PM review):** the card never introduces horizontal scroll. At `< 640px` the composition is fixed per period instead of shrinking bars indefinitely:
  1. `7D`: 7 daily bars, full weekday labels under each bar, `gap-2`, labels truncation-safe.
  2. `30D`: 30 daily bars kept, `gap-1`, gutter `px-3`; axis labels only at the existing `labelStep` and the last bar; exact values live in the tooltip pill, never squeezed into per-bar text.
  3. `90D`: **date-aligned weekly buckets (about 13 bars)** instead of 90 daily bars (confirmed user decision; supersedes the first-pass "90 thin daily bars" idea). Axis labels show each bucket's start date in the existing short `id-ID` day-label style; the first and last buckets are partial weeks and they label their real covered start/end.
  4. Bars stay `flex-1`/`min-w-0`, so the group is always exactly viewport-fit inside the card padding; nothing is clipped at 390px. Mode/scope control of §5.3a sits on its own row.
- **Bar-count note (revised 2026-10-22, pending PM review):** the 90D weekly bucketing is a **UI display grouping of the existing daily source data, not a changed finance calculation**: the client sums the daily values the server contract already returns into each bucket and shows that exact sum. The server `byDay` contract, budget logic, and all money rules stay untouched; the design no longer asks 90 two-pixel bars to be readable or precisely tappable on a phone.
- **Tap and keyboard access to exact values (revised 2026-10-22):**
  - **Bar-width honesty:** the §6.4 44px floor applies to the period tabs, scope control, and every other control, not to each bar pixel; dense daily bars (30D) are small tap targets and this design does not promise otherwise. The weekly buckets at 90D restore a comfortable per-bucket tap width (~a dozen bars across a 390px plot), and the keyboard path below covers precision-independent access for all periods.
  - **Keyboard selection:** the bar group is focusable and moves a selection between bars/buckets with Left/Right arrow keys; the selected bar gets a visible focus indicator (§2.1 `focus-ring`, plus an outline variant on tint surfaces), the same tooltip pill becomes visible on focus, and the pill text is announced through an `aria-live=polite` region with the same range + total. Blur or `Escape` hides the tooltip without leaving the chart.

### 5.5. Circular icon badges & category coding
- Size: `44px x 44px` (`w-11 h-11 rounded-full flex items-center justify-center`).
- **Two kinds of badge exist and must not be mixed up:**
  1. **Functional category badges** pierce the brand palette ON PURPOSE as data coding (existing `CATEGORY_TONES` in `components/transactions/categories.ts`). Keep their current muted tints paired with 4.5:1 compliant text/icon colors; they are data encoding, not decoration, and every badge has an `aria-label`.
  2. **Structural/brand badges** (wallet scope, nav, scan, Finny) use only tokens from §2.1 to §2.3.
- Wallet card ATM chip belongs to kind 2 (see §5.6).

### 5.6. Wallet ATM card treatment (tokens for doc 06; R-11, user-approved)
The wallet card uses a **generic ATM/debit-style card metaphor** as visual identity only.

| Token | Value | Rule |
| :--- | :--- | :--- |
| `wallet-card-shared` | surface `#14273F` (navy, solid, no gradient) | Dompet Bersama full card surface. |
| `wallet-card-personal` | surface `#1D4F87` (blue, solid, no gradient) | Dompet Pribadi full card surface. |
| `wallet-chip` | abstract rounded chip `#166534` green with a lighter glyph | Decorative only. |
| `wallet-contactless-glyph` | light arcs, `#DCEBFA` at reduced opacity | Decorative only. |
| Mini/mid-size treatment | small solid blue card + green chip row in pickers, detail sheets, manage sheet | Used when the card is not full-size (list rows stay light). |

**Forbidden on wallet cards (extends C-14/C-15/C-18):** no card numbers, expiry, CVV, cardholder name, real bank logos, payment network marks, security/feature claims, or any claim of bank connectivity. Amounts, names, scope pills, and actions use real app data labeled `(contoh)` only in evidence artifacts. This is visual metaphor only; it implies no banking integration, matching the label-only bank field design in `07-bank-institutions.md`.

### 5.7. Forms
- Inputs: `bg-white border border-[#E2E8F0] rounded-2xl focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15`.
- Helper text: `text-[#5C6C86]` on white (5.32:1) or `text-[#46597A]` on tinted surfaces; never ink-3 on `#EFF4FA` (4.49:1, fails, QA R-15).
- Error inline: `border-[#B91C1C]` + plain-language message below in `text-[#B91C1C]` (5.66:1 on `#FDECEC`, 6.47:1 on white).

### 5.8. IDR live grouping in money inputs (PM-approved 2026-10-23, implementation in T-013)
Budget target amount, savings goal target amount, and add-to-savings amount use the same live formatting as manual entry. Formatting changes only the display; values may include up to two decimal places.

- **Surfaces in scope:** budget target input (`atur budget`), goal form target amount, add-to-savings amount (both the in-goal action and the contribution path, doc 02 §8). The manual entry amount already behaves this way and is the behavior reference, not a new component.
- **Typing rule (live grouping):** thousands group with Indonesian dots and decimal fractions display with a comma (for example `3,000.12` and `3.000,12` display as `3.000,12`). Input accepts English and Indonesian punctuation, retaining at most two fraction digits.
- **Value integrity:**
  - Stored/submitted value is a canonical decimal rupiah value using a dot for the fraction (for example `3000.12`); display uses Indonesian punctuation.
  - **Caret:** after each reformat, the caret follows the digit the user was editing (offset by how many separators precede it), not "end of string": editing digits in the middle must not jump the caret to the end. Rule surfaces: caret position = number of digits before caret + separators before those digits.
  - **Delete/backspace:** deleting removes digits and separators gracefully; `Backspace` never leaves a group artifact (e.g. deleting `5` then `.` in `2.500.000` must not leave `2.00.00`). Select-all + delete leaves an empty, valid, disabled-submit field with the `Rp` prefix kept for the next press.
  - **Paste:** a pasted string is normalized: leading `Rp`, spaces, existing dots, and stray decimals are stripped; `12.500,00` and `12500/00`-style noise resolve to the digit string; the result is grouped again. A paste introducing anything clearly non-numeric resolves to the digits it contains and shows the existing inline-error pattern if the digits are not a valid positive integer.
- **Input details:** `inputMode="decimal"`, `type="text"`; visible `Rp` prefix as the first inline token; money `tabular-nums` per §3. Decimal punctuation is retained as a fractional part, up to two digits.
- **Validation:** required and positive; at most two fraction digits and at or below the single-entry maximum already enforced server-side (`Rp2.147.483.647`). Preview under the field preserves the same two-decimal value.
- **Where NOT to apply:** date fields, percentage, weekly plan slider (doc 05 §6) keep their current formats.
- **No new component family:** this spec encodes a behavior pattern for the existing form tokens of this section. Implementation may reuse the manual entry amount's formatter logic if it shares this caret/grouping behavior.

---

## 6. Accessibility & Inclusivity Guidelines (WCAG AA)

1. **Contrast ratios:** all readable text holds a minimum 4.5:1 against its background (antislop R-25 applies to **all** readable text, with no disabled-text exemption), large text 3:1; meaningful non-text elements (bars, chips-as-meaning, focus outlines) 3:1 (WCAG 1.4.11). Measured pairs from `evidence/contrast-check.js` (all pairs PASS, rerun 2026-10-20): `#17304F` on white/canvas, `#46597A` and `#5C7191` on white/canvas (ink-3 must not sit on `#EFF4FA`), `#5C6C86` placeholder, `#1D4F87` text and bars, `#166534` text/bars, status pairs `#8A5A00`/`#FDF3D7` and `#B91C1C`/`#FDECEC`/white, all navy and ATM-card pairs, and ink-2 on `#DCEBFA`/`#EFF4FA`/`#DCFCE7`/`#E6ECF4`. Any new text/surface pair must be added to and pass that script before implementation; only decorative scrims without text are not subject to text thresholds (audit R-16).
2. **No sole-color indicators:** money in shows `+` and green; money out shows `-` in neutral ink (rose/red is not used for ordinary expense amounts, per §2.3); status always has icon + label + color; scope always has icon + label (C: doc 06).
3. **Text equivalents:** every icon and emoji badge has an `aria-label`; every nav item has an icon, a visible label, and a programmatic name.
4. **Touch target sizing:** minimum **44px x 44px** for all interactive controls (enforced baseline `min-h-11`); primary mobile CTAs **target 48px** where feasible.
5. **Plain-language test:** a first-time user knows what each filled button does without documentation.
6. **Focus & state:** visible focus ring on every button, tab, input, and link; loading, success, error, and disabled states use the same plain-language vocabulary; `prefers-reduced-motion: reduce` swaps shimmer/pulse/beam animations for static indicators (doc 03 §5.2).
7. **No fabricated content:** no invented statistics, testimonials, thresholds, or real-looking placeholder numbers; all sample data in mockups is labeled `(contoh)`.
