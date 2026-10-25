/*
  Composition root and per-request authentication context (ADR-006, ADR-002).

  Route handlers depend on this module for `createServices` and
  `authenticatedRequest`; they import transport helpers from `./http` and cookie
  helpers from `./session`. Service/family authorization is enforced here and in
  the service layer.
*/

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { accessDeniedForStatus, unauthorized } from "./errors";
import { createAuthRepositories } from "./repositories/auth";
import {
  createBudgetRepository,
  createGoalRepository,
  createLedgerRepositories,
  createPersonalBudgetRepository,
  createPlanningRepositories,
  type LedgerRepositories,
  type PlanningRepositories,
} from "./repositories/ledger";
import { createReportRepository } from "./repositories/reports";
import type { Db } from "./repositories/types";
import { SESSION_COOKIE, verifySession } from "./session";
import { AuthService, type AuthRepositories, type AuthStateDTO } from "./services/auth";
import { AdvisorService } from "./services/advisor";
import { BudgetService } from "./services/budget";
import { DashboardService } from "./services/dashboard";
import { FamilyService } from "./services/family";
import { IdempotencyService } from "./services/idempotency";
import { GoalService } from "./services/goal";
import { InstitutionService } from "./services/institution";
import { OcrService } from "./services/ocr";
import { createSharpImageNormalizer } from "./services/image-normalization";
import { PeriodService } from "./services/period";
import { ReportService } from "./services/report";
import { TransactionService } from "./services/transaction";
import { WalletService } from "./services/wallet";
import type { LedgerTransaction, PlanningTransaction } from "./services/types";
import { createVercelBlobStore } from "./providers/blob";
import { createGeminiOcrProvider } from "./providers/ocr";
import { createGeminiAdvisorProvider } from "./providers/advisor";

export type Services = {
  auth: AuthService;
  family: FamilyService;
  transactions: TransactionService;
  wallets: WalletService;
  institutions: InstitutionService;
  ocr: OcrService;
  dashboard: DashboardService;
  reports: ReportService;
  budget: BudgetService;
  goals: GoalService;
  advisor: AdvisorService;
};

/*
  Ledger mutations run through one transaction. The OCR path performs a blob
  upload + model call inside it, so the timeout is raised above Prisma's 5s
  default to cover the 8-10s model budget (dev plan T-006 Keputusan Teknis).
*/
function createLedgerTransaction(): LedgerTransaction {
  return <T,>(fn: (repos: LedgerRepositories) => Promise<T>): Promise<T> =>
    prisma.$transaction((tx) => fn(createLedgerRepositories(tx as unknown as Db)), {
      timeout: 20_000,
      maxWait: 5_000,
    });
}

/*
  Goals/advisor services reuse the same budget rules: the advisor runs a model
  call inside the claim transaction (OCR precedent), so the timeout matches.
*/
function createPlanningTransaction(): PlanningTransaction {
  return <T,>(fn: (repos: PlanningRepositories) => Promise<T>): Promise<T> =>
    prisma.$transaction((tx) => fn(createPlanningRepositories(tx as unknown as Db)), {
      timeout: 20_000,
      maxWait: 5_000,
    });
}

export function createServices(): Services {
  const repos = createAuthRepositories(prisma);

  /*
    Owner bootstrap, invite redeem, and membership transitions each run in one
    interactive transaction (dev plan §Database & Model). The transaction gets
    its own repository bundle bound to the tx client so all writes commit or
    roll back together.
  */
  const transaction = <T>(fn: (repos: AuthRepositories) => Promise<T>): Promise<T> =>
    prisma.$transaction((tx) => fn(createAuthRepositories(tx as unknown as Db)));

  const ledgerTransaction = createLedgerTransaction();
  const ledgerRepos = createLedgerRepositories(prisma);
  const idempotency = new IdempotencyService(ledgerTransaction);

  const planningTransaction = createPlanningTransaction();
  const planningRepos = createPlanningRepositories(prisma);

  /*
    Dashboard/budget reads share one PeriodService so the budget key and the
    spending buckets always use the same Asia/Jakarta month boundaries (A-13).
  */
  const periods = new PeriodService();
  const budget = new BudgetService(
    createBudgetRepository(prisma),
    createPersonalBudgetRepository(prisma),
    ledgerRepos.transaction,
    periods,
  );
  const dashboard = new DashboardService(
    { transaction: ledgerRepos.transaction, wallet: ledgerRepos.wallet },
    createGoalRepository(prisma),
    budget,
    periods,
  );
  const reports = new ReportService(createReportRepository(prisma), periods);

  return {
    auth: new AuthService(repos, transaction),
    family: new FamilyService(repos),
    transactions: new TransactionService(ledgerRepos, ledgerTransaction, idempotency),
    wallets: new WalletService(ledgerRepos, ledgerTransaction, idempotency),
    institutions: new InstitutionService(ledgerRepos, ledgerTransaction, idempotency),
    ocr: new OcrService(
      ledgerRepos,
      ledgerTransaction,
      idempotency,
      createGeminiOcrProvider(),
      createVercelBlobStore(),
      createSharpImageNormalizer(),
    ),
    dashboard,
    reports,
    budget,
    goals: new GoalService(planningRepos, planningTransaction),
    advisor: new AdvisorService(planningRepos, planningTransaction, createGeminiAdvisorProvider()),
  };
}

export type AuthenticatedContext = {
  state: AuthStateDTO;
  userId: string;
  householdId: string;
  role: string;
  sessionId: string;
  auth: AuthService;
  family: FamilyService;
  transactions: TransactionService;
  wallets: WalletService;
  institutions: InstitutionService;
  ocr: OcrService;
  dashboard: DashboardService;
  reports: ReportService;
  budget: BudgetService;
  goals: GoalService;
  advisor: AdvisorService;
};

/**
 * Verifies the JWT, revalidates the session + membership from the DB, and
 * rejects non-approved members on protected routes with a typed 403.
 * The caller (route handler) reissues the sliding cookie via `setSessionCookie`.
 */
export async function authenticatedRequest(
  options: { approvedOnly?: boolean } = {},
): Promise<AuthenticatedContext> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw unauthorized();

  const claims = await verifySession(token);
  const services = createServices();
  const revalidated = await services.auth.revalidate(claims.sid);

  if (options.approvedOnly) {
    const denial = accessDeniedForStatus(revalidated.state.status);
    if (denial) throw denial;
  }

  return {
    state: revalidated.state,
    userId: revalidated.userId,
    householdId: revalidated.householdId ?? "",
    role: revalidated.role,
    sessionId: revalidated.sessionId,
    auth: services.auth,
    family: services.family,
    transactions: services.transactions,
    wallets: services.wallets,
    institutions: services.institutions,
    ocr: services.ocr,
    dashboard: services.dashboard,
    reports: services.reports,
    budget: services.budget,
    goals: services.goals,
    advisor: services.advisor,
  };
}
