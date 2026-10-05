# Design System Tokens & Guidelines: Bento Financial Planner

## 1. Overview & Aesthetic Philosophy
The Financial Planner MVP is built around a **Modern Bento Box** dashboard layout. It merges a playful, friendly EdTech/SaaS aesthetic with clean financial data visualization tailored for everyday laypeople, families, and students.

### Core Principles
1. **Playful Yet Reassuring:** Uses soft pastel gradients (warm peach, gentle lavender, soft mint) against an off-white canvas, paired with a sleek, floating dark charcoal header.
2. **Extreme Softness & Touchability:** High corner radii (`rounded-3xl` for cards, `rounded-full` for buttons and badges). Everything feels approachable and friendly, banishing intimidating corporate finance vibes.
3. **Bento Box Organization:** Information is structured into distinct, bite-sized container cards of varying sizes and proportions, creating clear visual hierarchy and effortless scanning.
4. **No Accounting Jargon:** Replace terms like *Accounts Payable/Receivable, Debit/Credit, Reconciliation, Amortization* with human phrases like *Uang masuk, Uang keluar, Sisa uang, Target tabungan*.

### 1.1 Plain-language interaction contract
The interface must be understandable without a guide. Every visible action follows these rules:

| Rule | Use | Avoid |
| :--- | :--- | :--- |
| Name the result | `Tambah transaksi`, `Simpan perubahan`, `Izinkan bergabung` | `Submit`, `Continue`, `Approve access` |
| Use everyday money language | `Uang masuk`, `Uang keluar`, `Mau menabung untuk apa?` | `Income`, `Expense`, `Target`, `Ledger` |
| Explain AI in the helper text | `Scan struk` + `AI membaca detailnya untukmu` | `AI OCR`, nama model AI, `OCR flow` |
| Keep one primary action per area | One filled button with a clear outcome | Several filled buttons with equal emphasis |
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
| OCR/AI extraction | **Scan struk** / **AI membaca struk** | OCR, nama model AI, AI extraction |
| Soft delete | **Pindahkan ke Trash** | Soft delete, Delete |
| Trash | **Trash** | Deleted items, Sampah |
| Restore | **Pulihkan** | Restore, Undo (kecuali toast) |
| Owner | **Pemilik keluarga** | Admin, Admin keluarga |
| Member | **Anggota** | User, Member |
| Invite code | **Kode undangan** | Invite, Token |

**Copy teknis dilarang di UI:** istilah OCR, JWT, ledger, admin, dan nama model AI tidak boleh muncul di teks yang dilihat user (A-30). Istilah teknis hanya boleh ada di catatan implementasi.

---

## 2. Color Palette & Design Tokens

### 2.1. Brand & Structural Colors
| Token Name | Hex Code | Tailwind Equivalent | Role / Usage |
| :--- | :--- | :--- | :--- |
| `surface-canvas` | `#F8F9FD` | `bg-[#F8F9FD]` / `bg-slate-50` | Primary app page background |
| `nav-charcoal` | `#15171C` | `bg-[#15171C]` | Floating top navigation bar background |
| `nav-charcoal-pill`| `rgba(255,255,255,0.12)` | `bg-white/12 text-white` | Active item pill inside floating navbar |
| `card-surface` | `#FFFFFF` | `bg-white` | Base neutral card surface |
| `card-border` | `#EEF1F6` | `border-slate-100` / `border-[#EEF1F6]` | Subtle card outline border |
| `text-primary` | `#0F172A` | `text-slate-900` | High-emphasis headings, main balance numbers |
| `text-secondary`| `#475569` | `text-slate-600` | Subtitles, labels, transaction descriptions |
| `text-muted` | `#64748B` | `text-slate-500` | Helper text, timestamps, placeholder copy (kontras AA 4.5:1) |
| `text-disabled` | `slate-400` | `text-slate-400` | Disabled controls only, never for readable helper text |

### 2.2. Playful Pastel Gradients (The "Bento" Mood)
Each Bento Card utilizes a distinct soft pastel wash to establish identity without visual fatigue:

| Palette Token | Gradient Definition | CSS / Tailwind Syntax | Ideal Bento Card Usage |
| :--- | :--- | :--- | :--- |
| **Pastel Lavender** | `#F3E8FF` → `#E0E7FF` | `bg-gradient-to-br from-purple-100/80 via-indigo-50/70 to-purple-50/40` | AI Insights, Advisor Panel, Projections |
| **Pastel Peach / Coral** | `#FFE8D6` → `#FED7AA` | `bg-gradient-to-br from-orange-100/70 via-amber-50/60 to-rose-50/50` | Hero Balance Card, Spending highlights |
| **Pastel Mint / Sage** | `#DCFCE7` → `#CCFBF1` | `bg-gradient-to-br from-emerald-100/70 via-teal-50/60 to-green-50/40` | Savings Goals, Income Positive balance |
| **Pastel Sky Blue** | `#E0F2FE` → `#DBEAFE` | `bg-gradient-to-br from-sky-100/70 via-blue-50/60 to-indigo-50/40` | Recent Activity summary, Filter bar |
| **Card Pure White** | `#FFFFFF` | `bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]` | Data-heavy feeds, Transaction history |

### 2.3. Semantic Accents
| Token | Hex | Tailwind Class | Semantic Meaning |
| :--- | :--- | :--- | :--- |
| `success-emerald` | `#10B981` | `text-emerald-600`, `bg-emerald-500` | Money In (+), Approved, Target Complete |
| `danger-rose` | `#F43F5E` | `text-rose-600`, `bg-rose-500` | Money Out (-), Denied, Soft Delete alert |
| `warning-amber` | `#F59E0B` | `text-amber-600`, `bg-amber-400` | Pending Approval, Approaching Budget limit |
| `ai-magic-purple` | `#8B5CF6` | `text-purple-600`, `bg-purple-600` | AI actions, scan buttons, sparkles ✨ |

---

## 3. Typography Scale & Hierarchy

### Recommended Fonts
- **Primary Display & Headings:** `Plus Jakarta Sans`, `Outfit`, or system `sans-serif` (friendly, geometric, highly legible).
- **Body & Numerical Figures:** `Inter` with tabular figures enabled (`font-mono` or the `tnum` OpenType feature) for financial alignment.

| Level | Size (rem/px) | Weight | Line Height | Tailwind Class | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Display** | 2.5rem / 40px | Bold (700) | 1.1 | `text-4xl font-bold tracking-tight` | Main available money (Rp14.250.800) |
| **Title 1 (Cards)** | 1.5rem / 24px | SemiBold (600)| 1.25 | `text-2xl font-semibold tracking-tight` | Bento Card titles, modal headers |
| **Title 2 (Sections)**| 1.125rem / 18px | SemiBold (600)| 1.3 | `text-lg font-semibold` | Goal titles, transaction groupings |
| **Body (Regular)** | 0.938rem / 15px | Normal (400) | 1.5 | `text-[15px] font-normal leading-relaxed` | Notes, descriptions, form inputs |
| **Body (Strong)** | 0.938rem / 15px | Medium (500) | 1.5 | `text-[15px] font-medium` | Transaction merchant, list titles |
| **Caption / Label** | 0.75rem / 12px | Medium (500) | 1.4 | `text-xs font-medium uppercase tracking-wider` | Form labels, category tags, timestamps |

---

## 4. Radii, Spacing & Shadows

### 4.1. Corner Radii (Pill & Super-Rounded Standard)
- **Bento Containers & Modals:** `rounded-3xl` (`24px` to `28px`). Generous curves that define the Bento aesthetic.
- **Buttons, Badges, Tabs, Search Bars:** `rounded-full` (`9999px`). Complete pill shapes for interactive touch points.
- **Inner Form Inputs, Progress Trackers:** `rounded-2xl` (`16px`).
- **Circular Category Badges:** `rounded-full` (`w-11 h-11` or `w-12 h-12`).

### 4.2. Elevation & Drop Shadows
Soft, ambient shadows that elevate cards naturally without heavy dark outlines:
```css
/* Tailwind custom shadow tokens */
--shadow-bento: 0 10px 30px -5px rgba(15, 23, 42, 0.04), 0 0 1px 1px rgba(15, 23, 42, 0.02);
--shadow-floating-nav: 0 20px 40px -10px rgba(0, 0, 0, 0.25);
--shadow-pill: 0 4px 14px 0 rgba(0, 0, 0, 0.08);
--shadow-hover: 0 14px 28px rgba(15, 23, 42, 0.08);
```

---

## 5. UI Component Primitives

### 5.0 Action hierarchy and button labels
- **Primary action:** one dark or semantic filled pill per section, using a clear outcome such as `Add a transaction` or `Save to family list`.
- **Secondary action:** outlined or white pill for a useful alternative such as `Scan a receipt` or `Check again`.
- **Tertiary action:** text or icon-only control for low-frequency actions. Icon-only buttons must include `aria-label`, `title`, and a minimum 48px touch area.
- **Destructive action:** state the consequence, for example `Decline request` or `Move to trash`; never rely on an unlabeled trash icon.
- **Helper copy:** keep technical terms such as OCR and soft delete out of primary labels.

### 5.1. The Floating Charcoal Navigation Bar
- **Positioning:** Fixed or sticky top, centered, width: `w-full max-w-4xl px-4 py-2.5` on desktop; on mobile floats `inset-x-4 top-3` with backdrop blur.
- **Background:** `bg-[#15171C]/90 backdrop-blur-md text-white border border-white/10 rounded-full shadow-floating-nav`.
- **Navigation Items:**
  - Pill active state: `bg-white/15 text-white font-medium px-4 py-1.5 rounded-full transition-all`.
  - Inactive state: `text-white/60 hover:text-white px-3 py-1.5 rounded-full transition-colors`.
  - User avatar with status indicator dot.

### 5.2. Pill Buttons & Action Controls
- **Primary Action (Brand / AI):**
  `bg-slate-900 text-white hover:bg-slate-800 px-5 py-2.5 rounded-full font-medium shadow-sm transition-all active:scale-[0.98]`
- **Magic / OCR Scan Pill:**
  `bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-95 px-5 py-2.5 rounded-full font-medium shadow-md shadow-purple-500/20 flex items-center gap-2`
- **Secondary Pill:**
  `bg-white/80 hover:bg-white text-slate-700 border border-slate-200 px-4 py-2 rounded-full font-medium shadow-sm`
- **Ghost Pill:**
  `hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full transition-all`

### 5.3. Segmented Controls (Tabs)
- Wrapped in a pill container: `bg-slate-100/90 p-1 rounded-full flex items-center gap-1`.
- Selected tab: `bg-white text-slate-900 font-medium px-4 py-1.5 rounded-full shadow-sm transition-all`.
- Unselected tab: `text-slate-500 hover:text-slate-900 px-4 py-1.5 rounded-full text-sm font-medium transition-colors`.

### 5.4. Rounded Bar Charts
- Charts use bars with fully rounded tops or pill caps: `rounded-t-xl` or `rounded-full`.
- Bar colors align to the semantic accents (400-weight, matching `success-emerald` / `warning-amber` families):
  - Uang masuk bar: Soft emerald/mint (`#34D399` / `bg-emerald-400`).
  - Uang keluar bar: Soft coral/peach (`#FB923C` / `bg-orange-400`).
  - Active hover state: Darker accent with tooltip overlay showing the exact IDR amount (integer, e.g. `Rp214.500`).

### 5.5. Circular Icon Badges
- Size: `44px x 44px` (`w-11 h-11 rounded-full flex items-center justify-center`).
- Subtle pastel backgrounds corresponding to categories:
  - 🍔 Groceries / Food: `bg-orange-100 text-orange-600`
  - 🏠 Housing / Utilities: `bg-blue-100 text-blue-600`
  - 🚗 Transport / Fuel: `bg-indigo-100 text-indigo-600`
  - 🎮 Entertainment: `bg-purple-100 text-purple-600`
  - 💼 Salary / Income: `bg-emerald-100 text-emerald-600`
  - 🏥 Health / Wellness: `bg-rose-100 text-rose-600`

---

## 6. Accessibility & Inclusivity Guidelines (WCAG AA)
1. **Contrast Ratios:** All body text maintains minimum `4.5:1` contrast ratio against backgrounds. Deep slate (`#0F172A`) is used on pastel and white surfaces.
2. **Text Equivalents for Emojis & Badges:** Every visual badge includes an `aria-label` (e.g. `aria-label="Food and Groceries Category"`).
3. **No Sole-Color Indicators:** Positive amounts explicitly feature the `+` sign and green text; negative amounts feature `-` and standard text or subtle red text, ensuring colorblind clarity.
4. **Touch Target Sizing:** Mobile buttons and interactive pills meet or exceed `48px x 48px` tappable areas with padding.
5. **Plain-language test:** A first-time user should know what will happen after tapping each filled button without reading documentation.
6. **Focus and status:** Every button, tab, input, and link has a visible keyboard focus state. Loading, success, error, and disabled states use the same plain-language action vocabulary.
