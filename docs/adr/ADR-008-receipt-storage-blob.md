# ADR-008: Storage Struk — Vercel Blob (≤4 MB, Dedup sha256)

**Status:** Accepted
**Tanggal:** 2026-09-30 · **Engineer:** Developer

## Konteks

Struk/bukti transfer diunggah untuk OCR. Byte gambar tidak boleh masuk DB dan tidak boleh
sampai ke client. Batas ukuran upload awal 5MB ternyata mustahil karena batas body
function Vercel ≈4,5MB. ERD menetapkan dedup `UNIQUE(household_id, content_sha256)` dan
`storage_key` Vercel Blob.

## Keputusan

Simpan struk di **Vercel Blob free tier** dengan batas **≤4.194.304 byte (4MB)** (A-02),
mime allowlist **jpeg/png/webp** (A-21), dedup **`UNIQUE(household_id, content_sha256)`**,
dan upload **server-proxied**.

## Alasan & Alternatif

- Dipilih karena: Vercel Blob terintegrasi dengan deployment Vercel dan free tier cukup
  untuk MVP; dedup sha256 mencegah pemrosesan struk yang sama dua kali.
- Alternatif A — **simpan byte di DB** (tidak dipilih): membengkakkan DB dan memperlambat
  query; byte gambar bukan data relasional.
- Alternatif B — **storage pihak ketiga lain** (tidak dipilih): menambah vendor di luar
  ekosistem Vercel tanpa manfaat MVP.
- Batas **4MB** (bukan 5MB): batas body function Vercel ≈4,5MB membuat 5MB mustahil (A-02).

## Trade-off

- Positif: byte di luar DB, dedup hemat pemrosesan, terintegrasi Vercel.
- Negatif: kuota Blob free tier terbatas; orphan blob (upload sukses, insert DB gagal)
  perlu cleanup (backlog); review yang dibatalkan tetap menyimpan blob (known free-tier risk).

## Detail Implementasi (kontrak)

- **Batas ukuran:** **≤4.194.304 byte (4MB)** — A-02, turun dari 5MB karena batas body
  function Vercel ≈4,5MB. Upload > 4MB → **422 `FILE_INVALID`** sebelum diproses
  (boundary test tepat di batas dan +1 byte).
- **Mime allowlist (A-21):** `image/jpeg`, `image/png`, `image/webp`; di luar itu → 422
  `FILE_INVALID`.
- **Dedup:** `UNIQUE(household_id, content_sha256)` — konten sama di household yang sama
  → **409 `DUPLICATE_RECEIPT`** + job existing dikembalikan; household berbeda boleh
  upload konten sama. Dedup scope = **upload saja** (membuat transaction kedua dari
  receipt/job existing diperbolehkan).
- **Upload server-proxied:** byte gambar melewati route server (bukan direct client→Blob);
  `storage_key` disimpan di `receipt`, byte **tidak pernah** di DB dan **tidak pernah**
  di response API.
- **Precedence idempotency (A-11):** claim key dieksekusi **dulu**, dedup receipt di
  dalamnya; retry dengan key sama me-replay response asli (termasuk replay 409
  `DUPLICATE_RECEIPT`).
- **Orphan-blob cleanup** (upload sukses tapi insert DB gagal) = **backlog**, tidak
  memblokir MVP.
- **OCR tidak pernah auto-save:** endpoint OCR hanya membuat receipt + job + draft;
  transaction hanya dibuat lewat `POST /api/transactions` dengan konfirmasi eksplisit user.

## Referensi

- `docs/spec/feat-transactions-ocr.md` — AC-4, AC-5, Edge Case
- `docs/erd/erd-database-schema.md` §3.9 (receipt), §5.7
- `docs/architecture-decisions.md` — A-02, A-11, A-21
