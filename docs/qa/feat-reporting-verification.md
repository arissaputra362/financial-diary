# F7 Laporan Bulanan (Ringkasan) - Independent QA Verification

**Owner:** QA Engineer - **Date:** 2026-10-25 - **Verdict:** PASS WITH RISKS
**Scope:** `docs/spec/feat-reporting.md` AC-F7-1..AC-F7-15, `docs/design/08-reporting.md` (copy deck, states, a11y contract), `docs/dev-plan/feat-reporting.md` test plan.
**Environment:** local only. Next.js 16.3.6 dev server (Playwright `webServer`, port 3010), Bun 1.4.2, PostgreSQL 18 local `financial_planner_t003` (`postgresql://postgres:***@localhost:5432/financial_planner_t003`). No production, no deploy, no remote mutation, no live Gemini/Blob call.

## 1. Summary

| Status | Count | AC |
| :-- | :-- | :-- |
| PASS | 14 | AC-F7-1..12, AC-F7-14, AC-F7-15 |
| PARTIAL | 1 | AC-F7-13 |
| FAIL | 0 | - |
| BELUM DIUJI | 0 | - |

Findings: 4 defects (1 Medium, 3 Low). No AC is violated outright; AC-F7-13 is PARTIAL because two of its six states were verified by code inspection only and the 360px viewport was not exercised. The Medium defect is a pre-existing activity-list limitation that the new F7 deep link now exposes in one click (BUG-QA-F7-04).

## 2. Evidence executed (QA)

| Check | Command | Result |
| :-- | :-- | :-- |
| Lint | `bun run lint` | exit 0, **0 errors, 13 warnings**, all pre-existing in `docs/qa/harness/*`, none in F7 files |
| Unit/component | `bun run test` | **516 passed / 49 files**, 0 failed |
| Types | `bunx tsc --noEmit` | clean (exit 0) |
| Targeted unit | `bunx vitest run app/api/reports/monthly/report-routes.test.ts components/transactions/activityUrl.test.ts` | **31 passed** (17 report route, 14 URL contract) |
| Integration (feature) | `bunx vitest run -c vitest.integration.config.mts lib/server/repositories/reports.integration.test.ts` | **4/4 passed** |
| Integration (full) | `bun run test:integration` | **38 passed, 1 failed** of 39. The single failure is the pre-existing QA harness script `docs/qa/harness/t008-auth-lifecycle.integration.test.ts` (`PrismaClientValidationError` on `db.transaction.create`, stale household relation), unrelated to F7 |
| Browser E2E (temporary probes, deleted after run) | `bunx playwright test e2e/qa-reporting-*.spec.ts` | **17 checks passed** at 390/768/1280 (see Appendix A) |

Feature files exercised: `app/api/reports/monthly/{route.ts,report-routes.test.ts}`, `lib/server/repositories/reports.ts`, `lib/server/repositories/reports.integration.test.ts`, `lib/server/services/report.ts`, `lib/server/contracts/reports.ts`, `lib/server/testing/report-fakes.ts`, `components/reports/MonthlyReport.tsx`, `components/reports/BalanceMovementChart.tsx`, `components/transactions/{ActivityView.tsx,activityUrl.ts,activityUrl.test.ts}`, `app/transactions/page.tsx`, `lib/dates.ts`, `lib/server/services/period.ts`.

## 3. Per-AC status

| AC | Status | Evidence | Notes |
| :-- | :-- | :-- | :-- |
| AC-F7-1 | PASS | Unit `writes the Ringkasan tab with its month and selected scope/wallet` (activityUrl); E2E probe: `/transactions?view=ringkasan&month=2026-09` restores tab + month after navigation, tablist holds exactly 3 tabs in order `Transaksi, Ringkasan, Trash`, Trash view never renders Ringkasan; route test `maps a PENDING member to a typed 403` plus page redirect inspection | No new nav item added (`components/layout/*` and dashboard nav untouched in the diff). APPROVED gating lives in the API (403) with client redirect to `/waiting-for-approval` |
| AC-F7-2 | PASS | E2E probe at 390px: month navigation on Ringkasan keeps `scope=personal` and `wallet=`, hero label becomes `Sisa akhir September`, URL receives one `month` write; tab switch keeps the month; date-range control is not rendered on Ringkasan (render is gated on `view === "active"`); unit `keeps the Ringkasan context when the Add intent is added` | Single `writeUrl` writer serves both tabs; no second month picker exists in the report |
| AC-F7-3 | PASS | Route test `returns the shared report and reconciles closing with the dashboard` asserts hero figure; E2E: current month renders `Sisa bulan ini`, past month renders `Sisa akhir September`; error probe renders one full error card, never `Rp0`; helper line `Setelah seluruh pengeluaran tercatat` present | Hero surface/size per design 08 §6.3 |
| AC-F7-4 | PASS | 17 route tests (5 invariant cases: same-scope transfer, cross-scope leg, new wallet in period, backdated wallet after period, no-activity wallet) + 4 real-DB integration tests + temporary real-DB probes: selected-wallet two-way transfer (masuk 40.000 / keluar 70.000, invariant exact), wallet created in period with pre-period backdate (saldo awal 50.000, penyesuaian 200.000, saldo akhir 240.000, difference 0), empty month (saldo awal = saldo akhir = 500.000) | Formula in `report.ts` + SQL CTE inspected; `newWalletOpening` excluded from `openingMinor` and added once |
| AC-F7-5 | PASS | Route test `caps named categories at four and keeps Tanpa kategori and Lainnya auditable` (4 named + `Tanpa kategori` + `Lainnya (n)`, subtotal equals card total); E2E renders the `Pemasukan` card with rows and `Subtotal` | `category = null` aggregated into `Tanpa kategori`, never dropped (service inspection + test fixture) |
| AC-F7-6 | PASS | Same route test for `MONEY_OUT`; E2E: `Lihat semua pengeluaran` navigates to `?view=active&month=2026-09&filter=out`; unit `writes the active tab type filter and wallet for Lihat semua pengeluaran`; `filter` omitted on Trash | Literal contract met. See BUG-QA-F7-04: on a month with more than 20 rows the filtered list can render a false empty state (pre-existing client-side filter) |
| AC-F7-7 | PASS | Route tests: `never mixes another member personal wallets into the personal scope`, `returns 422 for personal scope without a personal wallet`, foreign wallet -> 404; temporary probe on real DB: other member's wallet id -> 404 `Dompet tidak ditemukan.`; E2E: `Pribadi` renders disabled with the written reason when the user has no personal wallet, and no report request fires | Owner cannot read another member's personal report |
| AC-F7-8 | PASS | Route tests `narrows every figure to the selected wallet`, `keeps an archived wallet in the report and in the scoped list`, `rejects malformed filters and foreign wallets`; integration test narrows to one archived wallet; E2E: wallet dropdown writes `walletId` to the URL, scope change resets to `Semua dompet`, wallet survives month change | Wallet list is scope-filtered server-side |
| AC-F7-9 | PASS | Route parity test against dashboard fakes; temporary real-DB probe: report `saldo akhir` = `sharedBalanceMinor` 1.500.000 and = `personalBalanceMinor` 400.000 for the current month | Both figures come from the same wallet/transaction tables; no rounding path exists (integer minor units) |
| AC-F7-10 | PASS | Route test `hides deltas without a comparator and signs them when one exists` (`Naik`/`Turun` wording, no percentage); E2E: month without comparator renders no delta block at all | Delta uses `shiftMonthKey(month, -1)`; no test covers the December-to-January rollover (see Missing coverage) |
| AC-F7-11 | PASS | Route test `returns one balance point for every day, including flat days` (31 points for October, flat days included); E2E: 31 chart points, no horizontal overflow at 390/768/1280, identical point count across breakpoints, keyboard `ArrowRight`/`End`/`Home`/`Escape` updates the `aria-live` line, text alternative present | Chart reads server-provided points; no client re-aggregation |
| AC-F7-12 | PASS | Route tests `excludes transfer legs from Masuk/Keluar but keeps a same-scope transfer neutral` and `shows only its own leg of a cross-scope transfer`; integration aggregate test; temporary probes: both directions in a selected wallet (40.000 in / 70.000 out), reverse cross-scope transfer (shared out 250.000 only); footnote `Transfer antar dompet tidak dihitung sebagai pemasukan atau pengeluaran.` asserted in E2E | Pair leg of the other scope never leaks |
| AC-F7-13 | PARTIAL | Executed: error state (one full card + `Coba lagi`, no partial cards), empty month band with hidden deltas and `Tambah transaksi`, disabled `Pribadi` with reason, past-month hero label, loading labels present. Inspection only: skeleton uses the same card geometry as the loaded state; wallet-selected empty band names the wallet (`Belum ada transaksi pada dompet {name} untuk {month}.`). Not executed: 360px viewport | Skeleton and wallet-empty copy are guarded by code reading, not assertions. Spec asks 360px to be checked if needed (spec line 197) |
| AC-F7-14 | PASS | Server-only aggregation inspected (`MonthlyReport` receives `MonthlyReportDTO`, no summing of rows); route parity test; E2E: opening/closing the add sheet produces no additional report request and URL stays `view=ringkasan`; old `Ringkasan aktivitas` block removed from `ActivityView.tsx` and replaced by `Lihat ringkasan bulan ini` | `report` contains exactly the values rendered; no derived totals in the client |
| AC-F7-15 | PASS | E2E asserts the footnote block: `Dihitung dari {n} transaksi`, period start/end, transfer exclusion sentence, `Cakupan: Bersama/Pribadi`; grep of new UI files finds no em dash and no `Potongan`/`Tabungan` row; `formatIDR` renders `Rp1.250.000` with no accounting brackets | Wording defects found: BUG-QA-F7-01 (footnote points at a hidden row), BUG-QA-F7-02 (invariant helper copy deviates from copy deck #13). Both are copy-level, amounts remain correct |

## 4. Bugs

### BUG-QA-F7-01 - Footnote announces `Saldo awal dompet baru` row that is not rendered (Low)
- **Priority:** Low
- **Preconditions:** A wallet created in the reported period (or after it) with `occurredAt` before the period, so `hasBackdatedNewWallet = true`, and `openingBalanceMinor = 0` for that wallet.
- **Steps to reproduce:** Create a SHARING wallet with opening balance 0 in October; add one transaction backdated to September; open `?view=ringkasan&month=2026-10`; read the footnote.
- **Expected:** Footnote about a new wallet appears only when the `Saldo awal dompet baru` row is visible (design 08 §6.4: the row never renders at zero), or the sentence should not reference a row.
- **Actual:** Footnote `Ada dompet yang dibuat baru; angka saldo awalnya tampil pada baris Saldo awal dompet baru.` renders while no `Saldo awal dompet baru` row exists. Row visibility uses `report.newWalletOpeningMinor !== 0` (MonthlyReport.tsx:288, 313) while the footnote uses `report.hasBackdatedNewWallet` (MonthlyReport.tsx:494).
- **Evidence:** Reproduced in the temporary E2E probe (footnote present, row count 0). Reproduced condition pair visible in `components/reports/MonthlyReport.tsx:288` vs `:494`.
- **Affected component:** `components/reports/MonthlyReport.tsx` (footnote + movement trace), `MonthlyReportDTO.hasBackdatedNewWallet` contract in `lib/server/contracts/reports.ts`.
- **Regression risk:** Low. Copy-only; no amount, invariant, or API change. Switching the condition to `hasBackdatedNewWallet && newWalletOpeningMinor !== 0` would hide a true statement in the zero-opening case; rewording is safer.
- **Suggested next step:** PM/design decides whether the footnote should (a) render only when the adjustment row exists, or (b) use separate wording for a zero-opening new wallet, e.g. mention that the backdated transaction is counted in `Masuk`/`Keluar`.

### BUG-QA-F7-02 - Invariant helper copy deviates from approved copy deck #13 (Low)
- **Priority:** Low
- **Preconditions:** Any loaded report.
- **Steps to reproduce:** Open `?view=ringkasan&month=2026-10&scope=shared` with no new-wallet adjustment row; read the line under the `Jejak saldo` strip.
- **Expected (design 08 §6.4 and copy deck row 13):** `Saldo akhir = Saldo awal, ditambah Masuk dan Transfer masuk, dikurangi Keluar dan Transfer keluar.` with absent rows not spoken.
- **Actual:** `Saldo akhir = Saldo awal + Masuk + Transfer masuk, dikurangi Keluar dan Transfer keluar.` (and with the adjustment row: `Saldo akhir = Saldo awal + Saldo awal dompet baru + Masuk + Transfer masuk, dikurangi Keluar dan Transfer keluar.`). Built by joining labels with `+` in `components/reports/MonthlyReport.tsx:293-301`.
- **Evidence:** Rendered string asserted in the E2E probe at 390px; approved string in `docs/design/08-reporting.md:215` and `:435`.
- **Affected component:** `components/reports/MonthlyReport.tsx` (`MovementTrace`).
- **Regression risk:** Low. Copy-only; the arithmetic remains auditable in both wordings.
- **Suggested next step:** Dev aligns the join to the approved wording (`ditambah ... dan ...`, `dikurangi ... dan ...`) for both variants, or PM/design approves the `+` formula and updates copy deck #13. Do not leave implementation and copy deck diverged.

### BUG-QA-F7-03 - Tablist lacks `aria-controls` and no tab panel role (Low, a11y)
- **Priority:** Low
- **Preconditions:** Any user on `/transactions`.
- **Steps to reproduce:** Inspect the tablist markup at 390px; check the Ringkasan tab and the report container.
- **Expected (design 08 §11.3):** `role="tablist"` + `aria-selected` and the Ringkasan tab carries `aria-controls` pointing at the report panel.
- **Actual:** `role="tablist"`, `aria-label="Tampilan aktivitas"`, `role="tab"`, `aria-selected` are present (`components/transactions/ActivityView.tsx:649-663`), but no `aria-controls` and the report container has no `role="tabpanel"`/`id`.
- **Evidence:** Inspection of `ActivityView.tsx:649-663` and the Ringkasan container; design 08 §11.3 line 476 and §6.1 line 92 (which only asks to match today's pattern, hence the ambiguity note below).
- **Affected component:** `components/transactions/ActivityView.tsx` (tablist), report panel wrapper.
- **Regression risk:** Low. Additive attributes only; no visual or behavior change.
- **Suggested next step:** Add `aria-controls` + `role="tabpanel"` with stable ids, or record a design decision that §11.3 is superseded by §6.1 ("sama seperti hari ini"). Screen reader users currently still get tab semantics and `aria-selected`.

### BUG-QA-F7-04 - `filter=out` deep link shows a false empty list on months with more than 20 rows (Medium, pre-existing, exposed by F7)
- **Priority:** Medium
- **Preconditions:** Selected month contains more than 20 transactions and none of the page-1 rows match the active type filter.
- **Steps to reproduce:** Sign up an owner; create a SHARING wallet; seed one `MONEY_OUT` (50.000, category `food`) and then 20 `MONEY_IN` (10.000, category `income`) on the same Jakarta date; open `/transactions?view=active&month=2026-10&filter=out`.
- **Expected:** At least the existing expense is listed, or a way to keep loading remains available while the filter is active.
- **Actual:** `Tidak ada transaksi untuk saringan ini.` card with `Tampilkan semua`. No `Muat lebih banyak` button is rendered even though `nextCursor` is non-null, because the empty-filter card replaces `TransactionList` (`ActivityView.tsx:938-956`).
- **Evidence:** Temporary Playwright probe passed with the assertion on the false empty copy at 390px (1 expense existed, 0 matching rows on page 1, 0 ten-thousand rows visible, no load-more). Root cause: client-side `visibleRows` filter over the loaded page (`ActivityView.tsx:612-616`) while the API request carries only `month`/`walletId`/`from`/`to` (`activityListUrl`), and the list empty branch hides pagination.
- **Affected component:** `components/transactions/ActivityView.tsx` (list filter + empty branch), `components/transactions/TransactionList.tsx:195-201`. `visibleRows` predates F7 (present in `HEAD:components/transactions/ActivityView.tsx`), so the filter logic is pre-existing latent behavior; the new `Lihat semua pengeluaran` link makes it reachable in one click from the report.
- **Regression risk:** Medium for the F7 journey (a report link that lands on "no transactions" while the report shows expenses), low for the rest of the list. Any fix that moves type filtering to the server touches the list API contract and needs its own regression pass.
- **Suggested next step:** Either keep the load-more affordance visible when the filtered set is empty (smallest fix), or pass the type filter to `GET /api/transactions` so pagination is applied after filtering. PM decides whether this blocks F7 release or is accepted as a known limitation.

## 5. Regressions checked

- Dashboard unchanged: only `app/api/dashboard/dashboard-routes.test.ts` fixture gained `reports: {} as ...`; `/api/dashboard` behavior and its 6 tests unaffected. Beranda vs Ringkasan parity still passes (AC-F7-9).
- Activity list: 14 `activityUrl` tests pass (month, Trash, add intent, date range, cursor, filter, wallet); month navigation, tab switching, add sheet, and undo untouched by the diff scope; E2E probes exercised tab switch, month change, and add-sheet open/close.
- Old `Ringkasan aktivitas` block: removed everywhere (grep over `app/` and `components/`), replacement link `Lihat ringkasan bulan ini` present in the Transaksi tab.
- Auth/permissions: report route keeps the 403 path for non-approved sessions; no new public route; nothing new under `app/(dashboard)` nav.
- Lint/type/build surfaces: `bun run lint` exit 0 (13 pre-existing warnings in `docs/qa/harness`), `bunx tsc --noEmit` clean, full unit suite 516/516.
- Full integration suite: 38/39, only the pre-existing t008 harness failure; not caused by this feature (file is a QA harness script, not application code).

## 6. Missing coverage (QA-visible gaps, not defects)

1. No component tests for `MonthlyReport.tsx` or the Ringkasan branch of `ActivityView.tsx`; every state/copy assertion in this report came from temporary Playwright probes that were removed. No permanent E2E reporting spec exists in `e2e/`, so state regressions (empty band, error card, disabled Pribadi, hero label, footnote) are unguarded.
2. `shiftMonthKey` (`lib/dates.ts:107`) has no test in the repository. The delta feature depends on it for the previous month, including the December-to-January rollover (AC-F7-10). Implementation reads correct (`Date.UTC(year, month - 1 + delta, 1)`), but it is unverified.
3. No automated Beranda parity test on a real database inside the repo: AC-F7-9 is guarded by a fake-backed route test, while the real-DB parity check ran only in a temporary probe.
4. The reverse cross-scope transfer case (accepted leg belongs to the shared scope, report scope personal) exists only in a deleted probe; the repository keeps the forward case.
5. 360px viewport not exercised (390/768/1280 were). Spec design note line 197 asks for 360px if the three pills risk overflow; none was observed at 390px.
6. Edge copy for very long wallet/category names and emoji (spec Edge Case line 166) was inspected only (`whitespace-nowrap` on amounts, `break-words` wrappers), never rendered with pathological strings.
7. Session expiry while switching tab/month (spec Edge Case line 167) was not exercised end to end; only the 403/401 mappings are covered by route tests.

## 7. PM / design decisions needed

1. **Invariant copy (BUG-QA-F7-02):** approve the implemented `+` formula and update copy deck #13, or require the approved `ditambah ... dan ...` wording. One source must win.
2. **New-wallet footnote (BUG-QA-F7-01):** reword for the zero-opening case, or gate the sentence on the adjustment row being visible.
3. **Deep link with paginated months (BUG-QA-F7-04):** accept as a known list limitation for release, or require the load-more affordance while a type filter is active (or server-side type filtering).
4. **Tab a11y (BUG-QA-F7-03):** design 08 §6.1 says "match today's pattern" while §11.3 asks for `aria-controls`; confirm which one governs.
5. **AC-F7-13 evidence bar:** confirm that inspection-level evidence for the loading skeleton and the wallet-selected empty band is acceptable, or request a permanent E2E assertion for both.

## 8. Handoff (Developer)

| ID | Severity | File | Minimal fix |
| :-- | :-- | :-- | :-- |
| BUG-QA-F7-01 | Low | `components/reports/MonthlyReport.tsx:494` (vs `:288`, `:313`) | Align footnote condition with the rendered adjustment row, or reword after PM decision |
| BUG-QA-F7-02 | Low | `components/reports/MonthlyReport.tsx:293-301` | Follow design 08 §6.4 / copy deck #13 wording, both variants |
| BUG-QA-F7-03 | Low | `components/transactions/ActivityView.tsx:649-663` | Add `aria-controls` + `role="tabpanel"` ids, or record the design exception |
| BUG-QA-F7-04 | Medium | `components/transactions/ActivityView.tsx:938-956`, `:612-616` | Show load-more while the filtered set is empty, or filter by type server-side |

Reproduction for each is in section 4. No production code was modified by QA; all temporary probes were deleted after execution.

## Appendix A - Temporary probes (created, run, deleted)

Playwright specs (`e2e/qa-reporting-*.spec.ts`), 17 checks, all passed on 2026-10-25:

- 390/768/1280: Ringkasan renders, hero + trace + group cards + chart + footnote copy, 31 chart points, no horizontal document overflow, tablist within viewport, full error card with retry, empty-month band with hidden deltas, `Pribadi` disabled with reason, `Lihat semua pengeluaran` target URL.
- 390: month navigation keeps `scope=personal` and `wallet=`, hero `Sisa akhir September`, report request carries `scope`/`walletId`, tab switch keeps month, add sheet opens/closes without an extra report request, chart keyboard roving updates the live region, new-wallet footnote bug reproduced.
- 390: paginated `filter=out` false-empty reproduced (BUG-QA-F7-04).

Integration probes (vitest, temporary) against the local database: AC-F7-9 parity (1.500.000 shared / 400.000 personal), WIB month boundary (`2026-10-31T16:59:59Z` counted in October money-in 111.000; `2026-10-31T17:00:00Z` counted in November money-in 222.000 with November opening 111.000), empty month (opening = closing = 500.000, 30 flat points, deltas absent), personal privacy (422 `REPORT_SCOPE_UNAVAILABLE`, foreign wallet 404), selected-wallet transfer both directions, new wallet created in period with pre-period backdate, reverse cross-scope transfer.

Side effects: Playwright runs created `e2e-*@test.local` fixture households in the local dev database (the shipped cleanup script only targets the `qa-t008-dev-*` prefix; the DB already holds 1.434 such fixture users from earlier suite runs). `test-results/` regenerated, only `.last-run.json` remains. No repository source file was changed by QA.

## Appendix B - Notes and observations

- Dev-mode `GET /api/reports/monthly` is issued twice with an identical URL. Assessed as React Strict Mode double-invoke of the data effect, not a duplicate production request; the production build was not exercised (all browser runs used `next dev`).
- `filter=out` is applied in the client and never sent to the list API; the observable deep-link contract of AC-F7-6 still holds (URL, month, wallet preserved).
- The report request is skipped entirely when the personal scope has no personal wallet, which is why the disabled `Pribadi` option produces no request (verified in the probe).

---

# Putaran 2 (regresi setelah koreksi) - 2026-10-25 10:10

**Scope:** verifikasi 4 bug putaran 1 setelah perbaikan, plus regresi pada surface yang bersentuhan (ActivityView, laporan, tab Transaksi/Trash). Round 1 di atas tidak diubah.
**Verdict putaran 2:** **PASS WITH RISKS**. Keempat bug diperbaiki dan terbukti berjalan; tidak ada regresi produk baru. Sisa risiko bersifat dokumentasi dan test-coverage (lihat 6 dan 7).

## 1. Status 4 bug

| Bug | Status | Bukti eksekusi |
| :-- | :-- | :-- |
| BUG-QA-F7-04 | **PASS** | Browser 390px: bulan 22 baris (1 `MONEY_OUT` tanggal 1, 21 `MONEY_IN` tanggal 2-22). `?filter=out` mengirim `type=MONEY_OUT` ke `GET /api/transactions` dan langsung menampilkan "Keluar halaman dua" tanpa kartu kosong. `filter=in` mengirim `type=MONEY_IN`, halaman 1 = 20 baris, `Muat lebih banyak` memuat halaman 2 = 21 baris unik (tiap nama dihitung tepat 1). Filter `Transfer` (client-side, request tanpa `type`) pada halaman 1 tanpa match menampilkan `Belum ada transaksi yang cocok di halaman ini.` + tepat satu `Muat lebih banyak`; klik memuat dan menampilkan baris transfer. Request `/api/transactions/trash` tidak memuat `type`. Add intent `?add=1` ditutup tanpa tambahan GET daftar (baseline diambil setelah daftar settle, selisih 0) dan baris tetap tampil. |
| BUG-QA-F7-02 | **PASS** | String persis terverifikasi di DOM: (a) tanpa baris kondisional `Saldo akhir = Saldo awal, ditambah Masuk, dikurangi Keluar.`; (b) transfer dua arah `Saldo akhir = Saldo awal, ditambah Masuk dan Transfer masuk, dikurangi Keluar dan Transfer keluar.` (identik copy deck #13); (c) tiga komponen `Saldo akhir = Saldo awal, ditambah Saldo awal dompet baru, Masuk, dan Transfer masuk, dikurangi Keluar dan Transfer keluar.`. Baris nol (transfer/penyesuaian) tidak diucapkan; `Masuk`/`Keluar` tetap diucapkan karena selnya selalu dirender. |
| BUG-QA-F7-01 | **PASS** | Kalimat baru `Ada dompet yang dibuat belakangan dan memiliki transaksi bertanggal lebih awal.` tampil saat `hasBackdatedNewWallet` (dompet dibuat Oktober, transaksi September) dan **tidak** tampil saat semua transaksi bertanggal hari ini (tanpa backdate). Kalimat berdiri sendiri, tidak memuat kata `baris`, dan tidak bergantung pada baris `Saldo awal dompet baru` (baris itu tetap terpisah dan hanya tampil saat nominal bukan nol). |
| BUG-QA-F7-03 | **PASS** | Tiap tab punya `id` + `aria-controls`; panel aktif `role="tabpanel"`, `id="activity-panel-{view}"`, `aria-labelledby="activity-tab-{view}"`. Keyboard: fokus tab pertama, `Tab` berpindah ke tab kedua, `Enter` mengaktifkan Ringkasan (URL dan panel ikut berubah). Grafik laporan tetap satu Tab stop dengan roving focus; `ArrowRight` mengubah isi `aria-live`. |

Catatan: dua assertion probe awal sempat merah karena asumsi probe, bukan produk. (1) Hitungan request add intent diambil sebelum fetch daftar Strict Mode selesai; (2) definisi backdate adalah `occurred_at < wallet.created_at`, jadi transaksi bertanggal lebih awal di bulan yang sama juga dihitung backdate. Keduanya diperbaiki di probe dan seluruh check lulus.

## 2. Regresi yang dieksekusi

| Check | Command | Hasil |
| :-- | :-- | :-- |
| Lint | `bun run lint` | exit 0, **0 error, 13 warning** (semua pre-existing di `docs/qa/harness`, tidak ada di file F7) |
| Unit/component | `bun run test` | **523 passed / 50 file**, 0 gagal (putaran 1: 516/49; +7 test dari `activityRows.test.ts` dan `activityUrl.test.ts`) |
| Types | `bunx tsc --noEmit` | bersih, exit 0 |
| E2E probe fitur (temporary) | `bunx playwright test e2e/qa-f7-round2.spec.ts --project=mobile` | **6/6 passed** (BUG-04 in/out, BUG-04 transfer, trash+add intent, copy/footnote, a11y, regresi kontrol) |
| E2E undo/trash (permanen) | `bunx playwright test e2e/transaction-undo.spec.ts --project=mobile` | **3/3 passed** (hapus + undo dalam 5 detik, toast kedaluwarsa, pulihkan dari Trash) |
| E2E add intent (permanen) | `bunx playwright test e2e/transaction-add-intent.spec.ts --project=mobile` | **12/13 passed**, 1 gagal karena locator test yang ambigu (lihat temuan T-1), bukan alur produk |

Cakupan regresi di probe: navigasi bulan sebelumnya/berikutnya (`month=2026-09` lalu balik `2026-10`), filter tanggal `from`/`to` (URL + request), filter dompet (URL `wallet=` + request `walletId`), tab Trash, scope laporan `Pribadi`/`Bersama`, pilih dompet laporan, dan deep link `Lihat semua pengeluaran` (`view=active&month=2026-10&filter=out`, pill `Uang keluar` aktif, baris pengeluaran tampil).

Tidak dijalankan ulang: `bun run test:integration`. Perbaikan putaran 2 hanya menyentuh file klien (`MonthlyReport.tsx`, `ActivityView.tsx`, `activityUrl.ts`, `activityRows.ts` + 2 test); file `lib/server/**` dan `app/api/reports/**` tidak berubah setelah 09:08, dan seluruh unit suite lulus.

## 3. Dokumen spec/design tidak berubah

`docs/spec/feat-reporting.md` mtime 09:21:08 dan `docs/design/08-reporting.md` mtime 09:20:28, sedangkan file perbaikan ditulis 09:47-09:55. Tidak ada perubahan spec/design oleh putaran perbaikan. Konsekuensinya copy deck #25 masih memuat kalimat lama (lihat 6).

## 4. Bug baru

Tidak ada defect produk baru.

## 5. Temuan test (bukan produk)

**T-1 (Low, test-only, pre-existing):** `e2e/transaction-add-intent.spec.ts:212` memakai `page.getByRole("option", { name: /Dompet Simpan E2E/ })` tanpa scope. Locator ini bersaing dengan `<option>` pada filter dompet halaman Aktivitas (teks sama ditambah ` · Bersama`), sehingga hasilnya flaky: bisa strict-mode violation, atau menunggu `<option>` tersembunyi sampai timeout. Gagal 2/2 kali dijalankan, lalu alur produk yang sama lulus saat option di-scope ke dialog `Pilih dompet` (simpan menulis URL satu kali, satu transaksi tercipta, toast tampil). Locator dan filter dompet halaman sama-sama sudah ada di `HEAD:ActivityView.tsx:780` sebelum fitur F7, jadi bukan regresi F7. Saran: `page.getByRole("dialog", { name: "Pilih dompet" }).getByRole("option", ...)`.
**Dampak:** `bun run test:e2e` akan gagal pada spec ini terlepas dari F7.

## 6. Ambiguitas / keputusan PM

1. **Copy footnote (BUG-QA-F7-01):** implementasi sekarang memakai kalimat baru yang berdiri sendiri, tetapi `docs/design/08-reporting.md` §6.7 butir 4 dan copy deck #25 masih memuat kalimat lama (`...tampil pada baris Saldo awal dompet baru.`). Desain tidak boleh berubah di putaran perbaikan, jadi deck perlu diperbarui oleh designer/PM agar satu sumber menang. Rekomendasi: terima kalimat baru dan update deck.
2. **T-1:** setujui perbaikan locator test sebagai follow-up (tidak menyentuh produk), atau terima spec tersebut merah sampai dibetulkan.
3. **Coverage permanen:** varian copy invarian, gating footnote, dan atribut tab a11y masih hanya dijaga probe sementara (dihapus setelah run). Rekomendasi follow-up: tambah test permanen untuk tiga hal ini.

## 7. Observasi (bukan defect)

- `aria-controls` dipasang pada ketiga tab, tetapi hanya panel milik tab aktif yang ada di DOM (`activity-panel-{view}`), jadi dua referensi lain menggantung. Design 08 §11.3 hanya mewajibkan tab Ringkasan menunjuk panel; tab aktif selalu valid. Pola satu panel dinamis ini dapat diterima, namun APG lebih suka satu panel per tab atau id panel bersama.
- Tab view tidak memakai roving tabindex/Arrow; ketiga tab ada di urutan Tab dan desain tidak mewajibkan Arrow untuk tablist ini. Arrow tetap berfungsi pada grafik laporan.
- `SegmentedControl` (scope laporan) juga memakai `role="tablist"`/`role="tab"` tanpa panel; pola lama, tidak berubah di putaran ini.

## 8. Rekomendasi akhir

**Ship.** Keempat bug putaran 1 tertutup dengan bukti eksekusi, lint/type/unit bersih, dan tidak ada regresi produk pada tab Transaksi, Trash, maupun laporan. Dua item non-blocking harus dilacak: update copy deck #25 (design) dan perbaikan locator `transaction-add-intent.spec.ts`.
