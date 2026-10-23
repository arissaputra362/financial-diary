# Spec: Savings Goals & AI Advisor

**Penulis:** PM / System Analyst · **Tanggal:** 2026-09-30 · **Status:** Draft
**PRD:** `docs/PRD.md#fitur-4-savings-goals-ai-advisor`
**AC yang di-cover:** AC-1 s.d. AC-8 (Fitur 4) = AC-F4-1..AC-F4-8
**Flow referensi:** `docs/erd/flowcharts.md` §7, §8

## Overview

Target tabungan keluarga dengan progres yang jujur, plus panel advisor berbahasa awam
yang menganalisis periode pengeluaran dan memberi aksi konkret — selalu dengan batasan
(limitations) yang terlihat. Insight sukses terbaru dipersist sebagai cache fallback.

## User Flow

1. User buka `/budget` → daftar goal aktif + progress bar (di bawah kartu budget).
2. User buat goal (nama, target, deadline opsional) → muncul di daftar + dashboard.
3. User menambah saved amount → atomic increment → progress terupdate.
4. User menghapus goal → soft delete → bisa restore dari trash.
5. User membuka advisor drawer → pilih periode → loading → insight (FRESH) atau
   insight cache (CACHE, berlabel) atau error state.

## Behavior Detail

### AC-1 (AC-F4-1): Buat goal

- Kondisi: target_amount_minor > 0; deadline opsional (deadline lampau diperbolehkan —
  goal tampil dengan penanda terlambat).
- Yang terjadi: goal aktif dibuat, saved_amount_minor awal 0; target 0/negatif → 422.
- Yang tidak boleh terjadi: target 0 lolos. Duplikat nama goal DIPERBOLEHKAN (nama
  tidak unik) — dua goal bernama sama keduanya 201.

### AC-2 (AC-F4-2): Progres capped di display

- Kondisi: saved ≥ target, atau saved melebihi target.
- Yang terjadi: `progressPercent = min(100, saved/target×100)` di DTO; nilai tersimpan
  tidak diubah.
- Yang tidak boleh terjadi: DB di-cap 100; progress > 100 tampil; pembulatan aneh
  (progress 99% saat saved = target).

### AC-3 (AC-F4-3): Atomic increment (delta-based, keputusan D-18)

- Kondisi: dua anggota menambah saved amount hampir bersamaan, atau increment membuat
  nilai negatif.
- Yang terjadi: perubahan saved amount berbasis delta via conditional update atomik
  (`saved_amount_minor = saved_amount_minor + X` dengan syarat `saved_amount_minor + X >= 0`
  di WHERE); kedua tambahan terhitung; hasil negatif → 422 SAVED_AMOUNT_INVALID tanpa
  perubahan. DB punya `CHECK (saved_amount_minor >= 0)` (raw SQL).
- Yang tidak boleh terjadi: read-modify-write yang membuat satu tambahan hilang;
  nilai negatif tersimpan; increment pada goal yang sudah di-trash → 404 (filter
  repository menang).

### AC-4 (AC-F4-4): Soft delete goal

- Kondisi: user menghapus goal.
- Yang terjadi: deleted_at terisi; hilang dari daftar aktif dan dashboard; bisa
  di-restore dari trash (fitur 5).
- Yang tidak boleh terjadi: goal deleted masih tampil di dashboard; hard delete.

### AC-5 (AC-F4-5): Insight dengan periode

- Kondisi: user meminta insight untuk periode {start, end} (maks 90 hari; start==end
  boleh; periode masa depan boleh → hasil "data tidak cukup"; start > end → 422).
- Yang terjadi: response berisi headline, summary, actions (list), limitations,
  sourcePeriod, model, generatedAt, expiresAt. Period picker di drawer advisor
  (preset + rentang, maks 90 hari) dan penempatan limitations yang tidak hilang saat
  scroll di 390px didefinisikan di design doc 05 (sign-off UI/UX Designer). Setelah
  wallet feature, advisor household hanya memakai transaksi aktif wallet Sharing,
  termasuk wallet Sharing yang diarsipkan; transaksi Pribadi tidak dikirim ke model maupun
  disertakan dalam insight/cache (AC-F6-11).
- Yang tidak boleh terjadi: insight tanpa limitations; periode yang berbeda dari
  yang diminta tanpa penjelasan; data transaksi mentah per record tampil di insight;
  periode > 90 hari diterima.

### AC-6 (AC-F4-6): FRESH vs CACHE jelas (cache key per periode, D-16/D-17)

- Kondisi: cache unexpired untuk periode yang DIMINTA ada / tidak ada.
- Yang terjadi: cache di-key `(household_id, source_period_start, source_period_end)`
  + unexpired (TTL 24 jam sejak generatedAt), terbaru dulu; delivery=FRESH untuk insight
  baru; delivery=CACHE untuk cache hit; UI wajib menampilkan label "tersimpan/dari
  cache" saat CACHE. Insight untuk periode berbeda TIDAK dipakai sebagai cache hit.
- Yang tidak boleh terjadi: cache ditampilkan tanpa label; cache expired dipakai;
  insight gagal di-cache; insight periode lain dikembalikan untuk periode yang diminta.

### AC-7 (AC-F4-7): Kegagalan typed + fallback

- Kondisi: rate limit / timeout / model unavailable / output invalid.
- Yang terjadi: 429 ADVISOR_RATE_LIMITED (pass-through Gemini saja — tanpa app-level
  limit di MVP, D-19) / 503 ADVISOR_UNAVAILABLE / 422 ADVISOR_INVALID_OUTPUT; bila
  cache unexpired untuk periode yang diminta ada → dikembalikan dengan delivery=CACHE.
- Yang tidak boleh terjadi: saran karangan saat gagal; retry tak terbatas; error
  teknis tampil ke user.

### AC-7b (AC-F4-7 amendemen 2026-10-23): Fallback model berbatas

- Kondisi: model utama gagal karena sebab spesifik-model: HTTP 429 (kuota / rate
  limit, per project DAN per model), HTTP 404 (model pensiun), atau HTTP 503
  (UNAVAILABLE).
- Yang terjadi: provider mencoba SEKALI ke model berikutnya pada rantai
  `GEMINI_MODEL` + `GEMINI_MODEL_FALLBACKS` (default `gemini-3.5-flash-lite` →
  `gemini-3.1-flash-lite`; dedupe, seluruh rantai maksimal 3 model; time-budget
  guard 19.000 ms untuk seluruh rantai di dalam transaksi idempotency ~20 detik,
  timeout 9 detik per attempt tetap). Bila semua attempt gagal, preseden errorCode
  final: attempt manapun kena 429 → `ADVISOR_RATE_LIMITED`; selain itu kode attempt
  terakhir (`ADVISOR_UNAVAILABLE` untuk timeout / 400 / 404 / 503).
- Yang tidak boleh terjadi: fallback pada HTTP 400 INVALID_ARGUMENT atau timeout;
  retry otomatis tanpa batas; perubahan bentuk respons, delivery=CACHE, atau nama
  error code.

### AC-8 (AC-F4-8): Batasan advice selalu tampil (testable, D-19)

- Kondisi: insight apapun ditampilkan.
- Yang terjadi: `actions` array ≥ 1 item, tiap item punya `label` (≤80 chars) + `type`
  dari enum `VIEW_GOAL|REVIEW_SPENDING|NONE`; `limitations` dan `sourcePeriod` terlihat
  di viewport 390px tanpa interaksi; bahasa awam; teks tidak mengandung frasa terlarang
  ("dijamin", "pasti hemat", "sesuai OJK" — blacklist assert).
- Yang tidak boleh terjadi: klaim jaminan; angka statistik yang tidak berasal dari data
  user; nada regulasi; limitations tersembunyi di balik scroll/interaksi.

## Edge Case

- Periode tanpa transaksi → insight menyatakan data tidak cukup (bukan saran karangan).
- Periode start > end → 422 validasi; periode > 90 hari → 422; start==end → boleh.
- saved_amount dikurangi melewati 0 → 422 SAVED_AMOUNT_INVALID (D-18).
- Increment hingga melewati int32 → ditolak 422 (bukan 500 dari overflow DB).
- Deadline sudah lewat → goal tetap tampil dengan penanda terlambat, tidak auto-delete.
- Rate limit Gemini saat pertama kali (belum ada cache) → state unavailable yang jujur.
- Dua anggota meminta insight periode sama bersamaan → diterima risiko dobel panggilan
  model (known free-tier risk, D-19); keduanya dapat insight valid.
- Dua anggota meminta periode berbeda bersamaan → dua insight terpisah (cache key per
  periode, D-16).
- Insight ke-11 pada satu household → insight tertua terhapus; household lain tidak
  terpengaruh (retensi D-16).
- Emoji/RTL pada nama goal (≤80 karakter, D-22) → render normal.

## Constraint Bisnis

- Tidak ada chat history; hanya insight sukses yang dipersist, di-key per
  (household, periode), retensi maks ~10 terbaru per household (D-16).
- Advice bukan nasihat keuangan profesional; limitations wajib menyatakannya.
- Setelah wallet feature, data wallet Pribadi tidak boleh masuk ke prompt, input agregat,
  atau cache advisor household; hanya transaksi aktif wallet Sharing yang dipakai,
  termasuk wallet Sharing terarsip (AC-F6-11).
- Progres dihitung dari counter manual (OQ-1: bukan dari transaksi nyata di MVP).
- TTL cache insight 24 jam (D-17).
- Halaman goals berada di `/budget` (budget + goals = perencanaan); route `/savings`
  dihapus dari kontrak (D-9).

## Out of Scope

- Saran investasi, transfer otomatis, chat interaktif, proyeksi lanjutan,
  notifikasi goal tercapai.
