# Spec: Dashboard & Overview

**Penulis:** PM / System Analyst · **Tanggal:** 2026-09-30 · **Status:** Draft
**PRD:** `docs/PRD.md#fitur-2-dashboard-overview`
**AC yang di-cover:** AC-1 s.d. AC-8 (Fitur 2) = AC-F2-1..AC-F2-10
**Flow referensi:** `docs/erd/flowcharts.md` §9

## Overview

Satu layar yang menjawab: berapa uang tersedia, berapa budget bulan ini yang sudah
terpakai, ke mana pengeluaran per hari, seberapa jauh tabungan, dan apa yang baru
terjadi. Server adalah sumber kebenaran; client tidak menghitung ulang angka.

## User Flow

1. Anggota APPROVED membuka `/home` → dashboard memuat semua kartu.
2. User melihat saldo, budget bulan berjalan (budget/terpakai/sisa), grafik pengeluaran.
3. User melihat ringkasan goals dengan progress bar.
4. User melihat aktivitas terbaru dan memakai filter lokal (type/source/tanggal).
5. User mengganti tab periode grafik 7D/30D/90D.
6. Selama memuat → skeleton; jika gagal → error state dengan retry; jika kosong → empty state.

## Behavior Detail

### AC-1 (AC-F2-1): Saldo tersedia dihitung server

- Kondisi: household punya campuran transaksi aktif, deleted, dan transfer.
- Yang terjadi: `balanceMinor = sum(MONEY_IN aktif) − sum(MONEY_OUT aktif)` seluruh waktu;
  kaki TRANSFER tidak mengubah saldo (in dan out saling menghapus).
- Yang tidak boleh terjadi: client menghitung saldo dari subset recentActivity;
  record soft-deleted ikut dihitung.

### AC-2 (AC-F2-2): Budget bulan berjalan

- Kondisi: household_budget untuk bulan berjalan ada / tidak ada.
- Yang terjadi: `budgetMinor` dari budget bulan berjalan (periode kalender timezone
  aplikasi — keputusan D-7: Asia/Jakarta, bukan jam proses server UTC); `spentMinor` =
  sum MONEY_OUT aktif dalam periode; `remainingMinor` = budget − spent. Budget bulan
  berjalan belum di-set → kartu budget menampilkan state "atur budget" (bukan angka 0
  yang menyesatkan) dengan CTA ke halaman `/budget`.
- Yang tidak boleh terjadi: kaki TRANSFER dihitung sebagai spending; periode memakai
  timezone proses server (UTC); transaksi 1 Okt 00:00 WIB menambah spentMinor bulan
  September meski disimpan sebelum tengah malam UTC.

### AC-2b (AC-F2-3): Atur budget (write path, keputusan D-6)

- Kondisi: OWNER membuka `/budget` dan mengisi/mengubah budget bulan berjalan.
- Yang terjadi: `PUT /api/budget` (owner-only sesuai OQ-3) melakukan upsert pada
  `household_budget` untuk `(household_id, period_start)` bulan berjalan; amount > 0;
  kartu dashboard langsung menampilkan nilai baru. MEMBER yang mencoba → 403.
- Yang tidak boleh terjadi: member mengubah budget; amount 0/negatif diterima;
  dua baris budget untuk periode sama (upsert, bukan insert ganda).
- UX: state "atur budget", form edit owner, dan view read-only member didefinisikan di
  design doc halaman budget+goals (sign-off UI/UX Designer sebelum dev plan).

### AC-3 (AC-F2-4): TRANSFER bukan spending

- Kondisi: household hanya punya transfer bulan ini.
- Yang terjadi: spentMinor = 0; transfer tetap terlihat di aktivitas.
- Yang tidak boleh terjadi: transfer dihitung ganda sebagai pengeluaran.

### AC-4 (AC-F2-5): Grafik per hari + tab periode

- Kondisi: tab 7D/30D/90D.
- Yang terjadi: `byDay` = bucket MONEY_OUT aktif per hari kalender (timezone aplikasi —
  D-7: Asia/Jakarta), periode berakhir di "hari ini" kalender Asia/Jakarta (bukan jam
  proses server UTC); 7D = 7 hari kalender terakhir termasuk hari ini (7 bucket), dst.
  Hari tanpa pengeluaran tetap muncul bernilai 0.
- Yang tidak boleh terjadi: hari tanpa pengeluaran hilang dari sumbu; tab mengubah
  data daftar aktivitas (tab hanya untuk grafik); bucket berubah karena jam proses
  server UTC. Boundary: `occurred_at = 2026-09-30T17:30:00Z` (= 1 Okt 00:30 WIB) masuk
  bucket 1 Okt.

### AC-5 (AC-F2-6): Filter lokal aktivitas

- Kondisi: filter type=MONEY_IN|MONEY_OUT, source=MANUAL|OCR, from, to, cursor, limit.
- Yang terjadi: daftar aktivitas berubah sesuai filter; "Scanned receipts" → source=OCR;
  "Everything" → tanpa filter type/source; pagination cursor opaque base64 keyset
  `(occurred_at DESC, id DESC)` (D-8); limit default 20, maks 50, di atas maks → 422;
  `from`/`to` adalah tanggal kalender Asia/Jakarta. Endpoint list = `GET /api/transactions`
  (bukan recompute seluruh DashboardDTO per filter change).
- Yang tidak boleh terjadi: filter tidak memengaruhi rows yang ditampilkan; filter
  mengubah kartu saldo/budget/grafik (scope filter = daftar aktivitas saja); duplikat
  atau item hilang saat menelusuri semua halaman, termasuk dua transaksi dengan
  `occurred_at` identik (tie-breaker id).

### AC-6 (AC-F2-7): Filter selalu mengubah data

- Kondisi: kombinasi filter apa pun, termasuk hasil kosong.
- Yang terjadi: setiap perubahan filter terlihat efeknya pada rows atau menampilkan
  filtered-empty state yang jelas.
- Yang tidak boleh terjadi: rows sama sebelum/sesudah filter berubah.

### AC-7 (AC-F2-8): State lengkap

- Kondisi: loading, kosong, error, filtered-empty.
- Yang terjadi: skeleton saat loading; empty state bahasa awam saat belum ada data;
  error state dengan retry (kegagalan agregasi mana pun → satu error state penuh dengan
  retry, tanpa kartu parsial); filtered-empty saat filter tanpa hasil.
- Yang tidak boleh terjadi: layar kosong tanpa penjelasan; spinner tanpa batas waktu;
  kartu parsial saat sebagian agregasi gagal.

### AC-7b (AC-F2-9): Kartu ringkasan goals (keputusan D-9)

- Kondisi: household punya goal aktif / tidak punya / punya goal deleted.
- Yang terjadi: kartu "What we're saving for" menampilkan daftar goal aktif dengan
  progress bar capped 100%; goal deleted tidak tampil; kosong → empty state dengan
  CTA ke halaman goals (`/budget`).
- Yang tidak boleh terjadi: goal deleted tampil; progress > 100%.

### AC-8 (AC-F2-10): Satu navigasi per breakpoint

- Kondisi: mobile <768px, tablet 768–1023px, desktop ≥1024px.
- Keputusan PM (2026-10-01): tablet (768–1023px) memakai top nav yang sama dengan
  desktop; bottom nav hanya di mobile.
- Yang terjadi: mobile hanya bottom nav (Home, Budget, Add, Activity, Family); desktop
  top nav dengan destinasi sama + tombol pill "Add a transaction" (aksi, bukan link —
  membuka sheet yang sama dengan Add mobile, keputusan A-27); tanpa horizontal overflow
  di 390px; touch target ≥48px.
- Yang tidak boleh terjadi: dua sistem navigasi aktif bersamaan di mobile; overflow
  horizontal; tombol Add tanpa perilaku.

## Edge Case

- Belum ada transaksi sama sekali → semua kartu menampilkan empty state yang mengarahkan
  ke aksi pertama (tambah transaksi).
- Budget belum di-set → state "atur budget", bukan 0.
- Semua transaksi bulan ini adalah transfer → spentMinor 0, grafik flat 0.
- Filter rentang tanggal from > to → validasi client, tidak memanggil API.
- Cursor pagination mencapai akhir → nextCursor null, tombol muat lagi hilang.
- Transaksi baru masuk di antara dua fetch halaman → tidak ada duplikat; item baru
  mungkin tidak muncul di halaman yang sudah lewat (semantik keyset, D-8).
- Total agregasi melebihi int32 (sum > 2.147.483.647 minor) → tetap benar (aggregate
  Postgres → bigint; tanpa cast int32 di aplikasi, D-23).
- API error saat load → error state + retry, bukan layar putih.
- Periode mengikuti kalender Asia/Jakarta (D-7), bukan jam perangkat user dan bukan
  timezone proses server (UTC).
- Session expired saat idle → request berikutnya 401 → login ulang → dashboard memuat.
- Emoji/RTL pada note/merchant → wrap normal tanpa overflow di 390px.

## Constraint Bisnis

- Angka keuangan selalu integer minor (IDR, skala 1 rupiah), diformat di client.
- Dashboard tidak boleh menampilkan data household lain.
- Periode kalender memakai timezone aplikasi yang tetap (Asia/Jakarta — OQ-2/D-7),
  bukan jam proses server (UTC) dan bukan jam perangkat user.
- Menghapus satu kaki transfer menggeser saldo seolah kaki itu tidak pernah ada
  (lintas-ref: spec trash-restore edge case).

## Out of Scope

- Budget per kategori, multi-currency, notifikasi, ekspor data, widget lain di luar
  kontrak DashboardDTO.