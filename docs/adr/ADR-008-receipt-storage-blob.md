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
  di response API. **Diamandemen (Accepted 2026-10-09) oleh bagian "Amendment —
  Authenticated image read path (T-009)" di bawah:** objek Blob tetap privat dan tidak
  pernah publik (tanpa URL/token/`storage_key` ke client); yang berubah hanya bahwa byte
  boleh di-stream melalui route server terautentikasi untuk anggota yang lolos predikat
  union C-28/A-46, bukan oleh URL Blob publik/direct.
- **Precedence idempotency (A-11):** claim key dieksekusi **dulu**, dedup receipt di
  dalamnya; retry dengan key sama me-replay response asli (termasuk replay 409
  `DUPLICATE_RECEIPT`).
- **Orphan-blob cleanup** (upload sukses tapi insert DB gagal) = **backlog**, tidak
  memblokir MVP.
- **OCR tidak pernah auto-save:** endpoint OCR hanya membuat receipt + job + draft;
  transaction hanya dibuat lewat `POST /api/transactions` dengan konfirmasi eksplisit user.

## Amendment — Authenticated image read path (T-009) — Accepted by PM 2026-10-09

**Status:** **Accepted** — PM, **2026-10-09** (ratified as part of `docs/architecture-decisions.md`
"Amendment — Wallet F6 (T-009)" A-46/A-49). Developer (T-009).
**Amends:** the "Upload server-proxied" implementation bullet above, which states the
receipt bytes are never in an API response. Accepted and in force; supersedes that
sentence only for the authenticated server-proxied read path described here; the
private-object rule itself is unchanged.

- This amendment distinguishes two things that must not be conflated:
  1. **No public/direct Blob URL.** The stored object stays `access: "private"`. The
     `storage_key` is never returned to any client, no route issues a public, signed,
     or direct Blob URL, and the read/write token stays server-only. This prohibition is
     absolute and applies to the new streaming route as well: direct/public Blob URLs
     remain forbidden in every case.
  2. **Authenticated server-proxied image streaming (new).** To satisfy C-28
     (authorized members may view the receipt image via the Sharing link), a protected
     server route may stream the private Blob bytes **through the server**, after
     authorizing via the A-46 image-union predicate. This is a controlled read of the
     same private object, not a public URL.
- Amended contract for the streaming route:
  - **Auth:** APPROVED session + the image-union predicate over ALL linked transactions
    (**including soft-deleted/trashed links**), via `receipt → transaction → wallet` and
    the A-38 wallet predicate. Unauthorized, foreign-household, or no-link → generic
    **404** (no existence leak); mutation-style errors are not returned for a read.
  - **Response:** bytes only, `Content-Type` = the stored allowlisted `mime_type`
    (jpeg/png/webp, A-21), and `Cache-Control: private, no-store`; the response never
    contains `storage_key`, a Blob URL/token, an OCR job/draft (`result_json`), or any
    linked transaction row.
  - **Server-side read seam:** `BlobStore` gains a read/stream operation in addition to
    `put`, implemented with the installed `@vercel/blob@2.8.0`
    `get(pathname, { access: "private", token })` API (returns `stream`, `headers`, and
    `blob`). The route never issues a public/signed Blob URL, never exposes `storage_key`,
    and never bypasses Blob `access: "private"`.
- **Route (ratified):** `GET /api/ocr/receipts/{id}/image` — the final, PM-ratified route
  (declared in `docs/architecture-decisions.md` A-49). The earlier alternative
  `/api/receipts/{id}/image` is not used.
- **OCR job/draft and share flag unchanged:** `GET /api/ocr/jobs/{id}` stays
  uploader-only (C-29) and `receiptSharedWithHousehold` stays uploader-only. This
  amendment widens **image-byte access only**, never job/draft/flag access.

## Referensi

- `docs/spec/feat-transactions-ocr.md` — AC-4, AC-5, Edge Case
- `docs/erd/erd-database-schema.md` §3.9 (receipt), §5.7
- `docs/architecture-decisions.md` — A-02, A-11, A-21, A-46, A-49; Amendment Wallet F6 A-36..A-50 (Accepted by PM 2026-10-09)
