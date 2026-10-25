# Spec: Penyelarasan Visual UI Aplikasi

**Penulis:** PM / System Analyst  
**Tanggal:** 2026-10-20  
**Status:** Approved by PM (2026-10-20)  
**Ticket:** T-010 (`tickets/13-T-010-ui-visual-refresh.md`)  
**PRD:** F2 Dashboard, F3 Transactions, F4 Goals/Advisor, F5 Family/Auth, F6 Wallets  
**Design source:** `docs/design/01-design-system-tokens.md` through `docs/design/06-wallets.md` (visual refresh PM-approved; evidence board is not canonical)

## Overview

Selaraskan presentasi seluruh layar existing Financial Diary dengan arah UI/UX terbaru: tema biru-putih-hijau, hierarki judul konsisten, kartu dompet generik bergaya ATM, ikon navigasi bermakna, dan perilaku layout yang tetap terbaca pada layar kecil serta nilai uang panjang.

Task ini bersifat visual. Tidak mengubah sumber data, aturan bisnis, permission, route, pagination cursor, atau state transitions existing.

## User Flow

1. User membuka route existing yang memang berhak diaksesnya.
2. User memakai nav, form, sheet, daftar, dan state seperti perilaku existing.
3. UI menampilkan struktur dan visual tokens yang konsisten pada mobile, tablet, dan desktop.
4. Bila angka uang sangat panjang, seluruh nominal tetap terlihat utuh; layout menyesuaikan ukuran/penempatan tanpa mengubah nilainya.

## Behavior Detail

### AC-VIS-1: Satu visual system blue-white-green

- **Kondisi:** layar existing dirender.
- **Yang terjadi:** active visual tokens mengikuti `docs/design/01-design-system-tokens.md`: blue structural/money context, white card surfaces, green action/positive. Amber/red hanya untuk semantic warning/error/destructive states. Token pasangan warna memenuhi WCAG AA.
- **Yang tidak boleh terjadi:** palette lama peach/lavender/coral/violet-fuchsia dipakai sebagai active brand; status color dipakai dekoratif; contrast pair di bawah threshold.

### AC-VIS-2: Hierarki judul dan label konsisten

- **Kondisi:** user melihat page title, section title, card title, metric label, dan metadata lintas route.
- **Yang terjadi:** hierarchy mengikuti type contract kanonik doc 01: page/section/card titles normal-case, metric/micro-label dibedakan sebagai metadata, money figure menjadi focal point bila relevan.
- **Yang tidak boleh terjadi:** title roles berganti-ganti gaya tanpa alasan, uppercase micro-label dipakai sebagai semua section title, atau teks saling bertumpuk.

### AC-VIS-3: Navigasi tetap, ikon terlihat

- **Kondisi:** mobile atau desktop shell dirender.
- **Yang terjadi:** mobile tetap 5 item dengan aksi Tambah; desktop tetap 4 route links + Add action + avatar/profile entry sesuai `BottomNav.tsx` dan `FloatingNavbar.tsx`. Setiap nav item punya ikon relevan dan label yang terlihat.
- **Yang tidak boleh terjadi:** route/nav baru, placeholder ikon kosong, dead link, atau perubahan route matching.

### AC-VIS-4: Beranda mengikuti wireframe R-9

- **Kondisi:** user approved membuka `/home`.
- **Yang terjadi:** hero pengeluaran bulan ini memakai data yang sudah ada, mini metric hanya Hari ini dan Sisa budget, lalu dua total wallet terpisah, kartu wallet, aktivitas, budget/chart, dan target sesuai doc 02. Finny tetap hanya pada `/budget` sesuai behavior existing.
- **Yang tidak boleh terjadi:** dua wallet total dijumlahkan; wallet Pribadi masuk ringkasan/budget Sharing; previous-month delta, hero period control, quick action, atau Finny-home card yang tidak didukung current behavior ditambahkan.

### AC-VIS-5: Kartu wallet generik bergaya ATM

- **Kondisi:** kartu wallet tampil pada Beranda, picker, atau detail.
- **Yang terjadi:** treatment kartu mengikuti doc 06 dengan surface solid navy/blue, abstract chip/contactless glyph, nama/scope/saldo/aksi yang sudah ada; `+ Dompet baru` tetap aksi terpisah.
- **Yang tidak boleh terjadi:** nomor rekening/kartu, expiry, CVV, logo bank/network, klaim keamanan, atau kesan rekening telah terhubung.

### AC-VIS-6: Aktivitas mempertahankan pagination cursor

- **Kondisi:** `/transactions` mempunyai `nextCursor`.
- **Yang terjadi:** satu CTA `Muat lebih banyak` meminta batch berikutnya dan menambahkan baris. CTA hilang saat cursor habis.
- **Yang tidak boleh terjadi:** nomor halaman, total halaman, atau tombol Sebelumnya/Berikutnya yang tidak tersedia di kontrak API.

### AC-VIS-7: Nominal panjang tetap akurat dan terbaca

- **Kondisi:** layar merender uang dengan nilai panjang.
- **Yang terjadi:** nilai single-entry maksimum existing `Rp2.147.483.647` tetap utuh. `Rp9.007.199.254.740.991` hanya dipakai sebagai layout/formatter stress untuk agregat JS Number, bukan business limit. Nama deskriptif boleh ellipsis jika detail tetap menampilkan nama lengkap; nominal tidak boleh dipotong/dibulatkan.
- **Yang tidak boleh terjadi:** nominal tertutup chip, terpotong oleh container, berubah presisi, atau diubah nilainya untuk menyesuaikan visual.

### AC-VIS-8: Semua state dan perilaku existing dipertahankan

- **Kondisi:** UI berada pada loading, empty, error, filtered-empty, disabled, selected, submitting, success, permission, Trash/restore, OCR review, atau dialog state.
- **Yang terjadi:** state, copy, CTA, permission, focus, privacy boundaries, dan behavior mengikuti Spec existing terkait; semua layar data tetap memiliki state wajib.
- **Yang tidak boleh terjadi:** perubahan behavior/scope, data palsu, kontrol mati yang tampak hidup, atau penghapusan state karena visual refresh.

## Edge Case

- Nilai currency maksimum terlihat pada mobile width 390px dan desktop 1280px tanpa clipping.
- Nama wallet atau merchant sangat panjang boleh dipendekkan hanya jika tidak menghilangkan informasi nominal dan detail tetap menyediakan nilai lengkap.
- Budget belum diatur menampilkan state existing, bukan `Rp0` yang menyesatkan.
- Activity cursor habis berarti CTA Muat lebih banyak tidak dirender.
- State Pribadi tetap owner-only di semua breakpoints; perubahan visual tidak mempengaruhi permission.

## Constraint Bisnis

- Scope wallet, transaction flows, soft delete/restore, OCR review-before-save, budget calculation, and advisor permissions remain unchanged.
- Wallet Bersama and Wallet Pribadi totals remain separate (C-11/C-18); budget and household spending remain Sharing-only (C-12).
- No module or route additions. Bank institution tables/Quick Add data behavior is a separate ticket T-011 and out of scope for T-010.
- Old evidence mockups are not implementation source; current canonical docs must be the implementation basis.

## Out of Scope

- BankInstitution/UserCustomInstitution tables, Quick Add persistence, OJK import, API/DTO/migration (T-011).
- Finny on Beranda, report page/nav item, month-over-month spend comparison, hero period picker, or budget risk threshold changes.
- Dark-mode/theme toggle and any new account linking or bank integration.
- Changes to money aggregation/precision policy. MAX_SAFE_INTEGER testing is a display stress only; aggregate precision contract remains separate PM/Dev risk.

## PM Review & Approval

- **Status:** Approved by PM, 2026-10-20, for visual-only implementation under T-010.
- **Design sign-off:** `docs/design/01-design-system-tokens.md` through `06-wallets.md` approved for T-010 visual refresh on 2026-10-20. `07-bank-institutions.md` remains separate; its data model is not part of this Spec.
- **Scope boundary:** no bank catalog, custom institution, Quick Add persistence, schema/API/DTO change, new navigation item, or new business behavior. These remain T-011 or future decision scope.
- **QA ownership:** test plans and executed verification evidence are QA-owned; this Spec defines acceptance criteria only.
