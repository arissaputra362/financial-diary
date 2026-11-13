# User Flow Map — Phase 0

**As of:** 2026-11-11  
**Cross-reference:** Workspace sibling ../docs/qa/user-journey-map.md (initially dated 2026-10-05; T-009 addenda dated 2026-10-09), current app source, and docs/current-state.md.

This document records the current verified flow structure and identifies where the older journey artifact needs revalidation. It avoids copying the full QA journey checklist, which remains QA-owned.

## Existing journey artifact: reuse and corrections

The older journey map remains useful for signup/login/session, invite approval, transaction capture, OCR failure, trash/restore, and security isolation scenarios. Its top-level “all features implemented / future features not started” framing is stale: it describes wallet functionality as not started, while current source includes wallet selection, forms, management sheets, archive/restore APIs and later T-009/T-011 QA. It predates monthly reporting, bank institutions, gold expansion, OCR retry, and recent budget/goal additions. Keep its scenario ideas; do not treat its dated implementation status as current.

The Oct 2026 visual-refresh audit adds a broad static route/state catalog and useful evidence for mobile layout, wallet labeling, no-fake data, and transfer semantics. It is explicitly evidence-only in docs/design/README.md; it does not replace current workflows or QA execution.

## Current flows

### FLOW-AUTH-01 — Create a household or join one

1. Anonymous user opens login/signup.
2. User chooses signup and enters account details.
3. Without an invite, signup creates a new household and Owner membership; with an invite, signup requests membership.
4. New Owner proceeds to the signed-in experience; invitee enters the waiting room as pending.
5. Owner reviews the request in Family and approves or declines; an approved member receives access on a subsequent authenticated request.
6. Revoked/declined membership displays a distinct state; logout revokes the session.

**Actors/permissions:** Anonymous, Owner, member, pending/declined/revoked user.  
**Data changes:** User, Household, Membership, Invite, MembershipEvent, Session.  
**Verification:** Auth/family route and service test suites; historical journey map and QA matrix. Current tests exist; no live production auth validation in Phase 0.

### FLOW-TX-01 — Add or edit a transaction

1. User selects the central/global Tambah action or add action on Activity.
2. Add sheet offers manual entry or receipt scan.
3. Manual flow selects income, expense, or transfer; enters amount/date/details and the applicable wallet(s).
4. Validation runs; save calls the transaction API with idempotency behavior where configured.
5. Success returns the user to the activity context and updates authoritative server data.
6. Existing non-transfer rows can be opened for detail/edit subject to permissions.

**Actors/permissions:** Approved user; wallet options depend on ownership and scope.  
**Data changes:** Transaction row(s); transfer creates a paired out/in movement.  
**Verification:** Transaction contracts/services/routes and activity/add/undo E2E files. Current suite passes most tests but report transfer tests fail; see TEST_BASELINE.

### FLOW-TX-02 — Remove and restore a transaction

1. User chooses delete/trash from a row or detail view.
2. Confirmation/action moves the row to soft-deleted state.
3. Undo toast offers a short immediate restore action.
4. If toast expires, user opens the Trash view and restores the item.

**Data changes:** Soft-delete metadata only; restore clears deletion state.  
**Verification:** Transaction trash/restore APIs, service tests, transaction-undo E2E, older user-journey scenarios. Confirm the actual current toast duration and filters during future visual QA.

### FLOW-OCR-01 — Scan, review, and save a receipt

1. User opens Add and selects Scan receipt.
2. User captures or selects an image; camera captures over the configured limit are compressed client-side, and upload validation enforces the size/type rules.
3. Server creates/processes an OCR job; UI shows progress.
4. User reviews and edits extracted fields; OCR never auto-saves a transaction.
5. User confirms save with a wallet/scope selection; receipt association/access disclosures reflect existing links.
6. On retry, the user explicitly selects an image; same-image retry behavior and different-image upload are distinct. Failure/unavailable-image states offer recovery/manual entry.

**Data changes:** Receipt, OcrJob attempts, and only after confirmation a transaction.  
**External dependencies:** Gemini and private Blob storage.  
**Verification:** OCR contract/service/route/integration/E2E and T-012 report (2026-10-22, PASS WITH RISKS); live Gemini/Blob were not tested in that report or this Phase 0.

### FLOW-WALLET-01 — Create, select, edit, archive, or restore a wallet

1. User opens /wallet, the dashboard wallet summary/manage sheet, or selects a wallet from a transaction form.
2. User creates/edits name, purpose, opening balance, institution label and (on create) scope as permitted.
3. User may choose an official institution or manage a personal custom institution in the nested picker; manual wallet remains available.
4. Wallet details show server-provided balance and available actions.
5. Authorized actors archive or restore a wallet through the management sheet.
6. Wallet picker constrains choices based on money flow and access.

**Permissions:** Scope is immutable on update; capabilities are exposed by server DTO and enforced server-side. Custom institutions remain private to their creator.  
**Verification:** Wallet/institution API/service/seed tests, focused browser gates, and current Phase 4 visual regression. `/wallet` is the Phase 2 dedicated view; broad legacy bank-institution specs retain superseded selectors.

### FLOW-BUDGET-01 — Manage household/personal budgets and savings goals

1. User opens the budget card or /budget.
2. User selects personal or shared scope; personal scope is self-only, shared scope follows Owner/member permissions.
3. User sets/edits budget and cycle where supported; server computes period usage and remaining amount.
4. User creates/edits a savings goal and records progress; goals remain distinct from wallet transactions.
5. Advisor panel fetches grounded insight if available.

**Verification:** Budget/goal/advisor services and API tests plus focused browser gates. Money inputs and contracts support up to two fractional digits; old integer-only assertions are historical and must not be reused.

### FLOW-REPORT-01 — Review and print a monthly report

1. User opens the Ringkasan view from Activity.
2. Selects month, scope, and optional wallet filters.
3. UI requests server-aggregated balances, money in/out, transfers, category breakdown and daily balance history.
4. For print detail, UI loads report rows through the existing cursor contract, builds detail sections, and opens browser print/save PDF.
5. Transfer legs must remain neutral to money-in/out but visible in transfer totals/print details according to the current reporting spec.

**Verification:** Report API/repository/service/detail tests and focused browser gates pass. Transfer totals and printable transfer sections were corrected and are covered by the current closeout suite.

### FLOW-GOLD-01 — Track gold and understand an estimate

1. User opens /gold and reviews holdings/history.
2. Creates or edits a bar/jewelry asset manually or scans supporting imagery.
3. Server derives market estimate from provider/snapshot and labels source/date/fallback.
4. User can inspect details and applicable destructive/restore actions.

**Verification:** Gold unit/API/integration/E2E tests. Provider and Gemini live behavior were not verified in this audit; displayed market estimates are not guaranteed sale values.

### FLOW-FAMILY-01 — Manage members and invitations

1. Approved user opens /family.
2. Owner creates/shares an invite and handles pending membership; members see only allowed household information.
3. Owner approves, declines, or revokes membership; member status and API authorization govern future access.

**Verification:** Family API/service tests and older journey scenarios; source confirms server-side authorization is required.

### FLOW-PROFILE-01 — Update account/theme and log out

1. User opens /profile from the desktop avatar or mobile Lainnya menu.
2. User edits profile/password, chooses system/light/dark theme, or logs out.
3. Theme selection persists locally and follows OS preference when set to system; logout revokes the current session.

**Verification:** Profile/auth tests and theme E2E; current baseline results are in TEST_BASELINE.md.

## User-flow cross-cutting rules

- Deep links/query state must preserve month and active filters when returning from report/detail flows.
- Loading, empty, error, unauthorized, disabled, submitting, success and recovery states must be catalogued per discovered view.
- Personal/shared data must never be combined or revealed beyond server permissions.
- OCR output remains a reviewed draft.
- Print/PDF is browser-generated; it is not a server-rendered downloadable PDF.
