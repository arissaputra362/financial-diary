# Verification Matrix — Financial Planner MVP

**Owner:** QA Engineer · **Tanggal:** 2026-09-30 · **Status:** Baseline (pre-implementation)
**Sumber AC:** `docs/spec/feat-*.md` (42 AC) · **AC ID:** usulan QA, menunggu penempelan PM
**Catatan:** Dokumen ini TIDAK memuat test executable. Route/schema belum ada; baris
"Status" = `Not started` sampai dev plan + implementasi tersedia.

## Legenda

- **Test level:** `unit` (fungsi murni/service), `integration` (route+DB+seam), `e2e`
  (Playwright, browser), `smoke` (scan statis/bundle/route-existence).
- **Oracle:** kondisi lulus yang dapat diamati (bukan "TBD").
- **Status:** `Not started` | `Blocked` | `Pass` | `Fail`.

## Matriks AC (42 baris == 42 AC)

| AC ID | Spec | Test level | Oracle | Status |
|---|---|---|---|---|
| AC-F1-1 | feat-auth-approval | integration | Signup tanpa invite → 1 user + 1 household + 1 membership(OWNER,APPROVED) dalam satu tx; `nextAction=OPEN_HOME`; tidak ada data ledger di response; password <8 → 422 | Not started |
| AC-F1-2 | feat-auth-approval | integration | Invite valid → membership PENDING + event REQUESTED; `nextAction=WAIT_FOR_APPROVAL`; `invite.redeemed_at` terisi; status bukan APPROVED | Not started |
| AC-F1-3 | feat-auth-approval | integration | 4 penyebab (salah/expired/revoked/terpakai) → 400 `INVALID_INVITE` dengan body `{code,message}` identik; tidak ada enumerasi code | Not started |
| AC-F1-4 | feat-auth-approval | integration | PENDING/DECLINED/REVOKED → 403 `ACCESS_PENDING`/`ACCESS_DECLINED`/`ACCESS_REVOKED` pada semua `/api/*` kecuali `/api/auth/me` & logout; tidak ada data ledger | Not started |
| AC-F1-5 | feat-auth-approval | integration | Transisi valid PENDING→APPROVED/DECLINED, APPROVED→REVOKED; tiap aksi append 1 membership_event; transisi invalid → 409 `INVALID_STATE_TRANSITION`; non-owner → 403; OWNER sebagai target → ditolak | Not started |
| AC-F1-6 | feat-auth-approval | integration | JWT TTL 15m; reissue cookie (sid sama) tiap request protected; `session.expires_at` 7 hari → 401; logout set `revoked_at` + clear cookie; login → sid baru; cookie HttpOnly/Secure/SameSite=Lax | Not started |
| AC-F1-7 | feat-auth-approval | integration | Approve → akses pada request berikutnya; revoke → akses hilang pada request berikutnya; JWT claims = `{sub,sid,token_version,iat,exp}` (tanpa role/household_id) | Not started |
| AC-F2-1 | feat-dashboard | integration | `balanceMinor = sum(MONEY_IN aktif) − sum(MONEY_OUT aktif)` seluruh waktu; kaki TRANSFER net 0; record deleted tidak dihitung | Not started |
| AC-F2-2 | feat-dashboard | integration | `budgetMinor` dari household_budget periode bulan berjalan Asia/Jakarta; `spentMinor` = sum MONEY_OUT aktif periode; `remaining = budget − spent`; belum di-set → state "atur budget" (bukan 0) | Not started |
| AC-F2-3 | feat-dashboard | integration | `PUT /api/budget` owner-only upsert `(household_id, period_start)`; amount >0; member → 403; amount 0/negatif → 422; tidak ada baris ganda | Not started |
| AC-F2-4 | feat-dashboard | integration | Household hanya transfer → `spentMinor=0`; transfer tetap tampil di aktivitas | Not started |
| AC-F2-5 | feat-dashboard | integration | `byDay` bucket MONEY_OUT per hari kalender Asia/Jakarta; 7D=7 bucket termasuk hari ini; hari tanpa pengeluaran = 0; `occurred_at=2026-09-30T17:30:00Z` → bucket 1 Okt | Not started |
| AC-F2-6 | feat-dashboard | integration | Filter type/source/from/to/cursor/limit mengubah rows; cursor keyset `(occurred_at DESC,id DESC)` opaque base64; limit default 20 maks 50 (>50 → 422); tanpa duplikat/hilang termasuk tie `occurred_at` | Not started |
| AC-F2-7 | feat-dashboard | e2e | Setiap perubahan filter mengubah rows atau menampilkan filtered-empty; rows tidak identik sebelum/sesudah | Not started |
| AC-F2-8 | feat-dashboard | e2e | loading→skeleton; empty→empty state; error→error state penuh + retry (tanpa kartu parsial); filtered-empty saat filter tanpa hasil | Not started |
| AC-F2-9 | feat-dashboard | integration | Kartu goals menampilkan goal aktif + progress capped 100%; goal deleted tidak tampil; kosong → empty state + CTA `/budget` | Not started |
| AC-F2-10 | feat-dashboard | e2e | <768px hanya bottom nav; 768–1023 & ≥1024 top nav + pill "Add a transaction"; tanpa horizontal overflow di 390px; touch target ≥48px; tidak ada dua nav aktif | Not started |
| AC-F3-1 | feat-transactions-ocr | integration | type enum; amount >0 maks 2.147.483.647 (>→422 `AMOUNT_OUT_OF_RANGE`); `occurred_at` > now WIB → 422; category kanonik sesuai type; note ≤500; merchant ≤120; invalid → 422 fieldErrors bahasa awam | Not started |
| AC-F3-2 | feat-transactions-ocr | integration | `amount_minor` integer; DTO suffix `Minor`; tidak ada float/decimal/pembulatan | Not started |
| AC-F3-3 | feat-transactions-ocr | integration | Transfer → tepat 2 record (MONEY_OUT+MONEY_IN) `transfer_group_id` sama, satu tx; keduanya tampil; tidak dihitung spending | Not started |
| AC-F3-4 | feat-transactions-ocr | integration | Upload ≤4.194.304 byte mime jpeg/png/webp → receipt+ocr_job; response job+draft; TIDAK ada transaction; date-only D → `occurred_at` D 12:00 WIB; >4MB → 422 `FILE_INVALID`; API key tidak di response | Not started |
| AC-F3-5 | feat-transactions-ocr | integration | Timeout/rate limit/model unavailable/output invalid → HTTP 200 `{job:{status:FAILED,errorCode},draft:null}`; errorCode ∈ {`OCR_TIMEOUT`,`OCR_RATE_LIMITED`,`OCR_INVALID_OUTPUT`,`OCR_MODEL_UNAVAILABLE`}; bukan 5xx | Not started |
| AC-F3-6 | feat-transactions-ocr | integration | sha256 sama di household sama → 409 `DUPLICATE_RECEIPT` + job existing; tidak diproses dua kali; household berbeda boleh konten sama | Not started |
| AC-F3-7 | feat-transactions-ocr | integration | ocr_job FAILED `error_code` typed; confidence <0,70 ditandai; field `missingFields` tetap kosong; tidak ada data karangan; tidak ada transaction | Not started |
| AC-F3-8 | feat-transactions-ocr | integration | Claim key dulu, dedup di dalamnya (A-11); key sama+payload sama → replay response asli (termasuk replay 409); key sama+payload beda → 409 `IDEMPOTENCY_CONFLICT`; gagal → key rollback; tanpa key → normal; hash canonical-JSON; scope per user; path bagian hash | Not started |
| AC-F3-9 | feat-transactions-ocr | smoke | Bundle scan: `GEMINI_API_KEY`/`DATABASE_URL` tidak ada di client bundle; env tanpa `NEXT_PUBLIC_`; prompt mentah tidak di UI/log | Not started |
| AC-F4-1 | feat-goals-advisor | integration | target >0; saved awal 0; target 0/negatif → 422; deadline lampau boleh (penanda terlambat); nama duplikat → dua 201 | Not started |
| AC-F4-2 | feat-goals-advisor | integration | `progressPercent = min(100, saved/target×100)` di DTO; DB tidak di-cap; saved=target → 100% (bukan 99%) | Not started |
| AC-F4-3 | feat-goals-advisor | integration | Delta atomic conditional update (`+X>=0` di WHERE); dua increment bersamaan keduanya terhitung; hasil negatif → 422 `SAVED_AMOUNT_INVALID` tanpa perubahan; DB `CHECK(saved>=0)`; increment goal trash → 404 | Not started |
| AC-F4-4 | feat-goals-advisor | integration | `deleted_at` terisi; hilang dari daftar aktif + dashboard; bisa restore; bukan hard delete | Not started |
| AC-F4-5 | feat-goals-advisor | integration | Response `{headline,summary,actions,limitations,sourcePeriod,model,generatedAt,expiresAt}`; periode maks 90 hari; start==end boleh; masa depan → "data tidak cukup"; start>end → 422; tidak ada transaksi mentah per record | Not started |
| AC-F4-6 | feat-goals-advisor | integration | Cache key `(household_id,source_period_start,source_period_end)`+unexpired TTL 24h terbaru; `delivery=FRESH` baru / `CACHE` hit; UI label "tersimpan/dari cache"; periode beda bukan cache hit; cache expired tidak dipakai | Not started |
| AC-F4-7 | feat-goals-advisor | integration | 429 `ADVISOR_RATE_LIMITED` / 503 `ADVISOR_UNAVAILABLE` / 422 `ADVISOR_INVALID_OUTPUT`; bila cache unexpired periode diminta ada → `delivery=CACHE`; tidak ada saran karangan | Not started |
| AC-F4-8 | feat-goals-advisor | integration | `actions` ≥1 item, tiap `label` ≤80 char + `type` ∈ {VIEW_GOAL,REVIEW_SPENDING,NONE}; limitations+sourcePeriod terlihat di 390px tanpa interaksi; teks tanpa frasa terlarang ("dijamin","pasti hemat","sesuai OJK") | Not started |
| AC-F5-1 | feat-trash-restore | integration | `deleted_at`+`deleted_by_user_id` terisi; hilang dari semua daftar aktif + perhitungan (saldo/budget/grafik/progress); bukan hard delete | Not started |
| AC-F5-2 | feat-trash-restore | e2e | Toast undo tampil setelah 200, hilang dalam 4,5–5,5 detik; undo → restore; undo hanya selama toast terlihat; setelah hilang hanya via trash | Not started |
| AC-F5-3 | feat-trash-restore | integration | Trash hanya record deleted household caller; urutan `deleted_at DESC`; cursor pagination sama; record aktif tidak tampil | Not started |
| AC-F5-4 | feat-trash-restore | integration | `deleted_at`+`deleted_by_user_id` dikosongkan; kembali dihitung + tampil; `occurred_at`/`amount`/`created_by` tidak berubah | Not started |
| AC-F5-5 | feat-trash-restore | integration | Restore record sudah aktif → 200 `ALREADY_ACTIVE` tanpa error UI | Not started |
| AC-F5-6 | feat-trash-restore | integration | Dua trash bersamaan → satu 200, satu 200 `ALREADY_DELETED`; tidak ada 409/500; `deleted_at` tidak dobel-set | Not started |
| AC-F5-7 | feat-trash-restore | integration | Akses/restore record household lain by id → 404 `NOT_FOUND` pesan generik; bukan 403; tidak membedakan "tidak ada" vs "milik orang lain" | Not started |
| AC-F5-8 | feat-trash-restore | smoke | Tidak ada route/UI permanent delete (grep route DELETE fisik + tombol "hapus permanen") | Not started |

**Jumlah baris AC = 42 == jumlah AC di 5 spec.**

## Appendix — Cross-cutting checks (BUKAN baris AC; dipetakan ke AC ID)

| Concern | Dipetakan ke | Test level | Oracle | Status |
|---|---|---|---|---|
| Isolasi household (404 bukan 403) | AC-F1-4, AC-F5-3, AC-F5-7, AC-F2-1 | integration | Query lintas household tidak mengembalikan/membocorkan keberadaan record | Not started |
| Soft delete / restore | AC-F5-1..AC-F5-8 | integration | Semua query aktif `deleted_at IS NULL`; trash `IS NOT NULL` | Not started |
| Idempotency (sama vs beda payload) | AC-F3-8 | integration | Replay vs 409 `IDEMPOTENCY_CONFLICT` | Not started |
| Duplicate receipt | AC-F3-6 | integration | 409 `DUPLICATE_RECEIPT` per household | Not started |
| Advisor FRESH/CACHE + rate limit | AC-F4-6, AC-F4-7 | integration | delivery label + typed error + fallback cache | Not started |
| State UI lengkap | AC-F2-8, AC-F5-2 | e2e | loading/empty/error/filtered-empty/submitting/success | Not started |
| Responsive 390px + satu nav | AC-F2-10 | e2e | tanpa overflow; satu sistem nav per breakpoint | Not started |
| Timezone Asia/Jakarta | AC-F2-2, AC-F2-5, AC-F3-1, AC-F4-5 | integration | Boundary 17:30Z/00:30 WIB; validasi masa depan WIB | Not started |
| Secrets server-side | AC-F3-9 | smoke | Bundle scan bersih | Not started |
| Concurrency | AC-F1-2 (redeem), AC-F4-3 (increment), AC-F5-6 (double delete) | integration | Conditional update + rowcount; tidak ada lost update | Not started |
| DB contract (partial index / CHECK) | ERD §7 | integration | Partial unique membership; CHECK transaction/goal/budget terpasang | Not started |
| Route kanonik (A-31) | AC-F2-10 | smoke | `/savings` & `/add` tidak ada; trash = `/transactions?view=trash` | Not started |
