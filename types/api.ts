/*
  Shared API response types (camelCase DTOs, ADR-006). This module is pure types
  (no runtime import of server code) so both route handlers and client
  components can consume the same contract. Money fields retain the `Minor`
  suffix for API compatibility and are rupiah values with up to two decimals.
*/

export type TransactionType = "MONEY_IN" | "MONEY_OUT" | "TRANSFER";
export type TransactionSource = "MANUAL" | "OCR";

/* ── Wallets (T-009 / F6) ──────────────────────────────────────────── */

export type WalletScope = "PERSONAL" | "SHARING";

/* ── Institutions (T-011 / F6 extension) ───────────────────────────── */

export type InstitutionKind = "OFFICIAL" | "CUSTOM";

export type BankInstitutionDTO = {
  id: string;
  name: string;
};

export type UserCustomInstitutionDTO = {
  id: string;
  name: string;
  archivedAt: string | null;
  createdAt: string;
};

export type InstitutionListDTO = {
  official: BankInstitutionDTO[];
  /** Caller's active private entries. Archived entries are separate. */
  custom: UserCustomInstitutionDTO[];
  /**
   * Caller's own archived private entries (A-54). Additive field so the picker
   * can offer the Aktif/Arsip view without exposing any other user's list.
   */
  archivedCustom: UserCustomInstitutionDTO[];
};

/**
 * Wallet metadata label. `id` is null for a custom entry viewed by someone who
 * does not own it (A-56); `name` remains visible on an authorized wallet.
 */
export type WalletInstitutionDTO = {
  kind: InstitutionKind;
  id: string | null;
  name: string;
};

/** Card-safe projection: never carries a private custom id. */
export type WalletInstitutionSummaryDTO = {
  kind: InstitutionKind;
  name: string;
};

export type WalletCreatorDTO = { id: string; displayName: string };

/** Lean wallet reference embedded in a transaction DTO (A-39/A-49). */
export type WalletRefDTO = { id: string; name: string; scope: WalletScope };

export type WalletDTO = {
  id: string;
  name: string;
  purpose: string | null;
  scope: WalletScope;
  openingBalanceMinor: number;
  balanceMinor: number;
  archivedAt: string | null;
  /** Exposed for SHARING only; PERSONAL never shows the creator (A-49). */
  createdBy: WalletCreatorDTO | null;
  canEdit: boolean;
  canArchive: boolean;
  canRestore: boolean;
  /** True once any transaction row references the wallet (A-42/C-21). */
  openingBalanceLocked: boolean;
  /** Optional bank/provider label; null = manual (T-011). */
  institution: WalletInstitutionDTO | null;
  createdAt: string;
  updatedAt: string;
};

export type WalletCardDTO = {
  id: string;
  name: string;
  purpose: string | null;
  scope: WalletScope;
  balanceMinor: number;
  archivedAt: string | null;
  canEdit: boolean;
  canArchive: boolean;
  canRestore: boolean;
  /** Card-safe label (no private custom id); null = manual. */
  institution: WalletInstitutionSummaryDTO | null;
};

export type WalletListDTO = {
  wallets: WalletDTO[];
};

export type TransactionDTO = {
  id: string;
  type: TransactionType;
  amountMinor: number;
  currencyCode: string;
  category: string | null;
  merchant: string | null;
  note: string | null;
  /** ISO 8601 UTC instant. */
  occurredAt: string;
  /** Null on a redacted cross-scope generic row (A-39); otherwise MANUAL/OCR. */
  source: TransactionSource | null;
  receiptId: string | null;
  transferGroupId: string | null;
  /** Wallet the row belongs to; null on a redacted cross-scope generic row (A-39). */
  wallet: WalletRefDTO | null;
  deletedAt: string | null;
  createdAt: string;
};

export type TransactionListDTO = {
  rows: TransactionDTO[];
  nextCursor: string | null;
};

/**
 * One calendar day of spending, bucketed in Asia/Jakarta (AC-F2-5). `date` is
 * `YYYY-MM-DD`; days with no spending are present with `amountMinor: 0`.
 */
export type SpendingDayDTO = {
  date: string;
  amountMinor: number;
};

/**
 * Current-month budget (AC-F2-2, AC-F2-2c). When no budget row exists, `isSet`
 * is false and the amount fields are null so the client shows "atur budget"
 * instead of a misleading Rp0. `spentMinor` excludes transfer legs (AC-F2-4).
 * `scope` identifies which independent budget this DTO describes; the two
 * scopes are never summed.
 */
export type MonthlyBudgetDTO = {
  periodStart: string;
  periodEnd: string;
  scope: "PERSONAL" | "SHARED";
  isSet: boolean;
  budgetMinor: number | null;
  spentMinor: number;
  remainingMinor: number | null;
  currencyCode: string;
};

/** Lean goal projection for the dashboard card (AC-F2-9). */
export type GoalSummaryDTO = {
  id: string;
  name: string;
  targetAmountMinor: number;
  savedAmountMinor: number;
  currencyCode: string;
  deadline: string | null;
  /** `min(100, saved / target * 100)`, capped at the DTO boundary. */
  progressPercent: number;
};

export type DashboardSpendingDTO = {
  periodStart: string;
  periodEnd: string;
  totalOutMinor: number;
  byDay: SpendingDayDTO[];
};

export type DashboardPeriodKey = "7D" | "30D" | "90D";

export type DashboardDTO = {
  /** Σ over SHARING wallets (active and archived) (A-44). */
  sharedBalanceMinor: number;
  /** Σ over the caller's PERSONAL wallets (A-44); never summed with shared. */
  personalBalanceMinor: number;
  currencyCode: string;
  /** Active wallets only, for the carousel (A-44/C-18). */
  wallets: WalletCardDTO[];
  /** SHARED budget, unchanged meaning. */
  monthlyBudget: MonthlyBudgetDTO;
  /** The caller's PERSONAL budget (T-015); never summed with `monthlyBudget`. */
  personalMonthlyBudget: MonthlyBudgetDTO;
  /** SHARED spending over SHARING wallets, unchanged meaning. */
  spending: DashboardSpendingDTO;
  /** The caller's PERSONAL spending (T-015); never summed with `spending`. */
  personalSpending: DashboardSpendingDTO;
  goals: GoalSummaryDTO[];
  recentActivity: TransactionDTO[];
};

/* ── Monthly report (feat-reporting, AC-F7-1..15) ───────────────────── */

export type ReportScopeDTO = "ALL" | "SHARED" | "PERSONAL";

export type ReportCategoryDTO = {
  /** Stored category label; never invented by the client. */
  name: string;
  amountMinor: number;
};

export type ReportBreakdownDTO = {
  /** Server total; must equal the rendered subtotal. */
  totalMinor: number;
  /** At most four named categories, largest first. */
  categories: ReportCategoryDTO[];
  /** 0 when no uncategorized transaction exists. */
  uncategorizedMinor: number;
  /** Number of named categories outside the top four. */
  otherCategoryCount: number;
  /** Combined amount of those remaining named categories. */
  otherAmountMinor: number;
};

export type MonthlyReportDeltaDTO = {
  /** Null when the previous month had no data for the same scope + wallet. */
  closingMinor: number | null;
  moneyInMinor: number | null;
  moneyOutMinor: number | null;
};

export type DailyBalanceDTO = {
  /** `YYYY-MM-DD` on the Asia/Jakarta calendar. */
  date: string;
  closingMinor: number;
};

export type MonthlyReportDTO = {
  month: string;
  periodStart: string;
  periodEnd: string;
  isCurrentMonth: boolean;
  scope: ReportScopeDTO;
  wallet: { id: string; name: string } | null;
  openingMinor: number;
  newWalletOpeningMinor: number;
  moneyInMinor: number;
  moneyOutMinor: number;
  /** Transfer legs entering wallets in this scope. */
  transferInMinor: number;
  /** Transfer legs leaving wallets in this scope. */
  transferOutMinor: number;
  transferNetMinor: number;
  closingMinor: number;
  /** Active rows in the period, including both transfer legs. */
  transactionCount: number;
  /** A new wallet has a transaction dated before the wallet was created. */
  hasBackdatedNewWallet: boolean;
  delta: MonthlyReportDeltaDTO;
  income: ReportBreakdownDTO;
  expense: ReportBreakdownDTO;
  /** One point per calendar day, including days without transactions. */
  dailyBalances: DailyBalanceDTO[];
};

export type OcrJobStatus = "PROCESSING" | "SUCCEEDED" | "FAILED";

export type OcrErrorCode =
  | "OCR_TIMEOUT"
  | "OCR_RATE_LIMITED"
  | "OCR_INVALID_OUTPUT"
  | "OCR_MODEL_UNAVAILABLE";

/**
 * T-012 retry control errors (envelope `error.code`, HTTP 409). These are not
 * `OcrJob.errorCode` values: a failed scan keeps the model namespace above.
 */
export type OcrRetryControlErrorCode =
  | "OCR_NOT_RETRYABLE"
  | "OCR_RETRY_IN_PROGRESS"
  | "OCR_IMAGE_UNAVAILABLE";

export type OcrMissingField =
  | "merchant"
  | "totalAmountMinor"
  | "occurredAt"
  | "category";

/** Editable draft returned for review; never auto-saved (AC-F3-4). */
export type OcrDraftDTO = {
  merchant: string | null;
  totalAmountMinor: number | null;
  currencyCode: "IDR" | null;
  /** Date-only `YYYY-MM-DD`; converted to 12:00 Asia/Jakarta on save (D-14). */
  occurredAt: string | null;
  category: string | null;
  taxAmountMinor: number | null;
  confidence: number;
  missingFields: OcrMissingField[];
  notes: string | null;
};

export type OcrJobDTO = {
  id: string;
  /** Receipt to reference when the user confirms the draft via POST /api/transactions. */
  receiptId: string;
  status: OcrJobStatus;
  errorCode: OcrErrorCode | null;
  model: string | null;
  confidence: number | null;
  /**
   * Server-computed image-share flag (C-28/A-46). True when any linked
   * transaction (including a soft-deleted link) points to a SHARING wallet.
   * Returned to the uploader only; drives the disclosure variant 2.
   */
  receiptSharedWithHousehold: boolean;
};

export type OcrUploadResultDTO = {
  job: OcrJobDTO;
  draft: OcrDraftDTO | null;
};

/* ── Savings goals (T-007, feat-goals-advisor) ─────────────────────── */

export type GoalDTO = {
  id: string;
  name: string;
  targetAmountMinor: number;
  savedAmountMinor: number;
  currencyCode: string;
  /** Date-only `YYYY-MM-DD`; a past date renders the late badge (AC-F4-1). */
  deadline: string | null;
  /** `min(100, saved / target * 100)`, capped at the DTO boundary (AC-F4-2). */
  progressPercent: number;
  createdByUserId: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GoalListDTO = {
  rows: GoalDTO[];
  nextCursor: string | null;
};

/* ── Advisor (T-007, feat-goals-advisor, ADR-003) ──────────────────── */

export type AdvisorActionType = "VIEW_GOAL" | "REVIEW_SPENDING" | "NONE";

export type AdvisorActionDTO = {
  label: string;
  type: AdvisorActionType;
};

export type AdvisorInsightDTO = {
  headline: string;
  summary: string;
  actions: AdvisorActionDTO[];
  limitations: string | null;
  sourcePeriod: { start: string; end: string };
  /** Stored for traceability; the UI never renders the model name (A-30). */
  model: string;
  /** ISO 8601 UTC instant. */
  generatedAt: string;
  expiresAt: string;
};

export type AdvisorDelivery = "FRESH" | "CACHE";

export type AdvisorInsightResponseDTO = {
  insight: AdvisorInsightDTO;
  delivery: AdvisorDelivery;
};
