# FinDiary — UX & Interaction Guidelines

## 1. General interaction principles

- Make primary actions obvious.
- Keep common tasks short.
- Confirm destructive actions.
- Provide clear feedback after save, update, delete, upload, or failure.
- Preserve user input after recoverable errors where technically possible.
- Use consistent labels and interaction patterns.
- Avoid controls that look interactive but do nothing.

## 2. Mobile-first behavior

- Design the narrow viewport first.
- Keep primary actions within comfortable thumb reach.
- Use bottom navigation only for a small number of high-frequency destinations.
- Use bottom sheets for short contextual actions when appropriate.
- Use full-screen flows for camera, complex forms, and multi-step tasks where needed.
- Avoid horizontal scrolling for primary content.
- Respect device safe areas and keyboard behavior.

## 3. Transaction capture

Inspect the existing transaction model and workflows before redesigning. Preserve all supported fields and business rules.

Potential UX structure:
1. Select income/expense/transfer if supported.
2. Enter amount.
3. Select category.
4. Select wallet/scope.
5. Enter date and optional notes/attachments.
6. Validate and save.
7. Show clear confirmation and updated context.

Do not force this exact sequence if the existing product has a better or required workflow.

## 4. Personal and shared context

- Always make the active wallet/financial scope visible.
- Clearly identify which household/shared space is active.
- Show transaction creator/owner when relevant.
- Make permissions and approval status understandable.
- Do not imply that a shared balance belongs to one individual.
- Preserve access control and ownership rules.

## 5. Forms

- Label fields persistently; do not rely on placeholder text alone.
- Group related fields.
- Show validation near the relevant field.
- Explain why a field is required when non-obvious.
- Preserve values on validation errors.
- Prevent duplicate submissions.
- Show pending/loading state.
- Confirm successful completion.

## 6. Search and filters

- Make active filters visible.
- Provide a clear way to reset filters.
- Preserve filter state when navigating back where appropriate.
- Distinguish no matching results from no data at all.
- Ensure filter controls are usable on narrow screens.

## 7. Financial language and formatting

- Follow the app's existing locale and currency conventions.
- For Indonesian Rupiah, use consistent `Rp` formatting and separators.
- Never silently round values where precision matters.
- Label period boundaries clearly.
- Distinguish transaction date from created/updated timestamps.
- Label market estimates and unrealized gains/losses clearly.
- Do not describe an estimate as a guaranteed future balance.

## 8. Financial insights

Insights must be derived from real available data and explain their comparison basis:
- “Dibanding bulan lalu”.
- “Berdasarkan transaksi yang tercatat”.
- “Budget kategori ini tersisa”.
- “Estimasi berdasarkan pola saat ini”.

Avoid unsupported causal claims or judgmental language. If there is insufficient data, show an honest insufficient-data state.

## 9. Receipt scanning

- Clearly communicate camera/upload permission state.
- Show capture guidance and retake option.
- Treat OCR/AI output as a draft.
- Let users review and correct merchant, date, line items, total, and category when supported.
- Do not save silently without confirmation unless the existing workflow explicitly requires it.
- Show extraction errors and partial extraction honestly.

## 10. Shared finance

Inspect actual roles and approval mechanics. The UI must accurately show:
- Active household/group.
- Members and roles.
- Shared balance and its meaning.
- Transaction creator.
- Pending/approved/rejected status if present.
- Invitation state and permission boundaries.

Never invent approval or contribution calculations.

## 11. Empty, loading, and error states

Every data-driven screen must have intentional states:
- Loading: skeleton or progress indicator appropriate to content.
- Empty: explain what is missing and offer a relevant next action.
- Error: explain the problem and recovery action.
- Permission denied: explain access limitation without leaking data.
- Success: concise confirmation.
- Offline/network failure: preserve input and allow retry when feasible.

## 12. Mascot usage

Finny is optional and provisional. Use it only where it adds warmth or guidance. Never let mascot art displace important information or slow down workflows.
