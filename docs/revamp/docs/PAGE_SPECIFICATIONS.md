# FinDiary — Page & Workflow Specifications

## Important

This document defines the target experience for known areas. It is not a complete route inventory. The agent must append specifications for every additional screen discovered during repository audit.

For each actual screen, document: purpose, hierarchy, actions, data, permissions, states, responsive behavior, theme behavior, and acceptance tests.

## 1. Home / Dashboard

### User job
Understand current financial position and decide what to do next.

### Suggested hierarchy
1. Greeting and period selector if useful.
2. Main balance or relevant financial summary.
3. Income and expense summary.
4. Budget progress.
5. Cash-flow trend.
6. Actionable financial insight.
7. Recent transactions.
8. Wallet/shared context summary where supported.

### Rules
- Do not show every metric at equal visual weight.
- Use real data and explain selected period.
- Avoid charts if data volume is insufficient.
- Provide shortcuts to existing primary actions.
- Do not expose sensitive amounts unnecessarily; preserve any existing hide/show balance behavior.

## 2. Budget

### User job
Create, monitor, and adjust budgets.

### Suggested hierarchy
1. Period selector.
2. Total budget, used amount, remaining amount.
3. Overall progress and status.
4. Category breakdown.
5. Warning/near-limit categories.
6. Budget history or trend if available.
7. Create/edit budget actions.

### Rules
- Preserve budget period, rollover, category, wallet, and scope semantics.
- Show actual amount and limit, not only percentage.
- Distinguish exceeded, near limit, and healthy states.
- Verify calculations and date boundaries.

## 3. Activities / Transactions

### User job
Find, understand, and manage recorded money movements.

### Suggested hierarchy
1. Page title and date range.
2. Search and filters.
3. Income/expense/transfer filters if supported.
4. Grouped transaction list.
5. Clear amount, category, wallet, date, and note context.
6. Detail/edit/delete actions according to permissions.

### Rules
- Preserve pagination/infinite scroll and filter behavior.
- Distinguish transaction types.
- Do not merge separate transactions visually if this causes ambiguity.
- Provide a clear no-results state.

## 4. Receipt scanning

### User job
Capture receipt information and turn it into a reviewed transaction.

### Suggested flow
1. Camera capture or image upload.
2. Preview, crop/retake if supported.
3. Processing state.
4. Extracted data review.
5. Edit fields and line items where supported.
6. Confirm/save or cancel.

### Rules
- Never treat OCR output as guaranteed correct.
- Preserve original image association where supported.
- Show extraction failure and partial data.
- Respect camera permissions and upload limits.

## 5. Gold assets

### User job
Record gold holdings and understand cost/value over time.

### Suggested hierarchy
1. Total recorded weight.
2. Total acquisition cost.
3. Estimated current value, only if supported by reliable price data.
4. Unrealized gain/loss with explicit basis and timestamp.
5. Asset/holding list.
6. Purchase history.
7. Add/edit transaction.

### Rules
- Distinguish grams, purchase price, fees, and market estimate.
- Clearly label the source and timestamp of market price if present.
- Never imply that estimated value is a guaranteed sell price.
- Preserve purity/karat and unit precision where supported.

## 6. Wallets

### User job
Understand and manage balances across wallets.

### Suggested hierarchy
1. Wallet overview.
2. Personal/shared grouping where supported.
3. Balance per wallet.
4. Wallet detail and transaction history.
5. Add/edit/archive wallet actions.
6. Transfer flow if existing.

### Rules
- Preserve balance calculation and wallet ownership.
- Distinguish transfers from income/expense.
- Prevent visual ambiguity between personal and shared balances.
- Confirm destructive actions.

## 7. Shared finance

### User job
Coordinate household/shared financial activity.

### Suggested hierarchy
1. Active household/group selector.
2. Shared balance and period context.
3. Member list and roles.
4. Contribution or activity summaries only if supported.
5. Shared transaction list.
6. Pending approvals if supported.
7. Invitation and member management.

### Rules
- Preserve owner/member roles and permission boundaries.
- Do not invent equal contribution assumptions.
- Clearly identify who created each transaction.
- Show approval states accurately.
- Never expose private wallet data to unauthorized members.

## 8. Additional discovered screens

The agent must create specifications for every discovered screen not covered above, including but not limited to:
- Authentication and account recovery.
- Onboarding.
- Profile and preferences.
- Category management.
- Reports and exports.
- Notification center.
- Wallet and budget detail/create/edit.
- Transaction detail/create/edit.
- Shared household setup/invitation/member management.
- Search/filter screens.
- Confirmation dialogs and bottom sheets.
- Print/export layouts.

Only include a screen as an existing feature when verified in the codebase.

## 9. Required page spec template

For each screen, use:

### [SCREEN_ID] — [Screen name]
- Route/entry:
- User goal:
- Access/roles:
- Primary information:
- Primary action:
- Secondary actions:
- Data/API dependencies:
- Business rules to preserve:
- Loading state:
- Empty state:
- Error state:
- Success state:
- Disabled/permission state:
- Mobile behavior:
- Tablet behavior:
- Desktop behavior:
- Light mode:
- Dark mode:
- Accessibility:
- Acceptance tests:
- Dependencies:
- Open questions:
