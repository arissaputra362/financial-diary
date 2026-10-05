# Spec: Transaksi Manual & OCR Review

**Penulis:** PM / System Analyst · **Tanggal:** 2026-09-30 · **Status:** Draft
**PRD:** `docs/PRD.md#fitur-3-transaksi-manual-ocr-review`
**AC yang di-cover:** AC-1 s.d. AC-8 (Fitur 3) = AC-F3-1..AC-F3-9
**Flow referensi:** `docs/erd/flowcharts.md` §4, §5

## Overview

Dua jalur masuk data: form manual (money in / money out / transfer) dan upload struk
yang diekstrak Gemini Vision menjadi draft yang WAJIB direview user sebelum disimpan.
Semua POST mutation mendukung Idempotency-Key. Tidak ada penyimpanan otomatis dari OCR.

## User Flow

1. User buka Add (tombol tengah bottom nav) → pilih money in / money out / transfer.
2. Isi amount, category, date, note → submit → sukses → muncul di aktivitas.
3. Alternatif: pilih "scan struk" → pilih/ambil gambar → upload → loading OCR.
4. Draft hasil OCR tampil dalam form editable (amount, date, merchant, category) + confidence.
5. User mengoreksi → konfirmasi save → tersimpan dengan source=OCR.
6. User membatalkan → tidak ada transaction tersimpan.

## Behavior Detail

### AC-1 (AC-F3-1): Form manual + validasi bahasa awam

- Kondisi: submit dengan berbagai input valid/invalid.
- Yang terjadi: type dari enum (money in/out/transfer); amount > 0 (maksimum
  2.147.483.647 minor — di atas → 422 AMOUNT_OUT_OF_RANGE); date tidak di masa depan
  **menurut kalender Asia/Jakarta** (D-7/D-14: `occurred_at` > now() WIB ditolak 422);
  category dari daftar kanonik (D-11): `food`, `transport`, `bills`, `shopping`,
  `health`, `education`, `entertainment`, `income`, `gift_donation`, `other` —
  MONEY_OUT menerima semua kecuali `income`; MONEY_IN menerima `income`,
  `gift_donation`, `other`; note opsional ≤500 karakter; merchant ≤120 karakter.
  Invalid → 422 dengan fieldErrors per field dalam bahasa awam.
- Yang tidak boleh terjadi: amount 0/negatif lolos; date masa depan (WIB) lolos;
  category di luar daftar lolos; pesan error teknis ("violates constraint", stack trace).

### AC-2 (AC-F3-2): Amount integer minor

- Kondisi: semua penyimpanan amount.
- Yang terjadi: amount_minor integer (IDR, skala 1 rupiah); DTO memakai suffix `Minor`.
- Yang tidak boleh terjadi: float/decimal; pembulatan tersembunyi; kehilangan presisi.

### AC-3 (AC-F3-3): Transfer dua kaki atomik

- Kondisi: user memilih transfer.
- Yang terjadi: service membuat tepat 2 record (MONEY_OUT + MONEY_IN) dengan
  transfer_group_id sama dalam satu transaksi; keduanya muncul di aktivitas.
- Yang tidak boleh terjadi: hanya satu kaki tersimpan; transfer dihitung sebagai
  spending di dashboard; user diminta input ganda.

### AC-4 (AC-F3-4): OCR draft editable, tidak auto-save

- Kondisi: upload struk valid ≤ 4.194.304 byte (4MB — keputusan D-10, turun dari 5MB
  karena batas body function Vercel ≈4,5MB), mime jpeg/png/webp.
- Yang terjadi: receipt + ocr_job dibuat; Gemini menghasilkan draft terstruktur;
  response berisi job + draft; TIDAK ada transaction sampai user konfirmasi via
  POST /api/transactions dengan source=OCR + receiptId. Draft date-only D dikonversi
  ke `occurred_at` = D 12:00 Asia/Jakarta (D-14).
- Yang tidak boleh terjadi: endpoint OCR membuat transaction; draft tampil sebagai
  sudah tersimpan; kunci API bocor ke client; upload > 4MB lolos (ditolak 422
  FILE_INVALID sebelum diproses).

### AC-4b (AC-F3-5): Kegagalan OCR berkontrak jelas (keputusan D-12)

- Kondisi: timeout, rate limit, model unavailable, output tidak valid.
- Yang terjadi: `POST /api/ocr/receipts` tetap 200 dengan
  `{ job: { status: FAILED, errorCode }, draft: null }`; errorCode dari namespace:
  `OCR_TIMEOUT`, `OCR_RATE_LIMITED`, `OCR_INVALID_OUTPUT`, `OCR_MODEL_UNAVAILABLE`.
  UI menampilkan state jujur (coba lagi / isi manual).
- Yang tidak boleh terjadi: data karangan mengisi field; retry tak terbatas otomatis;
  kegagalan disimpan sebagai transaction; error 5xx untuk kegagalan model yang sudah
  tertangani.
- UX: kartu kegagalan, treatment low-confidence, dan flow duplicate didefinisikan di
  design doc 03 (sign-off UI/UX Designer sebelum dev plan).

### AC-5 (AC-F3-6): Dedup struk

- Kondisi: konten gambar sama (sha256) di household yang sama.
- Yang terjadi: 409 DUPLICATE_RECEIPT + job existing dikembalikan; client bisa lanjut
  ke draft existing.
- Yang tidak boleh terjadi: struk sama diproses dua kali; dedup lintas household
  (household berbeda boleh upload konten sama).

### AC-6 (AC-F3-7): Kegagalan OCR jujur

- Kondisi: timeout, rate limit, output model tidak valid, confidence rendah.
- Yang terjadi: ocr_job FAILED dengan error_code typed; UI menampilkan state jujur
  (coba lagi / isi manual); confidence rendah ditandai dan field kosong dibiarkan kosong.
- Yang tidak boleh terjadi: data karangan mengisi field; retry tak terbatas otomatis;
  kegagalan disimpan sebagai transaction.

### AC-7 (AC-F3-8): Idempotency-Key

- Kondisi: POST mutation dengan header Idempotency-Key.
- Yang terjadi: claim key dieksekusi DULU, baru dedup/dedup receipt di dalamnya
  (precedence D-13) — retry jaringan dengan key sama → replay response asli, termasuk
  replay 409 DUPLICATE_RECEIPT; key sama + payload beda → 409 IDEMPOTENCY_CONFLICT;
  request gagal → key ikut rollback → retry mengeksekusi fresh; tanpa key → eksekusi
  normal. Payload dibandingkan via canonical-JSON hash (urutan key tidak mempengaruhi).
  Client wajib generate UUID key per submit attempt.
- Yang tidak boleh terjadi: double-charge saat client retry jaringan; replay response
  user lain (scope per user, D-2 ERD); key di endpoint berbeda dianggap konflik
  (path bagian dari hash).

### AC-8 (AC-F3-9): Secret tetap server-side

- Kondisi: semua request OCR/advisor.
- Yang terjadi: panggilan Gemini hanya dari route server; env var tanpa NEXT_PUBLIC_.
- Yang tidak boleh terjadi: GEMINI_API_KEY/DATABASE_URL di bundle client; prompt mentah
  model tampil di UI/log.

## Edge Case

- Gambar > 4.194.304 byte atau mime di luar jpeg/png/webp → 422 FILE_INVALID sebelum
  diproses; boundary test tepat di batas dan +1 byte.
- Upload blob sukses tapi insert DB gagal → orphan blob (backlog cleanup, tidak blokir MVP).
- OCR sukses tapi amount kosong → field kosong di draft, user wajib isi sebelum save.
- Confidence < 0,70 (konstanta D-15) → draft ditandai low-confidence; field dengan
  `missingFields` tetap kosong.
- User menutup halaman review sebelum save → receipt + job tersimpan, tidak ada
  transaction (pertumbuhan Blob dari review yang dibatalkan = known free-tier risk,
  tercatat di ERD §5).
- Submit ganda cepat (double-tap) → idempotency key mencegah duplikat (satu 201, satu replay).
- Dua upload file sama bersamaan → satu sukses, satu 409 + job existing (bila job masih
  PROCESSING tanpa draft, client menunggu/menampilkan status, bukan error).
- Gemini mengembalikan amount negatif / currency tidak didukung / confidence di luar
  0..1 → draft ditolak di boundary → job FAILED dengan OCR_INVALID_OUTPUT (D-12).
- occurred_at dari OCR di masa depan (WIB) → ditolak oleh validasi yang sama dengan manual.
- Transfer via OCR → tidak didukung di MVP (OCR hanya money in/out); UI menyembunyikan opsi.
- PATCH /api/transactions/{id} → DITUNDA pasca-MVP (D-15): salah input diperbaiki lewat
  trash + entry ulang; route tidak ada di MVP.

## Constraint Bisnis

- OCR tidak pernah menyimpan transaction tanpa konfirmasi eksplisit user.
- Model output adalah untrusted input; divalidasi ulang dengan zod di route boundary
  (responseSchema Gemini adalah hint, bukan jaminan).
- Kategori dari daftar kanonik tetap (D-11); kategori bebas tidak ada di MVP.
- Satu struk = satu receipt record per household (dedup sha256); dedup scope = upload
  saja — membuat transaction kedua dari receipt/job existing diperbolehkan.
- Batas ukuran upload 4MB (D-10) — amandemen atas keputusan awal 5MB (batas platform).

## Out of Scope

- Sinkronisasi bank, recurring transaction, OCR PDF, multi-struk sekaligus,
  edit massal, impor CSV.