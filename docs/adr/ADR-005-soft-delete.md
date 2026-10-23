# ADR-005: Soft Delete — `deleted_at` + Restore Idempotent

**Status:** Accepted
**Tanggal:** 2026-09-30 · **Engineer:** Developer

## Konteks

Keluarga tidak boleh kehilangan data karena kesalahan kecil. Requirement melarang `DELETE`
SQL untuk data user. ERD menetapkan `deleted_at` hanya pada `transaction` dan
`savings_goal`. Keputusan rapat menambahkan `ALREADY_DELETED` (A-17) dan menetapkan undo
sebagai restore yang dipicu client (bukan penundaan commit di server).

## Keputusan

Gunakan **soft delete** via `deleted_at` + `deleted_by_user_id` pada `transaction` dan
`savings_goal`; repository **default scope `deleted_at IS NULL`**; restore bersifat
**idempotent**; **tanpa hard delete di MVP**.

## Alasan & Alternatif

- Dipilih karena: melindungi user dari kehilangan data, mendukung undo/trash, dan menjaga
  integritas referensi (receipt tetap ada).
- Alternatif A — **hard delete** (tidak dipilih): melanggar kepatuhan "keluarga tidak
  kehilangan data"; menghapus baris merusak referensi.
- Alternatif B — **deferred commit (undo menunda commit server)** (tidak dipilih):
  kompleks dan rapuh; undo dipilih sebagai restore cepat yang dipicu client.

## Trade-off

- Positif: aman dari kesalahan, undo/trash sederhana, referensi utuh.
- Negatif: semua query aktif wajib filter `deleted_at IS NULL` (risiko lupa filter →
  dimitigasi di layer repository); tabel tumbuh (tanpa auto-purge di MVP).

## Detail Implementasi (kontrak)

- **Kolom:** `deleted_at TIMESTAMPTZ` (null = aktif) + `deleted_by_user_id` pada
  `transaction` dan `savings_goal`.
- **Default scope:** repository **wajib** memfilter `deleted_at IS NULL` untuk semua
  query aktif; trash view memfilter `deleted_at IS NOT NULL`.
- **Trash:** `POST /api/transactions/{id}/trash` dan `POST /api/goals/{id}/trash` set
  `deleted_at` + `deleted_by_user_id`; record hilang dari semua daftar aktif dan
  perhitungan (saldo, budget, grafik, progress).
- **Restore idempotent (A-17):**
  - Restore record yang sudah aktif → **200 `ALREADY_ACTIVE`** (tanpa error di UI).
  - Trash ganda pada record yang sama → **200 `ALREADY_DELETED`** (idempotent).
- **Undo = client-triggered restore:** server **langsung commit** soft delete; undo
  memanggil restore selama toast 5 detik terlihat. Tutup app sebelum undo → record tetap
  deleted di server.
- **Tanpa hard delete di MVP:** tidak ada route/UI permanent delete, termasuk untuk Owner.
- **Cross-household:** akses/restore record household lain by id → **404 `NOT_FOUND`**
  dengan pesan generik (tidak membedakan "tidak ada" vs "milik orang lain").
- **Transfer:** menghapus satu kaki transfer hanya men-soft-delete kaki itu; pasangan
  tetap aktif; saldo dihitung seolah kaki itu tidak pernah ada; `UNIQUE(household_id,
  transfer_group_id, type)` tetap memblokir kaki ketiga.
- **Restore tidak mengubah data lain:** `occurred_at`, `amount_minor`, `created_by_user_id`
  tidak tersentuh; hanya `updated_at` berubah.

## Referensi

- `docs/spec/feat-trash-restore.md` — AC-1..AC-7, AC-5b, Edge Case
- `docs/erd/erd-database-schema.md` §3.7, §3.8
- `docs/architecture-decisions.md` — Soft delete, A-17; Amendment Wallet F6 A-36/A-40/A-41 (Accepted by PM 2026-10-09)

## Amendment (T-009 / F6 wallet) — Accepted by PM 2026-10-09

**Status:** Accepted (PM, 2026-10-09). Amends §Detail Implementasi "Transfer" above for two-legged transfers only; the original ADR-005 decision continues to apply to non-transfer records.

Konteks: Spec `docs/spec/feat-wallets.md` (AC-F6-5) dan design `docs/design/06-wallets.md` (C-9, C-20) menetapkan bahwa **trash/restore transfer memproses kedua kaki secara atomik** dan bahwa untuk **transfer lintas scope hanya pembuat transfer atau Owner** yang boleh memutasi pasangan. Ini menggantikan perilaku per-kaki di §Detail Implementasi "Transfer" di atas. Diratifikasi sebagai bagian `docs/architecture-decisions.md` "Amendment — Wallet F6 (T-009)" A-40/A-41 (**Accepted by PM 2026-10-09**).

- **Superseded:** kalimat lama "menghapus satu kaki transfer hanya men-soft-delete kaki itu; pasangan tetap aktif" **tidak berlaku lagi** untuk transfer dua kaki.
- **Keputusan baru (Accepted):** trash/restore pada baris dengan `transfer_group_id` menyasar **semua baris** dengan `(household_id, transfer_group_id)` yang sama dalam **satu interactive transaction**; tidak pernah tersisa satu kaki aktif. Operasi idempoten: semua kaki sudah trashed → 200 `ALREADY_DELETED`; semua sudah aktif saat restore → 200 `ALREADY_ACTIVE`. State parsial (warisan perilaku per-kaki) direkonsiliasi dalam transaksi yang sama.
- **Otorisasi (Accepted):** `PERSONAL↔PERSONAL` hanya pemilik; `SHARING↔SHARING` semua anggota APPROVED yang dapat mengakses kedua wallet; `lintas scope` hanya pembuat transfer atau Owner household. Aktor tanpa hak → 403 `ACCESS_DENIED`; id asing → 404 `NOT_FOUND`. Response tidak boleh mengungkap keberadaan kaki Pribadi (lihat A-39/A-41 di `docs/architecture-decisions.md`).
- **Kontrak penuh:** `docs/architecture-decisions.md` "Amendment — Wallet F6 (T-009)" A-40/A-41. Amandemen ini berstatus **Accepted** (PM 2026-10-09); tidak ada bagian amandemen yang tersisa berstatus draft.
