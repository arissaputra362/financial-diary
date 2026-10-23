# T-011 Bank Institutions: Independent QA Report

**Owner:** QA Engineer
**Date:** 2026-10-22
**Verdict:** `PASS WITH RISKS`
**Task:** T-011 Official bank catalog and personal Quick Add
**Basis:** `docs/spec/feat-bank-institutions.md` (AC-BI-1..13), `docs/PRD.md` F6 extension (AC-F6-13..16), `docs/dev-plan/feat-bank-institutions.md`
**Environment:** local only. No production, no deployment, no Neon validation, no live OJK fetch during this QA cycle.

**As-of status:** This report records the independent QA verification completed on 2026-10-22. Its
verdict and evidence are preserved as recorded and are not rewritten after the fact. On 2026-10-22,
separately from this report, the PM accepted T-011 as `done` with the risks documented in Section 7.
That PM acceptance is task acceptance, not release approval. This report itself was not a release
signoff and does not become one retroactively. T-008 remains the release gate.

> **This report is not a release signoff.** It records independent QA verification of T-011.
> It did not mark T-011 done, did not grant PM acceptance, and does not replace T-008 as the
> release gate. At the close of this QA cycle the ticket remained `in_qa_review`; the later PM
> decision dated 2026-10-22 is recorded in the as-of status above and in Section 7 item 8.

## 1. Summary

QA retest on 2026-10-22 confirms the T-011 implementation against the approved acceptance
criteria, including the archive and restore UI, the restore collision guard, month-level seed
provenance, and user-private list isolation. No blocking functional defect was found.

Residual items are recorded in Section 7. They are release risks and evidence limitations, not
confirmed product defects.

## 2. Scope and AC mapping

| Spec AC | PRD F6 extension | QA result |
|---|---|---|
| AC-BI-1, AC-BI-13 | AC-F6-14 | Pass with risks |
| AC-BI-2, AC-BI-9 | AC-F6-13 | Pass |
| AC-BI-3, AC-BI-4, AC-BI-5, AC-BI-8, AC-BI-11, AC-BI-12 | AC-F6-15 | Pass with risks |
| AC-BI-6, AC-BI-7, AC-BI-10, AC-BI-12 | AC-F6-16 | Pass with risks |

The matrix rows and evidence are in `docs/qa/verification-matrix.md`, section
"Matriks AC F6 extension: Bank/Penyedia (T-011), 4 baris PRD dan 13 AC Spec dipetakan". Base F6 rows AC-F6-1..12 and all earlier
historical rows are unchanged.

## 3. Test execution

### 3.1 Executed in this QA documentation sync (2026-10-22)

| Command | Result |
|---|---|
| `bunx vitest run lib/server/services/institution.test.ts app/api/institutions/institutions-routes.test.ts prisma/data/bank-institutions-ojk-2026-06.test.ts lib/server/services/wallet.test.ts` | 4 files passed, **45/45 tests passed** |
| Read-only PostgreSQL check on `financial_planner_t003` | `bank_institution` has `source_period` (varchar, not null) and no `source_as_of`; 105 rows, all `2026-06`; CHECK `bank_institution_source_period_format` present; 0 rows with invalid format |

Per-file counts: `institution.test.ts` 16, `institutions-routes.test.ts` 11,
`bank-institutions-ojk-2026-06.test.ts` 4, `wallet.test.ts` 14.

### 3.2 QA retest artifacts (2026-10-22, session-local)

Browser probes at 390, 768, and 1280 against the local production build:

- active list, inline archive confirmation, archived list with `Pulihkan`, and restored state
- collision error state on restore against an active official name at 390
- REST probes for archive, restore, and collision responses
- leftover check after the probes

Screenshots: `C:/Users/Aris/AppData/Local/Temp/opencode/t011-r16-shots/` (`390-active.png`,
`390-confirm.png`, `390-archived.png`, `390-restored.png`, plus 768 and 1280 variants, and
`390-collision-error.png`). These are session-local artifacts and are not versioned in the repo.

Cross-check: the archived tab shows the archived chip with archive date, `Pulihkan`, and the
manual path. The collision state shows the inline error and an action to select the official row,
while the private row stays in the archived tab.

### 3.3 Engineering evidence recorded in the Dev Plan (not re-executed here)

- `bunx tsc --noEmit`: pass, 0 errors
- `bun run test`: 40 files, 371 tests pass
- T-011 integration on a disposable migrated DB: 8/8 pass
- `bun run test:integration` full: 28 pass / 1 fail, the single failure is the stale T-008 harness
- `bunx playwright test e2e/bank-institutions.spec.ts`: 6/6 at 390/768/1280
- `bun run build`: pass
- targeted ESLint on changed files: pass, 0 errors

## 4. Seed provenance and source period

- Source: OJK "Daftar Alamat Kantor Pusat Bank Umum dan Syariah" page, workbook for June 2026.
- Provenance constants live in `prisma/data/bank-institutions-ojk-2026-06.ts`: source URL,
  source file name, SHA-256 (`4e87b307...d63b50`), `seed_version = ojk-office-list-2026-06-v1`,
  and `source_period = 2026-06`.
- Content: 105 unique named rows across four OJK groups (4 / 67 / 27 / 7). No mockup short names,
  aliases, logos, account numbers, or card numbers were added.
- The workbook states only the month, so provenance is stored at month level. No publication day
  is inferred. Operational import time stays in `created_at` / `updated_at`.
- Migration `prisma/migrations/20261022120000_institution_source_period/migration.sql` is additive:
  it adds `source_period`, backfills from the old date with `to_char(..., 'YYYY-MM')`, adds a format
  CHECK, then drops the old column. The earlier applied T-011 migration was not rewritten and no
  database was dropped or reset.
- Seed rerun is idempotent and rows missing from a newer snapshot are deactivated, not deleted.
- Risk: QA did not download the live OJK workbook again. Integrity is verified against the checked-in
  hash, period, version, and the seed tests, not against a fresh external download.

## 5. Archive and restore UI, plus restore collision fix

### Archive and restore UI

- The management surface lives inside the existing bank picker sheet as a two-position
  `Aktif` / `Arsip` toggle. No new route, page, or navigation entry was added.
- Active private rows expose `Arsipkan` with a two-step inline confirmation. The confirmation
  states that this is not a permanent delete and that existing wallet labels remain visible.
- Archived rows expose `Pulihkan` and show an archived chip with the archive date. Restore returns
  the entry to the active list for the same user only.
- Status text is announced, focus returns to the entry row after archive and restore, and controls
  meet the 44px touch floor. Official catalog stays a listbox; the private list is a plain list with
  two tab stops per row and `aria-current` on the selected row.
- `GET /api/institutions` returns additive `archivedCustom` for the session user only, so the
  Arsip tab needs no new endpoint.
- Archive is soft. No hard-delete path was added.

### Restore collision fix

- `InstitutionService.setArchived(actor, id, false)` checks `findOfficialByNormalized` before
  reactivation.
- When an active official row has the same normalized name, the API returns 409
  `INSTITUTION_ALREADY_EXISTS` with `existing = { kind: "OFFICIAL", id, name }`.
- The private row stays archived, no second active row is created, and the response contains no
  `userId`, private list, or another user's data.
- The UI shows an inline error and offers the official catalog row as the next action.
- Covered by service, route, and DB integration tests, plus the 390px browser probe.

## 6. User-private list isolation

- The custom list is filtered by `userId` taken from the server session. The client never supplies
  the owner id.
- A foreign custom id returns a generic 404. An own archived id used for new selection returns 422.
- Wallet DTOs include a custom institution id only for its owner. Other authorized members of a
  Shared wallet receive the label kind and name as wallet metadata, not the private id.
- The archived list is owner-only. No endpoint lists another member's private entries.
- Covered by unit, route, and DB integration tests, including a wallet label that survives archive
  while the custom id stays hidden from another member.

## 7. Known limitations and residual risks

1. **Full integration suite is not fully green:** 28/29 pass. The one failure is the stale T-008
   harness `docs/qa/harness/t008-auth-lifecycle.integration.test.ts`, which creates a transaction
   without the now-required `walletId`. It is not a T-011 regression, but the full suite result
   cannot be reported as green.
2. **Full lint is not green:** 9 pre-existing errors in evidence and QA harness scripts (`require()`),
   not in T-011 application files. Targeted lint on changed files passes.
3. **Source workbook was not re-downloaded:** provenance is verified from the checked-in hash,
   period, and version. No live OJK fetch or external sync was performed.
4. **No production or deployment validation:** no Neon, Vercel, production mutation, or deployment.
5. **No screen-reader session:** keyboard and ARIA behavior were checked, but no running assistive
   technology announcement test was performed.
6. **Shared-wallet edit by two different actors was not executed in the browser:** authorization for
   preserve, clear, official, own custom, and foreign custom is proven at service, route, and DB level.
7. **Browser evidence is session-local:** screenshots and probe scripts are not versioned in the repo.
8. **Release gate remains T-008:** this report did not PM-accept, mark done, or release T-011.
   The later PM decision on 2026-10-22 accepted T-011 as `done` with these risks documented, which
   is task acceptance only. Release approval still depends on T-008.

## 8. Evidence paths

- Spec: `docs/spec/feat-bank-institutions.md`
- PRD F6 extension: `docs/PRD.md`
- Verification matrix: `docs/qa/verification-matrix.md`
- Dev Plan evidence: `docs/dev-plan/feat-bank-institutions.md`
- Service and unit tests: `lib/server/services/institution.test.ts`,
  `lib/server/services/wallet.test.ts`
- Route tests: `app/api/institutions/institutions-routes.test.ts`
- DB integration tests: `lib/server/services/institution.integration.test.ts`
- Seed and provenance: `prisma/data/bank-institutions-ojk-2026-06.ts`,
  `prisma/data/bank-institutions-ojk-2026-06.test.ts`,
  `prisma/migrations/20261022120000_institution_source_period/migration.sql`
- Browser test: `e2e/bank-institutions.spec.ts`
- UI component: `components/wallets/BankPickerSheet.tsx`
- Local read-only provenance check output: `financial_planner_t003` query result in Section 3.1
- Session-local browser artifacts: `C:/Users/Aris/AppData/Local/Temp/opencode/t011-r16-shots/`

## 9. Documentation scope

This report and the matrix extension are documentation-only changes. No application code, schema,
migration, seed, Spec, Dev Plan, architecture, PRD, TASK-PLAN, or T-011 ticket was modified. T-011
was not marked done or PM-approved by this report; the PM decision on 2026-10-22 was made outside
this report after its QA cycle closed. No sample bank rows or personal data were copied into this
document.