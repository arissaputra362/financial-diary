# Financial Planner UI/UX Design System & Specification

Welcome to the UI/UX design specifications for the Financial Planner MVP. This is a mobile-first **family budgeting app** where available money, monthly budget progress, money in/out, and recent activity are visible first. Bento containers group these tasks, while the compact app header and bottom navigation keep the product feeling like a real finance app.

> **Canonical status:** these documents are the source of truth for UI/UX and are owned by the UI/UX Designer (A-32). UI copy ships in **Bahasa Indonesia** (A-30). Routes follow the canonical table A-31. `interactive-mockup.html` is evidence-only and is NOT canonical.

## 📁 Design Documentation Index

| Document | Content & Focus |
| :--- | :--- |
| **[01-design-system-tokens.md](01-design-system-tokens.md)** | Color palette (HEX & Tailwind), pastel gradient tokens, typography scale, pill/radii rules, drop shadows, canonical Indonesian vocabulary, and WCAG AA accessibility. |
| **[02-bento-dashboard-wireframes.md](02-bento-dashboard-wireframes.md)** | Desktop 12-column Bento Box grid, mobile single-column stacked layout, ASCII wireframes, card-by-card breakdown, and card states. |
| **[03-transaction-and-ocr-flow.md](03-transaction-and-ocr-flow.md)** | Dual-tab modal (Isi manual vs Scan struk), AI scanning state, editable review screen, honest failure states, and 5s soft-delete undo toast. |
| **[04-auth-and-household-admin.md](04-auth-and-household-admin.md)** | Invite-based authentication, "Menunggu persetujuan" waiting room, DECLINED/REVOKED variants, Owner member management, and the minimal `/profile` page. |
| **[05-ai-advisor-panel.md](05-ai-advisor-panel.md)** | AI Advisor "Finny" interaction patterns, bounded action pills, period picker, and source-period/limitations footer. |
| **[interactive-mockup.html](interactive-mockup.html)** | Evidence-only, superseded reference. Not canonical, do not implement from this file. |

---

## 🎨 Key Visual Aesthetics Reference

  - 🍑 Warm Peach: `from-orange-100/80 via-amber-50/70 to-rose-50/60` (Hero Uang Tersedia)
  - 💜 Soft Lavender: `from-purple-100/90 via-indigo-50/70 to-purple-50/50` (Kartu Advisor)
  - 🌿 Soft Mint: `from-emerald-100/70 via-teal-50/60 to-green-50/50` (Target Tabungan)
  - ⚪ Pure White with Soft Shadow: `bg-white shadow-bento` (Grafik Pengeluaran & Aktivitas)
- **Shapes:** Super-rounded corners (`rounded-3xl` / `rounded-4xl` for Bento cards, `rounded-full` for all buttons, tabs, and tags).
- **Icons:** Circular icon badges with pastel backgrounds (Makanan 🍔, Transportasi 🚗, Tagihan ⚡, Kopi ☕).

## 🧭 Designed for first-time users

The design uses outcome-first language so people can use it without a guide:

- **Beranda** shows `Uang tersedia`, `Budget bulan ini`, and `Target tabungan`.
- **Tambah transaksi** offers `Isi manual` or `Scan struk`; technical terms such as OCR and the model name stay in implementation notes.
- Buttons describe what will happen: `Simpan transaksi`, `Izinkan bergabung`, `Periksa lagi`, and `Pindahkan ke Trash`.
- **Keluarga** replaces admin language, and the waiting room replaces the cold 403 screen.
- Each section has one clear primary action, while unfamiliar actions include short helper text.

The detailed rules live in [01-design-system-tokens.md](01-design-system-tokens.md) under **Plain-language interaction contract**.

