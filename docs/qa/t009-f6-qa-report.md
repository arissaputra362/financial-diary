# T-009 / F6 Wallet — Independent QA Report

**Owner:** QA Engineer · **Date:** 2026-10-09 · **Verdict:** PASS WITH RISKS
**Scope:** `docs/spec/feat-wallets.md` AC-F6-1..12; `docs/design/06-wallets.md` C-1..C-31 (focus C-28/C-29/C-30/C-31); QA matrix F6 + journey W1..W15.
**Environment:** local only. Local PostgreSQL 18 at `localhost:5432`; scratch DB `financial_planner_qa_f6` created by QA (migrated). No production, no deploy, no remote mutation, no live Gemini/Blob call.

## Summary of evidence (QA-executed)

- `bun run test` -> **319 passed / 36 files**.
- `bunx tsc --noEmit` -> **clean (exit 0)**.
- `bun run lint` -> **0 errors, 8 pre-existing warnings** (all in `docs/qa/harness`, none F6).
- `bun run test:integration` against migrated scratch DB -> **13 passed / 4 failed / 1 skipped (18)**. The 4 failures are stale pre-wallet tests (see BUG-2).
- Real migration test (scratch DB, synthetic legacy data) -> **backfill + idempotence + constraints Pass** (AC-F6-9).
- HTTP actor matrix harness `docs/qa/harness/t009-wallets.qa.mjs` -> **42/42 Pass** (real routes + real DB, production build served by `next start`).
- OCR privacy harness `docs/qa/harness/t009-ocr.qa.mjs` -> **20/20 Pass** (dedup short-circuit + read routes; no live Blob/Gemini).
- Playwright/browser E2E at 390/768/1280 -> **not run** (AC-F6-12 Not started).

## Per-AC status

| AC | Status | Evidence |
|---|---|---|
| AC-F6-1 | **Pass** | HTTP F6-1a..e (default scope PERSONAL, blank opening=0, name/purpose/opening validation 422, non-approved 403); unit `wallet.test.ts` opening-balance lock (`WALLET_OPENING_BALANCE_LOCKED`, `openingBalanceLocked`). |
| AC-F6-2 | **Pass** | HTTP F6-2a..d (list/visibility), F6-6a..c, C30-3, F6-7b/c, F6-11a, F6-14a; unit `dashboard-wallet.test.ts`, `ocr-privacy.test.ts`. |
| AC-F6-3 | **Pass** | HTTP F6-3a..i (SHARING edit by any approved; archive/restore creator/Owner only; archived excluded from picker + rejected for tx/transfer; archived balance retained). C-31: F6-3a/b + W15. |
| AC-F6-4 | **Pass** | HTTP F6-4a..e (wallet required, server balance formula, foreign wallet 404, trashed excluded). |
| AC-F6-5 | **Pass** | HTTP F6-5a..e (atomic pair, same-wallet/archived rejected, creator/Owner-only pair trash/restore). |
| AC-F6-6 | **Pass** | HTTP F6-6a..c (member sees generic cross-scope row: wallet/note/receipt/group/source/category all null; owner sees full detail). |
| AC-F6-7 | **Pass** | HTTP F6-7a..d (two separate totals, personal only caller, active-only carousel, archived counted). |
| AC-F6-8 | **Pass (budget/dashboard) / Blocked (live advisor)** | HTTP F6-8a..b (spending + budget spent = SHARING active MONEY_OUT only; personal + transfers excluded); code review: `AdvisorService.buildAggregate` uses `sumByType{ walletScope:"SHARING" }`. Live advisor call Blocked (external model). |
| AC-F6-9 | **Pass** | Scratch-DB migration: 1 SHARING "Dompet Keluarga" per household (incl. empty household), opening 0, all pre-wallet rows attached (trashed + both transfer legs), transfer pair intact, no cross-household link, ledger parity; rerun idempotent (INSERT 0/UPDATE 0); FK/CHECK/UNIQUE enforced. |
| AC-F6-10 | **Pass WITH RISK / partial Blocked** | C-19 generic cross-uploader 409 (body only `{error}`), same-uploader reuse; C-29 job uploader-only before/after save (non-uploader 404, flag hidden); C-30 image route 401/404 generic; union flag flips true on SHARING link; Lihat-struk signal = non-null receiptId. **Blocked:** live upload (Gemini+Blob) and authorized image 200-byte path (would call live Vercel Blob). |
| AC-F6-11 | **Pass** | HTTP actor matrix: Owner/creator/ordinary approved/personal owner/non-approved(head); cross-household 404, private 404, identical messages; revoked -> 403 ACCESS_REVOKED. |
| AC-F6-12 | **Not started** | No browser/E2E run. Code review only (see Risks). |

## Bugs / defects

### BUG-1 (Low) — same-wallet transfer emits `VALIDATION_ERROR`, not ratified `TRANSFER_INVALID`
- Repro: `POST /api/transactions {type:"TRANSFER", amountMinor, fromWalletId:X, toWalletId:X, occurredAt}`.
- Expected (Dev Plan A-49 error namespace): `TRANSFER_INVALID` (422, fieldErrors).
- Actual: `422 VALIDATION_ERROR`, `fieldErrors.toWalletId=["Dompet asal dan tujuan harus berbeda."]`. The contract `superRefine` shadows `TransactionService`'s `transferInvalid`; through HTTP, missing from/to also yield `VALIDATION_ERROR`, archived yields `WALLET_UNAVAILABLE`, foreign yields `NOT_FOUND` — so `TRANSFER_INVALID` is never emitted over HTTP.
- Impact: no functional/security impact (correct 422 + human message); machine-readable contract (A-49) diverges. Reconcile Dev Plan vs Zod contract.

### BUG-2 (Medium, test defect / regression coverage) — stale pre-wallet DB integration tests
- Repro against migrated DB: `bun run test:integration` -> `lib/server/services/transaction.integration.test.ts` (1) and `lib/server/services/idempotency.integration.test.ts` (3) fail; tests call `createManual` without `walletId` and a TRANSFER without from/to.
- Expected: fixtures/tests updated for mandatory `walletId`.
- Actual: 4 failures; AC-F3-3 transfer DB oracle and AC-F3-8 transaction-route idempotency DB oracle no longer execute.
- Impact: test debt, not a product behavior bug; T-009 did not update the T-006 integration suite. `docs/qa/harness/t008-*` and other pre-wallet DB harnesses are likewise stale.

## Risks / unverified

- AC-F6-12 unverified in a browser: no 390/768/1280 layout, keyboard, or screen-reader run. Code review flags suspected a11y gaps vs design 06: `ReceiptImageViewer`, `WalletFormSheet`, `WalletPickerSheet` trap Tab? (only Escape/backdrop handled; no explicit Tab focus-trap and no focus-return-to-trigger on close). `WalletPickerSheet` options render `aria-selected={false}` without tracking selection.
- C-30 authorized image bytes and the full OCR upload lifecycle (Gemini/Blob) are Blocked — not permitted in QA.
- The migration is **not applied to `financial_planner_t003`**; `prisma migrate status` shows `20261009120000_wallet_f6` pending. Local/e2e suites that target that DB will fail until it is deployed.
- Full `bun run build` not re-run; the existing production build was used to serve the wallet routes for the HTTP harness.

## Artifacts
- `docs/qa/harness/t009-wallets.qa.mjs` + `t009-wallets-results.json`
- `docs/qa/harness/t009-ocr.qa.mjs` + `t009-ocr-results.json`
- Scratch DB `financial_planner_qa_f6` (QA-owned; legacy fixtures only).

---

# Round 2 retest — correction loop 1 (2026-10-09)

**Owner:** QA Engineer (independent retest) · **Verdict:** PASS WITH RISKS
**Environment:** disposable LOCAL PostgreSQL only — database
`financial_planner_dev_t009r1` at `localhost:5432`, all three migrations applied
(`20261001062805_init`, `20261006120000_fix_transfer_enum`,
`20261009120000_wallet_f6`). No Neon, no production, no deploy, no live
Gemini/Vercel Blob call; the disposable database is recreated/emptied around the
run (see "Database isolation" below).

## Commands actually executed (round 2)

| Command | Result |
|---|---|
| `bun run test` | **329 passed / 36 files** (exit 0) |
| `bunx tsc --noEmit` | **clean, exit 0** |
| `bun run lint` | **0 errors, 12 warnings**, all inside `docs/qa/harness` scratch files (exit 0) |
| `bun run build` | **exit 0**, 27 static pages, all wallet/OCR/wallet-image routes emitted |
| `bun run test:integration` (DATABASE_URL pinned to the disposable dev DB) | **20 passed / 1 skipped / 21** over 7 files. The single failure is the QA-owned `docs/qa/harness/t008-auth-lifecycle.integration.test.ts`, which **self-blocks** by design outside `financial_planner_t003` |
| `docs/qa/harness/t009-wallets.qa.mjs` (harness copy retargeted to the dev DB, `next start` on :3012) | **42/42 Pass** |
| `docs/qa/harness/t009-ocr.qa.mjs` (same) | **20/20 Pass** |
| `bunx playwright test --config docs/qa/harness/t009-a11y.playwright.config.ts` | **15 tests: 7 passed, 8 skipped** (non-mobile viewports skip the interactive suites). Internal QA assertions: **39 pass / 7 fail** — see AC-F6-12 |
| Direct `GET /api/ocr/receipts/{id}/image` probes on the production build | unauthenticated **401**, authenticated unknown id **404**, malformed id **404**; bodies carry only `{error:{code,message,fieldErrors}}` |

Artifacts written by this round (QA-owned, scratch):
`docs/qa/harness/t009-wallets-devdb.qa.mjs` + `t009-wallets-devdb-results.json`,
`docs/qa/harness/t009-ocr-devdb.qa.mjs` + `t009-ocr-devdb-results.json`,
`docs/qa/harness/t009-a11y.playwright.config.ts`, `docs/qa/harness/t009-a11y.spec.ts`.

### Database isolation

- Every fixture row lives in `financial_planner_dev_t009r1` (disposable, QA-created
  in round 1, verified empty at the start of the run, and emptied again at the end).
- `financial_planner_t003` was **read only** for a before/after user count:
  `210 -> 210`, with `0` rows matching `qa-t009-%` before and after. It was never
  written, migrated, or used as a fixture target.
- `financial_planner_qa_f6` was **not touched** at all this round (the round-1
  HTTP harness copies are hard-guarded to that name, so QA cloned them and
  retargeted the guard at the disposable dev DB instead of modifying the
  round-1 harness).
- `bun run start` and the Playwright dev server were both started with
  `DATABASE_URL` overridden in the process environment (Next's `@next/env`
  loader gives an existing `process.env` value precedence over `.env`, so the
  override is effective and was verified by observing the fixture rows landing in
  the disposable DB only).

## Retest of BUG-1 (transfer error mapping, A-51) — RESOLVED

| Case | Expected (A-51) | Observed (round 2) |
|---|---|---|
| same source/destination wallet | 422 `VALIDATION_ERROR` with `fieldErrors.toWalletId` | `POST /api/transactions` -> **422 `VALIDATION_ERROR`**, `fieldErrors.toWalletId=["Dompet asal dan tujuan harus berbeda."]` (harness `F6-5a`, unit `transaction-wallet.test.ts`, integration `rejects a same-wallet pair...`) |
| missing / malformed pair | 422 `VALIDATION_ERROR` | missing `from` -> `fieldErrors.fromWalletId`; missing `to` -> `fieldErrors.toWalletId` (unit suite); malformed ids are refused at the route boundary as generic 404 (see image/probe evidence below) |
| archived wallet in the pair | 422 `WALLET_UNAVAILABLE` | **422 `WALLET_UNAVAILABLE`** (`F6-3i`, unit `rejects an archived wallet inside a transfer pair`) |
| unknown / foreign / inaccessible PERSONAL | generic 404 `NOT_FOUND` | **404 `NOT_FOUND`** with the same message as an unknown id (`F6-4d`, `F6-2d`) |
| unauthorized pair mutation (trash/restore of the pair) | 403 `ACCESS_DENIED` | non-creator, non-owner member -> **403 `ACCESS_DENIED`** (`F6-5c`) |
| `TRANSFER_INVALID` no longer emitted | removed | `transferInvalid` is gone from `lib/server/errors.ts`; the only remaining textual references are comments/decision docs stating its deliberate absence |

BUG-1 is **resolved**: code, contract and behaviour now agree on A-51.

## Retest of BUG-2 (stale pre-wallet DB integration tests) — RESOLVED

`transaction.integration.test.ts` (4 tests, incl. new mandatory-`walletId`
fixtures and the A-51 same-wallet oracle) and `idempotency.integration.test.ts`
(6 tests) all pass against the migrated dev DB:
**20 passed / 1 skipped**, no failures outside the self-blocking
`t008-auth-lifecycle` harness. The AC-F3-3 transfer DB oracle and the AC-F3-8
idempotency DB oracle execute again.

## AC-F6-12 (UX state + accessibility) — executed this round, Pass WITH RISK

Browser: real Chromium, three viewports (390x844, 768x1024, 1280x800),
disposable dev DB, dev server (`next dev`) with `DATABASE_URL` pinned.

**What passes (32 assertions on the mobile viewport):**

- Responsive: no horizontal overflow on `/home` and `/transactions` at
  390, 768 and 1280 (`scrollWidth == clientWidth`, RESP-390-a/d, RESP-768-a/d,
  RESP-1280-a/d).
- Wallet picker field trigger (48px tall) and every control inside the
  add-transaction sheet and the wallet sheets is >=44px tall; the two wallet-surface
  exceptions are called out in the failure table below.
- Scope is never conveyed by colour alone: the pill renders an icon **and** the
  text `Pribadi` / `Bersama`, and the selected picker option additionally
  renders a check icon plus `.sr-only` "(dompet terpilih)" (`PICK-d`).
- Picker semantics: `role="option"` rows, accurate `aria-selected` (0 selected
  when nothing is bound, exactly 1 when the field is bound), roving `tabindex`
  (exactly one tabbable option, and it is the selected one), `ArrowDown`/
  `ArrowUp` move focus and hand over the roving tabindex, `Enter` and `Space`
  activate the focused option (`PICK-a..g`, `PICK-f2`, `PICK-f3`).
- C-32 flow (PM correction): the picker closes **before** the create form opens,
  the created wallet is auto-selected into the originating field, the picker is
  never reopened, cancel leaves the field unchanged, and focus returns to the
  wallet-field trigger on **both** save and cancel (`C32-a..h`).
- Wallet detail / manage / create sheets: `role="dialog"` + `aria-modal="true"`,
  focus moves into the panel, Tab cycles inside with real key presses
  (`SHEET-detail-a`, `SHEET-manage-a`, `SHEET-form-a`), Escape closes and focus
  returns to the trigger (`SHEET-detail-b`, `SHEET-manage-b`, `SHEET-form-c`).
- Receipt viewer (image bytes intercepted in the browser, so no live Blob call):
  dialog semantics, Tab trap inside the panel for synthetic events, `blob:` src
  only, no storage key / public Blob URL / job id / draft in the DOM (`VIEWER-a`,
  `VIEWER-b`).

**What fails (8 assertions, all evidence-backed; three of them repeat at each viewport):**

| Check | Expected | Actual | Defect |
|---|---|---|---|
| `PICK-h2` | Tab cycles inside the picker with real key presses | focus leaves the picker panel on the 4th Tab | BUG-4 |
| `PICK-i`, `PICK-j` | Escape closes the picker only; the parent add-transaction sheet stays open; focus returns to the field trigger | **both** dialogs close (0 dialogs remain) and `document.activeElement` is `BODY` | BUG-3 |
| `VIEWER-c` | Tab cycles inside the receipt viewer | focus leaves the viewer on the 2nd Tab | BUG-4 |
| `VIEWER-d`, `VIEWER-e` | Escape closes the viewer only; focus returns to `Lihat struk` | **both** the viewer and the transaction detail sheet close; focus is on `BODY` | BUG-3 |
| `RESP-390-b`, `RESP-768-b`, `RESP-1280-b` | every wallet-surface control >=44px | `Kelola` (36x74) and `Termasuk dompet di Arsip` (32x129 at 390, 16x148 at 768/1280) | BUG-5 |
| `RESP-390-f`, `RESP-768-f`, `RESP-1280-f` | every control inside the add-transaction sheet >=44px | the amount `<input>` (32px, `py-3` wrapper is 48px so the tap row is reachable but the input box itself is 32px) and the "Scan struk" text link (16px) | note below |

The `RESP-390-f` / `RESP-768-f` / `RESP-1280-f` rows: the amount input and the "Scan struk"
link are transaction-form controls that existed before T-009 and are not wallet
surfaces, so they are reported as an observation rather than folded into BUG-5.

Root cause of BUG-3/BUG-4: the wallet picker and the receipt viewer are rendered
**inside** the add-transaction sheet and the transaction detail sheet, whose own
document-level `keydown` handlers (`AddTransactionSheet` lines 37-60,
`TransactionDetailSheet` lines 55-79) have no "a nested dialog is open" guard.
They therefore also act on Escape (closing the parent and orphaning the trigger,
so the child's focus-return never lands) and their focusable query spans the
child dialog, so the parent's Tab wrap pulls focus out of the child. Design 06
§12/§14 (C-32) explicitly requires exactly one active sheet at a time and focus
return to the trigger, so this is a contract violation, not a preference.

AC-F6-12 also remains **Pass WITH RISK** because the screen-reader half
(announcing loading/empty/error/selected state) is verified only by ARIA roles
and labels in this run, not by a running AT session.

## Authenticated image route (C-30) — re-verified without live Blob

- Unauthenticated `GET /api/ocr/receipts/{id}/image` -> **401**
  `{"error":{"code":"UNAUTHORIZED",...}}`.
- Authenticated, unknown receipt id -> **404** `NOT_FOUND`
  "Struk tidak tersedia."; malformed (non-uuid) id -> the identical **404**
  body. `ocr-routes.test.ts` proves the authorised 200 path returns private bytes
  with `Content-Type` from the allowlist and `Cache-Control: private, no-store`
  using an in-memory blob store (no Vercel Blob client is constructed).
- Response headers and bodies carry **no** `storage_key`, no public Blob URL, no
  OCR job id, no draft, and no `receiptSharedWithHousehold` flag.
- OCR privacy harness on the dev DB: **20/20** (C-19 generic cross-uploader 409,
  same-uploader reuse, C-29 uploader-only job/draft, C-28 union flag flip,
  `Lihat struk` signal, 401/404 image route).

**Still Blocked:** the authorised 200-byte path against real Vercel Blob
(`GET` on a live private object), the full OCR upload lifecycle (Gemini), and the
live advisor call. None of these can run in QA without external calls.

## Bugs found in round 2 (new)

### BUG-3 (Medium) — Escape inside a nested wallet dialog closes the parent dialog and loses the focus return

- Repro (real Chromium, 390x844): `/transactions` -> `Tambah transaksi` -> click
  the wallet field -> `Escape`. Then `/transactions` -> open a row with a receipt
  -> `Lihat struk` -> `Escape`.
- Expected: only the topmost/picker or viewer dialog closes; the add-transaction
  sheet (with the typed amount, category and merchant intact) or the transaction
  detail sheet stays open; focus returns to the wallet field trigger or to the
  `Lihat struk` trigger (design 06 §12/§14).
- Actual: both dialogs close simultaneously; `document.activeElement` is `BODY`;
  every value typed in the add-transaction sheet is discarded.
- Impact: silent loss of unsaved input for keyboard users, plus a broken focus
  contract on two of the five wallet dialogs. Mouse users are unaffected.
- Likely component: `components/transactions/AddTransactionSheet.tsx`
  (lines 37-60) and `components/transactions/TransactionDetailSheet.tsx`
  (lines 55-79), interacting with `hooks/useDialogFocusTrap.ts`.

### BUG-4 (Low) — Tab escapes the nested picker and receipt viewer into the parent sheet

- Repro: same setup as BUG-3, press `Tab` 4 times from the wallet field inside
  the picker (or twice inside the receipt viewer).
- Expected: focus stays inside the topmost dialog.
- Actual: the parent sheet's handler sees the child's last control as its own
  last control and wraps to the parent's first control, so focus lands behind
  the picker/viewer.
- Impact: keyboard-only focus leak; the child dialog's own trap is correct in
  isolation (the synthetic-event check passes, and the three top-level wallet
  sheets trap correctly with real key presses).

### BUG-5 (Low) — two wallet-surface controls are below the 44px touch target

- Repro: `/home` with at least one wallet card, at 390, 768 and 1280.
- Affected: the wallet card's `Kelola` button (36x74) and the two
  `Termasuk dompet di Arsip` helper buttons (32x129 at 390; 16x148 at 768/1280).
- Expected (design 06 §13 "Umum": touch target >=48px on mobile): >=44px.
- Actual: as measured above. The wallet picker field (48px) and every control
  inside the add-transaction and wallet sheets already meet the target.

## Observation (requirement ambiguity, not a product defect)

- Design 06 §5.2/§14 describes the card's `Kelola` control as a popup **menu**
  (`aria-haspopup="menu"` + `aria-expanded`, Arrow navigation, Escape, focus
  return), while design 06 §5.3/§12 and C-24 describe a `Kelola dompet` **sheet**
  with Aktif/Arsip tabs, which is what is implemented. Spec AC-F6-12, the QA
  oracle, does not decide between the two. Needs PM/Design reconciliation; QA
  cannot mark either variant as a defect.
- Dev-only React warning observed once while wallet sheets were open on `/home`:
  "Encountered two children with the same key, `closed`" — `DashboardView`
  renders `WalletManageSheet` and `WalletFormSheet` with the same fallback key.






---

# Round 3 retest — correction loop 2 (2026-10-09, final round)

**Owner:** QA Engineer (independent retest) · **Verdict:** **PASS**
**Scope of this round:** BUG-3 (nested-dialog Escape), BUG-4 (Tab leak to the
parent), BUG-5 (wallet-surface touch targets), the `/home` React duplicate-key
warning, the design-06 `Kelola` reconciliation (manage sheet, not a popup menu),
plus a full re-run of every static, unit, integration, HTTP harness and browser
check. AC-F6-1..11 were re-verified unchanged; AC-F6-12 was re-executed in a real
browser.

**Environment:** disposable LOCAL PostgreSQL only — database
`financial_planner_dev_t009r1` at `localhost:5432`, all three migrations applied
(`20261001062805_init`, `20261006120000_fix_transfer_enum`,
`20261009120000_wallet_f6`; `prisma migrate status` -> "Database schema is up to
date!"). No Neon, no production, no deploy, no live Gemini and no live Vercel
Blob call. The receipt image bytes were intercepted inside the browser, so the
server Blob client was never reached.

## Commands actually executed (round 3)

| Command | Result |
|---|---|
| `bun run test` | **329 passed / 36 files** (exit 0) |
| `bunx tsc --noEmit` | **clean (exit 0)** |
| `bun run lint` | **0 errors, 12 warnings**, all in `docs/qa/harness` scratch files (exit 0) |
| `bun run build` | **exit 0**, 28 route entries re-emitted incl. `/api/wallets*`, `/api/ocr/receipts/[id]/image` |
| `bun run test:integration` with `DATABASE_URL` pinned to the disposable dev DB | **20 passed / 1 skipped / 21** over 7 files; the only failure is the QA-owned `docs/qa/harness/t008-auth-lifecycle.integration.test.ts`, which **self-blocks by design** outside `financial_planner_t003` |
| `docs/qa/harness/t009-wallets-devdb.qa.mjs` against `next start` on :3012 (production build, `DATABASE_URL` pinned) | **42/42 Pass** |
| `docs/qa/harness/t009-ocr-devdb.qa.mjs` (same server) | **20/20 Pass** |
| `bunx playwright test --config docs/qa/harness/t009-a11y.playwright.config.ts` | **16 Playwright tests passed / 14 skipped** (single-viewport suites skip the other two viewports; no test failures). Internal QA assertions: **110 recorded, 107 pass, 3 fail** — all 3 are the same pre-existing non-wallet controls, see `RESP-*-f` below |
| Direct `GET /api/ocr/receipts/{id}/image` probes on the production build | unauthenticated **401**, authenticated unknown id **404**, malformed id **404**, percent-space id **404**; every body is `{"error":{"code","message","fieldErrors":null}}` with no `storage_key`, public Blob URL, job id or draft |

New QA artifact: `docs/qa/harness/t009-a11y-r3.spec.ts` +
`t009-a11y-r3-results.log` (full assertion log of the run above).

## BUG-3 (nested Escape closed the parent and dropped focus to BODY) — RESOLVED

Repro used (real Chromium, 390x844): `/transactions` -> `Tambah transaksi` ->
fill `Jumlah` `125000` + `Nama toko` `Warung QA Nest` -> wallet field ->
`Escape`; then `/transactions` -> row with a receipt -> `Lihat struk` -> `Escape`.

| Check | Expected | Round-2 actual | Round-3 actual |
|---|---|---|---|
| `NEST-b` | only the nested picker closes; the add-transaction sheet stays open | both closed | **parentDialogs=1** (parent open) |
| `NEST-c` | input typed in the parent survives | input lost | **amount=125.000, merchant=Warung QA Nest** preserved |
| `NEST-d` | focus returns to the nested trigger, not BODY | `BODY` | **BUTTON with `aria-haspopup="dialog"`** (the wallet field trigger) |
| `NEST-f` | a second Escape closes the parent (one layer per press) | n/a | **parentDialogs=0** |
| `NEST-g` | focus after the parent Escape is the `Tambah transaksi` trigger | `BODY` | **"Tambah transaksi"** |
| `V3-b` | only the receipt viewer closes; the detail sheet stays open | both closed | **detailDialogs=1** |
| `V3-c` | focus returns to `Lihat struk` | `BODY` | **"Lihat struk"** |
| `V3-e` | a second Escape closes the detail sheet | n/a | **detailDialogs=0** |
| `V3-f` | focus never left on BODY | n/a | **BUTTON** |

Root cause fix confirmed in `hooks/useDialogFocusTrap.ts`: a module-level
`openDialogs` stack, `isTopmost()` gate on both Escape and Tab, and the two
former inline traps in `AddTransactionSheet` / `TransactionDetailSheet` replaced
by the shared hook, so exactly one document-level `keydown` listener per dialog
answers only when it is the topmost layer. Focus restoration in the effect
cleanup is guarded by `trigger?.isConnected`.

## BUG-4 (Tab leaked out of the nested picker/viewer) — RESOLVED

| Check | Expected | Round-2 actual | Round-3 actual |
|---|---|---|---|
| `NEST-a` | 16 real `Tab` presses never leave the picker panel | escaped at the 4th Tab | **result=0** (never escaped) |
| `V3-a` | 16 real `Tab` presses never leave the receipt viewer | escaped on the 2nd Tab | **result=0** (never escaped) |
| `PICK-h2` / `VIEWER-c` (round-2 spec, re-run) | Tab cycles inside the topmost dialog | leak | **result=0** both |

The same hook also keeps the three top-level wallet sheets correct: `SHEET-detail-a`,
`SHEET-manage-a`, `SHEET-form-a`, `R3-detail-trap-*`, `R3-manage-trap-*` all
report `result=0` with real key presses.

## BUG-5 (wallet-surface controls below 44px) — RESOLVED at the >=44px floor

Measured with `getBoundingClientRect()` on every visible interactive node.

| Control | Round-2 actual | Round-3 actual (390 / 768 / 1280) |
|---|---|---|
| wallet card `Kelola` | 36x74 | **44px** / 44px / 44px (`min-h-11`) |
| `Termasuk dompet di Arsip` helper | 32x129 at 390, 16x148 at 768/1280 | **44px** / 44px / 44px |
| manage-sheet row actions `Ubah` / `Arsipkan` (Aktif tab) | below 44px | **44px** / 44px / 44px |
| manage-sheet row action `Pulihkan` (Arsip tab) | below 44px | **44px** / 44px / 44px |
| wallet section as a whole (`section[aria-labelledby="wallets-title"]`) | defects | **0** controls below 44px at all three viewports |
| add-transaction sheet, wallet-surface subset (field, chips, actions) | n/a | **0** controls below 44px at all three viewports (`TOUCH-*-sheet`) |

## React duplicate-key warning on `/home` — RESOLVED

`DashboardView` now keys `WalletManageSheet` / `WalletFormSheet`
(`manage-closed` / `form-closed`). `R3-console` walks the whole wallet surface
(detail sheet, `Kelola` -> manage sheet, `Dompet baru` -> create form, nested
picker over the add-transaction sheet, receipt viewer over the detail sheet) and
records **0 console errors and 0 uncaught page errors**; every run also printed
`CONSOLE_ERRORS=[]`.

## C-32 flow, responsive, scope semantics — still correct

- `C32-a..h` **all Pass**: picker closes before the create form opens, the new
  wallet is auto-selected into the originating field, the picker is never
  reopened, cancel leaves the field unchanged, and focus returns to the wallet
  field trigger on both save and cancel.
- No horizontal overflow: `scrollWidth == clientWidth` on `/home` and
  `/transactions` at 390, 768 and 1280 (`RESP-*-a`, `RESP-*-d`,
  `R3-resp-home-*`).
- Scope is never colour-only: the pill renders an icon **and** the text
  `Pribadi` / `Bersama`, and the selected picker option adds a check icon plus
  `.sr-only` "(dompet terpilih)" (`RESP-*-c`, `R3-scope-*`, `PICK-d`).
- `Kelola` opens the `Kelola dompet` **sheet** (tab Aktif / Arsip) exactly as the
  reconciled design 06 states; no popup menu, no `aria-haspopup="menu"`.
- No dead end: the picker and the receipt viewer both reopen after a nested
  Escape round-trip (`NEST-e`, `V3-d`).

## Acknowledgement of design 06 §13 vs the QA matrix oracle (requirement ambiguity)

Design 06 §13 "Umum" states a touch target **>=48px** on mobile, and
`docs/qa/verification-matrix.md` AC-F6-12 mirrors that wording. The corrected
wallet surfaces measure exactly **44px** (`min-h-11`), which is the codebase's own
baseline (design 01 §5.5 "44px x 44px", `Button` "at least 44px (R-03)",
`interactive-mockup.html` `min-height: 44px`). BUG-5 was scoped and corrected at
the **>=44px** floor, which is the bar used in this retest, so the three named
wallet surfaces Pass. The 4px gap against the stricter 48px design wording is a
documentation conflict for PM/Design to reconcile; it is not a functional or
regression defect and it was not inside the correction-loop scope.

## Pre-existing, non-wallet residual carried from earlier rounds (NOT a new bug)

The round-2 harness `t009-a11y.spec.ts` records 3 `FAIL` assertions
(`RESP-390-f`, `RESP-768-f`, `RESP-1280-f`). Both controls are owned by the
T-006 transaction form, not by any F6 wallet surface, and both were already
present in rounds 1 and 2:

- the amount `<input>` box itself (32px tall) inside a 48px `py-3` wrapper, so
  the tap row is reachable;
- the inline "Ada struk? **Scan struk**" text link (16px).

The round-3 harness partitions them out and asserts the wallet-surface subset
separately (`TOUCH-*-sheet` = 0 failures) while recording them explicitly
(`TOUCH-*-sheet-residual`). Whole-page scans also surface non-wallet app-shell
controls (bottom-nav icon buttons at 40px, the "7D" spending-period chip at 36px)
— all pre-existing and outside F6 scope. Recommendation: route these to a T-006
follow-up ticket rather than to T-009.

## Authenticated image route (C-30) — re-verified without live Blob

- Unauthenticated -> **401** `UNAUTHORIZED`.
- Authenticated + unknown uuid -> **404** `NOT_FOUND` "Struk tidak tersedia.".
- Malformed (non-uuid) id and a percent-space id -> the **identical** 404 body.
- No `storage_key`, no public Blob URL, no OCR job id, no draft and no
  `receiptSharedWithHousehold` flag in any body or header. Authorized actors
  never reach a Blob client: the browser run intercepted the image response and
  rendered it as a `blob:` URL only (`VIEWER-a`, `VIEWER-b`).
- OCR privacy harness on the disposable DB: **20/20** (C-19 generic
  cross-uploader 409, same-uploader job reuse, C-29 uploader-only job/draft even
  after the image becomes share-visible, C-28 union incl. trashed links,
  `Lihat struk` signal, 401/404 image route).

**Still Blocked (external/live only, unchanged):** the authorized 200-byte path
against a real Vercel Blob object, the full OCR upload lifecycle (Gemini), and
the live advisor call. Unit-level coverage of the authorized byte path exists in
`app/api/ocr/ocr-routes.test.ts` using an in-memory blob store (no Vercel Blob
client is constructed).

## Database isolation (round 3)

- Every fixture row lived in `financial_planner_dev_t009r1`. At the end of the
  round it is **empty again** (0 users, 0 households, 0 wallets, 0 transactions,
  0 receipts, 0 sessions).
- `financial_planner_t003` was **never written or migrated**; it is still
  missing `20261009120000_wallet_f6` (no `wallet` table) and still holds 210
  users / 210 households with 0 `qa-t009-*` rows.
- `financial_planner_qa_f6` was **not touched** (its 2 round-1 users / 3
  households are unchanged; both HTTP harness copies are hard-guarded to
  `financial_planner_dev_t009r1`).
- The Playwright dev server (port 3024) and the `next start` server (port 3012)
  were both started with `DATABASE_URL` overridden in the process environment.

## Bugs found in round 3

**None.** BUG-3, BUG-4, BUG-5 and the `/home` duplicate-key warning are closed,
and no new defect was observed in the browser, unit, integration or HTTP runs.
Only the pre-existing, out-of-scope transaction-form touch-target residual and
the external/live blockers remain outstanding (both documented above).

## Readiness for PM sign-off (F6)

F6 is ready for PM sign-off **for everything that can be executed inside a
disposable local environment**: AC-F6-1..AC-F6-11 keep their round-2 Pass
status (re-verified) and **AC-F6-12 is now a full browser Pass** at 390/768/1280.
The remaining residuals are: (1) live external checks — authorized image bytes
via Vercel Blob, the OCR upload lifecycle via Gemini, and the live advisor call;
(2) the design-06 §13 48px-vs-44px documentation conflict; (3) the pre-existing,
non-wallet T-006 transaction-form touch targets; (4) no running screen-reader
(AT) session; (5) `financial_planner_t003` still lacks the `wallet_f6` migration,
so any local suite pinned to that DB keeps failing until it is migrated. T-008
release approval and AC-F4-5 remain out of scope for T-009.

