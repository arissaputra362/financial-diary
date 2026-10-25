# Financial Diary

A web application for tracking and understanding personal and family finances. Users can manage transactions, wallets, budgets, savings goals, and personal or shared gold assets. Monthly reports provide balance summaries and transaction details that can be printed or saved as PDF.

## Features

- **Authentication:** Email and password authentication with revocable `httpOnly` JWT sessions backed by database session records.
- **Family households:** Household management, member invitations, owner approval, and owner/member roles.
- **Transactions:** Income, expenses, and transfers between wallets. Amounts support up to two decimal places and are stored as PostgreSQL `NUMERIC` values.
- **Wallets:** Personal and shared wallets, wallet archiving, official bank institutions, and user-defined institutions.
- **Budgets:** Monthly personal and family budgets.
- **Savings goals:** Progress tracking and AI advisor insights.
- **Receipt scanning:** Gemini-powered scanning of transaction receipts and gold certificates or receipts. Scanned results are saved as drafts for review before submission. Large camera images are compressed in the browser before upload.
- **Gold assets:** Bullion and jewelry tracking, estimated valuations, and market prices retrieved from providers and stored as daily database snapshots.
- **Monthly reports:** Scope and wallet filters, with print-to-PDF support.
- **Trash and recovery:** Soft-deleted data can be restored where supported.
- **Progressive Web App (PWA):** Installable on supported devices.

For the latest implementation status and known integration limitations, see [`docs/current-state.md`](./docs/current-state.md). Product specifications and architectural decision records are available in [`docs/`](./docs/).

## Tech Stack

- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS v4
- Prisma 7 with PostgreSQL; supports Neon or a local PostgreSQL instance
- Bun 1.4.2
- Gemini API for image scanning and the AI advisor (optional)
- Vercel Blob for receipt image storage (required for receipt OCR)
- Vitest and Playwright

## Getting Started

### Prerequisites

- Bun 1.4.2
- A Node.js version compatible with Next.js
- PostgreSQL 15+ locally or a Neon database

### Installation

Install the dependencies:

```bash
bun install
```

Copy `.env.example` to `.env` or `.env.local`, then configure at least `DATABASE_URL` and `AUTH_SECRET`.

Configure `GEMINI_API_KEY` and `BLOB_READ_WRITE_TOKEN` if you want to use the AI and image-scanning features. Gold price variables can retain their default values unless you use a different provider.

Run the following commands:

```bash
bunx prisma generate
bunx prisma migrate deploy
bun run seed:institutions
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For detailed local database setup instructions, see [`docs/dev-setup-local.md`](./docs/dev-setup-local.md).

## Available Commands

```bash
bun run dev               # Start the development server
bun run lint              # Run ESLint
bun run test               # Run unit tests
bun run test:integration   # Run integration tests
bun run test:e2e           # Run Playwright end-to-end tests
bun run build              # Generate Prisma Client and build Next.js
bun run start              # Start the local production server
```

Playwright uses port `3010`. Integration tests require a separate test database and test environment.

The build command does not run database migrations automatically.

## Project Structure

```text
app/          Pages, API Route Handlers, layouts, and PWA manifest
components/   Feature-specific UI components
lib/server/   Services, repositories, authentication, and server providers
lib/          Utilities and database connections
prisma/       Database schema, migrations, and seed scripts
types/        DTOs and shared types
docs/         Setup guides, specifications, architecture, and QA documentation
e2e/          Playwright browser test scenarios
```

## Deployment

The current deployment target is Vercel with PostgreSQL (Neon supported). Gemini and Vercel Blob are optional services depending on the features being used.

Configure `DATABASE_URL`, `AUTH_SECRET`, and the required provider credentials through your deployment environment.

Run `prisma migrate deploy` through your operational workflow or CI pipeline before using a new database schema. Database migrations are not executed automatically during the build.

For PWA/APK guidance, see [`docs/BUILD-APK-PWA.md`](./docs/BUILD-APK-PWA.md).

For deployment architecture decisions, see [`docs/adr/ADR-007-free-tier-deployment.md`](./docs/adr/ADR-007-free-tier-deployment.md).

## Documentation

- [`docs/current-state.md`](./docs/current-state.md) — Current feature implementation and integration limitations.
- [`docs/PRD.md`](./docs/PRD.md) and [`docs/spec/`](./docs/spec/) — Product requirements and specifications. These documents may describe planned features that are not yet implemented.
- [`docs/adr/`](./docs/adr/) — Architecture Decision Records.
- [`docs/erd/`](./docs/erd/) — Data models and workflow diagrams.
- [`docs/qa/`](./docs/qa/) — QA matrices, fixtures, and historical QA reports.

## Security

- Never commit `.env` files, API keys, authentication secrets, or Blob access tokens.
- Keep secrets server-side and never expose them through `NEXT_PUBLIC_` environment variables.
- Use HTTPS in production.
- Never store passwords in browser storage.
- Use synthetic data for public demonstrations and avoid publishing personal financial information.

## License

**All Rights Reserved.**

Unless otherwise stated in a separate written agreement, this project is provided for viewing and evaluation purposes only. No license is granted to use, copy, modify, distribute, sublicense, or create derivative works from this project's source code.

For permission to use or redistribute the code, please contact the repository owner.

Third-party dependencies remain subject to their respective licenses.
