# Dev Plan: Penyelarasan Visual UI Aplikasi (T-010)

Detail teknis implementasi untuk task visual refresh. Dokumen ini **Approved by PM (2026-10-20)** untuk implementasi T-010 dan **PM accepted (2026-10-21)** untuk completion task. Dokumen ini bukan approval rilis.

**Status:** `Implementation done / PM accepted` (2026-10-21), bukan approval rilis
**Tanggal:** 2026-10-20 (diperbarui 2026-10-21)
**Ticket:** T-010 (`tickets/13-T-010-ui-visual-refresh.md`, di luar repo; internal, tanpa key Jira)
**Spec:** `docs/spec/feat-visual-refresh.md` (Approved by PM, 2026-10-20)
**Engineer:** Developer
**Estimasi:** tidak ditetapkan; implementasi selesai 2026-10-21

## PM Approval

- **Status:** `Approved` by PM, 2026-10-20.
- **Dasar approval:** UI/UX sign-off atas dokumen desain kanonik `docs/design/01-design-system-tokens.md` sampai `06-wallets.md`, Spec `docs/spec/feat-visual-refresh.md`, serta scope visual-only T-010.
- **Implementasi:** boleh dimulai oleh Developer sesuai T-010. Approval ini tidak menyetujui schema/API/Quick Add bank T-011 dan tidak mengubah business behavior.
- **Rilis:** approval implementasi bukan approval rilis. T-008 tetap melakukan regression dan release gating.

## Catatan Developer: Sumber Kanonik vs Evidence

> **Wajib dibaca sebelum implementasi.**
>
> Board, catalog, dan screenshot di `docs/design/audit-2026-10-visual-refresh/` adalah **evidence-only**. Semua nama, nominal, tanggal, aktivitas, dan label bank di dalamnya adalah data contoh berlabel `(contoh)`, bukan data produksi.
>
> - **Sumber kanonik:** `docs/design/01-design-system-tokens.md` sampai `06-wallets.md` setelah sign-off PM.
> - **Gunakan evidence hanya untuk perbandingan visual:** layout, hierarchy, spacing, state, dan proporsi komponen.
> - **Jangan menyalin angka, nama, atau label fiktif** dari board/catalog/screenshot ke kode, fixture, seed, atau copy produksi.
> - **Palette final, kartu ATM, urutan R-9, nav, cursor `Muat lebih banyak`, dan kasus nilai panjang** harus dibaca dari dokumen kanonik. Evidence tidak boleh menimpa dokumen kanonik.
>
> Lingkungan Dev saat ini memiliki pemeriksaan desain evidence-only pada 390/768/1280. Angka itu **bukan bukti aplikasi**. Setelah dev dimulai, implementasi harus diverifikasi pada aplikasi aktual di tiga viewport tersebut; bukti dan test case tetap dimiliki QA.

## Tujuan dan Latar Belakang

Aplikasi saat ini masih memakai palet hangat dan aksen yang tidak konsisten dengan arah desain terbaru. Beberapa permukaan memakai peach, lavender, atau gradasi violet-fuchsia, sementara dokumen desain kanonik menetapkan tema **blue-white-green**: biru untuk struktur dan konteks uang, putih untuk permukaan, hijau untuk aksi dan nilai positif. Hierarki judul, ikon navigasi, kartu dompet, dan perilaku nominal panjang juga belum seragam lintas layar.

Tujuan T-010 adalah menyelaraskan **presentasi visual seluruh layar existing** dengan dokumen desain yang disetujui, tanpa mengubah data, aturan bisnis, permission, route, pagination cursor, atau state transition. Task ini adalah lapisan visual, bukan fitur baru.

## Referensi

- Spec: `docs/spec/feat-visual-refresh.md` (Approved by PM, 2026-10-20), AC-VIS-1 sampai AC-VIS-8.
- Ticket: `tickets/13-T-010-ui-visual-refresh.md` (di luar repo; internal, tanpa key Jira).
- Desain kanonik:
  - `docs/design/01-design-system-tokens.md` (token, tipografi, nav, ATM card, WCAG).
  - `docs/design/02-bento-dashboard-wireframes.md` (urutan R-9, grid, card states, cursor pagination).
  - `docs/design/03-transaction-and-ocr-flow.md` (manual, scan struk, review, soft delete).
  - `docs/design/04-auth-and-household-admin.md` (login, waiting room, Keluarga, Profil).
  - `docs/design/05-ai-advisor-panel.md` (Finny hanya di `/budget`).
  - `docs/design/06-wallets.md` (ringkasan ganda, kartu ATM generik, picker, arsip, privasi).
- Indeks desain: `docs/design/README.md` (status sign-off dan batas canonical vs evidence).
- Evidence-only: `docs/design/audit-2026-10-visual-refresh/` (board, catalog, screenshot, log). Tidak boleh menjadi sumber implementasi.
- PRD terkait: F2 Dashboard, F3 Transactions, F4 Goals/Advisor, F5 Family/Auth, F6 Wallets. PRD tidak diubah.
- QA (QA-owned, tidak diduplikasi di sini): `docs/qa/verification-matrix.md` dan `docs/qa/user-journey-map.md`.
- Catatan konsistensi instruksi: `AGENTS.md` §4 masih merangkum palette lama. T-010 memperbarui ringkasan §4 agar menunjuk token yang sama dengan `docs/design/01-design-system-tokens.md`; tidak mengubah aturan section AGENTS lain.

## Scope

### In Scope

- Token global dan tipografi: canvas, surface, navy, blue, blue tint, green, mint, bar track, text, border, shadow, focus ring.
- Primitive UI: Button, Card, Field, Input, TextArea, EmptyState, Skeleton.
- App shell dan navigasi: mobile 5 item dengan aksi Tambah, desktop 4 link + aksi Tambah + avatar profil. Destinasi tidak berubah.
- Beranda: urutan R-9, hero pengeluaran bulan ini, dua ringkasan dompet terpisah, kartu dompet ATM generik, aktivitas, budget, chart, target. Finny tetap hanya di `/budget`.
- Budget: BudgetView, GoalsSection, AdvisorPanel. Perilaku dan copy tetap.
- Aktivitas: filter, daftar, detail, Trash/restore, cursor `Muat lebih banyak`.
- Transaksi: sheet Tambah, form manual, scan struk, review OCR, detail transaksi, undo toast.
- Dompet: kartu, ringkasan ganda, picker, form buat/ubah, detail, kelola Aktif/Arsip, scope pill.
- Keluarga, Profil, login/signup, waiting room.
- State sistem: loading, error, not found.
- Nilai uang panjang: nominal tidak dipotong, tidak dibulatkan, dan tidak diubah nilainya. Layout yang menyesuaikan.
- Aksesibilitas: kontras WCAG AA, keyboard, focus visible, touch target minimal 44px, dan label non-warna.
- Verifikasi engineering pada aplikasi aktual di 390, 768, dan 1280 setelah implementasi dimulai.

### Out of Scope

- **T-011 dan seluruh lingkup bank:** tabel `BankInstitution`/`UserCustomInstitution`, katalog bank resmi, import OJK, bank picker, label institusi, perubahan schema/API/DTO wallet, dan **Quick Add persistence**.
- **Perbandingan bulan lalu:** delta month-over-month, chip delta, atau field `previousMonthSpentMinor`.
- **Route atau nav baru:** halaman Laporan, item nav baru, halaman Wallet baru, mengubah route matching, atau mengubah destinasi nav.
- **Perubahan business logic:** agregasi saldo, split Pribadi/Bersama, permission, privacy boundary, soft delete/restore, alur OCR, review-before-save, kalkulasi budget, scope wallet, transfer, dan idempotency.
- **Perubahan database:** schema, migration, seed, backfill, ERD.
- **Perubahan API:** route handler, kontrak Zod, DTO, error code, dan bentuk response.
- **Finny di Beranda**, hero period control, hero quick action, dan status chip budget dengan threshold baru.
- Dark mode, theme toggle, bank linking, atau integrasi rekening.
- Perubahan presisi uang dan penetapan `MAX_SAFE_INTEGER` sebagai batas bisnis.
- Perubahan copy bisnis di luar penyelarasan visual. Copy kanonik tetap.
- Perubahan pada artefak QA dan test plan.

## Perubahan Database

**Tidak ada.**

- `prisma/schema.prisma` tidak berubah.
- Tidak ada migration, seed, backfill, index, atau constraint baru.
- ERD dan flowchart tidak berubah.
- Nilai uang tetap integer minor unit dengan IDR scale 0. T-010 hanya mengubah cara nilai itu ditampilkan.

## Perubahan API dan Kontrak

**Tidak ada API baru dan tidak ada perubahan API existing.**

- Semua route handler di `app/api/**` tetap.
- `types/api.ts`, kontrak Zod, DTO, error code, dan bentuk response tetap.
- Tidak ada field baru untuk hero Beranda. Hero memakai data yang sudah ada:
  - `monthlyBudget.spentMinor` untuk pengeluaran bulan ini.
  - `spending.byDay` untuk metrik `Hari ini`.
  - `monthlyBudget.remainingMinor` untuk `Sisa budget`.
- `lib/format.ts` dan `formatIDR` tidak diubah. Nominal dirender apa adanya dari server.
- `GET /api/dashboard` tetap menjadi satu sumber angka Beranda. Tidak ada perhitungan ulang nilai uang di client.

## Alur Bisnis

1. Pengguna membuka route existing yang memang berhak diaksesnya.
2. App shell merender navigasi sesuai breakpoint. Destinasi dan aksi Tambah tetap sama.
3. Halaman memuat data lewat API existing dan mempertahankan state loading, error, empty, filtered-empty, disabled, submitting, success, dan permission.
4. Lapisan visual memetakan data ke token dan komponen baru. Tidak ada nilai yang dihitung ulang atau diubah.
5. Pengguna berinteraksi dengan form, sheet, filter, detail, Trash/restore, dan OCR review seperti perilaku existing.
6. Bila nominal panjang, nilai tetap utuh. Container atau penempatan yang menyesuaikan, bukan nilainya.
7. Setiap perubahan visual berhenti pada presentasi. Tidak ada perubahan izin, data, atau transisi state.

### Alur visual per area

- **Beranda:** hero pengeluaran bulan ini, dua total dompet terpisah, kartu dompet, aktivitas, budget, chart, target. Tidak ada penjumlahan Pribadi dan Bersama.
- **Aktivitas:** filter dan daftar existing. `Muat lebih banyak` mengambil batch cursor berikutnya dan menambahkan baris. CTA hilang saat cursor habis.
- **Dompet:** kartu ATM generik menampilkan nama, scope, saldo, dan aksi existing. Tidak ada nomor kartu, expiry, CVV, logo bank, atau klaim keamanan.
- **Transaksi dan OCR:** tab manual/scan, review sebelum simpan, error jujur, dan undo toast tetap.
- **Keluarga, Profil, Auth:** struktur dan copy existing, hanya token dan komponen yang diselaraskan.

## Alur Teknis (Visual Layer)

```
Dokumen desain 01-06 (setelah sign-off)
  -> app/globals.css (@theme tokens, shadow, focus ring)
  -> app/layout.tsx (font dan surface dasar)
  -> components/ui/* (primitive)
  -> components/layout/* (shell dan nav)
  -> komponen per route (dashboard, budget, transactions, wallets, family, profile, auth)
  -> API existing dan DTO existing (tidak berubah)
  -> formatIDR dan nilai server (tidak berubah)
```

Aturan teknis:

- **Token-first.** Ganti nilai di `@theme`, lalu primitive, lalu komponen. Jangan menyebar hex baru di banyak file.
- **Tailwind v4.** Tetap memakai `@import "tailwindcss"` dan `@theme`. Tidak membuat `tailwind.config.js`.
- **Server Components by default.** Tidak menambah `"use client"` baru kecuali komponen memang sudah interaktif.
- **Tidak ada dependency baru.** Ikon memakai `lucide-react` yang sudah ada. Font memakai `next/font` bila dua keluarga font disetujui.
- **Komposisi Beranda.** Urutan R-9 diterapkan di `DashboardView`. Hero adalah komponen presentasional baru yang menerima angka dari DTO existing, bukan melakukan fetch.
- **Komponen dompet.** `WalletSummaryPair` tetap menggabungkan dua ringkasan dan carousel. `WalletCard` menjadi permukaan ATM. Sheet existing tetap.
- **Dialog.** `useDialogFocusTrap` yang sudah ada dipertahankan. Tidak ada perubahan perilaku Escape, Tab, focus return, atau backdrop.
- **State.** Skeleton, empty, error, filtered-empty, disabled, submitting, success, dan permission tetap dirender.
- **Nominal.** `tabular-nums` dan `nowrap` dipakai pada angka. Bila ruang sempit, pindahkan angka ke baris penuh atau sesuaikan ukuran container. Jangan memakai `truncate` pada nominal.
- **Semantik warna uang.** Uang keluar memakai ink netral dengan tanda `-`; merah/rose hanya untuk error dan aksi destruktif. Uang masuk memakai hijau dengan `+`.
- **Tanpa data palsu.** Tidak ada angka, nama, atau label contoh di kode produksi.

## Modul dan Route yang Berubah

### Modul

| Area | File/modul existing | Perubahan |
|---|---|---|
| Token global | `app/globals.css` | Ganti token canvas, nav, card border, shadow, focus ring, dan warna teks ke palet kanonik. |
| Root layout | `app/layout.tsx` | Surface dasar dan font. Body mengikuti token baru. |
| Primitive | `components/ui/Button.tsx`, `Card.tsx`, `Field.tsx`, `Input.tsx`, `TextArea.tsx`, `EmptyState.tsx`, `Skeleton.tsx` | Primary green, secondary outlined, destructive red, input radius dan focus, card surface, skeleton netral. |
| Shell dan nav | `components/layout/AppShell.tsx`, `BottomNav.tsx`, `FloatingNavbar.tsx` | Navy shell, active pill biru, FAB Tambah hijau, ikon semantik, avatar profil tanpa teks tab. Destinasi tetap. |
| Beranda | `app/home/page.tsx`, `components/dashboard/DashboardView.tsx` | Urutan R-9 dan komposisi grid. Tidak ada fetch baru. |
| Beranda, hero | `components/dashboard/ExpenseHeroCard.tsx` (baru, presentasional) | Hero pengeluaran bulan ini dengan dua metrik existing. Tidak ada periode control. |
| Beranda, kartu | `components/dashboard/BudgetCard.tsx`, `SpendingChart.tsx`, `RecentActivityCard.tsx`, `GoalsSummaryCard.tsx` | Token, bar solid biru, mint target, amount netral, state tetap. |
| Budget | `app/budget/page.tsx`, `components/dashboard/BudgetView.tsx`, `components/goals/GoalsSection.tsx`, `components/goals/AdvisorPanel.tsx` | Token dan hierarchy. Finny tetap di `/budget`. Perilaku tidak berubah. |
| Aktivitas | `app/transactions/page.tsx`, `components/transactions/ActivityView.tsx`, `TransactionList.tsx` | Filter, ringkasan, tab Aktif/Trash, baris, empty state, cursor CTA. Tidak ada nomor halaman. |
| Tambah dan OCR | `components/transactions/AddTransactionSheet.tsx`, `ManualEntryForm.tsx`, `ReceiptScanner.tsx` | Tab, form, state scan, review, error. Copy dan flow tetap. |
| Detail dan undo | `components/transactions/TransactionDetailSheet.tsx`, `UndoToast.tsx` | Token, amount, sheet, toast. Focus trap tetap. |
| Kategori | `components/transactions/categories.ts` | Tidak diubah kecuali ada pasangan kontras yang gagal. Tone kategori tetap sebagai data coding. |
| Dompet | `components/wallets/WalletCard.tsx`, `WalletSummaryPair.tsx`, `WalletPickerSheet.tsx`, `WalletFormSheet.tsx`, `WalletDetailSheet.tsx`, `WalletManageSheet.tsx`, `scope.tsx` | Kartu ATM generik, dua ringkasan, picker, form, detail, kelola. Perilaku dan permission tetap. |
| Hook dompet | `components/wallets/useWallets.ts` | Tidak ada perubahan visual. Tidak diubah kecuali diperlukan oleh signature komponen. |
| Keluarga | `app/family/page.tsx` | Token, card, tombol, state permission. Struktur dan copy tetap. |
| Profil | `app/profile/page.tsx` | Token, card, tombol. Struktur tetap. |
| Auth | `app/(auth)/login/page.tsx`, `app/(auth)/waiting-for-approval/page.tsx` | Token, card, state PENDING/DECLINED/REVOKED. Perilaku tetap. |
| Auth wrapper | `app/(auth)/signup/page.tsx` | Hanya wrapper login. Tidak ada perubahan perilaku. |
| State sistem | `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx` | Token, card, tombol, skeleton. Copy tetap. |

Catatan modul yang ada tetapi tidak menjadi bagian render aktif T-010:

- `components/dashboard/BalanceCard.tsx` tidak diimpor oleh `DashboardView` dan tidak dirender. Komponen ini tetap di luar komposisi T-010 dan tidak dipakai sebagai hero; token-only styling yang sudah ada tidak menambah perilaku runtime. Koreksi round 1 tidak menambah pemakaian baru.
- `components/ui/ComingSoon.tsx` tidak dipakai oleh layar T-010. Satu-satunya perubahan adalah `Card variant="sky"` menjadi `variant="tint"` karena varian legacy diganti nama pada S1; perubahan ini hanya menjaga kompilasi, bukan bagian render aktif.
- `components/ui/Select.tsx` tidak dipakai oleh layar T-010. Perubahan warna one-off pada koreksi round 1 di-revert; file kembali tanpa perubahan.

### Route

| Route | Status | Perubahan visual |
|---|---|---|
| `/home` | Existing | Hero R-9, ringkasan dompet, kartu ATM, aktivitas, budget, chart, target. |
| `/budget` | Existing | Token, BudgetView, GoalsSection, AdvisorPanel. |
| `/transactions` | Existing | Filter, daftar, Trash, detail, cursor. |
| `/transactions?add=1` | Existing | Sheet Tambah, manual, scan, review OCR. |
| `/family` | Existing | Token dan state permission. |
| `/profile` | Existing | Token dan struktur existing. |
| `/login` | Existing | Token dan form existing. |
| `/signup` | Existing | Wrapper login, tanpa perubahan perilaku. |
| `/waiting-for-approval` | Existing | Token dan state PENDING/DECLINED/REVOKED. |
| `/` | Existing | Redirect ke `/home`, tidak ada perubahan visual. |

Tidak ada route baru, route yang dihapus, atau item navigasi baru.

## Dependensi dan Risiko

### Dependensi

- Sign-off UI/UX atas `docs/design/01` sampai `06` (approved 2026-10-20).
- Approval PM atas Spec `docs/spec/feat-visual-refresh.md`.
- Approval PM atas Dev Plan ini.
- Keputusan Q1 sampai Q3 di bawah.
- T-009 wallet sudah selesai dan tidak diubah.
- T-008 regression harus memasukkan T-010 sebelum release approval bila task ini masuk rilis saat ini.
- T-011 tetap terpisah dan tidak boleh menjadi dependensi implementasi T-010.
- QA memiliki test case dan bukti. Dev Plan tidak memuat test plan.

### Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Desain kanonik belum sign-off | Implementasi bisa mengikuti evidence yang salah | Gate sign-off sebelum S1. Baca docs 01-06, bukan board. |
| Spec masih Draft | Scope dapat berubah saat implementasi | Approval Spec sebelum coding. Perubahan perilaku kembali ke Spec. |
| Palet lama masih hardcoded di banyak komponen | Refresh tidak konsisten | Token-first, lalu sapu `violet`, `fuchsia`, `peach`, `lavender`, dan hex lama. |
| Nama varian `Card` mengandung palet lama | Nama menyesatkan setelah token baru | Ganti ke varian semantik dan update seluruh call site. |
| Data contoh di evidence terbawa ke kode | Pelanggaran no-fake-data | Larang copy data. Review diff untuk angka/nama contoh. |
| Kartu ATM terlihat seperti rekening nyata | Klaim integrasi bank palsu | Tanpa nomor kartu, expiry, CVV, logo, network, atau klaim keamanan. |
| Nominal panjang terpotong | Informasi uang hilang | `nowrap` pada angka, baris penuh bila sempit, tanpa `truncate` pada nominal. |
| Perubahan nav merusak active state | Navigasi terasa mati | Pertahankan `matchPrefix` dan `?add=1`, uji keyboard dan route matching. |
| Cursor pagination berubah menjadi nomor halaman | Melanggar kontrak API | Pertahankan `nextCursor`, satu CTA `Muat lebih banyak`, hilang saat habis. |
| Kontras token baru gagal | Tidak lolos WCAG AA | Gunakan pasangan token terukur di doc 01. Jangan mengarang pasangan baru. |
| Focus trap dialog rusak | Keyboard user kehilangan konteks | Pertahankan `useDialogFocusTrap` dan urutan dialog existing. |
| Scope melebar ke T-011 | Schema/API ikut berubah | Semua field bank, Quick Add, dan katalog ditolak dari T-010. |
| Dua keluarga font menambah beban | Loading dan layout shift | Default satu keluarga. Font kedua hanya bila disetujui desain. |
| Komponen lama yang tidak dirender ikut diubah | Diff melebar tanpa manfaat | Hanya file yang tercantum di tabel modul. |

## Rencana Implementasi

Urutan slice mengikuti ketergantungan visual. Setiap slice harus menjaga perilaku, copy, state, dan permission existing.

### S1. Token dan primitive

- Ganti token di `app/globals.css`: canvas, card, navy, blue, tint, green, mint, track, text, border, shadow, focus ring.
- Selaraskan `app/layout.tsx` untuk surface dan font.
- Perbarui Button, Card, Field, Input, TextArea, EmptyState, Skeleton.
- Ganti varian `Card` ke nama semantik dan update seluruh call site.
- **Exit:** primitive tampil konsisten, kontras terukur, tidak ada hex lama di primitive.

### S2. Shell, navigasi, dan state sistem

- Restyle `AppShell`, `BottomNav`, `FloatingNavbar`.
- Pertahankan 5 item mobile, 4 link desktop, aksi Tambah, dan avatar profil.
- Restyle `error.tsx`, `loading.tsx`, `not-found.tsx`.
- **Exit:** satu sistem nav per breakpoint, destinasi sama, tidak ada ikon kosong atau dead link.

### S3. Beranda R-9

- Terapkan urutan hero, dua ringkasan, kartu dompet, aktivitas, budget, chart, target.
- Tambah `ExpenseHeroCard` presentasional dari `monthlyBudget` dan `spending.byDay`.
- Bila budget belum diatur (`remainingMinor` null), tampilkan state existing, bukan `Rp0` yang menyesatkan.
- Restyle `BudgetCard`, `SpendingChart`, `RecentActivityCard`, `GoalsSummaryCard`.
- **Exit:** tidak ada penjumlahan Pribadi/Bersama, tidak ada delta bulan lalu, tidak ada Finny di Beranda, tidak ada hero period control.

### S4. Budget, target, dan advisor

- Restyle `BudgetView`, `GoalsSection`, `AdvisorPanel`.
- Pertahankan aturan budget Sharing-only, read-only member, dan Finny hanya di `/budget`.
- **Exit:** perilaku dan copy sama, hanya visual berubah.

### S5. Aktivitas, tambah, OCR, detail, dan Trash

- Restyle `ActivityView`, `TransactionList`, `AddTransactionSheet`, `ManualEntryForm`, `ReceiptScanner`, `TransactionDetailSheet`, `UndoToast`.
- Pertahankan filter, tab, cursor, review OCR, soft delete, restore, dan focus trap.
- **Exit:** `Muat lebih banyak` tetap satu CTA berbasis cursor, state lengkap, tidak ada nomor halaman.

### S6. Dompet

- Restyle `WalletCard` menjadi kartu ATM generik.
- Restyle `WalletSummaryPair`, `WalletPickerSheet`, `WalletFormSheet`, `WalletDetailSheet`, `WalletManageSheet`, `scope.tsx`.
- Pertahankan dua ringkasan terpisah, picker, scope immutable, arsip, dan permission.
- **Exit:** tidak ada nomor kartu, logo, expiry, CVV, atau klaim bank. Aksi `Kelola` dan `+ Dompet baru` tetap terpisah.

### S7. Keluarga, Profil, dan Auth

- Restyle `app/family/page.tsx`, `app/profile/page.tsx`, login, dan waiting room.
- Pertahankan role, status PENDING/DECLINED/REVOKED, copy, dan aksi existing.
- **Exit:** permission dan state sama, hanya visual berubah.

### S8. Hardening lintas layar dan handoff

- Sapu sisa warna lama dan class yang tidak sesuai token.
- Cek 390, 768, dan 1280 pada aplikasi aktual untuk layar yang tersentuh.
- Cek nominal `Rp2.147.483.647` dan stress layout `Rp9.007.199.254.740.991` tanpa clipping.
- Cek keyboard, focus visible, touch target, dan kontras.
- Perbarui Progress Log dan Keputusan Teknis setiap sesi.
- **Exit:** build, lint, dan pemeriksaan engineering relevan tercatat. Bukti QA diserahkan ke QA.

## Keputusan Teknis (Approved for T-010)

> Entri berikut disetujui khusus untuk T-010 visual layer. Tidak mengubah arsitektur data atau API.

| Tanggal | Keputusan | Status | Alasan | Update Spec/ADR? |
|---|---|---|---|---|
| 2026-10-20 | Visual layer only: tanpa perubahan database, API, route, DTO, atau business logic | Approved | Batas Spec dan ticket | Tidak |
| 2026-10-20 | Token-first melalui `@theme` di `app/globals.css`, tanpa `tailwind.config.js` | Approved | Konvensi Tailwind v4 proyek | Tidak |
| 2026-10-20 | Hero Beranda memakai `monthlyBudget.spentMinor`, `spending.byDay`, dan `monthlyBudget.remainingMinor` | Approved | AC-VIS-4 dan tidak ada field DTO baru | Tidak |
| 2026-10-20 | `ExpenseHeroCard` adalah komponen presentasional baru, bukan endpoint atau service baru | Approved | Memisahkan kartu dari orchestrator tanpa menambah layer data | Tidak |
| 2026-10-20 | Varian `Card` diganti ke nama semantik dan seluruh call site diperbarui | Approved | Nama `peach`/`lavender` menyesatkan setelah palet lama dihentikan | Tidak |
| 2026-10-20 | Tidak ada dependency npm baru; ikon memakai `lucide-react` yang sudah ada dan font tetap Plus Jakarta Sans | Approved | Menekan risiko build dan bundle; tidak menambah font kedua | Tidak |
| 2026-10-20 | `formatIDR` tidak diubah dan nominal tidak boleh `truncate` | Approved | AC-VIS-7 dan integritas nilai | Tidak |
| 2026-10-20 | `useDialogFocusTrap` dipertahankan untuk semua dialog | Approved | AC-VIS-8 dan regresi aksesibilitas T-009 | Tidak |
| 2026-10-20 | Destinasi nav, `matchPrefix`, dan `?add=1` tidak berubah | Approved | AC-VIS-3 | Tidak |
| 2026-10-20 | `CATEGORY_TONES` tetap sebagai data coding, bukan diubah menjadi warna brand | Approved | Doc 01 §5.5 membedakan badge kategori dan badge struktural | Tidak |
| 2026-10-20 | Evidence-only tidak boleh menjadi sumber copy, angka, atau data fixture | Approved | Instruksi ticket dan README desain | Tidak |
| 2026-10-20 | Sinkronkan ringkasan palet `AGENTS.md` §4 dengan design tokens kanonik 01 | Approved | Mencegah instruksi visual lama bertentangan dengan sumber token yang telah disetujui | Tidak |
| 2026-10-21 | Nominal panjang memakai `nowrap`, ukuran adaptif, dan stacking baris per komponen; nilai tidak dipotong atau diubah. `Rp9.007.199.254.740.991` hanya stress tampilan agregat | Implemented | Q5/AC-VIS-7; menjaga 390px tanpa overflow | Tidak |
| 2026-10-21 | Label nav desktop/tablet selalu terlihat; ikon memakai `lucide-react`; destinasi, `matchPrefix`, dan `?add=1` tetap | Implemented | AC-VIS-3 | Tidak |
| 2026-10-21 | `WalletSummaryPair` menormalkan `wallets` yang tidak ada menjadi array kosong | Implemented | Mencegah dashboard crash saat respons lama/stub tidak membawa field `wallets`; kontrak API tidak berubah | Tidak |
| 2026-10-21 | `DashboardView` memvalidasi payload DTO aktif sebelum render; payload stale/tidak valid masuk error state dengan retry | Implemented | Koreksi QA: respons lama tanpa `sharedBalanceMinor`/`personalBalanceMinor`/`wallets` tidak boleh menjadi `RpNaN` atau `Rp0` palsu; error state adalah jalur jujur | Tidak |

## Open Questions dan Keputusan PM

| ID | Pertanyaan | Rekomendasi default | Blocking? | Pemilik |
|---|---|---|---|---|
| Q1 | Versi final dokumen desain 01-06 yang menjadi dasar implementasi | Gunakan versi 2026-10-20 yang saat ini berstatus Ready for PM sign-off; sign-off sebelum S1 | Ya | PM + UI/UX |
| Q2 | Approval Spec `feat-visual-refresh.md` | Setujui Spec apa adanya; perubahan perilaku harus kembali ke Spec | Ya | PM |
| Q3 | Sumber data hero `Pengeluaran bulan ini` | `monthlyBudget.spentMinor`; metrik `Hari ini` dari `spending.byDay`; `Sisa budget` dari `monthlyBudget.remainingMinor`; tanpa API baru | Ya, dikonfirmasi saat approval Spec | PM + Developer |
| Q4 | Dua keluarga font atau satu keluarga | Default satu keluarga, Plus Jakarta Sans, dengan `tabular-nums`. Tambah Inter hanya bila desain mewajibkan | Tidak | UI/UX + Developer |
| Q5 | Strategi layout nominal sangat panjang per komponen | Angka `nowrap`, pindah ke baris penuh bila sempit, tanpa pemotongan nilai. Detail per kartu mengikuti doc 01/02 dan 06 | Ya untuk S3/S5 bila desain belum menetapkan | UI/UX |

## Gate Kesiapan

**Status: PASSED (2026-10-20).** Bagian ini historis; status completion T-010 ada di §QA Sign-off (Independent) dan §PM Review (Final).

- [x] UI/UX menandatangani dokumen desain kanonik 01-06.
- [x] PM menyetujui Spec `docs/spec/feat-visual-refresh.md`.
- [x] PM menyetujui Dev Plan ini.
- [x] Q1 sampai Q3 dijawab dan dicatat.
- [x] Batas T-011 (bank catalog, schema, Quick Add persistence) dikonfirmasi tetap di luar T-010.
- [x] Implementasi dijalankan setelah seluruh gate di atas selesai.
- [x] Status `blocked` dicabut saat approval 2026-10-20; T-010 selesai dan diterima PM 2026-10-21.

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-20 | Dev Plan Draft dibuat | Dokumen saja. Tidak ada kode, schema, migrasi, API, fixture, atau seed yang diubah. Status `Draft / Waiting PM Approval`; belum ada approval PM. Link Spec dan Dev Plan di ticket T-010 diperbarui dari "belum dibuat" menjadi status Draft. |
| 2026-10-21 | Implementasi visual S1-S8 selesai | Token/primitif, shell/nav, R-9 Beranda + `ExpenseHeroCard`, Budget/goals/Finny, Aktivitas/OCR/detail/Trash, kartu ATM dompet, Keluarga/Profil/Auth, dan system states diselaraskan. `AGENTS.md` §4 disinkronkan. Tidak ada perubahan schema, migration, API, DTO, route, pagination, atau business logic; tidak ada field bank/Quick Add T-011. Validasi: `bunx tsc --noEmit` PASS; `bun run test` 329/329 PASS; `bun run build` PASS; `bunx eslint app components lib hooks types --max-warnings=0` PASS; targeted E2E smoke/goals/nav/budget 60/60 PASS; smoke dijalankan ulang setelah polish akhir 27/27 PASS. Full `bun run test:e2e` 63/84 PASS; 21 kegagalan berasal dari fixture test lama (dashboard stub tanpa `wallets`/copy pra-wallet, helper seed transaksi tanpa `walletId`), bukan regresi UI. Screenshot aktual 390/768/1280 dan stress agregat: tidak ada page overflow; CTA `Muat lebih banyak` tepat 1 saat `nextCursor` ada; nominal maksimum single-entry utuh. |
| 2026-10-21 | Koreksi round 1 temuan QA | (1) Login: tab `Masuk`/`Buat akun` memakai `min-h-11` dan toggle kata sandi memakai hit area `h-11 w-11`; ukuran ikon tetap `h-5 w-5`, focus ring dan `aria-pressed` ditambahkan. (2) E2E fixture diselaraskan ke kontrak T-009: `dashboard-states.spec.ts` memakai `sharedBalanceMinor`, `personalBalanceMinor`, dan `wallets`, copy R-9 aktif, plus kasus payload stale yang harus masuk error state. Helper `seedTransaction` membuat/memakai wallet nyata dan mengirim `walletId`. (3) Targeted T-010 E2E ditambahkan untuk urutan R-9, tepat dua total dompet terpisah, nav destination/icon, cursor `Muat lebih banyak`, kartu ATM tanpa identitas bank/kartu, nominal panjang di 390/768/1280, dan touch target login. (4) `DashboardView` memvalidasi DTO aktif sebelum render agar payload lama gagal jujur, bukan `RpNaN`. (5) `Select.tsx` dikembalikan tanpa perubahan; `ComingSoon.tsx` hanya menyesuaikan varian `Card` yang diganti nama. Validasi: `bunx tsc --noEmit` PASS; `bun run test` 329/329 PASS; `bunx eslint app components lib hooks types --max-warnings=0` PASS; `bun run build` PASS; full `bun run test:e2e` 96/96 PASS (84 baseline + 12 assertion T-010 baru). Tidak ada perubahan schema/API/DTO/route/business logic dan tidak ada field T-011. |
| 2026-10-21 | QA independen T-010: **PASS WITH RISKS** | Bukti eksekusi QA: `bunx tsc --noEmit` PASS; `bun run test` 329/329 PASS; `bun run build` PASS; targeted lint `bunx eslint app components lib hooks types --max-warnings=0` PASS; full `bun run test:e2e` rerun 96/96 PASS (84 baseline + 12 assertion T-010). Run penuh pertama QA 95/96: satu kegagalan flake timing di `transaction-undo.spec.ts` (oracle 4.5-5.5 detik; terukur melewati batas atas 5.500 ms sebesar 24 ms). Test yang sama lulus saat dijalankan terisolasi dan lulus pada rerun penuh; tidak ada kode atau test yang diubah untuk flake ini, klasifikasinya assertion timing-sensitive, bukan regresi produk. Tidak ada pengujian live Gemini (OCR/Advisor), Vercel Blob live, atau OCR end-to-end; kualitas model, quota, dan jalur byte gambar terotorisasi ke Blob produksi tidak diklaim. |
| 2026-10-21 | PM menerima implementasi T-010 untuk completion task | Status Dev Plan: implementation `done` / PM accepted. Bukan approval rilis; release gating tetap milik T-008. Entri ini dokumentasi saja: tidak ada perubahan kode, schema, migration, API, DTO, route, business logic, atau test plan; tidak ada scope T-011. Residual T-008 dan temuan pre-existing WO-009 dicatat terpisah di §QA Sign-off (Independent) dan tidak diklaim sudah diperbaiki. |

## QA Reference (QA-owned)

Dev Plan ini **tidak memuat QA test plan**. Test case, oracle, matriks state, screenshot, dan bukti adalah milik QA.

- Acceptance criteria: `docs/spec/feat-visual-refresh.md` AC-VIS-1 sampai AC-VIS-8.
- Skenario ticket: `tickets/13-T-010-ui-visual-refresh.md` §QA Scenarios (di luar repo).
- Matriks verifikasi: `docs/qa/verification-matrix.md`.
- Journey map: `docs/qa/user-journey-map.md`.
- QA menentukan baris matriks, test case, alat, dan bukti 390/768/1280. Dev Plan hanya merujuk.
- Hasil eksekusi dan bukti yang diklaim ada di §QA Sign-off (Independent); Dev Plan tidak menduplikasi test case atau artefak QA.

## QA Sign-off (Independent)

**Verdict: PASS WITH RISKS (2026-10-21).** QA independen menandatangani implementasi T-010 untuk completion task. Verdict ini bukan approval rilis.

### Evidence yang dieksekusi QA

| Pemeriksaan | Hasil |
|---|---|
| `bunx tsc --noEmit` | PASS |
| `bun run test` | 329/329 PASS |
| `bun run build` | PASS |
| Targeted lint (`bunx eslint app components lib hooks types --max-warnings=0`) | PASS |
| Full `bun run test:e2e` (rerun) | 96/96 PASS (84 baseline + 12 assertion T-010) |

### Flake E2E dan penanganannya

- Run penuh pertama QA: **95/96**. Satu kegagalan pada oracle timing `transaction-undo.spec.ts` (`stays visible for 4.5-5.5 seconds`): durasi toast terukur melewati batas atas 5.500 ms sebesar **24 ms**.
- Test yang sama **lulus saat dijalankan terisolasi** dan **lulus pada rerun penuh 96/96**.
- Tidak ada perubahan kode atau test untuk flake ini. Klasifikasi: assertion timing-sensitive pada batas oracle, bukan defect produk yang terkonfirmasi.

### Tidak diuji dan tidak diklaim

- Pada pass T-010 ini tidak ada panggilan **Gemini live** untuk OCR maupun Advisor; kualitas model dan quota tidak diverifikasi.
- Tidak ada pengujian **Vercel Blob live** atau OCR end-to-end dengan gambar nyata pada pass ini; jalur byte gambar terotorisasi ke Blob produksi tidak diklaim.
- Tidak ada verifikasi deployment/produksi Neon atau Vercel, dan tidak ada uji screen reader pada perangkat nyata.

### Residual T-008 (terpisah, bukan penutup T-010)

Berikut tetap terbuka dan **tidak** diperbaiki, ditutup, atau dipindahkan oleh T-010. Item ini non-blocking untuk completion T-010, tetapi tetap blocker release T-008:

- **AC-F4-5**: respons FRESH empty-period Advisor belum terverifikasi.
- **Validasi deployment Neon/Vercel**: belum dijalankan dan belum disetujui.

### Temuan pre-existing di luar scope T-010

- Kontrol tutup `UndoToast` memakai `h-11 w-8` (lebar 32px), di bawah floor target sentuh 44px. Ini **pre-existing T-006** dan berada di keluarga temuan **WO-009**; T-010 tidak memperbaikinya dan **WO-009 tetap `open`**.

## PM Review (Final)

- **Keputusan:** PM menerima implementasi T-010 dan menetapkan task **`done`** pada 2026-10-21, berdasarkan QA independen **PASS WITH RISKS**.
- **Status Dev Plan:** implementation `done` / PM accepted untuk T-010.
- **Bukan approval rilis:** persetujuan ini menutup task T-010, bukan mengizinkan rilis atau deployment. Release gating, regresi lintas task, dan sign-off rilis tetap milik T-008.
- **Batas lingkup:** tidak ada perubahan database, API, DTO, route, permission, atau business logic. T-011 (bank catalog, custom institution, Quick Add persistence) tetap terpisah dan tidak disentuh.
- **Tindak lanjut di luar T-010:** WO-009 (`open`), residual T-008 (AC-F4-5 dan validasi deployment Neon/Vercel), serta verifikasi live Gemini/Blob/OCR bila diperlukan untuk gate rilis.
- **Dokumentasi:** entri ini tidak menambahkan test plan; test case, oracle, dan bukti tetap milik QA.

