# FinDiary — Data, Financial Logic & Integration Guardrails

## 1. Source of truth

The current application implementation, API contracts, database schema, and verified product behavior are the source of truth for existing functionality.

UI mockups and design documents do not authorize changes to financial logic.

## 2. Protected areas

Do not change without explicit approval:
- Database schema and migrations.
- API request/response contracts.
- Authentication/session behavior.
- Authorization and ownership rules.
- Wallet balance calculation.
- Income/expense/transfer semantics.
- Budget calculation and period boundaries.
- Shared finance visibility and permissions.
- Gold weight, cost, and valuation formulas.
- Currency precision and rounding.
- Receipt scan persistence and confirmation behavior.
- Transaction history and audit semantics.

## 3. Financial correctness

For every financial value, identify:
- Source field or calculation.
- Currency and unit.
- Precision and rounding rule.
- Date/time basis.
- Whether value is actual, derived, or estimated.
- Whether value is personal or shared.
- Whether it is current, period-based, or historical.

Never calculate a new value in the UI if the backend already provides an authoritative value, unless the existing architecture explicitly requires client calculation.

## 4. Formatting

- Reuse existing formatting utilities if correct.
- Do not use floating-point arithmetic for money where it can introduce precision errors.
- Do not silently convert units.
- Keep raw values separate from formatted display values.
- Verify Indonesian Rupiah display conventions.
- Respect existing locale and timezone behavior.

## 5. Data states

All data-driven components must account for:
- Loading.
- Empty.
- Partial.
- Error.
- Stale data if applicable.
- Unauthorized.
- Offline/network failure.

Do not display zero as a substitute for unavailable data unless that is the established product meaning.

## 6. Receipt OCR and AI

- Treat extracted content as untrusted draft data.
- Validate fields before saving.
- Preserve user corrections.
- Show uncertain or missing values.
- Do not imply successful extraction if the process failed.
- Do not expose API keys or sensitive payloads in frontend code or logs.

## 7. Shared finance privacy

- Enforce existing backend authorization; frontend hiding is not security.
- Do not leak private wallet balances or transactions in shared views.
- Verify owner/member permissions for each action.
- Keep invite tokens and sensitive identifiers out of logs and UI where unnecessary.

## 8. Change protocol

If a UI requirement appears to require a data or API change:
1. Document the gap.
2. Explain why UI-only implementation is insufficient.
3. Propose the smallest compatible solution.
4. Identify migration and regression risks.
5. Wait for approval before implementing protected changes.
