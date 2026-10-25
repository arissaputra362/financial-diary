# Financial Diary System - MVP Requirements

## 1. Product Vision
A mobile-first, responsive web application designed for families, students, and laypeople to easily track their income, expenses, and savings targets. The app removes the friction of manual data entry by using AI to read receipts and bills, and provides actionable financial advice—all while being 100% free to run for the user's trial phase.

## 2. Target Audience
- **Primary:** Laypeople, families, and students.
- **Needs:** Simple, attractive, and understandable UI. No complex accounting jargon.

## 3. Key Feature Breakdown (MVP)

### 3.1. Dashboard & Overview
- **Current Balance:** Quick view of total available funds.
- **Recent Transactions:** A feed of the latest income and expenses.
- **Savings Progress:** Visual progress bars for active savings targets.

### 3.2. Transaction Management
- **Manual Entry:** Simple form for Income, Expense, or Transfer. Includes fields for Amount, Category, Date, and Notes.
- **AI-Powered OCR Entry:** Image upload for transfer receipts/bills. Integration with **Google Gemini Vision API** to extract details. User reviews the auto-filled form before saving.
- **Soft Delete (Crucial):** All transactions use a "Soft Delete" (e.g., `deleted_at` timestamp). If a user accidentally deletes a transaction, it is hidden from the UI but remains in the database and can be restored.

### 3.3. Saving Targets
- Create goals (e.g., "Holiday Trip") with a target amount and deadline.
- Soft Delete applies to targets as well.

### 3.4. AI Financial Advisor & Projections
- Uses **Google Gemini API** to analyze user data and provide personalized, conversational advice or projections.

### 3.5. User Management & Roles
- **Model: "One Big Ledger" (Invite-Only).**
- **Super Admin (Owner):** The person who creates the Household account. They must explicitly invite or approve registered accounts to join the family ledger. Random sign-ups cannot access the data.
- **Equal Access:** Once approved, all family members can add expenses, upload receipts, and view the main dashboard. Accidental deletions are protected by the Soft Delete feature.
- **Security & Expiration:** Implements secure JWT session tokens with strict expiration dates for security. (This architecture also easily supports adding account-level "trial expiration" dates if the app scales to a SaaS model later).

## 4. Technical Architecture (Zero-Cost MVP)

The concrete T-001 decisions and shared contracts are maintained in [docs/architecture-decisions.md](architecture-decisions.md). Where this section named alternatives, the ADR is the selected MVP contract and takes precedence for implementation.

To ensure the MVP costs $0 to run while remaining highly secure:
- **Frontend/Backend:** Next.js (React) - easily hosted for free on Vercel. Mobile-first UI utilizing Tailwind CSS.
- **Database:** **PostgreSQL via Neon.tech** (Serverless, highly secure, excellent free tier).
- **ORM:** Prisma ORM with PostgreSQL migrations and a generated TypeScript client.
- **AI / OCR:** Google Gemini Developer API (Generous free tier up to 15 RPM).

The selected MVP runtime is Next.js `16.3.6` App Router on Vercel with Neon PostgreSQL. Authentication uses a short-lived `jose`-signed JWT cookie backed by a revocable database session. Gemini uses `gemini-2.5-flash` with server-side JSON structured output, subject to a pre-implementation availability check in the deployment's Google project. Advisor insights are persisted only as bounded cache records; invite codes are single-use, hashed, and expire after seven days.
