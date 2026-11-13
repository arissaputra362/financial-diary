# FinDiary — Information Architecture & Route Discovery

## 1. Purpose

This is a proposed grouping model, not a replacement for the existing route structure. The agent must discover actual routes and map them into an understandable information architecture.

## 2. Known navigation direction

Possible primary mobile navigation:
- Home
- Budget
- Central quick-add action
- Aktivitas
- Lainnya

“Lainnya” may expose secondary destinations such as Scan Struk, Aset Emas, Wallet, Keuangan Bersama, reports, profile, and settings. Verify current usage and route structure before adopting this exact arrangement.

The central quick-add action must expose real existing actions only.

## 3. Desktop navigation

A responsive sidebar or compact navigation may be appropriate. Preserve access to every discovered destination. Avoid making desktop merely a stretched mobile screen.

## 4. Mandatory route discovery

Search and inspect:
- Filesystem-based routes.
- Router configuration.
- Dynamic and nested route segments.
- Layouts and route groups.
- Middleware-protected routes.
- Links and navigation arrays.
- Buttons that navigate programmatically.
- Conditional navigation based on user role, membership, or data state.
- Deep-linked detail pages.
- Modal routes or intercepted routes if the framework supports them.
- Legacy routes still reachable from links or bookmarks.

## 5. Screens that must be checked even if not in navigation

- Login, registration, logout, password reset, verification.
- Onboarding and first-run setup.
- Profile and account management.
- User preferences and theme settings.
- Notifications.
- Wallet create/edit/detail/archive flows.
- Category create/edit flows.
- Budget create/edit/detail flows.
- Transaction create/edit/detail flows.
- Receipt scan capture, review, correction, and confirmation.
- Gold asset add/edit/detail/history flows.
- Shared household creation, invitation, join, member roles, approval, and activity.
- Reports, exports, and print views.
- Search, filters, pagination, and date selection.
- Confirmation dialogs and destructive actions.
- Empty, loading, error, permission-denied, and not-found screens.

This list is a discovery checklist, not an assertion that every item exists.

## 6. Navigation rules

- Show current location clearly.
- Keep the most frequent actions easy to reach.
- Avoid deep navigation for frequent transaction capture.
- Preserve back navigation and deep-link behavior.
- Use labels and icons together where space allows.
- Do not hide a critical feature solely to simplify the menu.
- Use clear personal/shared context indicators.

## 7. Required inventory format

For every discovered screen, record:

| Field | Description |
|---|---|
| Screen ID | Stable identifier such as `ACTIVITY_DETAIL` |
| Name | User-facing page name |
| Route/entry | Exact path or trigger |
| Parent | Layout/navigation group |
| Access | Authentication and role conditions |
| Purpose | Main user job |
| Actions | All visible and secondary actions |
| Data | API, database, state dependencies |
| States | Loading, empty, error, success, disabled |
| Responsive | Mobile/tablet/desktop behavior |
| Theme | Light/dark coverage |
| Test | Existing or proposed verification |
| Status | Not audited / audited / designed / implemented / verified |

## 8. Discovery completeness

Do not report “all pages discovered” until the route list has been cross-checked against:
- Route source files.
- Navigation references.
- Internal links.
- Programmatic navigation calls.
- Role/permission branches.
- Test references and page-level components.

Record unresolved routes and unreachable code separately.
