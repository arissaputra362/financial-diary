# Dev Plan: T-006 Transaksi Manual & OCR Review

Detail teknis sesi T-006. Dokumen utama implementasi fitur `feat-transactions-ocr`
(lihat dev plan fitur untuk schema/interface lengkap). Berisi task breakdown sesi,
keputusan teknis, bukti ALARM-002, dan progress log.

## Referensi

- Tiket: `tickets/09-T-006-transactions-ocr.md`; kontrol: `tickets/TASK-PLAN.md` § Task Register
- Spec: `docs/spec/feat-transactions-ocr.md` (AC-F3-1..9 + Edge Case + Constraint Bisnis)
- Dev plan fitur: `docs/dev-plan/feat-transactions-ocr.md` (Interface & Contract, Test Scenario, Task Breakdown)
- ADR: ADR-003 (Gemini structured output fail-closed), ADR-006 (layer), ADR-007 (free tier), ADR-008 (Blob ≤4MB, dedup, server-proxied)
- ERD: `docs/erd/erd-database-schema.md` §3.7/3.9/3.10/3.13, D-1/D-2/D-8
- Design: `docs/design/03-transaction-and-ocr-flow.md` (wireframe + copy kanonik), `docs/design/01-design-system-tokens.md`
- Fixture (opsional, integration ditunda): fixtures-seed-plan §3/§6/§8/§9
- AC (verification-matrix): AC-F3-1 … AC-F3-9
- Engineer: Developer · Tanggal: 2026-10-05 · Status: implementasi selesai, menunggu QA/PM

## Ringkasan Teknis

Dua jalur masuk data lewat layar `/transactions`: form manual (money in/out/transfer)
dan scan struk (upload → draft → review konfirmasi → POST transaksi terpisah).
Layer terdampak: Route Handler (`app/api/transactions`, `app/api/ocr`) → Service
(`TransactionService`, `OcrService`, `IdempotencyService`) → Repository (T-003) → Prisma.
Seam `OcrProvider` + `BlobStore` di-inject ke service; route tidak pernah memakai fake.
Tidak ada PATCH transaksi (A-08). Endpoint OCR tidak pernah membuat transaction.

## ALARM-002 — Verifikasi Model (bukti runtime, 2026-10-05)

- Bootstrap `bun -e` (sesi terpisah) memakai `@google/genai@2.27.0` + kredensial `.env`:
  - `gemini-2.5-flash` (nilai `GEMINI_MODEL` lama) → **404 NOT_FOUND**:
    "This model models/gemini-2.5-flash is no longer available to new users.
    Please update your code to use models/gemini-3.8-flash".
  - Kredensial **valid** (error model-availability, bukan 401/403), sehingga tidak ada
    STOP-report ke PM.
  - Kandidat diuji dengan `generateContent`: `gemini-3.8-flash` → 503 high demand
    (intermiten); `gemini-3.5-flash` → OK; `gemini-flash-latest` → OK.
  - `gemini-3.5-flash` lolos verifikasi structured output (`responseMimeType:
    application/json` + `responseSchema` + `thinkingConfig.thinkingBudget=0`) dan vision
    (`inlineData` image/png). 503 high-demand = error transien → dipetakan fail-closed
    ke `OCR_MODEL_UNAVAILABLE`/`OCR_RATE_LIMITED`.
- **Aksi:** `GEMINI_MODEL` di `.env` diubah `gemini-2.5-flash` → `gemini-3.5-flash`
  (alasan: model ADR-003 tidak tersedia untuk API key baru; ADR-003 tidak diubah,
  write-lock). Nilai deployment Vercel harus disamakan saat T-008.
- Catatan prompt IDR: model sempat mengembalikan Rp50.000 sebagai `5000000`; prompt OCR
  kini eksplisit "Rupiah utuh (IDR tanpa desimal)" dan service memvalidasi ulang.

## Task Breakdown (sesi ini)

### 1. Paket (A-24)
- [x] `bun add @google/genai @vercel/blob` (hanya ini; jose/bcryptjs sudah ada)

### 2. Service layer (`lib/server/services/`)
- [x] `IdempotencyService.run` — urutan A-11: claim → dedup/mutasi → complete → commit;
  key sama + payload beda → 409 `IDEMPOTENCY_CONFLICT`; mutasi gagal → key rollback;
  `request_hash = sha256(method + path + canonical JSON)` (key order tidak berpengaruh)
- [x] `TransactionService.createManual/createFromOcr` (future-WIB, amount ≤ int32, kategori
  per tipe A-09, transfer 2 kaki 1 transaksi, soft delete/restore, list/listTrash)
- [x] `OcrService.upload/getJob` (server-proxied Blob, dedup sha256 → 409 + job existing,
  panggil `OcrProvider`, validasi Zod output untrusted, namespace A-10, HTTP 200 FAILED)
- [x] Seam `OcrProvider` (real: `@google/genai`, timeout eksplisit 9 detik) + `BlobStore`
  (real: `@vercel/blob`, access **private**)
- [x] Fake provider + fake BlobStore + fake ledger in-memory **khusus test**
  (`lib/server/testing/fakes.ts`; tidak diimpor route)
- [x] `lib/server/errors.ts`: `unprocessableCode` + `FILE_INVALID`; namespace OCR dari
  kontrak T-003
- [x] Unit test service (mock repo + seam fake) sesuai BDD §Unit

### 3. HTTP layer (`app/api/`)
- [x] `POST /api/transactions` (manual + `source=OCR`+`receiptId`; 201)
- [x] `GET /api/transactions` + `GET /api/transactions/trash` +
  `POST /api/transactions/{id}/trash|restore` (kontrak feat-dashboard/feat-trash-restore,
  dibutuhkan UI Aktivitas T-006)
- [x] `POST /api/ocr/receipts` (multipart; `maxDuration=30`; 200 job+draft; 422 FILE_INVALID;
  409 DUPLICATE_RECEIPT + job/draft existing)
- [x] `GET /api/ocr/jobs/{id}` (scope household)
- [x] Semua route: Node runtime, `approvedOnly`, sliding `setSessionCookie`, `respondError`
- [x] Feature test route (boundary 4MB/+1, replay idempotency termasuk replay 409, smoke secret)

### 4. Frontend (milik T-006)
- [x] `/transactions`: daftar aktif + tab Trash (`?view=trash`) + 3 state (loading/empty/error)
- [x] Add flow dari halaman (modal desktop / bottom sheet mobile): segmented Isi manual /
  Scan struk; nav interim T-005 tidak disentuh
- [x] Form manual money in/out/transfer (transfer 2 kaki otomatis, format ribuan, chips
  kategori per tipe, tanggal Hari ini/Kemarin/pilih, fieldErrors per field)
- [x] Scan struk: pilih/ambil gambar → loading → review editable + confidence +
  missingFields → konfirmasi eksplisit atau batal; kartu gagal (Coba lagi / Isi manual);
  duplicate lanjut ke draft existing; low-confidence ditandai (0,70)
- [x] Soft delete + undo toast 5 detik + restore dari Trash (copy A-30, tanpa istilah teknis)
- [x] Secret: tidak ada import env di client; OCR hanya lewat route server (smoke test)

### 5. Verifikasi
- [x] `bun run test` hijau (187 test; 134 lama + 53 baru)
- [x] `bun run lint` hijau
- [x] `bun run build` lulus (route baru terdaftar; `/transactions` dinamis)
- [ ] Integration ber-DB (Neon): DITUNDA — cakupan T-008 (opsional di tugas ini)
- [ ] E2E Playwright upload/review/save/delete/undo/restore: DITUNDA — cakupan T-008

## Keputusan Teknis

| Tanggal | Keputusan | Alasan | Update Spec/ADR? |
|---|---|---|---|
| 2026-10-05 | `GEMINI_MODEL` di `.env` diubah ke `gemini-3.5-flash` | `gemini-2.5-flash` 404 "no longer available to new users" (bukti runtime ALARM-002); ADR-003 tidak diedit (write-lock) | Tidak (dicatat di sini) |
| 2026-10-05 | Timeout model eksplisit 9 detik; `maxDuration=30` untuk route OCR; interactive transaction 20 detik | ADR-003 (8-10 detik) + model dipanggil di dalam satu transaksi idempotency A-11; Prisma default 5 detik tidak cukup | Tidak |
| 2026-10-05 | Blob disimpan `access: "private"` | ADR-008: byte struk tidak boleh sampai ke client; hanya `storage_key` di DB | Tidak |
| 2026-10-05 | `category` pada `createTransactionSchema` opsional khusus TRANSFER (wajib untuk MONEY_IN/OUT) | Design 03 §2.2: transfer tidak memakai kategori; kontrak T-003 mewajibkan kategori untuk semua tipe | Tidak (kontrak T-003 diperluas, bukan keputusan A) |
| 2026-10-05 | DUPLICATE_RECEIPT dikembalikan sebagai **hasil 409 committed** (bukan throw) berisi `{ error, job, draft }` | A-11: replay 409 harus memuat job existing; throw akan me-rollback key sehingga tidak bisa di-replay | Tidak |
| 2026-10-05 | `POST /api/transactions` satu endpoint untuk manual + OCR; respons `{ transactions: TransactionDTO[] }` (1 atau 2 kaki) | Kontrak input sudah memisahkan `source`/`receiptId`; bentuk array menampung transfer 2 kaki | Tidak |
| 2026-10-05 | Route `GET /api/transactions`, trash/restore ditambahkan | Dibutuhkan UI Aktivitas T-006; kontrak resmi ada di dev plan feat-dashboard/feat-trash-restore, bukan route baru di luar kontrak | Tidak |
| 2026-10-05 | `missingFields` di-unions dengan field null; field yang masuk `missingFields` dikosongkan | AC-F3-7: jangan tampilkan nilai karangan; user wajib mengisi | Tidak |
| 2026-10-05 | `OcrJobDTO` menyertakan `receiptId` | Konfirmasi draft butuh `receiptId` untuk `source=OCR` (AC-F3-4) | Tidak |
| 2026-10-05 | Review OCR punya toggle Uang keluar/masuk (transfer disembunyikan); saran `income` → MONEY_IN; default MONEY_OUT | Spec Edge: "OCR hanya money in/out"; design 03 tidak menampilkan opsi transfer | Tidak |
| 2026-10-05 | Fake seam hanya di `lib/server/testing/fakes.ts` (test-only) | Mock-seams dev plan: jangan pernah wire fake di route | Tidak |
| 2026-10-06 | BUG-001: buang nilai enum `TRANSFER` dari DB + hapus `CHECK transaction_transfer_group_consistency`; kontrak input tetap menerima `TRANSFER` dan service menerjemahkannya ke dua kaki | CHECK lama `(type='TRANSFER') = (transfer_group_id IS NOT NULL)` menolak kaki `MONEY_*` bergrup (23514); spec AC-F3-3 menyatakan enum TRANSFER tidak dipakai | Ya — ERD/spec perlu revisi konstrain (write-lock PM) |
| 2026-10-06 | BUG-003: redirect default pasca-auth `/home` → `/transactions` | `/home` belum ada (T-005); `/transactions` sudah live | Tidak (hotfix bertag TODO) |
| 2026-10-08 | WO-008: helper server-only Sharp (`lib/server/services/image-normalization.ts`) di-inject ke `OcrService`; Gemini menerima salinan ter-normalisasi (auto-orient EXIF, max edge 2048, tanpa upscale, MIME dipertahankan) sementara hash/dedup/size/Blob tetap byte asli; gagal transform → fallback byte asli sekali (tanpa 500); `sharp@0.35.4` jadi dependency langsung; default model → `gemini-3.5-flash-lite` | WO-008; Next 16 sudah meng-externalize `sharp` lewat `serverExternalPackages` (tanpa ubah `next.config`); tidak ada panggilan Gemini/Blob nyata; ADR-003/008 write-lock | Tidak (dicatat di sini) |
| 2026-10-23 | Bugfix: `thinkingConfig` dihilangkan dari konfigurasi panggilan Gemini (provider OCR & advisor); kegagalan provider kini di-log `console.error` tanpa secret (status + message saja, tanpa API key/gambar/base64) | `gemini-3.5-flash-lite` menolak `thinkingBudget: 0` (HTTP 400 INVALID_ARGUMENT), sehingga setiap scan struk gagal sebelum gambar dievaluasi dan UI menampilkan "Layanan baca struk sedang tidak tersedia". Omit `thinkingConfig` diterima semua model yang diuji; timeout 9 s tetap penjaga latensi | Ya — baris OCR ADR-003 & baris ringkasan ADR-003 di `docs/adr/README.md` dikoreksi |
| 2026-10-23 | Rantai model Gemini berbatas: helper murni `lib/server/providers/model-chain.ts` (`GEMINI_MODEL` + `GEMINI_MODEL_FALLBACKS`, dedupe/trim, maks 3 model); provider OCR & advisor fallback maks satu tahap ke model berikutnya hanya pada HTTP 429/404/503; tanpa fallback pada HTTP 400 atau timeout; preseden error final `OCR_RATE_LIMITED`/`ADVISOR_RATE_LIMITED` bila ada attempt 429, selain itu kode attempt terakhir | Kuota free tier Gemini berlaku per project DAN per model (rantai memperbesar kapasitas terpakai) dan menutup model yang pensiun (404). Kontrak API, shape respons, nama error code, timeout 9 s, dan maxDuration route tidak berubah | Ya — AC-4c/AC-7b ditambahkan di spec + amendemen ADR-003 |

## Progress Log

| Tanggal | Task selesai | Catatan / deviasi dari plan |
|---|---|---|
| 2026-10-05 | ALARM-002 model runtime; paket `@google/genai@2.27.0` + `@vercel/blob@2.8.0`; service idempotency/transaction/ocr + seam + fake test; 6 route handler (transactions POST/GET, trash/restore/trash-list, ocr receipts/jobs); frontend transaksi + add flow + scan + review + trash/undo; 53 test baru; lint + build | Bukti ALARM-002 di atas. Integration DB + E2E Playwright sengaja ditunda ke T-008. Write-lock utuh. |
| 2026-10-06 | Perbaikan QA T-006: BUG-001 (migrasi `20261006120000_fix_transfer_enum`, tipe persist tanpa TRANSFER, regression test integration diaktifkan) + BUG-003 (redirect `/transactions`) + koreksi dokumentasi environment; 188 unit test, 5 integration test, typecheck, lint hijau; migrasi diuji di PostgreSQL lokal | BUG-002 (savepoint) sudah fixed & diratifikasi PM, tanpa action dev. Devi dari handoff: klaim auto-detect `lib/db.ts` dikoreksi di dokumen (fungsi dipertahankan) karena `.env` lokal & E2E QA memakainya; handoff meminta fungsi dihapus. |
| 2026-10-08 | WO-008: normalisasi salinan OCR via Sharp (seam `ImageNormalizer`, fallback byte asli saat gagal) + switch default OCR/Advisor ke `gemini-3.5-flash-lite`; tes normalizer, seam service, dan pemilihan model provider ditambah | `sharp@0.35.4` dependency langsung; `.env` GEMINI_MODEL line-only diubah; `.env.example`/AGENTS.md/dev-setup disamakan; tidak ada panggilan model/Blob nyata; QA Log tidak disentuh |
| 2026-10-23 | Bugfix scan struk: hapus `thinkingConfig.thinkingBudget = 0` dari provider OCR & advisor (amendemen ADR-003) + `console.error` fail-closed bebas secret; regression test baru `lib/server/providers/thinking-config.test.ts` | Root cause: default model `gemini-3.5-flash-lite` menolak `thinkingBudget: 0` → HTTP 400 INVALID_ARGUMENT dipetakan ke `OCR_MODEL_UNAVAILABLE`/`ADVISOR_UNAVAILABLE`; timeout/skema/kontrak/error code tidak berubah |
| 2026-10-23 | Fallback model berbatas: `model-chain.ts` (murni, tanpa dep) + loop provider OCR & advisor (AbortController per attempt, time-budget 28 s OCR / 19 s advisor) + unit test `model-chain.test.ts` & `model-fallback.test.ts` + bukti live fallback | Env baru `GEMINI_MODEL_FALLBACKS` didokumentasikan di `.env.example` dan AGENTS.md §8; fallback hanya pada 429/404/503, satu tahap, rantai maks 3 model; `ocr_job.model` tetap mencatat model yang berhasil; tidak ada perubahan route/UI/kontrak |

## QA Log

| Tanggal | AC diuji | Hasil | Catatan |
|---|---|---|---|
| 2026-10-06 | AC-F3-3, AC-F3-8, Journey A2 (re-test BUG-001/002/003) | Pass | 188 unit + 5 integration hijau; transfer 2 kaki terverifikasi di level DB; replay idempotency deep-equal; login/signup -> /transactions. Verdict PASS. Detail: agent-comms/2026-10-06-qa-t006-retest-report.md |
| 2026-10-08 | WO-008 (normalisasi salinan OCR + default model Flash-Lite) | PASS WITH RISKS (unit/config/build; tanpa panggilan nyata) | 36/36 focused + 285/285 unit hijau; lint 0 error; tsc 0; build hijau; `sharp@0.35.4` dependency langsung & ter-externalize (nft OCR 81 file termasuk binary native). AC byte asli/dedup/Blob utuh, kontrak transform (<=2048, orient, MIME, no-upscale), fallback typed, dan pemilihan model terbukti. Integration DB tidak dijalankan; quota/quality model tidak diverifikasi. Detail: ../../agent-comms/2026-10-08-qa-wo008-report.md |

## Open Questions

- Tidak ada. Kontrak merujuk A-01..A-35, ERD, ADR-001..008, dan design 03.