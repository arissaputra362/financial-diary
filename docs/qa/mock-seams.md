# Mock Seams — Financial Planner MVP

**Owner:** QA Engineer · **Tanggal:** 2026-09-30 · **Status:** Baseline (pre-implementation)
**Tujuan:** Cara mem-fake Gemini, `@vercel/blob`, dan DB **tanpa mengubah kode route**,
sehingga test AI tidak membakar kuota dan test deterministik. Seam = titik injeksi
dependency (interface) yang route/service panggil; test mengganti implementasinya.

## 0. Prinsip

1. **Route tidak tahu** apakah dependency nyata atau fake — route hanya memanggil
   interface (mis. `OcrProvider`, `BlobStore`, `Db`).
2. Seam didefinisikan di **service layer** (`lib/server/services`), bukan di route.
3. Fake harus **fail-closed**: tidak pernah mengembalikan data karangan saat error.
4. Semua seam di-inject lewat factory/parameter (dependency injection), bukan
   monkey-patch global, agar tidak ada perubahan kode route.

## 1. Gemini seam (`OcrProvider` / `AdvisorProvider`)

Interface (kontrak, bukan kode):

```
OcrProvider.extract(imageBytes, mimeType) -> OcrDraft | OcrError
AdvisorProvider.insight(period, aggregate) -> AdvisorInsight | AdvisorError
```

Fake yang dibutuhkan:

| Fake | Perilaku | Dipakai |
|---|---|---|
| `FakeGemini.success(draft)` | mengembalikan draft valid (confidence ≥0,70) | AC-F3-4, AC-F4-5 |
| `FakeGemini.lowConfidence(draft)` | confidence 0.55 + missingFields | AC-F3-7 |
| `FakeGemini.timeout()` | melempar timeout | AC-F3-5, AC-F4-7 |
| `FakeGemini.rateLimited()` | melempar rate limit | AC-F3-5, AC-F4-7 |
| `FakeGemini.modelUnavailable()` | melempar unavailable | AC-F3-5, AC-F4-7 |
| `FakeGemini.invalidOutput()` | JSON/schema tidak valid | AC-F3-5, AC-F4-7 |
| `FakeGemini.negativeAmount()` | amount negatif | AC-F3-5 (OCR_INVALID_OUTPUT) |
| `FakeGemini.badConfidence()` | confidence di luar 0..1 | AC-F3-5 |

Aturan: fake **tidak** memanggil jaringan; tidak ada API key di test; output model
diperlakukan sebagai untrusted input dan tetap divalidasi zod di route boundary.

## 2. `@vercel/blob` seam (`BlobStore`)

Interface:

```
BlobStore.put(bytes, key, contentType) -> { key, url }
BlobStore.get(key) -> bytes
BlobStore.delete(key) -> void
```

| Fake | Perilaku | Dipakai |
|---|---|---|
| `FakeBlob.ok()` | menyimpan in-memory, mengembalikan key | AC-F3-4 |
| `FakeBlob.failAfterPut()` | put sukses, insert DB gagal → orphan blob | ERD §5 risiko |
| `FakeBlob.assertNoBytesInDb()` | memastikan byte gambar tidak masuk DB | AC-F3-4 |

Aturan: byte gambar tidak pernah di DB (`storage_key` saja); fake menyimpan byte
in-memory agar test tidak menulis ke Blob nyata.

## 3. DB seam

| Opsi | Kapan | Catatan |
|---|---|---|
| Neon branch disposable | integration test penuh | A-23; branch dihapus setelah run |
| In-memory repository fake | unit test service | mengimplementasi interface repository |
| Transaction rollback per test | isolasi | setiap test dalam tx yang di-rollback |

Aturan: repository **wajib** menerima `householdId` scope; fake repository harus
menegakkan isolasi (query lintas household → kosong/404) agar AC-F5-7 & AC-F1-4
teruji di level service.

## 4. Namespace error OCR (A-10) — WAJIB

Kegagalan OCR **tetap HTTP 200** dengan body:

```json
{ "job": { "status": "FAILED", "errorCode": "<CODE>" }, "draft": null }
```

`errorCode` ∈ namespace tertutup:

| errorCode | Pemicu | Fake |
|---|---|---|
| `OCR_TIMEOUT` | timeout panggilan model | `FakeGemini.timeout()` |
| `OCR_RATE_LIMITED` | rate limit Gemini | `FakeGemini.rateLimited()` |
| `OCR_INVALID_OUTPUT` | output tidak valid (schema/negatif/confidence) | `FakeGemini.invalidOutput()` |
| `OCR_MODEL_UNAVAILABLE` | model tidak tersedia | `FakeGemini.modelUnavailable()` |

Assertion: status HTTP **200** (bukan 5xx); `draft === null`; `errorCode` tepat satu
dari empat nilai; tidak ada transaction tersimpan; tidak ada data karangan.

## 5. Precedence idempotency (A-11) — WAJIB

Urutan yang harus diuji (claim key DULU, dedup di dalamnya):

1. **Claim key** — insert baris `idempotency_key` (unique `(user_id, key)` = claim).
2. **Di dalam claim**: jalankan dedup receipt (sha256) / mutasi.
3. **Tulis** `response_status` + `response_body` → commit.

| Skenario | Ekspektasi | AC |
|---|---|---|
| Key sama + payload sama | replay response asli (status + body identik) | AC-F3-8 |
| Key sama + payload beda | 409 `IDEMPOTENCY_CONFLICT` | AC-F3-8 |
| Key sama, retry setelah 409 DUPLICATE_RECEIPT | replay 409 asli (bukan re-proses) | AC-F3-8, A-11 |
| Mutasi gagal | seluruh tx rollback → key hilang → retry fresh | AC-F3-8 |
| Tanpa key | eksekusi normal | AC-F3-8 |
| Key di endpoint berbeda | bukan konflik (path bagian hash) | AC-F3-8 |
| Duplicate concurrent (P2002) | rollback → re-read → replay bila hash match | AC-F3-8 |

Assertion seam: fake DB harus memaksa urutan claim→dedup→commit dan memverifikasi
bahwa dedup **tidak** dieksekusi sebelum claim key berhasil.

## 6. Matriks seam → AC

| Seam | Fake | AC yang diverifikasi |
|---|---|---|
| Gemini OCR | success/lowConfidence/timeout/rateLimited/modelUnavailable/invalidOutput | AC-F3-4, AC-F3-5, AC-F3-7 |
| Gemini Advisor | success/timeout/rateLimited/modelUnavailable/invalidOutput | AC-F4-5, AC-F4-6, AC-F4-7 |
| BlobStore | ok/failAfterPut | AC-F3-4 |
| DB | branch/fake repo/rollback | AC-F1-4, AC-F5-7, AC-F3-8 |
