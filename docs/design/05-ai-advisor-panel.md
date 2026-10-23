# AI Financial Advisor ("Finny") Panel Design

> **Canonical status:** Behavior remains PM-approved; visual refresh PM-approved for T-010 (2026-10-20). Persona, bounded action pills, period picker, footer rules, and error states are unchanged. Updated 2026-10-20 by the UI/UX Designer: Finny surfaces restyled to the navy structural token `#14273F` with white text (doc 01 §2.1); lavender/purple references retired; **placement clarified: Finny lives only on `/budget` (panel + drawer). `/home` renders no Finny card, matching the actual `DashboardView.tsx`.** Ticket: T-010 (visual refresh).
> **Cross-reference (2026-10-22, revised, PM review requested):** the savings-contribution flow (`Catat progres` inside the global Tambah sheet) now records an immutable per-goal history event for **both increase and decrease** entries from two entry points (the sheet mode and the goal-level `Tambah saldo` / `Kurangi` controls); the optional note field was removed by user decision; history inherits the existing household-goal ACL; not a wallet transaction, no wallet/budget effect, no Beranda activity row. Spec: doc 02 §8. The goal-form target amount, add-to-savings, and contribution amount adopt the IDR live grouping of doc 01 §5.8. The weekly plan slider here keeps its current format. Goals business rules themselves are unchanged in this document.

## 1. Persona & Tone Guidelines
The AI Advisor is named **Finny** (represented by a playful friendly avatar 🦉 / ✨). Finny transforms cold transaction numbers into encouraging, proactive financial guidance for families and laypeople. The model name is never shown in the UI (A-30).

### Voice & Tone Principles:
- **Encouraging, Never Preachy:** No guilt-tripping about spending. Frame insights positively (e.g. *"Keren, kamu masak di rumah 4 hari minggu ini!"* instead of *"Kamu terlalu banyak makan di luar"*).
- **Layperson Clarity:** Zero financial jargon (no CAGR, Sharpe ratio, or EBITDA). Use terms like *"Dana cadangan"*, *"Sisa uang bulan ini"*, and *"Tabungan liburan"*.
- **Action-Oriented, but bounded:** Every insight may include a pill action, but the action type is limited to the enum `VIEW_GOAL | REVIEW_SPENDING | NONE` (spec AC-8). The advisor never moves money or sets alerts on its own.

---

## 2. Bento Card & Panel UI Components

### 2.1. Budget-page Finny panel (Compact View, static, A-28)
- **Placement: `/budget` only.** The panel sits with the budget content (above the goals section, mirroring `AdvisorPanel.tsx` inside `BudgetView.tsx`). It is NOT rendered on `/home`; the dashboard has no advisor card (doc 02 §0 correction pass). Moving it to Beranda would be a new surface and needs explicit PM approval.
- Navy panel background (`#14273F` with white/`#DCEBFA` text, solid, no gradient; `border border-white/10 rounded-3xl p-6`; doc 01 §2.1). The former lavender gradient is retired (doc 01 §2.5).
- Static invitation copy only, no server data and no invented numbers. Example: *"Lihat saran untuk pengeluaran keluargamu bulan ini."*
- **CTA pill:** `Lihat saran` renders as a light pill on the navy panel (`bg-white text-[#14273F] hover:bg-[#DCEBFA]`) or the blue scan/AI accent pill outside the panel; one filled CTA only.

### 2.2. Interactive Advisor Drawer / Slide-Over (Full View)
Tapping the Finny panel on `/budget` opens an interactive drawer from the right on desktop, or a full-screen sheet on mobile.

```
+-------------------------------------------------------------+
| ✨ Finny • Asisten keuangan keluarga          [ X Tutup ]    |
+-------------------------------------------------------------+
|                                                             |
| (Finny Avatar 🦉)                                           |
| "Hai Sarah! Aku sudah melihat pengeluaran keluargamu        |
|  bulan ini. Masih ada Rp1.240.000 di budget fleksibelmu."   |
|                                                             |
| PERIODE:  [ Minggu ini ] [ Bulan ini ] [ 30 hari terakhir ] |
|           [ Pilih rentang... (maks 90 hari) ]               |
|                                                             |
| +---------------------------------------------------------+ |
| | 💡 INSIGHT                                              | |
| | Tagihan listrikmu Rp24.000 lebih rendah dari bulan lalu.| |
| |                                                         | |
| | [ Lihat target tabungan (pill) ]  [ Nanti saja ]        | |
| +---------------------------------------------------------+ |
|                                                             |
| INSIGHT TERBARU (bukan riwayat chat):                       |
| Finny merangkum periode yang dipilih dan menampilkan        |
| periode sumber serta batasannya.                            |
|                                                             |
| [ Minta insight baru ]                                      |
+-------------------------------------------------------------+
```

### 2.3. Period picker (spec AC-5)
- Presets: `Minggu ini`, `Bulan ini`, `30 hari terakhir`, and `Pilih rentang...`.
- The custom range picker allows a maximum of 90 days; `start == end` is allowed; `start > end` is rejected client-side before calling the API.
- The chosen period is shown in the insight footer as the source period.

### 2.4. Action pills (bounded enum)
- Each insight may show at most one action pill. Its label is free text (≤80 chars) but its `type` must be one of `VIEW_GOAL`, `REVIEW_SPENDING`, or `NONE`.
- `VIEW_GOAL` navigates to the goals section on `/budget`; `REVIEW_SPENDING` scrolls to the spending chart; `NONE` renders no action.
- Forbidden: money-movement or alert-setting actions (for example moving money to a goal or setting a spending alert). The advisor never performs these.

### 2.5. Footer: source period & limitations (spec AC-8)
- The drawer footer always shows the source period and the limitations text.
- At 390px the footer is pinned so it stays visible without scrolling; limitations must never be hidden behind scroll or interaction.

---

## 3. Deferred projection concepts

The interactive prompt list, chat composer, and what-if savings simulator shown in earlier explorations are deferred. They have no MVP route or persistence contract. T-007 implements the bounded period insight only, with its source period and limitations visible.

For future planning, the following concept is retained for a later feature:

### 3.1. What-If Scenario Widget
- **Interactive Slider:** `[ Atur tabungan mingguan: Rp50rb / mgg --------O-- Rp250rb / mgg ]`
- **Dynamic Outcome Pill:**
  - *"Dengan Rp120rb/minggu, 🏖️ Liburan Akhir Tahun (Rp3.000.000) akan terkumpul pada **14 Nov 2026** (3 minggu lebih cepat!)"*
- **Visual Curve:** A smooth SVG area chart with soft green gradient fill (`from-emerald-400/30 to-transparent`) showing the trajectory.

---

## 4. Error & Fallback States
Because the MVP relies on the model's free tier, the UI must gracefully handle rate limits or network issues:
- **Rate-limit state:** *"Coba lagi sebentar."* (Soft amber pill banner). No promise of an automatic retry and no countdown.
- **Cached insight:** When generation is rate-limited or unavailable and an unexpired cache exists for the requested period, display it with a subtle badge *"Menampilkan insight tersimpan"*. If no cache exists, show the unavailable state without invented advice.
- **Unavailable / invalid output:** a plain-language state with a `[ Coba lagi ]` action; never fabricated guidance.
