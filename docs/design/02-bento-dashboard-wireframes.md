# Bento Box Dashboard Wireframes & Layout Specs

## 1. Finance App Architecture

The dashboard follows a recognizable budgeting app rhythm first, with bento containers used only where they help group information. The first viewport answers four questions in order: **How much money is available? How much budget is left? Where did money go? What happened recently?**

### 1.1 Reference-aligned screen order
1. Desktop uses a compact app header with family navigation; mobile uses only the bottom navigation.
2. Greeting and current date.
3. Available money (uang tersedia) with family account context and quick actions.
4. Monthly budget progress with the amount still available to spend.
5. Daily spending chart with its period filter directly above the data.
6. Target tabungan.
7. Recent activity feed with local `Semua / Uang masuk / Uang keluar / Struk hasil scan` filters.

Colors, icons, typography, pastel accents, and rounded shapes remain defined by the existing design tokens. The reference informs information hierarchy and spacing, not the visual theme.

### 1.2 Canonical navigation (A-27, A-31)
There is exactly one navigation system per breakpoint. No legacy variant is kept.

- **Mobile (`< 768px`):** bottom navigation only, 5 items: `Beranda`, `Budget`, `Tambah` (center action), `Aktivitas`, `Keluarga`.
- **Desktop (`>= 1024px`):** top navigation with the same destinations `Beranda`, `Budget`, `Aktivitas`, `Keluarga`, plus a pill action `Tambah transaksi` (an action that opens the Add sheet, not a link) and the user avatar.
- **Removed:** `Overview`, `Goals`, and the old `Home / Scan / History / AI` bottom bar. Goals live on `/budget`; the advisor is a drawer inside `/budget`, not a nav item.

## 2. Bento Grid Architecture

The dashboard organizes complex financial data into a modern, playful "Bento Box" grid of modular cards with rounded corners (`rounded-3xl`).

### 2.1. Responsive Breakpoints
- **Desktop (`lg` / `xl` ≥ 1024px):** 12-column Bento Grid with asymmetrical card spans creating visual rhythm.
- **Tablet (`md` 768px - 1023px):** 2-column simplified Bento Grid.
- **Mobile (`< 768px`):** Single-column stacked card feed with smooth vertical scrolling and one floating bottom navigation. There is no second mobile header navigation.

---

## 3. Desktop 12-Column Layout Wireframe

```
+---------------------------------------------------------------------------------------------------+
|                           [FLOATING CHARCOAL NAVIGATION BAR]                                      |
|    LOGO (Planner ✦)    [ Beranda (pill) ]  [ Budget ]  [ Aktivitas ]  [ Keluarga ]  [ + Tambah transaksi ]  (Avatar) |
+---------------------------------------------------------------------------------------------------+

+-------------------------------------------------------------+ +-----------------------------------+
| CARD 1: Hero Uang Tersedia (Col 1-7)                        | | CARD 2: Kartu Advisor (statis)    |
| Soft Peach Gradient (from-orange-100/70 to-amber-50/60)     | | Soft Lavender (from-purple-100/80)|
|                                                             | |                                   |
| Uang Tersedia Keluarga            [Keluarga: Kel. Miller]   | | ✨ Finny                          |
| Rp14.250.800                                                | | "Lihat saran untuk pengeluaran    |
|                                                             | | keluargamu bulan ini."            |
| [ + Rp4.850.000 Masuk ]   [ - Rp2.310.400 Keluar ]          | |                                   |
|                                                             | | [ Lihat saran → (pill) ]          |
| Aksi cepat:                                                 | |                                   |
| ( + Tambah manual )   ( ✨ Scan struk )   ( 🎯 Target baru ) | |                                   |
+-------------------------------------------------------------+ +-----------------------------------+

+-------------------------------------------------------------+ +-----------------------------------+
| CARD 3: Rincian Pengeluaran (Col 1-7)                       | | CARD 4: Target Tabungan Aktif     |
| White Card (bg-white border-slate-100)                      | | Soft Mint Gradient (from-emerald) |
|                                                             | |                                   |
| Header: Pengeluaran         [ Tabs: 7D | 30D | 90D (pill) ] | | Header: Target tabungan (3 aktif) |
|                                                             | |                                   |
| Rounded Bar Chart (Soft Coral / Mint Bars):                 | | 1. 🏖️ Liburan Akhir Tahun (72%)   |
|  Rp800rb |            _                                    | |    Rp2.160.000 / Rp3.000.000      |
|  Rp600rb |    _      | |      _                            | |    [====---]                      |
|  Rp400rb |   | |  _  | |  _  | |  _   _                    | |                                   |
|  Rp200rb |   | | | | | | | | | | | | | |                   | | 2. 🛡️ Dana Darurat (90%)          |
|      Rp0 +---+-+-+-+-+-+-+-+-+-+-+-+-+-+                   | |    Rp9.000.000 / Rp10.000.000     |
|           Sen Sel Rab Kam Jum Sab Min                       | |    [======-]                      |
|                                                             | |                                   |
|                                                             | | 3. 💻 Laptop Kerja (35%)          |
|                                                             | |    Rp700.000 / Rp2.000.000        |
|                                                             | |    [==-------]                    |
+-------------------------------------------------------------+ +-----------------------------------+

+---------------------------------------------------------------------------------------------------+
| CARD 5: Aktivitas Terbaru (Col 1-12 or Col 1-8 + Col 9-12 side widget)                            |
| Clean White Card (bg-white shadow-soft rounded-3xl p-6)                                           |
|                                                                                                   |
| Header: Aktivitas terbaru         [ Filter: Semua | Uang masuk | Uang keluar | Struk hasil scan ]  |
|                                                                                                   |
| (Icon)  Belanja Bulanan            Ditambah Sarah • Kemarin        - Rp142.500    ( ... / Trash ) |
| (Icon)  Gaji Bulanan               Ditambah Alex  • 21 Sep         + Rp3.800.000  ( ... / Trash ) |
| (Icon)  Listrik & Air              Hasil scan     • 19 Sep         - Rp84.200     ( ... / Trash ) |
| (Icon)  Kopi Senja                 Ditambah Sarah • 18 Sep         - Rp9.500      ( ... / Trash ) |
|                                                                                                   |
| Footer: [ Lihat semua aktivitas (pill) ]                               [ + Tambah transaksi ]     |
+---------------------------------------------------------------------------------------------------+
```

> Catatan: tidak ada input pencarian di Card 5. Pencarian item tidak punya kontrak backend di MVP, jadi kontrol itu dihapus (antislop: no fake interactive elements).

---

## 4. Mobile Single-Column Wireframe (`< 768px`)

```
+------------------------------------------+
|  [ Beranda ] [ Budget ] [ + Tambah ] [ Aktivitas ] [ Keluarga ]|
+------------------------------------------+
|                                          |
|  +------------------------------------+  |
|  | HERO UANG TERSEDIA (Peach Gradient)|  |
|  | Uang tersedia                      |  |
|  | Rp14.250.800                       |  |
|  |                                    |  |
|  |  + Rp4.850.000 Masuk  - Rp2.310.400 Keluar |  |
|  +------------------------------------+  |
|                                          |
|  AKSI CEPAT (Horizontal Pill Scroll):    |
|  [ ✨ Scan struk ] [ + Tambah ] [ 🎯 Target ]  (pill ketiga mengintip) |
|                                          |
|  +------------------------------------+  |
|  | KARTU BUDGET BULAN INI             |  |
|  | Budget bulan ini                   |  |
|  | Rp3.000.000 dari Rp5.000.000       |  |
|  | [==========------]  Sisa Rp2.000.000|  |
|  | (state "atur budget" bila belum di-set) |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  | KARTU ADVISOR (Pastel Lavender)    |  |
|  | ✨ Finny                           |  |
|  | Lihat saran untuk pengeluaranmu    |  |
|  | [ Lihat saran (pill) ]             |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  | TARGET TABUNGAN (Carousel / Stack) |  |
|  | 🏖️ Liburan Akhir Tahun             |  |
|  | Rp2.160.000 / Rp3.000.000 (72%)    |  |
|  | [========================--------] |  |
|  +------------------------------------+  |
|                                          |
|  +------------------------------------+  |
|  | AKTIVITAS TERBARU                  |  |
|  | 🛒 Belanja Bulanan     - Rp142.500 |  |
|  | 💼 Gaji Bulanan      + Rp3.800.000 |  |
|  | ⚡ Listrik & Air        - Rp84.200 |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+
|  [ FLOATING BOTTOM PILL BAR ]            |
|  (Beranda)  (Budget)  (Tambah)  (Aktivitas)  (Keluarga)|
+------------------------------------------+
```

> Perilaku 390px: filter pills di kartu aktivitas wrap ke dua baris; quick actions scroll horizontal dengan pill ketiga mengintip (menandakan masih ada item di kanan). Tidak ada horizontal overflow di 390px.

---

## 5. Bento Card Detailed Component Specifications

### 4.1. Card 1: Hero Uang Tersedia Card
- **Styling:**
  - Background: `bg-gradient-to-br from-orange-100/70 via-amber-50/50 to-rose-50/40`
  - Border: `border border-orange-200/50`
  - Rounded: `rounded-3xl`
  - Padding: `p-7`
- **Key Elements:**
  - Label: `text-xs font-semibold uppercase tracking-wider text-orange-800/70` ("Uang tersedia keluarga")
  - Amount: `text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight` (IDR integer, e.g. `Rp14.250.800`)
  - Cashflow Pill Badges:
    - Uang masuk: `bg-emerald-500/10 text-emerald-700 px-3.5 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5`
    - Uang keluar: `bg-rose-500/10 text-rose-700 px-3.5 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5`
  - Household tag: Pill badge indicating active shared ledger (e.g. `👥 Kel. Miller • 3 anggota`).
### 4.2. Card 2: Kartu Advisor (statis, A-28)
- **Styling:**
  - Background: `bg-gradient-to-br from-purple-100/80 via-indigo-50/70 to-purple-50/40`
  - Border: `border border-purple-200/60`
  - Rounded: `rounded-3xl`
  - Padding: `p-6`
- **Key Elements:**
  - Header: Sparkling icon badge (`bg-purple-500 text-white rounded-full p-2`) + Title "Finny".
  - Body: Static invitation copy, no server data and no invented numbers (A-28). Example: "Lihat saran untuk pengeluaran keluargamu bulan ini."
  - Interactive Action: Pill button `bg-purple-900 text-white hover:bg-purple-800 rounded-full px-4 py-2 text-sm font-medium` labeled `Lihat saran`, which opens the advisor drawer on `/budget`.

### 4.3. Card 3: Rounded Bar Chart (Spending Analytics)
- **Styling:**
  - Background: `bg-white`
  - Border: `border border-slate-100`
  - Rounded: `rounded-3xl`
  - Padding: `p-6`
- **Visual Design:**
  - Timeframe Toggle: Segmented control pills `[ 7D | 30D | 90D ]` (same labels everywhere; card title stays period-neutral, e.g. "Pengeluaran").
  - Chart Canvas: Soft gray gridlines with rounded pastel bars.
  - Bars: `rounded-t-2xl` or `rounded-full` caps. Heights represent daily expenditure.
  - Tooltip: On tap/hover, shows a floating pill with exact date and total spent (e.g. `Sab, 22 Sep: Rp214.500`).

### 4.4. Card 4: Target Tabungan Card
- **Styling:**
  - Background: `bg-gradient-to-br from-emerald-100/70 via-teal-50/60 to-green-50/40`
  - Border: `border border-emerald-200/50`
  - Rounded: `rounded-3xl`
  - Padding: `p-6`
- **Goal Item Structure:**
  - Goal Icon: 3D/Emoji in circular container (e.g., 🏝️, 🚗, 🛡️).
  - Target title & deadline date (e.g., "Liburan Akhir Tahun • Target Des 2026").
  - Progress Pill: Dual-layer rounded bar (`bg-emerald-200/60 h-3 rounded-full overflow-hidden` with fill `bg-emerald-500 h-full rounded-full transition-all duration-500`).
  - Values: `Rp2.160.000 dari Rp3.000.000 (72%)` in tabular numbers.

### 4.5. Card 5: Aktivitas Terbaru Feed
- **Styling:**
  - Background: `bg-white`
  - Border: `border border-slate-100`
  - Rounded: `rounded-3xl`
  - Padding: `p-6`
- **Item Row Components:**
  - Circular Category Icon: `w-11 h-11 rounded-full flex items-center justify-center` with pastel background matching category.
  - Title & Member Info: "Belanja Bulanan" (SemiBold) + "Sarah • Kemarin 16:15" (Muted).
  - Scan Tag: Pill badge `bg-purple-50 text-purple-600 text-xs px-2 py-0.5 rounded-full` labeled `Hasil scan` if created from a scanned receipt (no model name in UI).
  - Amount: Tabular numbers, `text-rose-600` for uang keluar, `text-emerald-600` for uang masuk.
  - Soft Delete Action: Hover icon button (Trash can) that triggers instant soft delete with "Undo" notification banner.

### 4.6. Card states (all cards)
Every card must define these states (spec dashboard AC-7):

- **Loading:** skeleton per card type (hero skeleton, chart skeleton with bar placeholders, list skeleton with 3 rows). No unbounded spinner.
- **Error:** a single full error state with a retry button replaces the whole dashboard. No partial cards when any aggregation fails.
- **Empty:** plain-language empty state pointing to the first action (add a transaction). Budget card shows the "atur budget" state instead of a misleading `Rp0`.
- **Filtered-empty:** when an activity filter returns no rows, show a clear filtered-empty message with a reset-filter action.

