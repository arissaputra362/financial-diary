# ADR-003: Gemini `gemini-2.5-flash` dengan Structured Output Fail-Closed

**Status:** Accepted
**Tanggal:** 2026-09-30 · **Engineer:** Developer

## Konteks

Aplikasi memakai Gemini Vision untuk OCR struk dan Gemini untuk advisor insight. Output
model adalah **untrusted input** dan tidak boleh pernah menjadi data keuangan yang
dikarang. Model harus dipilih lewat konfigurasi server, dan kegagalan model harus
menghasilkan error bertipe, bukan data palsu. Period math (budget, byDay, tab periode,
filter tanggal) adalah konsep kalender, sedangkan `occurred_at` disimpan UTC.

## Keputusan

Gunakan **`gemini-2.5-flash`** melalui env server-only `GEMINI_MODEL` (nilai ini sebagai
default terdokumentasi), dengan **structured output JSON** dan **fail-closed**: setiap
kegagalan model menjadi error bertipe, tidak pernah data karangan.

## Alasan & Alternatif

- Dipilih karena: Flash memberi latensi rendah untuk ekstraksi struk dan respons advisor
  pendek; structured output membatasi bentuk respons; free tier cukup untuk MVP.
- Alternatif A — **model Pro** (tidak dipilih): latensi dan biaya lebih tinggi tanpa
  manfaat untuk tugas ekstraksi pendek.
- Alternatif B — **parsing teks bebas** (tidak dipilih): rapuh dan rawan data karangan;
  structured output + re-validasi zod jauh lebih aman.

## Trade-off

- Positif: output terstruktur, latensi rendah, fail-closed mencegah data palsu.
- Negatif: `responseSchema` Gemini hanya **hint**, bukan jaminan — wajib re-validasi zod
  di boundary; model free tier bisa rate-limited.

## Detail Implementasi (kontrak)

- **Model via env:** `GEMINI_MODEL` (server-only, default `gemini-2.5-flash`). **Fail-closed:**
  bila model yang dikonfigurasi tidak tersedia, kembalikan error bertipe — **jangan**
  diam-diam mengganti dengan respons palsu.
- **Structured output:** `responseMimeType: "application/json"` + `responseSchema`
  (subset OpenAPI; field nullable memakai `nullable: true`).
- **Re-validasi zod di boundary:** output model divalidasi ulang dengan zod di route
  handler; `responseSchema` adalah hint, bukan jaminan. Output invalid → error bertipe
  (`OCR_INVALID_OUTPUT` / `ADVISOR_INVALID_OUTPUT`).
- **OCR:** `thinkingConfig` sengaja **tidak dikirim** (amendemen 2026-10-23) karena model
  default saat ini (`gemini-3.5-flash-lite`) menolak `thinkingBudget: 0` dengan HTTP 400
  INVALID_ARGUMENT; budget default model dipakai dan **timeout 8–10 detik tetap jadi
  penjaga latensi**.
- **Timeout eksplisit 8–10 detik** per panggilan model; `maxDuration` di route handler
  disetel agar sesuai batas platform Vercel.
- **Rantai model berbatas (amendemen 2026-10-23):** kedua provider memakai rantai
  model berurutan dari env `GEMINI_MODEL` + `GEMINI_MODEL_FALLBACKS` (default
  `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`; nilai di-trim, token kosong
  di-drop, dedupe, seluruh rantai maksimal 3 model). Fallback ke model berikutnya
  **hanya** pada kegagalan spesifik-model: HTTP 429 (RESOURCE_EXHAUSTED; kuota free
  tier berlaku per project DAN per model), HTTP 404 (model pensiun), HTTP 503
  (UNAVAILABLE). **Bukan** retry model yang sama (panggilan ulang instan tidak
  memulihkan kuota 429 per model) dan **bukan** round-robin lintas-request (tidak ada
  status kesehatan model yang diandalkan). HTTP 400 INVALID_ARGUMENT dikecualikan agar
  bug request terlihat, tidak tertutupi model lain; timeout juga tidak fallback dan
  berakhir `OCR_TIMEOUT` dengan guard time-budget rantai (28.000 ms OCR /
  19.000 ms advisor). Maksimal satu tahap fallback terbatas per request; effort
  berbatas: `ocr_job.model` mencatat model yang benar-benar berhasil. Preseden error
  final: attempt manapun kena 429 → `OCR_RATE_LIMITED` / `ADVISOR_RATE_LIMITED`;
  selain itu kode attempt terakhir.
- **Kegagalan OCR (A-10):** `POST /api/ocr/receipts` tetap **HTTP 200** dengan
  `{ job: { status: FAILED, errorCode }, draft: null }`; namespace error:
  `OCR_TIMEOUT`, `OCR_RATE_LIMITED`, `OCR_INVALID_OUTPUT`, `OCR_MODEL_UNAVAILABLE`.
- **Kegagalan advisor:** `429 ADVISOR_RATE_LIMITED` / `503 ADVISOR_UNAVAILABLE` /
  `422 ADVISOR_INVALID_OUTPUT`; bila cache unexpired ada → kembalikan `delivery=CACHE`.
- **Timezone aplikasi = `Asia/Jakarta`** untuk **semua period math** (budget bulanan,
  `byDay`, tab 7D/30D/90D, filter `from`/`to`, validasi tanggal masa depan) — bukan jam
  proses server (UTC) dan bukan jam perangkat user. Konversi date-only → `occurred_at`
  = 12:00 Asia/Jakarta (A-12).
- **Secret server-only:** `GEMINI_API_KEY` tanpa prefix `NEXT_PUBLIC_`; panggilan Gemini
  hanya dari route server; prompt mentah tidak pernah tampil di UI/log.

## Referensi

- `docs/spec/feat-transactions-ocr.md` — AC-4b, AC-6, AC-8
- `docs/spec/feat-goals-advisor.md` — AC-5, AC-7, AC-8
- `docs/architecture-decisions.md` — Gemini model/output, A-10, A-12, A-13
