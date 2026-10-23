# Verification Matrix — Financial Planner MVP

**Owner:** QA Engineer · **Tanggal:** 2026-09-30 · **Status:** Baseline (pre-implementation)
**Sumber AC:** `docs/spec/feat-*.md` (**54 AC**: 42 AC F1–F5 historis + 12 AC F6) · **AC ID:** 12 AC F6 memakai ID kanonik dari `docs/PRD.md` (`AC-F6-1..AC-F6-12`); 42 AC F1–F5 memakai ID usulan QA historis (snapshot pra-F6; status/bukti lama tidak diubah)
**Catatan:** Dokumen ini TIDAK memuat test executable. Route/schema belum ada; baris
"Status" = `Not started` sampai dev plan + implementasi tersedia.

> **Update 2026-10-08 (F6 Dompet Pribadi & Sharing):** Spec `docs/spec/feat-wallets.md`
> masih **Draft**; desain `docs/design/06-wallets.md` sudah **PM UX sign-off (2026-10-08,
> design-only)** tetapi gate implementasi (amendment `architecture-decisions.md`,
> persetujuan resmi Spec, Dev Plan) belum terpenuhi. 12 baris AC-F6-1..AC-F6-12
> ditambahkan di section "Matriks AC F6". **Semua baris F6 berstatus `Not started`**;
> tidak ada test F6 yang dijalankan dan tidak ada baris lama F1–F5 yang dipromosikan ulang.

## Legenda

- **Test level:** `unit` (fungsi murni/service), `integration` (route+DB+seam), `e2e`
  (Playwright, browser), `smoke` (scan statis/bundle/route-existence).
- **Oracle:** kondisi lulus yang dapat diamati (bukan "TBD").
- **Status:** `Not started` | `Blocked` | `Pass` | `Fail`.

## Matriks AC F1–F5 (42 baris == 42 AC, historis — tidak diubah)

| AC ID | Spec | Test level | Oracle | Status |
|---|---|---|---|---|
| AC-F1-1 | feat-auth-approval | integration | Signup tanpa invite → 1 user + 1 household + 1 membership(OWNER,APPROVED) dalam satu tx; `nextAction=OPEN_HOME`; tidak ada data ledger di response; password <8 → 422 | Pass |
| AC-F1-2 | feat-auth-approval | integration | Invite valid → membership PENDING + event REQUESTED; `nextAction=WAIT_FOR_APPROVAL`; `invite.redeemed_at` terisi; status bukan APPROVED | Pass |
| AC-F1-3 | feat-auth-approval | integration | 4 penyebab (salah/expired/revoked/terpakai) → 400 `INVALID_INVITE` dengan body `{code,message}` identik; tidak ada enumerasi code | Pass |
| AC-F1-4 | feat-auth-approval | integration | PENDING/DECLINED/REVOKED → 403 `ACCESS_PENDING`/`ACCESS_DECLINED`/`ACCESS_REVOKED` pada semua `/api/*` kecuali `/api/auth/me` & logout; tidak ada data ledger | Pass |
| AC-F1-5 | feat-auth-approval | integration | Transisi valid PENDING→APPROVED/DECLINED, APPROVED→REVOKED; tiap aksi append 1 membership_event; transisi invalid → 409 `INVALID_STATE_TRANSITION`; non-owner → 403; OWNER sebagai target → ditolak | Pass |
| AC-F1-6 | feat-auth-approval | integration | JWT TTL 15m; reissue cookie (sid sama) tiap request protected; `session.expires_at` 7 hari → 401; logout set `revoked_at` + clear cookie; login → sid baru; cookie HttpOnly/Secure/SameSite=Lax | Pass |
| AC-F1-7 | feat-auth-approval | integration | Approve → akses pada request berikutnya; revoke → akses hilang pada request berikutnya; JWT claims = `{sub,sid,token_version,iat,exp}` (tanpa role/household_id) | Pass |
| AC-F2-1 | feat-dashboard | integration | `balanceMinor = sum(MONEY_IN aktif) − sum(MONEY_OUT aktif)` seluruh waktu; kaki TRANSFER net 0; record deleted tidak dihitung | Pass |
| AC-F2-2 | feat-dashboard | integration | `budgetMinor` dari household_budget periode bulan berjalan Asia/Jakarta; `spentMinor` = sum MONEY_OUT aktif periode; `remaining = budget − spent`; belum di-set → state "atur budget" (bukan 0) | Pass |
| AC-F2-3 | feat-dashboard | integration | `PUT /api/budget` owner-only upsert `(household_id, period_start)`; amount >0; member → 403; amount 0/negatif → 422; tidak ada baris ganda | Pass |
| AC-F2-4 | feat-dashboard | integration | Household hanya transfer → `spentMinor=0`; transfer tetap tampil di aktivitas | Pass |
| AC-F2-5 | feat-dashboard | integration | `byDay` bucket MONEY_OUT per hari kalender Asia/Jakarta; 7D=7 bucket termasuk hari ini; hari tanpa pengeluaran = 0; `occurred_at=2026-09-30T17:30:00Z` → bucket 1 Okt | Pass |
| AC-F2-6 | feat-dashboard | integration | Filter type/source/from/to/cursor/limit mengubah rows; cursor keyset `(occurred_at DESC,id DESC)` opaque base64; limit default 20 maks 50 (>50 → 422); tanpa duplikat/hilang termasuk tie `occurred_at` | Pass |
| AC-F2-7 | feat-dashboard | e2e | Setiap perubahan filter mengubah rows atau menampilkan filtered-empty; rows tidak identik sebelum/sesudah | Pass |
| AC-F2-8 | feat-dashboard | e2e | loading→skeleton; empty→empty state; error→error state penuh + retry (tanpa kartu parsial); filtered-empty saat filter tanpa hasil | Pass |
| AC-F2-9 | feat-dashboard | integration | Kartu goals menampilkan goal aktif + progress capped 100%; goal deleted tidak tampil; kosong → empty state + CTA `/budget` | Pass |
| AC-F2-10 | feat-dashboard | e2e | <768px hanya bottom nav; 768–1023 & ≥1024 top nav + pill "Add a transaction"; tanpa horizontal overflow di 390px; touch target ≥48px; tidak ada dua nav aktif | Pass |
| AC-F3-1 | feat-transactions-ocr | integration | type enum; amount >0 maks 2.147.483.647 (>→422 `AMOUNT_OUT_OF_RANGE`); `occurred_at` > now WIB → 422; category kanonik sesuai type; note ≤500; merchant ≤120; invalid → 422 fieldErrors bahasa awam | Pass |
| AC-F3-2 | feat-transactions-ocr | integration | `amount_minor` integer; DTO suffix `Minor`; tidak ada float/decimal/pembulatan | Pass |
| AC-F3-3 | feat-transactions-ocr | integration | Transfer → tepat 2 record (MONEY_OUT+MONEY_IN) `transfer_group_id` sama, satu tx; keduanya tampil; tidak dihitung spending | Pass |
| AC-F3-4 | feat-transactions-ocr | integration | Upload ≤4.194.304 byte mime jpeg/png/webp → receipt+ocr_job; response job+draft; TIDAK ada transaction; date-only D → `occurred_at` D 12:00 WIB; >4MB → 422 `FILE_INVALID`; API key tidak di response | Pass |
| AC-F3-5 | feat-transactions-ocr | integration | Timeout/rate limit/model unavailable/output invalid → HTTP 200 `{job:{status:FAILED,errorCode},draft:null}`; errorCode ∈ {`OCR_TIMEOUT`,`OCR_RATE_LIMITED`,`OCR_INVALID_OUTPUT`,`OCR_MODEL_UNAVAILABLE`}; bukan 5xx | Pass |
| AC-F3-6 | feat-transactions-ocr | integration | sha256 sama di household sama → 409 `DUPLICATE_RECEIPT` + job existing; tidak diproses dua kali; household berbeda boleh konten sama | Pass |
| AC-F3-7 | feat-transactions-ocr | integration | ocr_job FAILED `error_code` typed; confidence <0,70 ditandai; field `missingFields` tetap kosong; tidak ada data karangan; tidak ada transaction | Pass |
| AC-F3-8 | feat-transactions-ocr | integration | Claim key dulu, dedup di dalamnya (A-11); key sama+payload sama → replay response asli (termasuk replay 409); key sama+payload beda → 409 `IDEMPOTENCY_CONFLICT`; gagal → key rollback; tanpa key → normal; hash canonical-JSON; scope per user; path bagian hash | Pass |
| AC-F3-9 | feat-transactions-ocr | smoke | Bundle scan: `GEMINI_API_KEY`/`DATABASE_URL` tidak ada di client bundle; env tanpa `NEXT_PUBLIC_`; prompt mentah tidak di UI/log | Pass |
| AC-F4-1 | feat-goals-advisor | integration | target >0; saved awal 0; target 0/negatif → 422; deadline lampau boleh (penanda terlambat); nama duplikat → dua 201 | Pass |
| AC-F4-2 | feat-goals-advisor | integration | `progressPercent = min(100, saved/target×100)` di DTO; DB tidak di-cap; saved=target → 100% (bukan 99%) | Pass |
| AC-F4-3 | feat-goals-advisor | integration | Delta atomic conditional update (`+X>=0` di WHERE); dua increment bersamaan keduanya terhitung; hasil negatif → 422 `SAVED_AMOUNT_INVALID` tanpa perubahan; DB `CHECK(saved>=0)`; increment goal trash → 404 | Pass |
| AC-F4-4 | feat-goals-advisor | integration | `deleted_at` terisi; hilang dari daftar aktif + dashboard; bisa restore; bukan hard delete | Pass |
| AC-F4-5 | feat-goals-advisor | integration | Response `{headline,summary,actions,limitations,sourcePeriod,model,generatedAt,expiresAt}`; periode maks 90 hari; start==end boleh; masa depan → "data tidak cukup"; start>end → 422; tidak ada transaksi mentah per record | Not started |
| AC-F4-6 | feat-goals-advisor | integration | Cache key `(household_id,source_period_start,source_period_end)`+unexpired TTL 24h terbaru; `delivery=FRESH` baru / `CACHE` hit; UI label "tersimpan/dari cache"; periode beda bukan cache hit; cache expired tidak dipakai | Pass |
| AC-F4-7 | feat-goals-advisor | integration | 429 `ADVISOR_RATE_LIMITED` / 503 `ADVISOR_UNAVAILABLE` / 422 `ADVISOR_INVALID_OUTPUT`; bila cache unexpired periode diminta ada → `delivery=CACHE`; tidak ada saran karangan | Pass |
| AC-F4-8 | feat-goals-advisor | integration | `actions` ≥1 item, tiap `label` ≤80 char + `type` ∈ {VIEW_GOAL,REVIEW_SPENDING,NONE}; limitations+sourcePeriod terlihat di 390px tanpa interaksi; teks tanpa frasa terlarang ("dijamin","pasti hemat","sesuai OJK") | Pass |
| AC-F5-1 | feat-trash-restore | integration | `deleted_at`+`deleted_by_user_id` terisi; hilang dari semua daftar aktif + perhitungan (saldo/budget/grafik/progress); bukan hard delete | Pass |
| AC-F5-2 | feat-trash-restore | e2e | Toast undo tampil setelah 200, hilang dalam 4,5–5,5 detik; undo → restore; undo hanya selama toast terlihat; setelah hilang hanya via trash | Pass |
| AC-F5-3 | feat-trash-restore | integration | Trash hanya record deleted household caller; urutan `deleted_at DESC`; cursor pagination sama; record aktif tidak tampil | Pass |
| AC-F5-4 | feat-trash-restore | integration | `deleted_at`+`deleted_by_user_id` dikosongkan; kembali dihitung + tampil; `occurred_at`/`amount`/`created_by` tidak berubah | Pass |
| AC-F5-5 | feat-trash-restore | integration | Restore record sudah aktif → 200 dengan flag `alreadyActive: true`; tidak ada error UI; tidak ada perubahan data | Pass |
| AC-F5-6 | feat-trash-restore | integration | Dua trash bersamaan → satu 200 dengan `deletedAt` terisi, satu 200 dengan flag `alreadyDeleted: true`; tidak ada 409/500; `deleted_at` tidak dobel-set | Pass |
| AC-F5-7 | feat-trash-restore | integration | Akses/restore record household lain by id → 404 `NOT_FOUND` pesan generik; bukan 403; tidak membedakan "tidak ada" vs "milik orang lain" | Pass |
| AC-F5-8 | feat-trash-restore | smoke | Tidak ada route/UI permanent delete (grep route DELETE fisik + tombol "hapus permanen") | Pass |

**Jumlah baris AC F1–F5 = 42 == jumlah AC di 5 spec (historis, tidak diubah).**
Setelah penambahan F6 (12 baris) di §"Matriks AC F6" di bawah, total matriks menjadi
**54 AC (42 + 12)**. Semua angka "42" dan rekonstruksi 26/16, 37/5, 41/1 pada bagian
historis di bawah adalah snapshot pada tanggalnya masing-masing dan belum mencakup F6.

## Appendix — Cross-cutting checks (BUKAN baris AC; dipetakan ke AC ID)

| Concern | Dipetakan ke | Test level | Oracle | Status |
|---|---|---|---|---|
| Isolasi household (404 bukan 403) | AC-F1-4, AC-F5-3, AC-F5-7, AC-F2-1 | integration | Query lintas household tidak mengembalikan/membocorkan keberadaan record | Not started |
| Soft delete / restore | AC-F5-1..AC-F5-8 | integration | Semua query aktif `deleted_at IS NULL`; trash `IS NOT NULL` | Not started |
| Idempotency (sama vs beda payload) | AC-F3-8 | integration | Replay vs 409 `IDEMPOTENCY_CONFLICT` | Pass |
| Duplicate receipt | AC-F3-6 | integration | 409 `DUPLICATE_RECEIPT` per household | Pass |
| Advisor FRESH/CACHE + rate limit | AC-F4-6, AC-F4-7 | integration | delivery label + typed error + fallback cache | Pass |
| State UI lengkap | AC-F2-8, AC-F5-2 | e2e | loading/empty/error/filtered-empty/submitting/success | Not started |
| Responsive 390px + satu nav | AC-F2-10 | e2e | tanpa overflow; satu sistem nav per breakpoint | Pass |
| Timezone Asia/Jakarta | AC-F2-2, AC-F2-5, AC-F3-1, AC-F4-5 | integration | Full oracle remains: boundary 17:30Z/00:30 WIB, calendar bucketing/filter semantics, and WIB future validation. Bounded evidence (2026-10-08): local DB default `Asia/Bangkok`; actual app `PrismaPg` session `SHOW TIME ZONE=UTC`; real date-only transaction route response, Prisma readback, and raw SQL agreed exactly at epoch `1791349200000`; timestamp integration test 1/1. This does not check full calendar/filter semantics. Local only, no Neon/production. | Not started |
| Secrets server-side | AC-F3-9 | smoke | Bundle scan bersih | Pass |
| Concurrency | AC-F1-2 (redeem), AC-F4-3 (increment), AC-F5-6 (double delete) | integration | Conditional update + rowcount; tidak ada lost update | Not started |
| DB contract (partial index / CHECK) | ERD §7 | integration | Partial unique membership; CHECK transaction/goal/budget terpasang | Not started |
| Route kanonik (A-31) | AC-F2-10 | smoke | `/savings` & `/add` tidak ada; trash = `/transactions?view=trash` | Not started |

## T-008 execution evidence (2026-10-07)

This section records only evidence gathered in the T-008 run. It does not promote the
42 AC rows above based on test names or earlier task reports.

| Concern | Status | T-008 evidence |
|---|---|---|
| Regression suite: unit | Pass | `bun run test`: 268 passed, 28 files |
| Regression suite: integration | Pass | `bun run test:integration`: 11 passed, 4 files; local DB host was `localhost` |
| Regression suite: E2E | Pass | `bun run test:e2e`: 63 passed across 390/768/1280 viewports; web server self-managed on 3010 |
| Responsive overflow / one-nav-per-breakpoint | Pass | E2E `layout › no horizontal overflow` and `navigation per breakpoint` passed for all 3 viewports |
| Keyboard focus / visible nav focus | Pass (limited) | E2E `keyboard focus reaches a nav link with a visible outline` passed for all 3 viewports; this is not a full keyboard audit |
| Live navigation destinations | Pass (limited) | E2E `every visible nav link points to a live route` passed for all 3 viewports |
| Client bundle secret identifiers | Pass (limited) | Built `.next/static/**/*.js` scan found none of `GEMINI_API_KEY`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `AUTH_SECRET`; configured Gemini key prefix also absent. Does not prove all secret/prompt leakage modes absent |
| T-003/T-004 auth DB + HTTP route lifecycle | Pass for bounded HTTP path; incomplete overall | Prior real-DB service/repository harness passed 1/1. Final local HTTP Playwright test passed 1/1: invitee pending dashboard 403 `ACCESS_PENDING`; approve then next dashboard 200; Owner B transaction trash attempt 404 `NOT_FOUND`; revoke then next dashboard 403 `ACCESS_REVOKED`; logout then dashboard 401. Invalid/reused invite-body equivalence and other resource routes remain unverified |
| T-006 real Gemini + Blob OCR | **Blocked / incomplete** | Prior request produced a draft but its single confirmation was 422 due timestamp harness format. The one newly authorized request returned HTTP 200 job `FAILED`, code `OCR_RATE_LIMITED`; no draft, confirmation, trash, or restore was attempted. No retry. Exact Blob key deleted and independently listed absent; exact DB fixture graph cleaned. Full lifecycle not passed |
| Corrected local authenticated browser spot check | Pass for bounded checks; broader audit incomplete | Final Playwright run passed 1/1 at 390×844: `/home` and `/budget` width 390/scrollWidth 390, one visible nav, Add focus/Enter/Escape, stubbed advisor source-period/limitations visible, no page/console errors. Runtime envelopes recorded: anon dashboard 401 `UNAUTHORIZED`; malformed budget/goals/advisor/transaction requests each 422 `VALIDATION_ERROR`, top-level `error`. 18 representative flat-background pairs met applicable AA thresholds (minimum 4.53:1); gradient/alpha pairs excluded as unreliable. No axe or screen-reader audit |
| Production Neon/Vercel validation | Not run / not approved | No production access, external production validation, deployment, or production mutation was performed or approved |
| Local DB target and T-008 fixture baseline | Pass (environment only) | Continuation read-only `psql` check confirmed `financial_planner_t003` on `::1:5432`; `qa-t008-%` users=0 and their receipts=0. No lifecycle test was run and no existing user data was modified |
| T-008 one additional approved OCR attempt | **Blocked / incomplete (1 request)** | New final request returned HTTP 200 job `FAILED/OCR_RATE_LIMITED`, no draft; no save/trash/restore and no retry. Independent Blob list found 0 objects at exact path; fixture user count 0. The prior successful-draft/422 attempt is historical, not this pass's result |
| T-008 auth/invite HTTP route lifecycle | Pass for bounded route set | Final 1/1 Playwright route test observed pending denial, approval access, revoke denial, cross-household transaction 404, and logout 401. Does not cover invalid/reused invite equivalence or every resource route |
| T-008 authenticated browser + API + contrast | Pass for bounded checks; partial overall | Final 1/1 Playwright browser test recorded 390px overflow, keyboard Add/Escape, stub advisor footer, exact 401/422 envelope codes/keys, no browser errors, and representative flat-background AA samples. No full WCAG/axe/screen-reader audit; gradients/alpha excluded |
| Production Neon/Vercel validation | Not run / not approved | Production validation remains unperformed and unauthorized; no deploy or production mutation is implied |

See `../agent-comms/2026-10-07-qa-t008-report.md` for exact command output, limitations,
prior-task evidence distinctions, and release recommendation.

## Final traceability reconciliation (2026-10-07)

The 42 AC status cells are reconciled against executed QA reports and their cited artifacts,
not inferred from test names or from the current regression suite alone. **Pass: 26; Not
started: 16; Blocked: 0; Fail: 0.** `Blocked` is not used where evidence is merely absent or
partial: those rows remain `Not started` per the matrix vocabulary.

- **AC-F2-1..7, AC-F2-9..10 — Pass:** T-005 independent raw-SQL/service harness and
  Playwright results, `agent-comms/2026-10-07-qa-t005-report.md` §§ evidence/AC table
  (9 harness, 213 unit, 8 integration, 39 E2E). AC-F2-8 stays Not started: filtered-empty
  was browser-tested, but full loading/empty/error+retry UI oracle was not.
- **AC-F3-1..5, AC-F3-7, AC-F3-9 — Pass:** historical T-006 QA evidence in
  `agent-comms/2026-10-06-qa-t006-report.md` §§ AC Verification and Gemini/Blob OCR
  (including real upload→review→save), plus bug-fix retest in
  `agent-comms/2026-10-06-qa-t006-retest-report.md` (188 unit, 5 DB integration;
  transfer pair and DB migration). AC-F3-6 remains Not started because cross-household
  duplicate-receipt behavior was explicitly not tested. AC-F3-8 remains Not started:
  replay/conflict/rollback evidence exists, but the full matrix oracle also requires
  canonical hash, per-user scope, path hashing, and no-key behavior.
- **AC-F4-1..4, AC-F4-6..8 — Pass:** independent T-007 service/DB 19/19, route 38/38,
  and viewport 5/5 evidence in `agent-comms/2026-10-07-qa-t007-report.md` §3. AC-F4-5
  remains Not started: the empty-period real-model honesty probe did not produce a
  successful response; prompt/unit evidence does not satisfy its full oracle.
- **AC-F5-5..6 — Pass:** previously recorded DB integration outcomes and QA status in
  `agent-comms/2026-10-06-qa-t006-report.md` / `agent-comms/2026-10-06-pm-t006-next-steps.md`;
  these establish already-active restore and concurrent-trash idempotency only.
- **T-008 bounded checks are not promoted into unrelated AC rows.** Its final HTTP auth
  test was 1/1 and covered pending 403, approval/access, revoke 403, cross-household
  transaction-trash 404, and logout 401. It does not prove invalid/reused invite
  equivalence or isolation across resource types. The latest one-shot OCR attempt returned
  `OCR_RATE_LIMITED` after one request, so it did not newly pass the OCR lifecycle. Browser
  checks at 390px and 18 flat-background contrast pairs are bounded spot checks, not a full
  accessibility oracle.

Cross-cutting table: “Responsive 390px + satu nav” is Pass, supported by the T-005
three-viewport E2E and independent T-008 bounded browser checks; “Advisor FRESH/CACHE +
rate limit” is Pass per the complete T-007 service/route evidence; “Secrets server-side” is
Pass per the T-006 bundle smoke evidence. Household isolation,
complete soft-delete/restore, complete idempotency, duplicate receipt, advisor fallback,
complete UI states, timezone boundary suite, secret/prompt-leakage checks beyond the bounded
bundle scan, all concurrency cases,
DB contract, and canonical-route smoke remain Not started because the listed whole oracle
is not established by the available evidence.

Production Neon/Vercel validation and deployment were not run and remain explicitly outside
this local QA sign-off. See T-008 report final reconciliation for exact commands and limits.

T-008 local regression addendum: AC-F5-8 is additionally Pass from a repository-wide source
smoke across `app/` and `components/`: no DELETE route handler, client DELETE method, or
permanent-delete control label was found. The two explanatory “permanent delete” comments do
not implement a route or control. No other AC status is promoted by this addendum.

## T-008 Phase-1 auth/invite + trash/restore route evidence (2026-10-08)

QA-owned, local-only pass over real HTTP routes + local PostgreSQL `financial_planner_t003`.
Harness `docs/qa/harness/t008-auth-trash.qa.mjs`; results `docs/qa/harness/t008-auth-trash-results.json`.
Full narrative: `../../agent-comms/2026-10-08-qa-t008-auth-trash.md`.

**Totals after this pass: Pass 37; Not started 5; Blocked 0; Fail 0.** This supersedes the earlier
26/16 reconciliation for the rows listed below.

Promoted (route-level evidence executed this pass):
AC-F1-1..AC-F1-7 (owner signup atomicity/OPEN_HOME/no-ledger/422; invite PENDING + REQUESTED + redeemed_at;
four-cause `INVALID_INVITE` body equivalence; PENDING/DECLINED/REVOKED 403 codes with `/me`+logout exceptions
and error-only body; valid/invalid/non-owner/OWNER-target transitions with per-action events; 15-min JWT,
same-sid reissue, logout revoke + cleared cookie, new-sid login, HttpOnly/Secure/SameSite=Lax, 7-day absolute
TTL; approve/revoke take effect next request and exact JWT claims), AC-F5-1 (deleted fields, active-list and
balance/spending exclusion, not hard delete; byDay derives from the same active predicate, not re-asserted),
AC-F5-3 (household-scoped trash, `deleted_at DESC`, cursor pagination), AC-F5-4 (restore clears delete fields,
preserves occurred_at/amount/created_by, recalculates), AC-F5-7 (cross-household trash/restore 404 generic,
indistinguishable from unknown id, no mutation).

Remaining Not started: AC-F2-8 (full UI state oracle), AC-F3-6 (cross-household duplicate receipt),
AC-F3-8 (canonical-hash/scope/path/no-key oracle), AC-F4-5 (successful empty-period real-model outcome),
AC-F5-2 (transaction undo-toast timing — browser, not run this pass).

Caveats recorded in the artifact: AC-F1-1 atomicity is inspection-based; AC-F1-4 covers two protected routes
plus both exceptions (centralized `approvedOnly` gate inspected, not an exhaustive route sweep); AC-F1-6
absolute TTL measured via a Prisma probe; AC-F5-1 `byDay` not separately asserted.
A suspected environment issue (Prisma `@prisma/adapter-pg` vs DB session timezone `Asia/Bangkok`, +07h on
raw-SQL/psql-visible timestamps) is documented for PM routing; it is not a confirmed product defect and does
not affect the self-consistent app reads exercised above. Production Neon/Vercel validation remains not run.


## T-008 timestamp retest addendum (2026-10-08)

The independent local retest confirms the `PrismaPg` application connection session is UTC even though the local database default is `Asia/Bangkok`. `timestamp.integration.test.ts` passed 1/1. A real HTTP `POST /api/transactions` using date-only `2026-10-07` returned `2026-10-07T05:00:00.000Z`; the Prisma readback and raw-SQL epoch extraction both matched the API at `1791349200000`. Exact fixture cleanup counts were zero and ports 3000/3010/3011 had no listeners.

This is bounded timestamp/session/persistence evidence, not verification of complete Asia/Jakarta calendar bucketing, filter boundaries, or future-date validation. The timezone cross-cutting row therefore remains **Not started** and no AC row is promoted. No Neon or production connection was tested. Full record: `../../agent-comms/2026-10-08-qa-t008-timezone-fix.md`.

## T-008 final local AC spot pass (2026-10-07)

Focused Vitest evidence: `bunx vitest run app/api/ocr/ocr-routes.test.ts lib/server/services/idempotency.test.ts lib/server/services/idempotency.integration.test.ts` (2 files, 17 passed; integration file is excluded by the default config) and `bunx vitest run -c vitest.integration.config.mts lib/server/services/idempotency.integration.test.ts` (1 file, 4 passed). These checks provide partial AC-F3-6/AC-F3-8 evidence only. The full AC-F2-8 browser state oracle, AC-F3-6 cross-household DB allowance, AC-F3-8 no-key and cross-route outcomes, and AC-F5-2 transaction toast timing/expiry oracle were not executed. Accordingly all four statuses remain **Not started**; totals remain **37 Pass / 5 Not started / 0 Blocked / 0 Fail**. No external provider/Blob call, server start, fixture creation, app/test edit, deployment, or production access occurred. Listener counts on ports 3000/3010/3011 were all zero. Detailed limits: `../../agent-comms/2026-10-07-qa-t008-report.md`, final local AC spot pass addendum.


## T-008 retest after Developer test additions (2026-10-08)

Independent execution against local `financial_planner_t003`; no production/deployment validation.
The new E2E and DB integration tests were assessed against the full AC oracle, not promoted by
test names. Current 42-row totals: **41 Pass / 1 Not started / 0 Blocked / 0 Fail**.

Promoted by this run: **AC-F2-8** (all four visible states: delayed skeleton, plain empty-state
cards/guidance, whole-page error with retry and no partial cards, filtered-empty and reset);
**AC-F3-6** (real PostgreSQL OcrService, same-household 409 with existing job/draft and no repeat
provider/Blob work, one receipt/job persisted, plus identical content accepted in another
household); **AC-F3-8** (canonical JSON/order/path/method unit oracle; DB-backed replay, changed
payload conflict, replayed 409, cross-route key conflict, per-user key scope, rollback then fresh
retry; no-key uploads run normally without idempotency rows); and **AC-F5-2** (real browser-backed
transaction soft-delete, toast timing in 4.5–5.5s, undo restore, expiry removes undo action and
restore through Trash).

**AC-F4-5 remains Not started**: the one approved authenticated local empty-period advisor request
returned 429 `ADVISOR_RATE_LIMITED`, so no successful FRESH response was available to inspect for
insufficient-data honesty or exact `sourcePeriod`. No retry was made. This is not a product defect
claim. Production deployment is separately not approved and was not run.

Exact evidence/commands and cleanup details: `../../agent-comms/2026-10-07-qa-t008-report.md`,
section “Final retest after Developer test additions (2026-10-08)”.

## AC-F4-5 final evidence appendix — second attempt (2026-10-08)

**Documentation-only reconciliation.** No model call or test was executed for this note; it records the separate attempt in `../../agent-comms/2026-10-08-qa-ac-f4-5.md`.

**Exact outcome:** exactly one authenticated local `POST /api/advisor/insights` with `GEMINI_MODEL=gemini-3.5-flash-lite` against a fresh synthetic OWNER empty-period household (`sourcePeriod` requested `2026-10-01`..`2026-10-07`) returned **HTTP 503 `ADVISOR_UNAVAILABLE`** in **839 ms** (application 779 ms), an immediate typed provider rejection — **not** a timeout. No FRESH response, no returned `sourcePeriod`, no persisted insight (`advisor_insight` rows 0; `idempotency_key` rows 0). Fixture cleaned and verified absent (0 remaining); ports 3000/3010/3011 had no listeners.

**AC-F4-5 status remains `Not started`** — no successful response oracle was observed, so the row is not promoted and Pass counts are unchanged (**41 Pass / 1 Not started / 0 Blocked / 0 Fail**). This is a **provider availability/quota observation** consistent with the fail-closed AC-F4-7 behavior, **not a confirmed defect**; root cause remains unknown without another authorized provider call. Production remains out of scope and not run.


## Matriks AC F6 — Dompet Pribadi & Sharing (12 baris → total 54 AC)

**Ditambahkan:** 2026-10-08 oleh QA. **Sumber:** `docs/spec/feat-wallets.md` (Status: Draft);
`docs/design/06-wallets.md` (PM UX sign-off 2026-10-08, design-only).
**Batasan:** baris di bawah hanya rencana verifikasi. **Tidak ada test F6 yang dijalankan.**
Semua Status = `Not started`. Gate implementasi (amendment `architecture-decisions.md`,
persetujuan resmi Spec, Dev Plan) belum terpenuhi; tidak ada klaim Pass/Fail.

**Test level:** `integration` (route+DB+seam) atau `e2e` (Playwright). Oracle memakai actor
matrix: **Owner**, **creator** (pembuat wallet/transfer), **ordinary approved member**,
**personal wallet owner**, **non-approved (PENDING/DECLINED/REVOKED)**.

| AC ID | Spec | Test level | Oracle | Status |
|---|---|---|---|---|
| AC-F6-1 | feat-wallets | integration | Hanya anggota APPROVED dapat membuat wallet Pribadi/Bersama; nama wajib ≤80; tujuan penggunaan opsional ≤80 (bukan tipe rekening); scope default Pribadi, dapat pilih Bersama; `openingBalanceMinor` kosong → Rp0, negatif → 422; saldo awal dapat dikoreksi sebelum transaksi pertama (termasuk satu kaki transfer atau transaksi yang kemudian di-trash) dan terkunci setelahnya; non-approved → 403 | Not started |
| AC-F6-2 | feat-wallets | integration | Actor matrix: wallet Pribadi + transaksi + receipt hanya untuk pemilik; wallet Bersama untuk semua APPROVED; nama/saldo/transaksi/note/receipt/draft OCR/riwayat Pribadi anggota lain TIDAK muncul lewat list/detail/pencarian/trash/restore/dashboard/budget/advisor/response duplikat OCR/akses ID langsung; penyembunyian UI bukan pengganti otorisasi server | Not started |
| AC-F6-3 | feat-wallets | integration | Semua APPROVED dapat mengubah detail nama/tujuan wallet Bersama; arsip/pulihkan Bersama hanya pembuat wallet atau Owner, Pribadi hanya pemilik; unauthorized → 403; arsip non-destruktif (tanpa hard-delete); saldo wallet terarsip tetap di total, riwayat tetap tampil, MONEY_OUT aktif wallet Bersama terarsip tetap masuk pengeluaran; wallet terarsip keluar dari picker/carousel aktif dan tidak dapat dipakai transfer baru; scope dipilih hanya saat pembuatan dan immutable: permintaan update yang mencoba mengubah PERSONAL ↔ SHARING gagal aman (ditolak validasi, bukan 5xx dan bukan 200 diam-diam) tanpa mengubah scope, visibilitas, atau riwayat; jalur resmi adalah membuat wallet baru dengan scope yang diinginkan lalu memindahkan dana via transfer bila berhak; security oracle: riwayat PERSONAL sebelumnya tidak pernah menjadi household-visible lewat percobaan mutasi scope | Not started |
| AC-F6-4 | feat-wallets | integration | MONEY_IN wajib memilih wallet penerima, MONEY_OUT wajib memilih wallet sumber; transaksi tanpa wallet → 422; pilihan hanya wallet Bersama + Pribadi milik caller; saldo = `openingBalance + MONEY_IN aktif − MONEY_OUT aktif` per wallet; opening bukan aktivitas; baris trashed tidak memengaruhi saldo; wallet milik anggota lain/household lain/tak dikenal → respons aman tanpa mengonfirmasi keberadaan | Not started |
| AC-F6-5 | feat-wallets | integration | Transfer memilih sumber≠tujuan, satu input jumlah; kedua kaki dibuat atomik (`transfer_group_id` sama, jumlah+tanggal konsisten); Pribadi↔Pribadi, Bersama↔Bersama, dan lintas scope dua arah; netral terhadap gabungan, mengubah saldo tiap wallet; transfer bukan pengeluaran budget; ditolak: wallet sama, wallet terarsip, Pribadi anggota lain, lintas-household; trash/restore atomik pada kedua kaki | Not started |
| AC-F6-6 | feat-wallets | integration | Transfer lintas scope: pemilik wallet Pribadi melihat rincian kedua sisi; anggota lain hanya melihat sisi Bersama sebagai aktivitas generik (nominal+tanggal) tanpa nama/ID wallet Pribadi, note, atau riwayat; body response API bersih dari metadata privat (bukan sekadar disembunyikan styling); relasi dua sisi tidak dapat dipakai menelusuri aktivitas Pribadi | Not started |
| AC-F6-7 | feat-wallets | integration | Dashboard menampilkan dua ringkasan terpisah (`sharedBalanceMinor` wallet Bersama; `personalBalanceMinor` hanya wallet Pribadi caller) yang tidak dijumlahkan; kartu per-wallet aktif dengan penanda scope; saldo wallet terarsip tetap termasuk total (Bersama & Pribadi) dan helper "Termasuk dompet di Arsip" ada; semua agregat server-side; saldo Pribadi anggota lain tidak tampil | Not started |
| AC-F6-8 | feat-wallets | integration | Budget spent/remaining, total pengeluaran household, dan grafik hanya memakai MONEY_OUT aktif pada wallet Bersama, termasuk wallet Bersama terarsip; kaki transfer tidak dihitung; MONEY_OUT wallet Pribadi tidak berkontribusi ke angka household | Not started |
| AC-F6-9 | feat-wallets | integration | Migrasi membuat satu wallet Sharing default per household lama (saldo awal Rp0) dan menautkan seluruh transaksi pre-wallet; idempoten (dijalankan ulang tidak membuat wallet/tautan duplikat); tanpa transaksi hilang; tanpa saldo ganda; pasangan transfer lama tetap utuh; transaksi household A tidak tertaut ke wallet household B; paritas ledger pre/post (jumlah & saldo hasil ledger sama sebelum dan sesudah) | Not started |
| AC-F6-10 | feat-wallets | integration | OCR tidak menebak wallet; wallet dipilih/dikonfirmasi user saat review sebelum simpan; draft belum disimpan (belum tertaut transaksi) hanya dapat diakses pengunggah; satu receipt dapat tertaut ke lebih dari satu transaksi dan visibilitas gambar struk = union seluruh tautan transaksi yang dihitung server-side, termasuk tautan transaksi yang di-trash/soft-deleted (trash tidak menghapus tautan dan tidak mengecilkan union; bukan dari pilihan wallet terakhir): receipt hanya-Pribadi → pemilik saja, termasuk bila satu-satunya tautan transaksi Pribadi berada di trash; ada satu tautan transaksi Sharing → seluruh household APPROVED dapat melihat gambar receipt, termasuk bila tautan Sharing tersebut di-trash (tautan tetap tersimpan dan dapat dipulihkan melalui trash), sementara baris transaksi Pribadi tetap privat (jumlah/kategori/note/wallet tidak terekspos); saat menyimpan OCR ke wallet Bersama, disclosure varian 1 tampil sebelum CTA konfirmasi; memakai ulang receipt yang sudah share-visible untuk transaksi Pribadi (varian 2) → status berbagi tetap ada (union tidak mengecil) dan uploader melihat disclosure status berbagi sebelum konfirmasi; panel disclosure mengikuti pilihan wallet/status tautan: Pribadi tanpa tautan Sharing → tidak dirender, Bersama → varian 1, Pribadi pada receipt yang sudah tertaut Sharing → varian 2; duplikat lintas-uploader → HTTP 409 `DUPLICATE_RECEIPT` body generik (tanpa job/draft/receipt lama/uploader/detail); retry uploader sama boleh memakai ulang job miliknya; tidak ada transaksi OCR tanpa konfirmasi/wallet; C-29 (PM 2026-10-09): job/draft OCR tetap hanya uploader sebelum DAN sesudah simpan walau gambar sudah share-visible via tautan transaksi Sharing — anggota approved non-uploader boleh mengambil gambar receipt yang share-visible tetapi TIDAK boleh GET OCR job/result_json/draft maupun field `receiptSharedWithHousehold`; uploader dapat melihat job/draft miliknya; retry uploader sama memakai ulang job sendiri; duplikat lintas-uploader → 409 `DUPLICATE_RECEIPT` generik; baris transaksi Pribadi tetap privat | Not started |
| AC-F6-11 | feat-wallets | integration | Setiap jalur (wallet, transaksi, receipt, trash/restore, dashboard, budget, advisor) memvalidasi membership APPROVED + household aktif + scope + kepemilikan wallet; agregat/advisor household hanya Bersama; ringkasan Pribadi hanya wallet caller; pada pasangan transfer, hak kedua sisi diperiksa tanpa mengirim metadata Pribadi; non-approved/akses dicabut → ditolak; response lintas-household/wallet Pribadi pengguna lain tidak membocorkan keberadaan resource; cache advisor tidak menyajikan data Pribadi; kontrol UI saja tidak cukup | Not started |
| AC-F6-12 | feat-wallets | e2e | State loading/empty/error/submitting/selected/success tersedia di halaman/kartu/picker/form wallet; kegagalan mempertahankan input; kartu & picker dapat dipakai keyboard + screen reader; scope tidak dibedakan warna saja (ikon+label); tidak ada horizontal overflow pada 390px; touch target ≥48px; tanpa dead-end saat belum ada wallet yang dapat dipilih; saldo error tidak dirender sebagai nol | Not started |

**Jumlah baris AC F6 = 12. Total matriks = 42 (F1–F5) + 12 (F6) = 54 AC.**

## Catatan C-29 — Visibilitas gambar receipt vs privasi job/draft OCR (2026-10-09)

**Dasar:** Keputusan PM **C-29 (2026-10-09)**, memperjelas **C-28** (visibilitas gambar receipt = union tautan transaksi, termasuk tautan di-trash) dan **C-19** (duplikat OCR generik). **Dokumentasi saja:** tidak ada test F6 yang dijalankan, semua baris F6 tetap `Not started`, dan status/bukti baris F1–F5 maupun baris F6 lain tidak diubah. Catatan ini memperluas oracle baris **AC-F6-10** di atas.

Kasus verifikasi tambahan untuk **AC-F6-10**:
- Anggota household **APPROVED yang bukan uploader** dapat **mengambil gambar receipt** yang sudah share-visible (ada tautan transaksi dompet Bersama), termasuk bila tautan tersebut di-trash/soft-deleted.
- Anggota approved **non-uploader TIDAK boleh** `GET` OCR job / `result_json` / draft, dan TIDAK menerima field `receiptSharedWithHousehold`; berlaku **sebelum DAN sesudah** simpan, walau gambar receipt sudah dibagikan via transaksi Sharing.
- **Uploader** dapat melihat job/draft miliknya sendiri (sebelum dan sesudah simpan).
- **Retry uploader yang sama** boleh memakai ulang job miliknya.
- **Duplikat lintas-uploader** → HTTP 409 `DUPLICATE_RECEIPT` body generik (tanpa job/draft/uploader/receipt lama/detail).
- **Baris transaksi Pribadi tetap privat** (jumlah/kategori/note/wallet tidak terekspos) meski gambar receipt-nya share-visible.

## Catatan C-31 — Scope hanya dipilih saat pembuatan wallet (2026-10-09)

**Dasar:** Keputusan PM **C-31** (melengkapi C-30), Out of Scope Spec `docs/spec/feat-wallets.md` ("Mengubah scope wallet setelah dibuat; pengguna membuat wallet baru dan memindahkan dana melalui transfer bila diperlukan"), dan `docs/architecture-decisions.md` A-36 ("`scope` is immutable after creation; the edit surface is name/purpose only"). **Dokumentasi saja:** tidak ada test F6 yang dijalankan, semua baris F6 tetap `Not started`, dan status/bukti baris F1–F5 maupun baris F6 lain tidak diubah. Catatan ini memperluas oracle baris **AC-F6-3** di atas.

Kasus verifikasi tambahan untuk **AC-F6-3**:

- **Scope hanya ditetapkan saat pembuatan wallet** (W1): pilihan Pribadi/Bersama adalah bagian dari create, bukan update.
- **Permintaan update yang mencoba mengubah scope** (`PERSONAL ↔ SHARING`, dua arah) **gagal aman**: ditolak validasi (bukan 5xx, bukan pula 200 yang diam-diam tidak berubah atau malah merusak field lain), dan `scope` tersimpan **tidak berubah**.
- **Tidak mengubah visibilitas/riwayat:** percobaan mutasi scope **tidak boleh** mengubah daftar wallet, riwayat transaksi, receipt, note, atau saldo yang terlihat oleh actor mana pun.
- **Jalur resmi pengganti:** pengguna yang ingin scope berbeda **membuat wallet baru** dengan scope yang diinginkan, lalu (bila berhak) **memindahkan dana via transfer** (W6/W7) — bukan mengubah scope wallet lama.
- **Unauthorized:** actor tanpa hak mencoba update/mutasi scope → **403**; actor berhak dengan payload perubahan scope → ditolak validasi; update nama/tujuan tanpa perubahan scope tetap bekerja sesuai C-4.
- **Security oracle:** **riwayat PERSONAL sebelumnya tidak pernah menjadi household-visible lewat percobaan mutasi scope**. Predikat visibilitas tetap dihitung dari `scope` tersimpan, sehingga tidak ada eskalasi walau permintaan diproses sebagian.

**Batas:** catatan ini hanya oracle dokumenter; tidak ada eksekusi, tidak ada baris F6 yang dipromosikan, dan tidak ada perubahan status/bukti F1–F5.

## Catatan — Jalur baca gambar struk terautentikasi untuk AC-F6-10/W12 (2026-10-09)

**Dasar:** Spec `feat-wallets.md` AC-F6-10 ("byte hanya disajikan melalui jalur server terautentikasi, bukan URL Blob publik"), Dev Plan `feat-wallets.md` (predikat gambar `ReceiptRepository.findByIdForActor`/`isSharedWithHousehold`, A-46/C-28, terpisah dari predikat job/draft C-29), dan `architecture-decisions.md` A-46/A-49. **Dokumentasi saja:** tidak ada test F6 yang dijalankan, semua baris F6 tetap `Not started`, dan status/bukti baris F1–F5 maupun baris F6 lain tidak diubah. Catatan ini memperluas oracle baris **AC-F6-10** di atas dan journey **W12**.

**Prasyarat implementasi (belum ada di kode):** Draft arsitektur/ADR-008 (A-49) mengusulkan route penyajian gambar struk terautentikasi yang baru (rekomendasi Draft: `GET /api/ocr/receipts/{id}/image`, alternatif `/api/receipts/{id}/image`); route tersebut belum ada di aplikasi. Predikat union (A-46/C-28) diberlakukan pada route baru tersebut. Repo saat ini hanya memiliki `POST /api/ocr/receipts` dan `GET /api/ocr/jobs/{id}`; **belum ada route GET yang menyajikan byte/gambar struk** (`BlobStore` hanya `put`, Blob `access: "private"`, `storage_key` tidak pernah keluar dari server). Skenario di bawah mengunci oracle untuk jalur tersebut dan tetap `Not started` sampai route/penyajian byte terautentikasi tersedia.

Skenario jalur baca gambar struk terautentikasi (semua `Not started`):

| ID | Skenario | Oracle |
|---|---|---|
| IMG-1 | Pemilik receipt hanya-Pribadi meminta byte gambar | 200 + byte gambar; `Content-Type` di allowlist A-21 (`image/jpeg`/`image/png`/`image/webp`); header penyajian aman per technical plan (`Cache-Control: private, no-store`); tanpa `storage_key`, URL Blob publik, atau token di body/DOM |
| IMG-2 | Anggota household APPROVED lain (bukan pemilik/uploader) meminta receipt hanya-Pribadi | **404 generik**, identik untuk "tidak ada" vs "tidak berhak" (tanpa existence leak); tanpa byte/body detail |
| IMG-3 | Anggota APPROVED meminta receipt dengan minimal satu tautan transaksi dompet Bersama | 200 + byte gambar (union terpenuhi) |
| IMG-4 | Sama seperti IMG-3 tetapi tautan transaksi Bersama berada di Trash/soft-deleted | 200 + byte gambar; union **tidak** mengecil (trash tidak menghapus tautan) |
| IMG-5 | Receipt hanya-Pribadi dengan satu-satunya tautan transaksi Pribadi di Trash | Tetap hanya pemilik; anggota lain 404 |
| IMG-6 | Anggota non-uploader yang lolos IMG-3/IMG-4 mencoba `GET /api/ocr/jobs/{id}`/draft/`result_json` | Ditolak uploader-only (C-29); tidak menerima `receiptSharedWithHousehold`; baris transaksi Pribadi (jumlah/kategori/note/wallet) tidak terekspos |
| IMG-7 | Scan respons API + DOM pada jalur gambar | Tidak ada URL Blob publik, `storage_key`, token, atau `receiptId` sebagai bukti kepemilikan; byte hanya lewat jalur server terautentikasi (cookie sesi) |
| IMG-8 | Aksi `Lihat struk` pada detail transaksi (e2e) | State loading lalu success/error; error tidak menampilkan byte parsial; viewer dapat ditutup dengan keyboard (Escape), fokus kembali ke pemicu; `src` tidak di-hardcode ke storage key |

**Batas:** IMG-1..IMG-8 hanya oracle dokumenter; tidak ada eksekusi, tidak ada baris F6 yang dipromosikan, dan tidak ada perubahan status/bukti F1–F5.

## T-009 F6 execution evidence (2026-10-09) — supersedes the F6 `Not started` cells above

QA-owned, local-only. Executed: unit 319/319, `tsc` clean, lint 0 errors, real
migration on scratch `financial_planner_qa_f6`, HTTP actor matrix 42/42, OCR
privacy/dedupe 20/20. Details in `docs/qa/t009-f6-qa-report.md`; harnesses
`docs/qa/harness/t009-wallets.qa.mjs`, `t009-ocr.qa.mjs`.

| AC | Updated status |
|---|---|
| AC-F6-1 | Pass |
| AC-F6-2 | Pass |
| AC-F6-3 | Pass (C-31 scope immutable verified: PATCH+scope -> 422 `fieldErrors.scope`, scope unchanged) |
| AC-F6-4 | Pass |
| AC-F6-5 | Pass (note: same-wallet transfer emits `VALIDATION_ERROR`, not ratified `TRANSFER_INVALID` — BUG-1) |
| AC-F6-6 | Pass |
| AC-F6-7 | Pass |
| AC-F6-8 | Pass for dashboard/budget; advisor live call Blocked |
| AC-F6-9 | Pass (backfill + idempotence + constraints + ledger parity) |
| AC-F6-10 | Pass WITH RISK: read-side/dedupe/C-28/C-29 Pass; live upload + authorized image bytes Blocked |
| AC-F6-11 | Pass |
| AC-F6-12 | Not started (no browser/E2E) |

Not promoted: the underlying F1–F5 rows and their historical evidence are unchanged.
BUG-1/BUG-2 (round 1) are closed by round 2: BUG-1 resolved under ratified A-51
(no `TRANSFER_INVALID`; 422 `VALIDATION_ERROR` with field errors, 422
`WALLET_UNAVAILABLE`, 404 `NOT_FOUND`, 403 `ACCESS_DENIED`); BUG-2 resolved, both
DB integration suites pass on a migrated DB. Round 2 raised new findings
(BUG-3/BUG-4 nested-dialog focus contract, BUG-5 touch target) — see the report.

## T-009 F6 round-2 evidence (2026-10-09) — correction loop 1

QA-owned, disposable local DB `financial_planner_dev_t009r1` only (migrated, incl.
`20261009120000_wallet_f6`). `financial_planner_t003` was read only for a
before/after row count (210 -> 210, no `qa-t009-*` rows) and never written;
`financial_planner_qa_f6` untouched. Executed: `bun run test` 329 passed/36 files,
`tsc --noEmit` clean, `bun run lint` 0 errors / 12 warnings (QA harness only),
`bun run build` exit 0, `test:integration` 20 passed / 1 skipped (the only failure
is the self-blocking QA `t008-auth-lifecycle` harness), HTTP actor matrix 42/42,
OCR privacy/dedupe 20/20, image-route probes (401 unauthenticated, 404 generic for
unknown + malformed, no storage key/Blob URL/job/draft), and a Playwright
accessibility pass at 390/768/1280 with focus trap + focus return + C-32 + touch
target checks. Full detail in `docs/qa/t009-f6-qa-report.md` (round-2 section);
harnesses `docs/qa/harness/t009-a11y.playwright.config.ts`,
`t009-a11y.spec.ts`, `t009-wallets-devdb.qa.mjs`, `t009-ocr-devdb.qa.mjs`.

| AC | Round-2 status |
|---|---|
| AC-F6-1 | Pass (unchanged) |
| AC-F6-2 | Pass (unchanged) |
| AC-F6-3 | Pass (unchanged) |
| AC-F6-4 | Pass (unchanged) |
| AC-F6-5 | Pass — BUG-1 resolved under A-51 |
| AC-F6-6 | Pass (unchanged) |
| AC-F6-7 | Pass (unchanged) |
| AC-F6-8 | Pass for dashboard/budget; advisor live call Blocked (unchanged) |
| AC-F6-9 | Pass (unchanged; round-2 DB was migrated before the HTTP/browser runs) |
| AC-F6-10 | Pass WITH RISK: read-side/dedupe/C-28/C-29 Pass on the disposable DB, 401/404 image route generic with no leakage; authorized 200-byte path Blocked (live Blob) |
| AC-F6-11 | Pass (unchanged) |
| AC-F6-12 | Pass WITH RISK — browser pass executed: responsive 390/768/1280, no horizontal overflow, keyboard (Tab/Enter/Space/Escape), accurate `aria-selected` + roving tabindex + Arrow navigation, C-32 flow with focus return, focus trap + focus return for the three top-level wallet sheets, scope not colour-only. Remaining defects: BUG-3 (Escape in a nested dialog closes the parent, focus lands on `body`), BUG-4 (Tab leaks out of the nested picker/viewer), BUG-5 (`Kelola` 36px, `Termasuk dompet di Arsip` 32/16px). Screen-reader announcement not verified with a running AT. |


## T-009 F6 round-3 evidence (2026-10-09) — correction loop 2 (final round)

QA-owned, disposable local DB `financial_planner_dev_t009r1` only (migrated incl.
`20261009120000_wallet_f6`; `prisma migrate status` -> "Database schema is up to
date!"; emptied again at the end of the round). `financial_planner_t003` was never
written or migrated (210 -> 210 users, 0 `qa-t009-*` rows, still no `wallet`
table); `financial_planner_qa_f6` untouched.

Executed: `bun run test` **329 passed / 36 files**; `tsc --noEmit` clean;
`bun run lint` **0 errors / 12 warnings** (QA harness scratch files only);
`bun run build` **exit 0**; `test:integration` on the disposable DB **20 passed /
1 skipped** (the single failure is the self-blocking QA `t008-auth-lifecycle`
harness); HTTP actor matrix **42/42**; OCR privacy/dedupe **20/20**; direct image
route probes on the production build (401 unauthenticated; 404 generic for
unknown, malformed and percent-space ids; no storage key / Blob URL / job /
draft); and a Playwright browser pass at 390/768/1280 against the disposable DB
with the image bytes intercepted in-browser (no live Blob/Gemini). New harness:
`docs/qa/harness/t009-a11y-r3.spec.ts` + `t009-a11y-r3-results.log`
(**107 pass / 3 fail of 110 internal QA assertions**; the 3 failures are
pre-existing non-wallet T-006 transaction-form controls, see the report).

| AC | Round-3 status |
|---|---|
| AC-F6-1 | Pass (re-verified, unchanged) |
| AC-F6-2 | Pass (re-verified, unchanged) |
| AC-F6-3 | Pass (re-verified, C-31 scope immutable 422 `fieldErrors.scope`, scope unchanged) |
| AC-F6-4 | Pass (re-verified, unchanged) |
| AC-F6-5 | Pass (re-verified, A-51 error mapping unchanged) |
| AC-F6-6 | Pass (re-verified, unchanged) |
| AC-F6-7 | Pass (re-verified, unchanged) |
| AC-F6-8 | Pass for dashboard/budget; advisor live call Blocked (unchanged) |
| AC-F6-9 | Pass (unchanged; DB migrated before the runs) |
| AC-F6-10 | Pass WITH RISK: read-side/dedupe/C-28/C-29 Pass on the disposable DB; 401/404 image route generic with no leakage; authorized 200-byte path Blocked (live Blob) |
| AC-F6-11 | Pass (re-verified, unchanged) |
| AC-F6-12 | **Pass (browser-executed, 390/768/1280)** — BUG-3 resolved (Escape peels exactly one layer in both nesting cases; picker closes with the add-transaction sheet open and its typed amount/merchant preserved; viewer closes with the detail sheet open; focus lands on the nested trigger, never BODY; a second Escape closes the parent). BUG-4 resolved (16 real Tab presses never leave the topmost picker or viewer). BUG-5 resolved at the >=44px floor (`Kelola` 44px, "Termasuk dompet di Arsip" 44px, manage-sheet `Ubah`/`Arsipkan`/`Pulihkan` 44px at all three viewports; 0 wallet-section controls below 44px). C-32 flow a..h pass. No horizontal overflow on `/home` and `/transactions` at 390/768/1280. Scope not colour-only (icon + text + check icon + sr-only). No console errors or uncaught page errors; the `/home` React duplicate-key warning is gone and `Kelola` opens the manage sheet. Residuals: design 06 §13 says >=48px on mobile while the code baseline is 44px (documentation conflict, not a functional defect); no running AT session; 3 pre-existing non-wallet T-006 transaction-form touch targets (`RESP-*-f`). |

**Residual list for PM sign-off:** live Vercel Blob authorized byte path, live
Gemini OCR upload lifecycle, live advisor call; design 06 §13 48px-vs-44px wording
conflict; pre-existing T-006 transaction-form touch targets (amount `<input>` 32px
inside a 48px wrapper, "Scan struk" link 16px); no running screen-reader session;
`financial_planner_t003` still lacks `20261009120000_wallet_f6`.


## Matriks AC F6 extension: Bank/Penyedia (T-011), 4 baris PRD dan 13 AC Spec dipetakan

**Ditambahkan:** 2026-10-22 oleh QA. **Jenis perubahan:** sinkronisasi dokumentasi QA
setelah implementasi T-011 dan QA retest independen 2026-10-22.
**Sumber AC:** `docs/spec/feat-bank-institutions.md` (Spec Ready / PM-approved 2026-10-21)
dan extension F6 di `docs/PRD.md` (`AC-F6-13`..`AC-F6-16`).
**Batasan:** bagian ini hanya menambah baris untuk extension. Baris F6 base
`AC-F6-1`..`AC-F6-12`, baris F1..F5, dan seluruh catatan historis di atas tidak diubah.
Angka "54 AC" pada bagian sebelumnya adalah snapshot pada tanggalnya dan tidak ditulis ulang.

**Status:** baris memakai `Pass` dan `Pass with risks`. `Pass with risks` setara dengan
`PASS WITH RISKS` pada laporan QA: oracle utama terbukti, residual tercatat. `Pass with risks`
bukan `Pass` penuh dan bukan release signoff.

**Pemetaan AC Spec T-011 ke AC PRD F6 extension:**

| AC Spec | AC PRD F6 extension | Cakupan |
|---|---|---|
| AC-BI-1 | AC-F6-14 | Katalog resmi read-only |
| AC-BI-2 | AC-F6-13 | Jalur wallet manual selalu tersedia |
| AC-BI-3 | AC-F6-15 | Quick Add masuk daftar pribadi |
| AC-BI-4 | AC-F6-15 | Satu field nama, maksimal 80 karakter |
| AC-BI-5 | AC-F6-15 | Duplikat nama ternormalisasi |
| AC-BI-6 | AC-F6-16 | Privasi label pada wallet Bersama |
| AC-BI-7 | AC-F6-16 | Izin mengubah institusi pada wallet |
| AC-BI-8 | AC-F6-15 | Arsip dan pemakaian ulang entri pribadi |
| AC-BI-9 | AC-F6-13 | Wallet merujuk paling banyak satu institusi |
| AC-BI-10 | AC-F6-16 (daftar pribadi juga AC-F6-15) | Otorisasi server-side |
| AC-BI-11 | AC-F6-15 | Quick Add bertahan bila wallet dibatalkan |
| AC-BI-12 | AC-F6-15 dan AC-F6-16 | State UX dan aksesibilitas |
| AC-BI-13 | AC-F6-14 | Sumber, versi, dan provenance katalog |

**Baris matriks:**

| AC ID | Spec | Test level | Oracle | Status | Evidence |
|---|---|---|---|---|---|
| AC-F6-13 | feat-bank-institutions (AC-BI-2, AC-BI-9) | integration | Wallet create/update menerima paling banyak satu referensi (official XOR custom, kedua null berarti manual); wallet lama tetap valid tanpa backfill; referensi ganda ditolak validasi dan DB CHECK; label hanya metadata tanpa rekening, logo, kartu, atau saldo bank; scope tetap immutable. | Pass | `lib/server/services/institution.test.ts` (16 pass), `app/api/institutions/institutions-routes.test.ts` (11 pass, termasuk create official dan `NONE`), `lib/server/services/wallet.test.ts` (14 pass), `lib/server/services/institution.integration.test.ts` (XOR CHECK dan wallet manual). Re-run QA 2026-10-22: 45/45 pass untuk empat file unit, route, dan seed. |
| AC-F6-14 | feat-bank-institutions (AC-BI-1, AC-BI-13) | integration + smoke | Katalog resmi read-only dari seeder statis versioned: 105 baris unik, `source_period` berformat `YYYY-MM` (`2026-06`), `seed_version` dan SHA-256 tercatat; tidak ada sync runtime; rerun idempoten; baris yang hilang dinonaktifkan, bukan dihapus; migrasi provenance tidak mengarang hari; non-approved tidak dapat membaca. | Pass with risks | `prisma/data/bank-institutions-ojk-2026-06.ts`, `prisma/data/bank-institutions-ojk-2026-06.test.ts` (4 pass), `prisma/migrations/20261022120000_institution_source_period/migration.sql`, `institution.integration.test.ts` (seed idempoten dan deaktivasi). QA read-only 2026-10-22 pada `financial_planner_t003`: hanya `source_period` (tipe varchar, not null), 105 baris `2026-06`, CHECK `bank_institution_source_period_format` ada, 0 baris format salah. Risiko: workbook OJK live tidak diunduh ulang pada siklus QA ini. |
| AC-F6-15 | feat-bank-institutions (AC-BI-3, AC-BI-4, AC-BI-5, AC-BI-8, AC-BI-11, AC-BI-12) | integration + e2e | Quick Add tersimpan pada daftar pribadi milik user session; satu field nama, trim, maksimal 80; normalisasi NFKC, collapse whitespace, case-insensitive; duplikat official mengarah ke katalog, duplikat private aktif memakai row existing; entri bertahan saat pembuatan wallet dibatalkan; arsip soft tanpa hard delete, toggle `Aktif`/`Arsip` dengan `Arsipkan` dua langkah dan `Pulihkan`; re-add nama sama mengaktifkan row arsip; restore ditolak 409 bila bertabrakan dengan official aktif dan row tetap arsip. | Pass with risks | `institution.test.ts` (normalisasi, duplikat, reaktivasi, arsip/restore, tabrakan official, label wallet bertahan), `institutions-routes.test.ts` (409 duplikat, 200 re-add arsip, arsip/restore, 409 tabrakan), `institution.integration.test.ts` (partial unique index, reaktivasi, tabrakan), `e2e/bank-institutions.spec.ts` 6/6 pada 390/768/1280 (create, label, clear, Quick Add cancel, arsip, label tetap, restore). Bukti visual QA 2026-10-22: `C:/Users/Aris/AppData/Local/Temp/opencode/t011-r16-shots/390-archived.png` dan `390-collision-error.png` (artefak session-local, tidak masuk repo). Risiko: full integration suite belum seluruhnya hijau karena harness T-008 stale; tidak ada sesi screen reader. |
| AC-F6-16 | feat-bank-institutions (AC-BI-6, AC-BI-7, AC-BI-10, AC-BI-12) | integration | Label wallet Bersama terlihat sebagai metadata oleh anggota APPROVED yang berhak; custom id hanya dikirim ke pemilik; user lain hanya menerima jenis dan nama; editor dapat mempertahankan, menghapus, memilih official, atau memilih custom miliknya; custom user lain menghasilkan 404 generik, custom arsip 422; daftar pribadi tidak dapat dienumerasi; scope tetap immutable. | Pass with risks | `institution.test.ts` (custom id owner-only), `institutions-routes.test.ts` (foreign 404, wallet create dengan custom foreign), `institution.integration.test.ts` (label bertahan setelah arsip, custom id tersembunyi dari anggota lain), `wallet.test.ts` (scope immutable). Risiko: alur edit wallet Bersama oleh dua aktor belum dijalankan di browser; otorisasi dibuktikan pada service, route, dan DB. |

**Catatan eksekusi bagian ini:** pada sinkronisasi dokumentasi 2026-10-22, QA menjalankan
ulang empat file unit, route, dan seed (`45/45` pass) serta pemeriksaan read-only DB untuk
provenance. Integration penuh, E2E, lint, build, dan unduhan ulang sumber OJK tidak dijalankan
ulang pada langkah dokumentasi ini. Angka E2E dan integration mengacu pada Implementation
Evidence Dev Plan dan retest QA 2026-10-22; rincian ada di
`docs/qa/t011-bank-institutions-qa-report.md`.