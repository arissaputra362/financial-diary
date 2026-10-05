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
- `docs/architecture-decisions.md` — Soft delete, A-17
