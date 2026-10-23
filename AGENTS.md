<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Financial Planner — Agent Guide

This document is the single source of truth for all AI coding agents (Antigravity, Claude, Codex, Copilot, Cursor) working on this project. Read it fully before writing any code.

## 1. Project Overview

**Financial Planner** is a mobile-first, responsive web application for families, students, and laypeople to track income, expenses, and savings targets. The app uses Google Gemini AI to read receipt photos/screenshots and extract transaction data, and provides conversational AI financial advice.

**Target users:** Non-technical family members. The UI must be intuitive for people with no accounting background.

Full product requirements (archived): `docs/archive/requirements-2026-09-30.md` · Canonical PRD: `docs/PRD.md`

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router) | Use `app/` directory only. No Pages Router. |
| Language | **TypeScript** | Strict mode. No `any`. |
| Styling | **Tailwind CSS v4** | Using `@import "tailwindcss"` in `globals.css`. No `tailwind.config.js`. |
| Package manager | **Bun** | Use `bun add`, not `npm install` or `yarn add`. |
| Database | **PostgreSQL on Neon.tech** | Serverless Postgres. Schema in `prisma/schema.prisma` (see `docs/erd/erd-database-schema.md`). |
| ORM | **Prisma 7.10** + `@prisma/adapter-neon` | Driver-adapter mode; `prisma.config.ts`; migrations via `prisma migrate` (direct URL). See `docs/adr/ADR-001-prisma-neon-adapter.md`. |
| Auth | **Custom `jose` JWT + DB session** | Invite-only. JWT claims `{sub, sid, token_version, iat, exp}` (no `role`); sliding session; session row revocable. See `docs/adr/ADR-002-auth-jwt-session.md`. |
| AI / OCR | **Google Gemini API** (`@google/genai`) | `gemini-3.5-flash-lite` via `GEMINI_MODEL`; structured output, fail-closed. Free tier. Used for receipt OCR and financial advice. |
| Storage | **Vercel Blob** (`@vercel/blob`) | Receipt images, ≤4MB, server-proxied. See `docs/adr/ADR-008-receipt-storage-blob.md`. |
| Deployment | **Vercel** (free tier) | Deploy from `main` branch. See `docs/adr/ADR-007-free-tier-deployment.md`. |

## 3. Project Structure

```
financial-planner-project/
├── app/                    # Next.js App Router pages and layouts
│   ├── (auth)/             # Auth routes: /login, /signup, /waiting-for-approval
│   ├── (dashboard)/        # Protected routes: /home, /budget, /transactions, /family, /profile
│   ├── api/                # API Route Handlers
│   │   ├── auth/           # Auth endpoints
│   │   ├── transactions/   # CRUD + soft delete endpoints
│   │   ├── goals/          # Savings goal endpoints
│   │   ├── budget/         # Household budget endpoints
│   │   ├── ocr/            # Gemini OCR endpoints
│   │   └── advisor/        # Gemini advisor endpoints
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx            # Landing/redirect page
├── components/             # Shared React components
│   ├── ui/                 # Base UI primitives (Button, Card, Input, etc.)
│   ├── layout/             # Navbar, Sidebar, Shell
│   ├── dashboard/          # Home/dashboard-specific components
│   ├── transactions/       # Transaction form, OCR upload, list
│   └── goals/              # Savings goal cards and progress
├── lib/                    # Shared utilities
│   ├── server/             # Server-only code (never imported by client components)
│   │   ├── services/       # Business rules, soft delete, idempotency, audit events
│   │   ├── repositories/   # Prisma access; MUST receive householdId scope
│   │   └── errors.ts       # Typed errors + HTTP mapping
│   ├── db.ts               # Prisma client (Neon adapter)
│   ├── gemini.ts           # Gemini API client wrapper
│   └── utils.ts            # General helpers (cn, formatCurrency, etc.)
├── prisma/
│   └── schema.prisma       # Prisma schema (all tables) + raw SQL appendix in migrations
├── hooks/                  # Custom React hooks
├── types/                  # Shared TypeScript types (DTO camelCase)
├── docs/                    # Document Driven Development docs
│   ├── PRD.md               # Canonical product requirements (PM-owned)
│   ├── spec/                # Feature specs (PM-owned): feat-*.md
│   ├── dev-plan/            # Dev plans (dev-owned, living documents)
│   ├── adr/                 # Architecture decision records (ADR-001..008)
│   ├── qa/                  # QA verification reports (QA-owned)
│   ├── erd/                 # ERD + flowcharts
│   ├── design/              # Design system + wireframes + mockup
│   ├── templates/           # DDD document templates
│   └── archive/             # Superseded docs (requirements-2026-09-30.md)
├── public/
├── AGENTS.md               # This file
├── CLAUDE.md               # Claude routing file
└── package.json
```

Tickets and agent communication live OUTSIDE the repo (not living documentation):
- `../tickets/` — task tickets (T-001..T-008), work orders (WO-*), and the control document `TASK-PLAN.md`. Work-order detail, operational.
- `../agent-comms/` — notices, minutes, delegation prompts between agents.

Only PRD, Spec, and Dev Plan are living documentation inside the repo.
Control/status documents (TASK-PLAN, tickets) live outside; see `../tickets/TASK-PLAN.md`.

## 4. Design System

The UI follows a **Bento Box dashboard** style with the PM-approved blue-white-green tokens from `docs/design/01-design-system-tokens.md` (2026-10-20):

| Token | Value | Usage |
|---|---|---|
| **Font** | Plus Jakarta Sans (single family) | Friendly, readable. Money uses `tabular-nums`; no second family. |
| **Canvas** | `#F1F5FA` | App page background. |
| **Card surface** | `#FFFFFF` | Default card and sheet surface. |
| **Structural navy** | `#14273F` | Floating nav, Finny panel, Dompet Bersama card, toast. |
| **Brand blue** | `#1D4F87` | Money context, chart bars, selected emphasis, Dompet Pribadi card. |
| **Blue tint / wash** | `#DCEBFA` / `#EFF4FA` | Bersama accents and light wells. |
| **Brand green** | `#166534` | Primary actions, money in, target progress, wallet chip. |
| **Mint well** | `#DCFCE7` | Savings target surface and success blocks. |
| **Text** | `#17304F` / `#46597A` / `#5C7191` / `#5C6C86` | Primary, secondary, muted helper, placeholder. |
| **Borders** | card `#D8E2EE`, input `#C9D6E4`, divider `#EAEEF4` | Hairlines and form boundaries. |
| **Status** | amber text `#8A5A00` on `#FDF3D7`; danger `#B91C1C` on `#FDECEC` | Warnings and errors only, never decoration. |
| **Radius: cards** | `rounded-3xl` | Bento cards, sheets, modals. |
| **Radius: buttons** | `rounded-full` | Pill-shaped controls. |
| **Radius: inputs** | `rounded-2xl` | Form fields. |

Use the token pairs measured in design 01 for WCAG AA. Retired warm peach/lavender/coral/violet-fuchsia colors must not be reintroduced. Wallet cards use the generic ATM treatment from `docs/design/06-wallets.md` with no card numbers, expiry, CVV, real bank logos, or bank-integration claims.

**Antislop dials:** ENERGY 2 / RHYTHM 2 / MOTION 1.

Full design specs: `docs/design/01-design-system-tokens.md`
Wireframes: `docs/design/02-bento-dashboard-wireframes.md`
OCR flow: `docs/design/03-transaction-and-ocr-flow.md`
Auth flow: `docs/design/04-auth-and-household-admin.md`
AI advisor: `docs/design/05-ai-advisor-panel.md`
Wallets: `docs/design/06-wallets.md`

## 5. Core Feature Rules

### Soft Delete
- **Never** use `DELETE` in the database for user data (transactions, savings targets).
- Every deletable table has a `deleted_at TIMESTAMPTZ` column (null = active).
- All queries must filter `WHERE deleted_at IS NULL` by default.
- Provide a 5-second undo toast after a user deletes an item. Undo is a client-triggered restore call — the server commits the soft delete immediately (no deferred commit).

### Signup & Invite Auth
- Signup without an invite is allowed ONLY to create a NEW household (the signer becomes its Owner). Joining an EXISTING household requires an owner-issued invite plus owner approval (amended 2026-09-30; supersedes "public registration disabled").
- After signing up via invite link, accounts are in `PENDING` state until the owner approves.
- Show a friendly "Waiting Room" screen for pending accounts.

### Gemini OCR Flow
- User uploads/snaps an image (receipt, transfer proof, invoice).
- Send to `POST /api/ocr/receipts` which calls Gemini Vision API.
- Return extracted fields: `amount`, `date`, `merchant`, `category` (with confidence).
- **Always show a review form** before saving. Never auto-save without user confirmation.

### Data Format
- All monetary amounts stored as `INTEGER` minor units. **IDR scale = 0: 1 minor unit = 1 rupiah** (decided; do NOT divide by 100).
- Currency: IDR (Indonesian Rupiah) as the default.
- Dates stored as `TIMESTAMPTZ` in UTC.

## 6. Code Conventions

- **Server Components by default.** Add `"use client"` only when strictly needed (event handlers, hooks, browser APIs).
- **No `any`.** Use `unknown` with type guards, or define proper types in `types/`.
- **`cn()` for class merging.** Use `clsx` + `tailwind-merge` via `lib/utils.ts`.
- **Colocation.** Keep component-specific types, hooks, and helpers in the same folder as the component.
- **API Routes return typed responses.** Define response types in `types/api.ts`.
- **Environment variables** accessed only via `lib/env.ts` (validated with Zod). Never import `process.env` directly in components.

## 7. Antislop Rules (Mandatory)

All UI work MUST pass the antislop Delivery Gate before being committed. Key rules:

- **No fake interactive elements.** Every button, link, and form must have real behavior or be removed.
- **No fabricated data.** No fake statistics, fake testimonials, placeholder numbers that look real.
- **WCAG AA contrast** required on all text (4.5:1 normal, 3:1 large).
- **Keyboard navigable.** Tab/Enter/Escape must work on all interactive elements.
- **All 3 states required** for every data view: empty state, loading state, error state.
- **No em dash (`—`) in UI text.** Use comma, colon, or parentheses instead.
- **No generic CTAs.** "Get Started", "Learn More", "Try Now" are forbidden. Use specific action labels.
- **No AI buzzwords.** "AI Powered", "Seamless", "Revolutionary", "Next Generation" are forbidden.
- **No dead navbar links.** Every nav item must point to a real, existing page.
- **Bento grid must be purposeful.** Card sizes must reflect content hierarchy, not be a mosaic default.

Full antislop rules (core): `C:\Users\Aris\.gemini\config\plugins\antislop\skills\antislop\SKILL.md`
UI-specific rules: `C:\Users\Aris\.gemini\config\plugins\antislop\skills\antislop-ui\SKILL.md`

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read the antislop core and then the skill for the task:
- UI / visual: `C:\Users\Aris\.gemini\config\plugins\antislop\skills\antislop-ui\SKILL.md`
- Copy & text: `C:\Users\Aris\.gemini\config\plugins\antislop\skills\antislop-copywriting\SKILL.md`
- People: `C:\Users\Aris\.gemini\config\plugins\antislop\skills\antislop-human\SKILL.md`
- Mobile / responsive: `C:\Users\Aris\.gemini\config\plugins\antislop\skills\antislop-layoutmobile\SKILL.md`
- Code comments: `C:\Users\Aris\.gemini\config\plugins\antislop\skills\antislop-code\SKILL.md`
Before starting UI work, antislop applies: DURING the work (Mode 1), not after.
<!-- antislop:end -->

## 8. Environment Variables

Required in `.env.local` (never commit this file):

```env
# Gemini API
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_MODEL_FALLBACKS=gemini-3.1-flash-lite

# Neon.tech PostgreSQL
DATABASE_URL=

# Auth (custom jose JWT + DB session)
AUTH_SECRET=

# Vercel Blob (receipt storage)
BLOB_READ_WRITE_TOKEN=
```

### Local Development with PostgreSQL

Untuk testing lokal dengan PostgreSQL lokal (bukan Neon cloud), lihat `docs/dev-setup-local.md`.

Quick start:
```bash
createdb financial_planner_test
cp .env.example .env.local
# Edit .env.local dengan DATABASE_URL lokal
bunx prisma migrate deploy
bun dev
```

**Catatan:**
- `lib/db.ts` memilih adapter dari `DATABASE_URL`: host `*.neon.tech` → `@prisma/adapter-neon`; selain itu (PostgreSQL lokal/self-hosted) → `@prisma/adapter-pg`. Karena itu `bun dev` bisa jalan di Neon maupun PostgreSQL lokal tanpa ganti file.
- `lib/server/testing/integration-db.ts` selalu memakai `@prisma/adapter-pg` untuk integration test (`bun run test:integration`).

## 9. Sprint Tickets

Tickets live OUTSIDE the repo at `../tickets/` (work-order detail, not living documentation, A-34):
- Task tickets: `../tickets/04-T-001-architecture-contracts.md` … `../tickets/11-T-008-qa-release.md`
- Work orders: `../tickets/WO-001-*.md` … `../tickets/WO-006-*.md`
- Legacy (archived): `../tickets/01-ui-ux-design.md` … `../tickets/03-backend-dev.md`

Status source of truth: `../tickets/TASK-PLAN.md` § Task Register (and § Work Order Register) — control document, lives outside the repo (A-34).

### 9.1 Document Driven Development (DDD)

Every feature follows the DDD workflow before any code is written:

- **Spec + approved Dev Plan required.** No implementation starts without a feature Spec (`docs/spec/feat-*.md`) and a Dev Plan approved by the PM.
- **Dev Plan is a living document.** The Progress Log and Keputusan Teknis (technical decisions) tables must be updated every coding session.
- **Behavior deviations update the Spec first.** If implementation must differ from the Spec, update the Spec (and get PM approval) before changing code.
- **QA verifies against Spec AC.** Acceptance criteria in the Spec are the QA test basis.
- **Design docs are designer-owned.** `docs/design/` is maintained by the UI/UX Designer. UI features require design sign-off before Dev Plan approval, and UI implementation must follow the approved design docs.
- **PM records release approval in the Dev Plan.** A feature is not released until the PM signs off in the Dev Plan.
- **Tickets and the control document TASK-PLAN.md live outside the repo** at `../tickets/` (A-34); only PRD, Spec, and Dev Plan are living documentation inside the repo.

## 10. Do Not

- Do NOT use the Pages Router (`pages/` directory).
- Do NOT use `npm` or `yarn`. Use `bun`.
- Do NOT commit `.env.local` or any secrets.
- Do NOT use `DELETE` SQL for user data (use soft delete).
- Do NOT auto-save transactions from OCR without user review.
- Do NOT create placeholder content that looks real (fake numbers, names, avatars).
- Do NOT ship UI without running the app and checking all interactive elements.
