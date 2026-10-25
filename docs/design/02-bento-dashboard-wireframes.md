# Bento Box Dashboard Wireframes & Layout Specs

## 0. Canonical status & change note

- **Status: PM-approved for T-010 composition refresh (2026-10-20).** This sign-off covers the R-9 layout, existing module placement, and responsive navigation; it does not add data fields or business behavior.
- **Author role:** UI/UX Designer. Last updated: 2026-10-22 (change-pass revision).
- **Supersedes:** the earlier home ordering in this document (wallet-first combined hero, `Uang tersedia` single hero card). The confirmed R-9 ordering (user direction, recorded in the audit README R-9/R-10, evidence-only) now governs Beranda: **expense hero first**, then **two separate wallet totals**, wallets, recent activity, budget, chart, goals. The delta/chip "perubahan vs bulan lalu" is **deferred by PM decision (2026-10-19)** and is NOT drawn or implemented in MVP.
- **Correction pass (2026-10-20, R-25 parity):** this document was re-aligned to the **active R-9 board evidence** (`mockup-visual-system-board.html`, official evidence) and the actual `DashboardView.tsx`:
  - Desktop hero is a **full-width span-12 strip above the grid**, not col 1-7 beside the balances.
  - The hero contains **only existing metrics** (uang keluar bulan ini, `Hari ini` from the existing `byDay` bucket, `Sisa budget`); no duplicate wallet balance, no period dropdown, and **no quick-action pills in the hero** (the Add path stays on the nav `Tambah` action and wallet-specific create controls, C-13/C-24; Target baru stays attached to the Target module and the goal form).
  - **Finny is not on Beranda.** The actual `/home` does not render any advisor card; Finny lives on `/budget` (AdvisorPanel/GoalsSection, doc 05). A Finny card previously drawn in this wireframe is removed.
  - The hero "Bulan ini dropdown / period switch" proposal is **removed**: the chart's periods are `7D/30D/90D` and no hero period control exists anywhere.
- **All existing modules survive:** two separate wallet summaries (C-11, never summed), per-wallet card carousel + `+ Dompet baru`, budget, spending chart, goals, activity. Navigation is unchanged (A-27/A-31).
- **Change pass revision (2026-10-22, second pass, PM review requested):** this pass incorporates the user's confirmed decisions and the technical review of the first 2026-10-22 proposal. Deltas since the first pass: (a) 90D chart changed from 90 thin daily bars to **date-aligned weekly buckets (about 13 bars)** computed client-side from the daily values (§5 Card 8, doc 01 §5.4); (b) contribution history now records **both increases and decreases** (the goal-level `Tambah saldo` and `Kurangi` actions also become history events), the optional note field is **removed** to keep scope minimal, and the history inherits the existing household-goal access rules with **no fabricated backfill for legacy saved amounts** (§8); (c) the chart default period stays the code's `7D` (the first-pass text said 30D; no behavior change asserted); (d) a dedicated `/budget` page budget-mode spec is added as **§5b**. No token values change; nothing is added to routes or nav.
- **Proposed change pass (2026-10-22, designer-authored, PM review requested; recorded as a new change, NOT a rewrite of the T-010 sign-off):** five proposed UX changes driven by the user's latest feedback (one overflow screenshot, two new mode screenshots, input screenshots, one nav screenshot, and one savings-flow screenshot):
  1. **Chart overflow fix (§5 Card 8):** the mobile chart must never overflow horizontally at 390px; per-period readable treatment defined per `7D/30D/90D`, with the 90D period rendered as date-aligned weekly buckets (about 13 bars) aggregated client-side from the existing daily values. Token-level rules: doc 01 §5.4.
  2. **`Pribadi / Bersama` modes on both Budget and Rincian Pengeluaran (§5 Cards 7 and 8):** two independent segmented controls. PM-confirmed product basis (recorded here as direction, not a Spec edit): personal budget is a separate monthly cap per user and is **self-only** (a Household Owner cannot read or change another member's personal budget); shared budget stays the household cap; the chart scope filters to the user's personal wallets or household Sharing wallets; the two controls may be set independently. Token anatomy: doc 01 §5.3a; `/budget` page spec: §5b.
  3. **IDR live grouping in money inputs:** budget target, goal target, add-to-savings amount. Spec: doc 01 §5.8 (manual entry already behaves this way, doc 03 §2.2).
  4. **Bottom navigation upgrade (§7):** same five destinations, larger tap targets (56px item floor), stronger selected state, more prominent central `Tambah`. No new route, no new destination.
  5. **Savings contribution as a manual goal-progress record (§8):** a `Catat progres` action inside the global `Tambah` sheet opens a goal-progress form; each entry (increase or decrease, from this sheet or from the existing goal-level `Tambah saldo`/`Kurangi` controls) is logged as an immutable per-goal history event. It is NOT a wallet transaction: no transaction row, no wallet balance change, no budget effect, no wallet affiliation required, and no entry appears in Beranda's `Aktivitas terbaru`. PM-confirmed direction. The existing direct goal flows stay available unchanged and now also record events.
  Items 2 and 5 do not change goals or budget business rules at design level beyond the PM-confirmed decisions stated above; Spec/Dev Plan follow-up is PM-owned.
- Ticket references: **T-010** (visual refresh). No new module, route, or nav item is introduced.

## 1. Finance App Architecture

The first viewport answers, in order: **Where did money go this month? How much money is available (shared vs personal)? Where are the wallets? What happened recently?** Then planning: budget, chart, goals (advisor is on `/budget`, not Beranda).

### 1.1. Canonical screen order (R-9)
1. Compact app header: desktop floating top nav; mobile bottom navigation only (§1.2).
2. Greeting/period heading for the current month.
3. **Card 1: Hero Pengeluaran** (expense hero: one big uang keluar figure for the period). No delta-vs-previous-month chip (deferred).
4. **Dua ringkasan dompet terpisah** (`Uang tersedia bersama` / `Dompet pribadiku`; C-11, tidak dijumlahkan).
5. **Kartu dompet** carousel + `+ Dompet baru` (ATM-style treatment, doc 06 §4).
6. **Aktivitas terbaru** with filters and `Muat lebih banyak` cursor pagination (Card 5 specification).
7. **Budget bulan ini** (with "atur budget" empty state when unset; helper "Dihitung dari dompet keluarga saja", doc 06 §11).
8. **Rincian Pengeluaran** chart with period tabs `7D/30D/90D` (the only period control anywhere in Beranda).
9. **Target tabungan** (progress bars, green; `+ Target baru` opens the existing goal form, no new route).
10. **No Finny card on Beranda:** `/home` renders no advisor surface (actual `DashboardView.tsx`); Finny stays on `/budget` (doc 05). No hero quick-action pills and no hero period switch either: `Tambah` lives in the nav, `+ Dompet baru`/`Kelola` on the wallet module, and the delta chip remains deferred.

### 1.2. Canonical navigation (A-27, A-31)
Exactly one navigation system per breakpoint; no legacy variants.

- **Mobile (`< 768px`):** floating bottom pill nav, 5 items with **meaningful inline SVG line icons + labels**: `Beranda`, `Budget`, `Tambah` (center action), `Aktivitas`, `Keluarga`.
- **Desktop (`>= 1024px`):** floating top nav mirroring the actual `FloatingNavbar.tsx`: brand block, the four labeled destinations `Beranda, Budget, Aktivitas, Keluarga` (icon + text label; audit R-13 finding 3: no blank/empty icon boxes), the `Tambah transaksi` pill action (opens the Add sheet, not a link), and a **round avatar/profile action** linking to `/profile`. There is **no text "Profil" tab** and no additional destination.
- **Removed (already canonical):** `Overview`, `Goals`, old `Home / Scan / History / AI` bar. Goals live on `/budget`; Finny is a drawer inside `/budget`.

## 2. Bento Grid Architecture

### 2.1. Responsive breakpoints
- **Desktop (`lg`/`xl` ≥ 1024px):** 12-column bento grid, asymmetrical spans.
- **Tablet (`md` 768-1023px):** 2-column simplified grid.
- **Mobile (`< 768px`):** single-column stacked feed, one floating bottom nav; no second header.

All colors, icons, typography, and shapes come from `01-design-system-tokens.md` (blue-white-green).

---

## 3. Desktop 12-Column Wireframe (`>= 1024px`)

```
+----------------------------------------------------------------------------------------------------+
|                        [ FLOATING NAVY NAVIGATION BAR  #14273F ]                                    |
| Financial Diary   [Beranda*] [Budget] [Aktivitas] [Keluarga]   [ + Tambah transaksi ]   (o Avatar/profil) |
| Meniru FloatingNavbar.tsx aktual: 4 tautan berlabel + pill aksi + aksi avatar ke /profile;          |
| tidak ada tab teks "Profil".                                                                        |
+----------------------------------------------------------------------------------------------------+

+----------------------------------------------------------------------------------------------------+
| HERO PENGELUARAN (span 12 penuh, strip di atas grid, tint biru muda #DCEBFA)                        |
| [ Pengeluaran bulan ini ]   [ Hari ini ]        [ Sisa budget ]                                     |
| Rp1.090.000 (contoh, hero)  Rp85.000 (contoh)   Rp2.910.000 (contoh)                                |
| Tanpa pill pengalih periode (chart memakai 7D/30D/90D); tanpa saldo dompet di dalam hero;           |
| tanpa pill aksi cepat di hero (Tambah = aksi nav; Target baru = di kartu Target).                   |
+----------------------------------------------------------------------------------------------------+

SPAN 12 (dua kartu berdampingan): [ Uang tersedia bersama  Rp4.850.000 ]  [ Dompet pribadiku  Rp1.150.000 ]
  helper keduanya: "Termasuk dompet di Arsip"; TIDAK dijumlahkan (C-11/C-27)

SPAN 12: DOMPETMU (strip kartu ATM per doc 06)
  [== Dompet Keluarga (navy #14273F)  Rp3.200.000  Kelola ==]
  [== Bensku (biru #1D4F87)           Rp800.000   Kelola ==]
  [== Kas Harian (biru #1D4F87)       Rp350.000   Kelola ==]
  [+ Dompet baru]  ghost dashed, kartu terpisah, bukan kartu dompet (C-13/C-24)

SPAN 5: BUDGET BULAN INI                 SPAN 7: RINCIAN PENGELUARAN
  [ Pribadi | Bersama* ]                   [ Pribadi | Bersama* ] [7|30|90]
  Rp2.910.000 sisa (contoh)                dua kontrol terpisah di header;
  Terpakai Rp1.090.000 (35%)               bar solid biru #1D4F87; tooltip pill
  bar biru solid; tanpa chip status        (saturun kontrol periode di Beranda)
  helper: "Dihitung dari dompet
  keluarga saja."

SPAN 12: TARGET TABUNGAN (mint well #DCFCE7)
  [x] Seragam sekolah 64%   [x] Rice cooker 38%
  bar track #E5EDF5 + fill hijau #166534; angka tabular-nums
  [+ Target baru] buka form target existing (bukan route baru)
  (span penuh: tanpa kartu Finny di Beranda, target memakai seluruh
   12 kolom sehingga layout tetap bebas lubang; Finny hidup di /budget,
   doc 05)

SPAN 12: AKTIVITAS TERBARU
  Filter: [Semua|Uang masuk|Uang keluar|Struk hasil scan]
  Nasi padang   Senin    -Rp92.000   (uang keluar: tinta netral + tanda minus)
  Ojek sekolah  Senin    -Rp15.000
  Tabungan masuk Minggu  +Rp500.000  (hijau +)
  [ Muat lebih banyak ]  pagination kursor, bukan nomor halaman
```

> Angka hero/matriks di atas memakai bucket yang sudah ada dari `GET /api/dashboard` (`spending`, `byDay` hari ini, budget). Tidak ada pill periode di hero; tidak ada kartu Finny di Beranda (aktual `DashboardView.tsx` tidak merendernya; Finny ada di /budget, doc 05). Semua angka contoh berlabel `(contoh)`, tabular-nums; tanpa input pencarian di Aktivitas (kontrak backend pencarian tidak ada di MVP).

---
## 4. Mobile Single-Column Wireframe (`< 768px`)

```
+------------------------------------------+
| (Beranda)(Budget)( + Tambah )(Aktivitas)(Keluarga) |  bottom nav navy, ikon SVG + label
+------------------------------------------+
|  Beranda                                 |
|  Periode: Oktober 2026 (contoh)          |
|                                          |
|  +------------------------------------+  |
|  | HERO PENGELUARAN (tint biru muda)  |  |
|  | Pengeluaran bulan ini              |  |
|  | Rp1.090.000 (contoh)               |  |
|  | [Hari ini Rp85.000 | Sisa budget   |  |
|  |  Rp2.910.000] (byDay + budget)     |  |
|  | tanpa pill periode; tanpa saldo    |  |
|  |  dompet; tanpa pill aksi cepat     |  |
|  +------------------------------------+  |
|                                          |
|  +---------------+ +-----------------+   |
|  | Uang tersedia | | Dompet          |   |
|  | bersama       | | pribadiku       |   |
|  | Rp4.850.000   | | Rp1.150.000     |   |
|  | Termasuk dompet di Arsip (keduanya) | |
|  | TIDAK dijumlahkan (C-11)            | |
|  +---------------+ +-----------------+   |
|                                          |
|  DOMPETMU (intro mini)                   |
|  +---------------------------------+--+  |
|  | kartu ATM Dompet Keluarga  <     >|  |  |  carousel; kartu berikutnya mengintip
|  +---------------------------------+--+  |
|  [+ Dompet baru] (ghost dashed)          |
|                                          |
|  +------------------------------------+  |
|  | AKTIVITAS TERBARU + filter pills   |  |
|  | Nasi padang        -Rp92.000       |  |
|  | Ojek sekolah       -Rp15.000       |  |
|  | Tabungan masuk     +Rp500.000      |  |
|  | [ Muat lebih banyak ]              |  |  kursor; tanpa nomor halaman
|  +------------------------------------+  |
|  +------------------------------------+  |
|  | BUDGET BULAN INI                   |  |
|  | [ Pribadi | Bersama* ]  (7 mode)   |  |
|  | Rp2.910.000 sisa (contoh)          |  |
|  | [====biru solid====----]           |  |
|  | Terpakai Rp1.090.000 (35%)         |  |
|  | (state "atur budget" bila kosong)  |  |
|  +------------------------------------+  |
|  +------------------------------------+  |
|  | RINCIAN PENGELUARAN                |  |
|  | [Pribadi | Bersama*]  (scope)      |  |
|  | [7 | 30 | 90]  (periode)           |  |
|  | bar biru; tooltip tanggal+jumlah   |  |
|  | (komposisi anti-overflow 390px:    |  |
|  |  bar flex penuh, label langkah)    |  |
|  +------------------------------------+  |
|  +------------------------------------+  |
|  | TARGET TABUNGAN (mint well)        |  |
|  | Seragam sekolah 64% [=======----]  |  |
|  | [+ Target baru] (baris sendiri)    |  |
|  +------------------------------------+  |
|  (Tidak ada kartu Finny di Beranda;      |
|   Finny ada di /budget, doc 05)          |
+------------------------------------------+
```

> Perilaku 390px: filter pills wrap ke dua baris; duaringkasan dompet tetap grid-2 dengan seluruh angka `nowrap`; kartu dompet aktif hampir selebar viewport (cek overlap 390px di evidence audit, PASS); tanpa scroll horizontal. Hero hanya memuat metrik yang sudah ada (uang keluar bulan ini, hari ini dari `byDay`, sisa budget); `Tambah` tetap di bottom nav dan `+ Dompet baru`/`Kelola` tetap di modul dompet. **Tambahan 2026-10-22 (proposed, pending PM review):** kontrol mode `Pribadi/Bersama` di kartu Budget dan kontrol scope di kartu Rincian Pengeluaran masing-masing dapat baris sendiri di 390px (tidak menekan header kartu), tanpa overflow horizontal (R-03). Rincian pengeluaran mematuhi aturan anti-overflow doc 01 §5.4 dan §5 Card 8: bar selalu `flex-1`, label sumbu hanya di langkah label, nilai tepat hidup di tooltip.

---
## 5. Card Specifications (R-9 ordering)

### Card 1: Hero Pengeluaran
- **Styling:** tint biru muda: `bg-[#DCEBFA] border border-[#BCD6EF] rounded-3xl p-6` (desktop: full-width span-12 strip above the grid; mobile: first card). Money identity stays blue.
- **Elements (existing data only):**
  - Title: normal-case SemiBold (`Pengeluaran bulan ini`) + hero number `text-4xl font-bold tabular-nums text-[#17304F]`.
  - Mini metric block (2 small figures in white inset boxes): `Hari ini` (from the existing `byDay` today bucket) and `Sisa budget` (from the existing budget data); each `text-sm` label + `tabular-nums`.
  - **Nothing else:** no period pill/dropdown (the only period control is the chart's `7D/30D/90D` tabs), no wallet balance inside the hero (the two totals are separate cards below), no quick-action pills (`Tambah` is the nav's add sheet, `+ Dompet baru`/`Kelola` belong to the wallet module), and no delta chip (deferred, below).
- **Deferred (do not implement):** any "delta vs bulan lalu" chip or comparison figure, and any period switch on the hero. `previousMonthSpentMinor` remains a recorded option for a future DTO amendment (PM/Dev), not a design commitment.
- **States:** loading skeleton (hero number placeholder + 2 metric skeletons); error joins the dashboard-level error state; empty-first-use shows copy pointing to `Tambah transaksi` pertama instead of an Rp0 claim.

### Cards 2/3: Dua ringkasan dompet (C-11, C-18, C-27)
- Two separate cards, never summed: `Uang tersedia bersama` (blue tint `#DCEBFA` accent, navy number) and `Dompet pribadiku` (white with very light blue well `#EFF4FA` and navy number). Scope meaning is also carried by icon + label, not color alone.
- Under each: helper `Termasuk dompet di Arsip` link (C-27) to the Arsip tab of the manage sheet.
- Amounts use `tabular-nums`, `text-2xl`/hero where space allows; no invented per-period deltas.

### Card 4: Kartu dompet (ATM treatment; visual spec owner: doc 06 §4)
- Full-size ATM-style cards (navy `#14273F` for Bersama, blue `#1D4F87` for Pribadi, green abstract chip, white text) in a horizontal strip on desktop, scroll-snap carousel on mobile with a peek indicator; ghost dashed `+ Dompet baru` button remains a separate button, never drawn as a wallet card.
- Interaction, permission, privacy, and state rules are fully canonical in doc 06 §4-§6; this wireframe only places the module.

### Card 5: Aktivitas terbaru
- **Styling:** white card.
- **Filters (unchanged):** `Semua / Uang masuk / Uang keluar / Struk hasil scan` pills; category icon badges use the functional `CATEGORY_TONES` (doc 01 §5.5 kind-1 badges).
- **Row:** category icon, title + member/date meta, `Hasil scan` pill (neutral/blue tint; no model name), amount `tabular-nums` with sign (uang keluar = neutral ink + `-`; uang masuk = green `+`, doc 01 §2.3); soft delete per doc 03 §4.
- **Pagination (cursor, canonical):** the footer renders a single CTA `Muat lebih banyak` that loads the next cursor batch and appends rows. There are **no** page numbers, no `Sebelumnya/Berikutnya` controls, and no fabricated totals (audit R-12 finding: the earlier "10 dari 38" page control was fabricated and is removed). While loading the next batch, show inline skeleton rows above the CTA; when the cursor is exhausted, the CTA is simply not rendered (never a permanently disabled button).
- **States:** loading skeleton (3 rows), error with `Coba lagi`, empty (plain-language first action), filtered-empty with reset-filter.

### Card 6: Target tabungan
- **Styling:** mint well `#DCFCE7` (border `#BBE5C7`; measured text pairs: `#46597A` 6.44:1, `#166534` 6.49:1, doc 01 §2.1/§6.1).
- Items: icon, title + deadline, dual-layer rounded progress bar (track `#E5EDF5`, `brand-green` fill; 6.03:1 vs track), values `Rp2.160.000 dari Rp3.000.000 (72%)`. `+ Target baru` opens the existing goal form; no new route.

### Card 7: Budget bulan ini
- White card; helper `Dihitung dari dompet keluarga saja.` (C-12 counting rule, doc 06 §11). Occupied bar solid `brand-blue`; percent text explicit. Empty/unset budget renders the `atur budget` state, not a misleading `Rp0`.
- **Status chips (Aman/Mendekati limit/Lewat limit) are intentionally NOT rendered until PM defines thresholds** (antislop; audit R-13).
- **Mode control `Pribadi / Bersama` (proposed 2026-10-22, pending PM review):**
  - A segmented pill (doc 01 §5.3a) sits directly under the card title, own row on mobile: `[ Pribadi | Bersama ]`, default `Bersama` on load so today's household view is unchanged at first paint.
  - **`Bersama` (household cap):** unchanged semantics of this card today; C-12 helper `Dihitung dari dompet keluarga saja.` shows in this mode.
  - **`Pribadi` (per-user cap):** same card anatomy, data from the user's personal wallets only. Helper in this mode: `Dihitung dari dompet pribadimu.` Number, bar, percent, and `atur budget` empty state re-render for the personal cap; never a sum of the two caps.
  - The two caps are independent: switching modes never carries the household cap figure into the personal view or vice versa. `atur budget` applies per mode with each mode's own data: the household cap follows the existing shared-budget edit rights, and the personal cap is **self-only** (only its own user can edit it; the household Owner has no read or edit access to another member's personal budget).
  - Wireframe, states, and permission notes per mode: §5b below.
- **Wireframe (mobile, both modes shown for clarity, only one renders at a time):**
```
+------------------------------------+
| BUDGET BULAN INI                   |
| [ Pribadi  | Bersama* ]            |
|                                    |
| Rp2.910.000 sisa (contoh)          |
| [====biru solid====----]           |
| Terpakai Rp1.090.000 (35%)         |
| Dihitung dari dompet keluarga saja |
| (state "atur budget" bila kosong,  |
|  per mode)                         |
+------------------------------------+
```

### Card 8: Rincian Pengeluaran (chart)
- Period tabs `[ 7D | 30D | 90D ]`, card title period-neutral. **Default period on load is `7D`**, matching the shipped code (`DashboardView.tsx` initial state); the first-pass doc text said `30D` and is corrected here so the design matches implementation with no behavior change asserted. Solid blue bars (`#1D4F87`), rounded caps, tooltip pill with the selection's exact range + IDR integer. No violet/fuchsia gradients (retired, doc 01 §2.5).
- **Scope control `Pribadi / Bersama` (proposed 2026-10-22, pending PM review):** a second segmented pill (doc 01 §5.3a) in the same card, independent of both the period tabs and the budget card's mode control.
  - **Header composition:** desktop the two controls share the header row on the right (`Scope` pill group, then period tabs). Mobile (< sm) they stack: scope row first, period tabs row second; the header never puts title + 2 control groups on one line at 390px.
  - **`Pribadi` scope:** chart totals and bars cover only the current user's personal wallets. Summary line `RpX keluar pada periode ini.` re-labels its basis with a short suffix per scope: mode-word stays in the control, the summary line itself keeps its exact-integer IDR identity.
  - **`Bersama` scope:** household Sharing wallets only, which is the behavior of the chart today. Same bars, same tooltip.
  - Both scopes exclude transfer legs per existing rules (no change).
  - Independent of Card 7's mode: switching the budget card's mode never changes the chart's scope and vice versa.
- **Overflow rules (revised 2026-10-22 per confirmed user decision; weekly bins, pending PM review):**
  - The bar chart container is always exactly viewport-fit inside card padding: `w-full` with `bars flex-1 min-w-0`; no fixed bar width above `max-w-10`, no fixed container width, no horizontal scroll region on any breakpoint.
  - **Mobile composition per period (390px reference):**
    - `7D` (default): 7 daily bars, full weekday labels below each bar, `gap-2`, every label readable (`text-[10px]` minimum, truncation-safe).
    - `30D`: 30 daily bars (unchanged), `gap-1`, gutters `px-3`; axis labels only at every 5th bar and the last (existing `labelStep`), using short day labels (existing `dayFormatter`); exact values live in the tooltip pill, never in per-bar text.
    - `90D`: **date-aligned weekly buckets, about 13 bars** (confirmed user decision; the earlier proposal of 90 thin daily bars is dropped). The client sums the daily values the `byDay` contract already returns into each bucket and shows the exact sum; the weekly grouping is a **UI display grouping of existing daily data, not a changed finance calculation** and implies no server semantic change. Axis labels show each bucket's start date; the first and last buckets are partial weeks, labeled and tooled with their real covered range. Bars stay comfortably tappable at this density.
  - **Tooltip and keyboard (both breakpoints):** tap/hover shows the floating pill (daily: exact date + IDR integer; 90D weekly: covered range + exact total, partial buckets show their real range). The bar group is focusable; Left/Right arrows move the selection, the focused bar/bucket gets a visible focus ring and shows the same pill, the pill text is announced via an `aria-live=polite` region, blur/`Escape` hides the pill. The §6.4 44px floor applies to the period/scope controls, not to every bar pixel (doc 01 §5.4).
  - Period/scope controls never overlap the plot area; the mobile close-focus target (44px) comes from the existing `min-h-11` tab style.
  - States stay per §6: loading skeleton keeps the same composition with placeholder bars (for 90D: 13 placeholder buckets); empty/`0` period keeps the existing plain sentence, scoping to the selected `Pribadi/Bersama` mode.
  - **Tablet/desktop (768px/1280px):** the scope pill and period tabs share the header row right side at 1024px and wrap to two stacked rows at 768px (same order: scope above period). `7D/30D` render daily bars with full-width room; `90D` keeps the same 13-bucket weekly grouping at every width so the buckets' meaning never shifts between breakpoints. Tooltips become hover-driven on pointer devices while the keyboard path stays.

### Card 9: Aktivitas terbaru ordering note
- Numbering follows the desktop wireframe above: 1 hero, 2/3 the two wallet totals, 4 wallet cards, 5 budget + 6 chart, 7 target, 8 activity.
- **Finny is intentionally ABSENT from Beranda (no feature addition).** `/home` renders no advisor card in the actual `DashboardView.tsx`; the advisor entry point and drawer live on `/budget` (doc 05). A "Finny invitation card" appears nowhere in the home wireframe; do not re-add it without explicit PM approval as a new surface.

---

### 5b. `/budget` page: budget mode spec (added 2026-10-22, pending PM review)

This section specifies the **page-level** budget experience so the dashboard card (Card 7) and the full page are one system with one rule set. The page stays at its canonical home (`/budget`, existing route; no new page or route). Composition today: Finny panel (doc 05), budget module, GoalsSection; this section adds the mode behavior and permission model on top of that composition, it does not reorder it.

**Budget module on `/budget` (desktop and mobile):**

- The same `Pribadi / Bersama` mode control (doc 01 §5.3a) heads the budget module; default on load is the household `Bersama` view (today's behavior at first paint; no data appears to vanish).
- **`Bersama` (household cap):** unchanged page behavior: household Sharing wallets, C-12 counting rule, helper `Dihitung dari dompet keluarga saja.`, existing shared-cap edit rights and the doc 06 §11 read-only variant for members without edit rights.
- **`Pribadi` (per-user cap):** the module re-renders for the current viewer's own personal cap across their personal wallets, with its own figure, bar, percent, `atur budget` state, and helper `Dihitung dari dompet pribadimu.` No caps are ever summed or merged.
- **Permissions (self-only, PM-confirmed):**
  - Personal budget data is visible and editable **only by its own user**. Member A's `Pribadi` mode never reads or edits Member B's personal budget, and the household **Owner has no read or edit access** to another member's personal budget (no owner override for personal data).
  - The shared cap keeps exactly the visibility and edit rights it has today; nothing in this pass changes household budget permissions.
  - A member without any personal wallet sees the per-mode empty state (§5 Card 7 / §6 states), not another user's data.
- **Not on the dashboard card:** the dashboard Budget card (Card 7) implements the same control, default, and permission rules; §5b adds nothing to the card, it only states the page-level placement, helper copy, and permission model so both surfaces stay consistent.
- **States (page):** per-mode loading skeletons (scoped to the budget module), per-mode empty/`atur budget` state, per-mode error follows the page-level error state (§6), session-scoped state memory per §5.3a.
- **Finny unchanged:** the advisor panel and drawer keep doc 05 behavior; Finny does not consume or display the personal cap separately, and this pass adds no Finny surface.

---

## 6. Card states (all cards)
Every card defines these states (spec dashboard AC-7), unchanged by the refresh:
- **Loading:** skeleton per card type (hero number placeholder, chart bar placeholders, 3-row list skeleton). No unbounded spinner.
- **Error:** a single full-dashboard error state with retry; no partial cards when an aggregation fails.
- **Empty:** plain-language state pointing to the first action (add a transaction). Budget unset shows the `atur budget` state.
- **Filtered-empty:** filter with no rows shows a clear message + reset-filter action.

---

## 7. Bottom navigation redesign (proposed 2026-10-22, pending PM review)

### 7.1. User goal
The current mobile bottom pill renders 10px labels inside 48px items and gives only a faint active treatment, which reads "too small/plain". The section keeps **exactly the current five destinations and the same single Add action** (A-27/A-31), and changes only size, weight, and selected-state treatment. No route, no destination, no icon family change: the same existing lucide icons (`LayoutDashboard, PiggyBank, Plus, ReceiptText, Users`) as the actual `BottomNav.tsx`.

### 7.2. Decision log (design reason, R-31)
- **Hierarchy the nav expresses (token-level intent, mirrored from doc 01 §5.2a):** the bar separates three roles, and each role gets a different existing-token treatment: the **navy shell is structure** (stable frame, never resized), the **route items are places** (icon + label; the current place wears the tint pill `#DCEBFA` + label weight), and the **center `Tambah` is the one action** (the only filled green disc, the only element that may break the pill's top line). Good mobile navs read as *"where am I, where else can I go, and what is the main thing I can do"*; this spec makes each of the three answers visible without adding levels or items.
- **56px item + 11px label:** the smallest label scale that fixes the "too small" complaint without pushing the shell past comfort inside 390px.
- **Two-signal active state:** tint pill + label weight, so the selected state is readable for color-blind users and feels chosen, not merely hovered.
- **60px green `Tambah` disc:** the center action was nearly the same size as the label items; raising its size is the only way to give it prominence while keeping a single nav level.

### 7.3. Item spec (mobile only, one nav system per breakpoint)
| Property | Value | Token source |
| :--- | :--- | :--- |
| Shell | navy floating pill, unchanged: `inset-x-3 bottom-3` plus `env(safe-area-inset-bottom)`, `bg-[#14273F]/95 backdrop-blur-md rounded-full shadow-floating-nav border-white/10` | doc 01 §5.2 + §5.2a safe-area |
| Inner padding | `p-1.5`, `gap-1.5` | fits larger items at 390px |
| Route item touch target | full item `min-h-[56px]`, full-width column cell | doc 01 §6.4 (44px floor stays the minimum; 56 is the nav floor) |
| Item content | icon `h-5 w-5` + label `text-[11px] font-semibold`; single column like today | labels always visible, never icon-only |
| Active route item | `bg-[#DCEBFA] rounded-full text-[#14273F]`, icon at full opacity, label `font-bold` | two signals: tint pill + weight (doc 01 §6.2) |
| Inactive route item | `text-white/60`, `hover:text-white`, `font-medium` | unchanged pair |
| `Tambah` (center) | `h-[60px] w-[60px] rounded-full bg-[#166534] shadow-pill`, `Plus` at `h-7 w-7` white, raised `-mt-6`, `hover:bg-[#155C30]`; label `Tambah` keeps its own 11px line under the disc | same action, same add sheet, `?add=1` unchanged |
| Active-route detection | unchanged from `BottomNav.tsx` (`matchPrefix`) | no behavior change |

### 7.4. Wireframe (390px)
```
+------------------------------------------------------+
| ( Beranda   )( Budget   )    Tambah    )( Aktivitas )( Keluarga ) |
|  icon        icon        (o) 60px      icon        icon         |
|  label       label           label     label       label       |
| navy pill shell, 56px rows, tint pill on active item  |
+------------------------------------------------------+
```
The green disc overlaps upward out of the pill shell line to gain importance without a second FAB layer.

### 7.5. States and a11y
- `aria-label` per link unchanged (`Tambah transaksi` for the center); `aria-current="page"` on the active route.
- Focus-visible ring on every item (§5.1 focus pattern, adapted to navy shell: `ring-[#DCEBFA]/60`).
- Reduced motion: no rise/scale animation added on the disc beyond the existing hover/active transitions.
- Tablet/desktop unchanged: `FloatingNavbar` stays the single nav system (this section touches only `< 768px`).

### 7.6. Off-limits
No sixth item, no text "Profil" tab, no route change, no new sheet, no relabel. Destinations, action targets, and copy stay exactly as today.

---

## 8. Savings contribution (pending PM review; PM-confirmed direction encoded and revised, 2026-10-22)

### 8.1. Product decision (recorded verbatim as direction; revised second pass)
The user chose **manual progress record**, not an actual transaction: a contribution is an immutable log event against a savings goal. Per the PM-confirmed decisions: no wallet transaction is created, no wallet balance or budget changes, no wallet affiliation is required, and no row appears in Beranda's `Aktivitas terbaru`. **Both directions are recorded:** the existing positive `Tambah saldo` and the negative `Kurangi` goal actions each create a history event, so the goal's activity explains why progress changed in either direction. Both the goal-level controls and the global `Tambah -> Catat progres` path record events the same way. History events are immutable and **cannot be deleted**; there is no editing or removing of recorded entries. The optional note field is **removed** (scope trim, user decision): an entry carries only date, amount (signed), and the authoring member. The existing direct goal flows in `GoalsSection` stay available unchanged. **No Spec/Dev Plan/API text is changed here**; data fields and the actual endpoint are outside the design docs.

### 8.2. Entry point: from the global `Tambah` sheet
The nav `Tambah` today opens the existing add sheet (dual tab `Isi manual / Scan struk`, doc 03). The proposed change adds a third way in, without altering the two existing tabs or their behavior (field suppression for this mode: doc 03 §1/§2.2):
```
+--------------------------------------------------------+
|  Tambah                                                |
|  [ Isi manual ] [ Scan struk ] [ Catat progres ] (pills)|
|  tab: Catat progres di bawah                           |
```
- Trigger surface: the segmented pill row grows from two to three pills; the new pill label is `Catat progres`. Tapping selects the third mode; existing tabs keep their exact behavior.
- Alternative copy considered and rejected: `Masuk ke target` (reads like a login) and `Tabungan` (vague). `Catat progres` names the result, per the plain-language contract (doc 01 §1.1).
- Equivalent value, two doors: the goal-level `Tambah saldo` / `Kurangi` controls and this sheet mode are **two entry points to the same underlying record**; the design gives neither a privileged status and the history rows do not (and must not) encode which door was used as a different event kind.

### 8.3. Contribution form (same sheet, third tab; note field removed)
```
+--------------------------------------------------------+
|  Catat progres tabungan                                |
|  helper: Progres ini dicatat ke target, bukan transaksi |
|                                                        |
|  Target: [ pilih target (picker) ]                     |
|  Jumlah: Rp [ 250000 -> tampil Rp250.000 ]             |
|  (live grouping, doc 01 §5.8)                          |
|                                                        |
|  +-------------------------------------------+         |
|  |  ( Catat progres (Pill) )                 |         |
|  +-------------------------------------------+         |
+--------------------------------------------------------+
```
- **Target:** required. The picker reuses the existing picker pattern from doc 06 §7.1, presenting the user's own visible goals under the current household scope; a user with no goals gets the empty state `Belum ada target. Buat target dulu di /budget.` with a link back, keeping the form open per draft-preservation (doc 03 §5.3).
- **Jumlah:** required, exact integer rupiah, live grouping per doc 01 §5.8; submit disabled until valid. **Direction is explicit, not signed by amount:** the sheet-level form records an increase by default; a decrease entry belongs to the goal-level `Kurangi` control (both directions share one history shape, but the global quick-add path keeps its single positive purpose so no sign toggle legibility problem is introduced on mobile).
- **No note field:** an entry is date + amount + authoring member only. The user confirmed dropping the optional note; nothing in the history UI reserves space for it.
- **Explicit non-transaction framing:** the short helper under the title says `Progres ini dicatat ke target, bukan transaksi` so the user knows what will and will not happen. A wallet picker never appears in this tab.

### 8.4. History, feedback, and effects
- **On success (sheet path):** the sheet closes and a neutral-success chip appears inside the mint well of the target card (existing chip pattern): `Progres tercatat +Rp250.000 (contoh)`. Amount keeps the sign-binds-with-color rule (§2.3 money-in for `+`); a decrease chip reads `Progres tercatat -Rp50.000 (contoh)` in neutral ink with the `-` sign.
- **Goal history (both paths, both directions):** the goal's history gains one immutable event per entry: date, signed amount, authoring member. Increase and decrease events are the same kind of row with a different sign, so reading the history explains every progress change. No silent merging of entries; no editing; no deletion of history entries in this design.
- **Legacy saved amounts (no backfill):** goals whose `saved` amount predates this change get **no fabricated history rows** (R-17: no invented data). Their history simply starts at the first recorded event; the empty history state says `Riwayat dimulai dari catatan pertama.` so a blank list is understood as honest, not broken.
- **Goal progress:** the target card's progress number and bar re-render after submit. The goal model stays household-scoped; access to a goal and to its history **inherits the existing goal ACL** (approved members see the goals they see today); no personal-goal concept is invented and no new permission rule is designed here.
- **Not created anywhere else:** no row in `Aktivitas terbaru` of Beranda because it is not a wallet transaction; no wallet balance, no budget card, and no budget chart changes from a contribution; no wallet link of any kind on the event.

### 8.5. States
- **Loading:** submit button in submitting state with the existing pattern; no optimistic history row.
- **Error:** inline field errors reuse doc 01 §5.7 forms (`required`, invalid amount); server error shows a plain retry sentence inside the sheet (`Gagal mencatat. Coba lagi.`).
- **Empty target list:** the picker's empty state links to existing goal creation (see 8.3).
- **Empty history:** the history block shows the legacy-aware copy `Riwayat dimulai dari catatan pertama.` (see 8.4), not an error look.
- **Permission:** a user cannot record progress against a goal they cannot already see; the form inherits the goal list's scope and the doc 06 §11 read-only variant is untouched. Nothing here grants new visibility, including no cross-member personal data.

### 8.6. Open items for PM (not settled at design level)
- Exact API/DTO shape for the immutable history record and its ordering/persistence behind the goal history (Spec/Dev Plan follow-up, PM-owned).
