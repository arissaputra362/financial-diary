# Spec: Soft Delete, Trash & Restore

**Penulis:** PM / System Analyst · **Tanggal:** 2026-09-30 · **Status:** Draft
**PRD:** `docs/PRD.md#fitur-5-soft-delete-trash-restore`
**AC yang di-cover:** AC-1 s.d. AC-7 (Fitur 5) = AC-F5-1..AC-F5-8
**Flow referensi:** `docs/erd/flowcharts.md` §6

## Overview

Proteksi terhadap penghapusan tidak sengaja: transaction dan savings_goal hanya
soft-delete (deleted_at), dengan undo toast 5 detik, trash view per household, dan
restore idempotent. Tidak ada permanent deletion di MVP.

## User Flow

1. User menghapus transaksi dari daftar/aktivitas → konfirmasi ringan → record hilang
   dari aktif → undo toast 5 detik.
2. User menekan undo dalam 5 detik → record kembali aktif.
3. Toast kedaluwarsa → record ada di trash view.
4. User buka tab "Trash" di halaman aktivitas (`/transactions?view=trash`) → daftar record
   deleted (urutan deleted_at DESC).
5. User restore record → kembali aktif, muncul lagi di daftar dan perhitungan.

## Behavior Detail

### AC-1 (AC-F5-1): Soft delete

- Kondisi: hapus transaction/goal milik household sendiri, record aktif.
- Yang terjadi: deleted_at + deleted_by_user_id terisi; record hilang dari semua
  daftar aktif dan perhitungan (saldo, budget, grafik, progress).
- Yang tidak boleh terjadi: record deleted masih dihitung di dashboard; hard delete
  (baris hilang dari DB).

### AC-2 (AC-F5-2): Undo toast 5 detik

- Kondisi: setelah hapus sukses.
- Yang terjadi: toast dengan aksi undo tampil segera setelah 200 dan hilang dalam
  window 4,5–5,5 detik (toleransi test); undo memanggil restore; undo hanya bisa
  dipanggil selama toast terlihat; setelah toast hilang, restore hanya via trash view.
- Yang tidak boleh terjadi: undo gagal diam-diam; toast menghalangi konten;
  undo tersedia setelah toast hilang tanpa buka trash.

### AC-3 (AC-F5-3): Trash view terisolasi household

- Kondisi: buka trash.
- Yang terjadi: hanya record soft-deleted yang dapat diakses caller pada household aktif;
  setelah wallet feature, wallet Pribadi hanya terlihat oleh pemiliknya dan wallet Sharing
  terlihat anggota approved. Entry point tunggal =
  tab "Trash" di halaman aktivitas — route `/transactions?view=trash` (keputusan A-25:
  route tetap `/transactions`, label nav "Activity"); urutan `deleted_at DESC`; cursor
  pagination sama dengan daftar aktif (D-8); UI tab didefinisikan di design doc 03/02
  (sign-off UI/UX Designer).
- Yang tidak boleh terjadi: record household lain atau wallet Pribadi anggota lain terlihat;
  record aktif ikut tampil.

### AC-4 (AC-F5-4): Restore

- Kondisi: restore record deleted yang dapat diakses caller pada household sendiri.
- Yang terjadi: deleted_at + deleted_by_user_id dikosongkan; record kembali dihitung
  di saldo/budget/grafik dan tampil di daftar aktif.
- Yang tidak boleh terjadi: restore mengubah data lain (occurred_at, amount tetap);
  restore record household lain atau wallet Pribadi anggota lain.

### AC-5 (AC-F5-5): Restore idempotent (ALREADY_ACTIVE)

- Kondisi: restore record yang ternyata sudah aktif (mis. dua tab, klik ganda).
- Yang terjadi: 200 dengan flag `alreadyActive: true`, tanpa error di UI.
- Yang tidak boleh terjadi: 409/500 yang membingungkan user; state UI rusak.

**Format Response:**
```json
{
  "id": "...",
  "deletedAt": null,
  "alreadyActive": true
}
```

### AC-5b (AC-F5-6): Trash ganda idempotent (keputusan D-20)

- Kondisi: dua anggota (atau dua tab) meng-trash record yang sama hampir bersamaan.
- Yang terjadi: satu sukses 200; satunya 200 dengan flag `alreadyDeleted: true`
  (idempotent, tanpa error).
- Yang tidak boleh terjadi: 409/500; dua baris berubah dua kali (deleted_at dobel-set).

**Format Response (untuk kasus already deleted):**
```json
{
  "id": "...",
  "deletedAt": "2026-10-06T10:00:00Z",
  "alreadyDeleted": true
}
```

### AC-6 (AC-F5-7): Cross-household tidak bocor

- Kondisi: akses/restore record household lain by id.
- Yang terjadi: 404 NOT_FOUND dengan pesan generik.
- Yang tidak boleh terjadi: 403 yang mengonfirmasi keberadaan record; pesan yang
  membedakan "tidak ada" vs "milik orang lain".

### AC-7 (AC-F5-8): Tanpa permanent deletion

- Kondisi: semua peran, termasuk Owner.
- Yang terjadi: tidak ada route/UI permanent delete di MVP.
- Yang tidak boleh terjadi: endpoint DELETE fisik; tombol "hapus permanen".

## Edge Case

- Hapus transfer setelah wallet feature aktif → kedua kaki dit-trash secara atomik dan
  dipulihkan secara atomik; satu sisi tidak dapat dihapus/dipulihkan sendiri. Untuk
  transfer lintas scope, hanya pembuat transfer atau Owner dapat trash/restore pasangan;
  anggota yang hanya melihat sisi Sharing tidak dapat memodifikasinya. Sebelum wallet
  feature diaktifkan, perilaku transfer yang sudah berlaku tetap mengikuti versi
  implementasi saat ini. Detail perubahan kontrak ada di `feat-wallets.md` AC-F6-5.
- Restore transaksi lama → saldo/budget/grafik masa lalu ikut berubah (benar, karena
  perhitungan selalu dari data aktif); `updated_at` berubah, tapi `occurred_at`,
  `amount_minor`, `created_by_user_id` tidak tersentuh.
- Trash kosong → empty state bahasa awam.
- Dua anggota menghapus record yang sama hampir bersamaan → satu sukses, satu
  ALREADY_DELETED (D-20, idempotent, tanpa error).
- Undo toast saat halaman berganti → toast tetap berfungsi selama app terbuka;
  tutup app sebelum commit → record tetap deleted di server (undo hanya client-triggered
  restore, bukan defer commit).
- Re-save dari receipt yang sama setelah transaction OCR di-trash → diperbolehkan
  (dedup scope = upload saja, bukan transaction).
- Record deleted lalu goal/transaction dirujuk entitas lain (receipt) → receipt tetap ada.
- Session expired di tengah flow trash/restore → 401; state record tidak berubah.

## Constraint Bisnis

- Semua query aktif wajib filter `deleted_at IS NULL` (default di repository).
- Trash view wajib filter `deleted_at IS NOT NULL`.
- Permanent deletion tidak ada di MVP, termasuk untuk Owner (kepatuhan "keluarga
  tidak kehilangan data").
- Undo adalah restore cepat, bukan penundaan commit di server.

## Out of Scope

- Permanent deletion UI/API, auto-purge trash, trash untuk receipt/insight,
  riwayat siapa menghapus/memulihkan (audit hapus) — backlog pasca-MVP.
