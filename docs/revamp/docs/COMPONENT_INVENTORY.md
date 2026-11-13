# FinDiary — Component Inventory & Reuse Strategy

## 1. Goal

Create a coherent component system that accelerates implementation and prevents visual drift. This is a target inventory, not a mandate to create every component regardless of need.

First inspect existing components and libraries. Extend or consolidate existing components where practical.

## 2. Foundation

- Theme provider/tokens.
- Typography primitives.
- App container and responsive content shell.
- Safe-area handling.
- Icon wrapper if useful.
- Formatting utilities for currency, date, and numbers.

## 3. Navigation

- Mobile bottom navigation.
- Central quick-action trigger.
- Desktop sidebar/top navigation.
- Page header.
- Breadcrumb/back navigation where appropriate.
- Context selector for personal/shared scope.

## 4. Inputs and actions

- Button variants and sizes.
- Icon button.
- Text/number/currency input.
- Select/combobox.
- Date picker.
- Search input.
- Filter chips.
- Checkbox/radio/switch.
- Form field and validation message.
- Upload/camera trigger.
- Confirmation dialog.
- Bottom sheet.

## 5. Financial components

- Balance summary.
- Income/expense summary.
- Wallet tile.
- Budget progress.
- Category breakdown.
- Transaction row.
- Transaction group/date header.
- Amount display.
- Financial insight panel.
- Chart wrapper and legend.
- Gold asset summary.
- Shared member/contribution item where supported.
- Approval/status indicator where supported.

## 6. Feedback and states

- Skeleton.
- Empty state.
- Error state.
- Toast/snackbar.
- Inline alert.
- Loading indicator.
- Retry action.
- Permission denied state.
- Success confirmation.

## 7. Component contract

Each shared component should document:
- Purpose.
- Props/API.
- Variants.
- Theme behavior.
- Responsive behavior.
- Accessibility behavior.
- Loading/disabled/error states.
- Example usage.
- Tests.

## 8. Reuse rules

- Do not create a new component for a one-off visual wrapper without a reuse or clarity benefit.
- Do not make one giant component handle unrelated use cases.
- Keep business logic outside purely presentational components.
- Use semantic props, not arbitrary class combinations at every call site.
- Avoid duplicate components with slightly different names.
- Avoid premature abstraction that makes simple UI harder to understand.
- Keep component styling token-based.

## 9. Icons and assets

- Reuse a single icon family.
- Use existing brand assets where available.
- Keep asset names semantic.
- Avoid inline SVG duplication when a shared icon package exists.
- Do not generate placeholder illustrations that resemble final brand assets.
