# Fixtures & Seed Plan — Financial Diary MVP

**Owner:** QA Engineer · **Tanggal:** 2026-09-30 · **Status:** Baseline (pre-implementation)
**Tujuan:** Fixture deterministik (UUID tetap) yang menutup semua invariant ERD §7 dan
skenario AC. Belum ada kode seed; dokumen ini adalah spesifikasi data.

## 0. Konvensi UUID deterministik

Semua UUID literal tetap (bukan random) agar assertion stabil. Pola:

- Household A = `11111111-1111-4111-8111-111111111111`
- Household B = `22222222-2222-4222-8222-222222222222`
- User A* = `a0000000-0000-4000-8000-00000000000N` (N = 1..5)
- User B* = `b0000000-0000-4000-8000-00000000000N`
- Membership = `c0000000-0000-4000-8000-0000000000NN`
- Transaction = `d0000000-0000-4000-8000-0000000000NN`
- Goal = `e0000000-0000-4000-8000-0000000000NN`
- Receipt = `f0000000-0000-4000-8000-0000000000NN`
- OCR job = `f1000000-0000-4000-8000-0000000000NN`
- Insight = `f2000000-0000-4000-8000-0000000000NN`
- Invite = `f3000000-0000-4000-8000-0000000000NN`
- Idempotency key row = `f4000000-0000-4000-8000-0000000000NN`

Semua timestamp fixture di-pin ke `NOW = 2026-09-30T03:00:00Z` (10:00 WIB) kecuali
yang diuji boundary. Timezone aplikasi = **Asia/Jakarta (UTC+7)**.

## 1. Household & membership (2 household × 5 status)

| Household | User | Role | Status | Catatan |
|---|---|---|---|---|
| A | A1 | OWNER | APPROVED | owner bootstrap |
| A | A2 | MEMBER | APPROVED | akses ledger penuh |
| A | A3 | MEMBER | PENDING | 403 ACCESS_PENDING |
| A | A4 | MEMBER | DECLINED | 403 ACCESS_DECLINED |
| A | A5 | MEMBER | REVOKED | 403 ACCESS_REVOKED |
| B | B1 | OWNER | APPROVED | isolasi lintas household |
| B | B2 | MEMBER | APPROVED | |
| B | B3 | MEMBER | PENDING | |
| B | B4 | MEMBER | DECLINED | |
| B | B5 | MEMBER | REVOKED | |

- Setiap household punya tepat 1 membership OWNER APPROVED (invariant bootstrap).
- Membership A3/A4/A5 & B3/B4/B5 memakai `UNIQUE(user_id, household_id)`; status
  di-flip pada baris yang sama (audit trail di membership_event).
- membership_event: REQUESTED untuk tiap PENDING; APPROVED/DECLINED/REVOKED sesuai
  transisi; tabel immutable (tanpa updated_at).

## 2. Invite

| Invite | Household | Kondisi | Dipakai untuk |
|---|---|---|---|
| INV-1 | A | valid, belum redeemed, belum revoked, `expires_at = NOW + 7d` | AC-F1-2 |
| INV-2 | A | sudah redeemed (`redeemed_at` terisi) | AC-F1-3 (terpakai) |
| INV-3 | A | `expires_at = NOW − 1d` | AC-F1-3 (expired) |
| INV-4 | A | `revoked_at` terisi | AC-F1-3 (revoked) |
| INV-5 | A | hash tidak match | AC-F1-3 (salah) |
| INV-6 | A | valid, untuk uji redeem concurrent (N request paralel) | AC-F1-2 concurrency |

`code_hash` = sha256; plaintext hanya di response create (tidak di fixture DB).

## 3. Transaction

### 3.1 Boundary timezone (Asia/Jakarta)

| Tx | type | amount_minor | occurred_at (UTC) | WIB | Dipakai |
|---|---|---|---|---|---|
| TX-TZ-1 | MONEY_OUT | 100000 | 2026-09-30T17:30:00Z | 1 Okt 00:30 | AC-F2-5 (bucket 1 Okt) |
| TX-TZ-2 | MONEY_OUT | 50000 | 2026-09-30T16:59:59Z | 30 Sep 23:59 | AC-F2-5 (bucket 30 Sep) |
| TX-TZ-3 | MONEY_OUT | 25000 | 2026-10-01T00:30:00Z | 1 Okt 07:30 | AC-F2-2 (spent Okt) |
| TX-TZ-4 | MONEY_IN | 200000 | 2026-09-30T03:00:00Z | 30 Sep 10:00 | saldo |

### 3.2 Pasangan transfer

| Tx | type | amount_minor | transfer_group_id | Catatan |
|---|---|---|---|---|
| TX-TR-OUT | MONEY_OUT | 300000 | `d0000000-...-9001` | kaki keluar |
| TX-TR-IN | MONEY_IN | 300000 | `d0000000-...-9001` | kaki masuk |

- `UNIQUE(household_id, transfer_group_id, type)` memblokir kaki ketiga.
- `CHECK ((type='TRANSFER') = (transfer_group_id IS NOT NULL))` — fixture juga
  menyertakan baris non-transfer dengan `transfer_group_id = NULL`.
- Uji hapus satu kaki (AC-F5 edge): hapus TX-TR-OUT → saldo bergeser; pasangan tetap aktif.

### 3.3 Soft-deleted

| Tx | deleted_at | deleted_by_user_id | Dipakai |
|---|---|---|---|
| TX-DEL-1 | NOW − 1h | A1 | AC-F5-1, AC-F5-3 (trash) |
| TX-DEL-2 | NOW − 2h | A2 | AC-F5-3 (urutan deleted_at DESC) |

### 3.4 Nilai boundary

| Tx | amount_minor | Catatan |
|---|---|---|
| TX-MIN | 1 | minimum valid |
| TX-MAX | 2147483647 | maksimum valid (int32) |
| TX-OVER | 2147483648 | harus ditolak 422 AMOUNT_OUT_OF_RANGE |
| TX-ZERO | 0 | harus ditolak 422 |
| TX-NEG | −1 | harus ditolak 422 |

### 3.5 Unicode / panjang

| Tx | Field | Nilai |
|---|---|---|
| TX-UNI-1 | note | emoji + RTL: `"🎉 شراء البقالة"` |
| TX-UNI-2 | note | 500 char (batas) |
| TX-UNI-3 | note | 501 char (harus 422) |
| TX-UNI-4 | merchant | 120 char (batas) |
| TX-UNI-5 | merchant | 121 char (harus 422) |

## 4. Budget (household_budget)

| Budget | Household | period_start | amount_minor | Dipakai |
|---|---|---|---|---|
| BUD-A-SET | A | 2026-10-01 | 5000000 | AC-F2-2 (set) |
| BUD-A-PREV | A | 2026-09-01 | 4000000 | periode lain (bukan bulan berjalan) |
| — | B | (tidak ada) | — | AC-F2-2 (unset → state "atur budget") |

- `UNIQUE(household_id, period_start)`; upsert, bukan insert ganda.
- `CHECK (amount_minor > 0)`; fixture amount 0/negatif untuk uji 422.

## 5. Savings goal (4 status)

| Goal | Household | target | saved | deadline | deleted_at | Dipakai |
|---|---|---|---|---|---|---|
| GOAL-ACTIVE | A | 1000000 | 250000 | 2026-12-31 | NULL | AC-F4-2 (25%) |
| GOAL-CAPPED | A | 1000000 | 1500000 | NULL | NULL | AC-F4-2 (capped 100%) |
| GOAL-OVERDUE | A | 500000 | 100000 | 2026-01-01 | NULL | AC-F4-1 (penanda terlambat) |
| GOAL-DELETED | A | 800000 | 0 | NULL | NOW − 1h | AC-F4-4, AC-F2-9 (tidak tampil) |
| GOAL-DUP-1/2 | A | 300000 | 0 | NULL | NULL | AC-F4-1 (nama sama → dua 201) |
| GOAL-B | B | 200000 | 0 | NULL | NULL | isolasi lintas household |

- `CHECK (target_amount_minor > 0)` dan `CHECK (saved_amount_minor >= 0)`.
- Uji increment: saved 0 + (−1) → 422 SAVED_AMOUNT_INVALID; saved 2147483647 + 1 → 422.

## 6. Receipt & OCR job

| Receipt | Household | content_sha256 | mime | size_bytes | Job status | error_code |
|---|---|---|---|---|---|---|
| RCP-OK | A | sha256(img-valid-jpeg) | image/jpeg | 1048576 | SUCCEEDED | — |
| RCP-FAIL-TIMEOUT | A | sha256(img-valid-png) | image/png | 2097152 | FAILED | OCR_TIMEOUT |
| RCP-FAIL-RATE | A | sha256(img-valid-webp) | image/webp | 524288 | FAILED | OCR_RATE_LIMITED |
| RCP-FAIL-INVALID | A | sha256(img-valid-jpeg-2) | image/jpeg | 1048576 | FAILED | OCR_INVALID_OUTPUT |
| RCP-FAIL-UNAVAIL | A | sha256(img-valid-png-2) | image/png | 1048576 | FAILED | OCR_MODEL_UNAVAILABLE |
| RCP-PROCESSING | A | sha256(img-valid-jpeg-3) | image/jpeg | 1048576 | PROCESSING | — |
| RCP-DUP | A | sha256(img-valid-jpeg) | image/jpeg | 1048576 | (existing) | — |
| RCP-B | B | sha256(img-valid-jpeg) | image/jpeg | 1048576 | SUCCEEDED | — |

- `UNIQUE(household_id, content_sha256)` → RCP-DUP memicu 409 DUPLICATE_RECEIPT.
- RCP-B membuktikan dedup TIDAK lintas household (konten sama, household beda → boleh).
- Draft sukses: `result_json` dengan `confidence` ≥0,70; satu draft low-confidence
  (`confidence = 0.55`) dengan `missingFields` terisi.

## 7. Advisor insight

| Insight | Household | period | generated_at | expires_at | Dipakai |
|---|---|---|---|---|---|
| INS-FRESH | A | 2026-09-01..2026-09-30 | NOW − 1h | NOW + 23h | AC-F4-6 (CACHE hit) |
| INS-EXPIRED | A | 2026-08-01..2026-08-31 | NOW − 25h | NOW − 1h | AC-F4-6 (expired tidak dipakai) |
| INS-OTHER-PERIOD | A | 2026-07-01..2026-07-31 | NOW − 1h | NOW + 23h | AC-F4-6 (periode beda bukan cache hit) |
| INS-B | B | 2026-09-01..2026-09-30 | NOW − 1h | NOW + 23h | isolasi |

- `actions_json` ≥1 item; `limitations` terisi; `source_period_start/end` DATE.
- Retensi: seed 11 insight household A untuk uji prune (insight tertua terhapus).

## 8. Idempotency key

| Row | user_id | key | request_hash | response_status | Dipakai |
|---|---|---|---|---|---|
| IDK-1 | A1 | `11111111-aaaa-4aaa-8aaa-111111111111` | sha256(POST /api/transactions + canonical body X) | 201 | AC-F3-8 replay |
| IDK-2 | A1 | `22222222-bbbb-4bbb-8bbb-222222222222` | sha256(POST /api/transactions + body Y) | 409 | AC-F3-8 replay 409 |
| IDK-3 | A1 | `33333333-cccc-4ccc-8ccc-333333333333` | sha256(POST /api/ocr/receipts + body Z) | 409 | AC-F3-8 replay DUPLICATE_RECEIPT |

- `UNIQUE(user_id, key)`; scope per user (A-22). Key sama + payload beda → 409
  IDEMPOTENCY_CONFLICT. Path bagian dari hash (key di endpoint beda ≠ konflik).

## 9. Gambar uji (byte-level)

| File | Ukuran | Mime | Dipakai |
|---|---|---|---|
| img-valid-jpeg | 1.048.576 byte | image/jpeg | AC-F3-4 sukses |
| img-valid-png | 2.097.152 byte | image/png | sukses |
| img-valid-webp | 524.288 byte | image/webp | sukses |
| img-exact-4mb | **tepat 4.194.304 byte** | image/jpeg | AC-F3-4 boundary (lolos) |
| img-over-4mb | **4.194.305 byte** (+1) | image/jpeg | AC-F3-4 → 422 FILE_INVALID |
| img-bad-mime | 1.048.576 byte | image/gif | → 422 FILE_INVALID |
| img-dup-a / img-dup-b | identik byte-for-byte | image/jpeg | AC-F3-6 dedup JALAN |
| img-similar-1 / img-similar-2 | mirip tapi beda 1 byte | image/jpeg | AC-F3-6 dedup TIDAK boleh jalan |

## 10. Time-travel helper (spesifikasi, bukan kode)

Kontrol waktu untuk menguji expiry tanpa menunggu:

| Target | Cara | Dipakai |
|---|---|---|
| `session.expires_at` | set ke NOW − 1s | AC-F1-6 (401) |
| `invite.expires_at` | set ke NOW − 1d | AC-F1-3 |
| `occurred_at` masa depan | set NOW + 1d (WIB) | AC-F3-1 (422) |
| `insight.expires_at` | set NOW − 1h | AC-F4-6 |
| `idempotency_key.expires_at` | set NOW − 1h | AC-F3-8 (purge) |
| `deleted_at` | set NOW − 1h | AC-F5-3 |

## 11. Concurrency harness (spesifikasi)

| Skenario | N request paralel | Ekspektasi | AC |
|---|---|---|---|
| Redeem invite sama | 2 | tepat 1 sukses; 1 gagal (conditional update + rowcount) | AC-F1-2 |
| Trash record sama | 2 | 1× 200; 1× 200 ALREADY_DELETED | AC-F5-6 |
| Increment saved amount | 2 | kedua delta terhitung (atomic) | AC-F4-3 |
| Upload konten sama | 2 | 1 sukses; 1× 409 + job existing | AC-F3-6 |
| Signup user pertama | 2 | keduanya sukses, household masing-masing | AC-F1-1 |

## 12. Cakupan invariant ERD §7

| Invariant ERD §7 | Fixture |
|---|---|
| Migration bersih di DB kosong | seluruh seed |
| 13 tabel + kolom §3 | seluruh seed |
| Partial unique membership + CHECK | §1, §3.2, §4, §5 |
| Query aktif exclude deleted | §3.3, §5 (GOAL-DELETED) |
| Isolasi lintas household | §1 (A vs B), §6 (RCP-B), §7 (INS-B) |
| Redeem ganda concurrent | §2 (INV-6), §11 |
| Idempotency sama vs beda | §8 |
| Transfer tepat 2 baris + bukan spending | §3.2 |
