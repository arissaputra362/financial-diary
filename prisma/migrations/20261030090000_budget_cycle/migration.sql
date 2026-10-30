-- AC-F2-2d: per-scope budget cycle.
--
-- CALENDAR_MONTH keeps the existing behaviour and is the default. FIXED_DAY
-- anchors on day 1-28 so every month has that day. END_OF_MONTH anchors on the
-- last day of the calendar month.
--
-- A change is stored as a pending cycle plus its effective date (the start of
-- the next period), so the period already on screen is never rewritten.

CREATE TYPE "BudgetCycleMode" AS ENUM ('CALENDAR_MONTH', 'FIXED_DAY', 'END_OF_MONTH');

ALTER TABLE "household"
ADD COLUMN "budget_cycle_mode" "BudgetCycleMode" NOT NULL DEFAULT 'CALENDAR_MONTH',
ADD COLUMN "budget_cycle_day" INTEGER,
ADD COLUMN "budget_cycle_pending_mode" "BudgetCycleMode",
ADD COLUMN "budget_cycle_pending_day" INTEGER,
ADD COLUMN "budget_cycle_pending_effective_from" DATE;

ALTER TABLE "user"
ADD COLUMN "personal_budget_cycle_mode" "BudgetCycleMode" NOT NULL DEFAULT 'CALENDAR_MONTH',
ADD COLUMN "personal_budget_cycle_day" INTEGER,
ADD COLUMN "personal_budget_cycle_pending_mode" "BudgetCycleMode",
ADD COLUMN "personal_budget_cycle_pending_day" INTEGER,
ADD COLUMN "personal_budget_cycle_pending_effective_from" DATE;

ALTER TABLE "household"
ADD CONSTRAINT "household_budget_cycle_day_check"
CHECK (
  ("budget_cycle_mode" = 'FIXED_DAY' AND "budget_cycle_day" BETWEEN 1 AND 28)
  OR ("budget_cycle_mode" <> 'FIXED_DAY' AND "budget_cycle_day" IS NULL)
);

ALTER TABLE "household"
ADD CONSTRAINT "household_budget_cycle_pending_check"
CHECK (
  (
    "budget_cycle_pending_mode" IS NULL
    AND "budget_cycle_pending_day" IS NULL
    AND "budget_cycle_pending_effective_from" IS NULL
  )
  OR (
    "budget_cycle_pending_mode" = 'FIXED_DAY'
    AND "budget_cycle_pending_day" BETWEEN 1 AND 28
    AND "budget_cycle_pending_effective_from" IS NOT NULL
  )
  OR (
    "budget_cycle_pending_mode" IN ('CALENDAR_MONTH', 'END_OF_MONTH')
    AND "budget_cycle_pending_day" IS NULL
    AND "budget_cycle_pending_effective_from" IS NOT NULL
  )
);

ALTER TABLE "user"
ADD CONSTRAINT "user_personal_budget_cycle_day_check"
CHECK (
  ("personal_budget_cycle_mode" = 'FIXED_DAY' AND "personal_budget_cycle_day" BETWEEN 1 AND 28)
  OR ("personal_budget_cycle_mode" <> 'FIXED_DAY' AND "personal_budget_cycle_day" IS NULL)
);

ALTER TABLE "user"
ADD CONSTRAINT "user_personal_budget_cycle_pending_check"
CHECK (
  (
    "personal_budget_cycle_pending_mode" IS NULL
    AND "personal_budget_cycle_pending_day" IS NULL
    AND "personal_budget_cycle_pending_effective_from" IS NULL
  )
  OR (
    "personal_budget_cycle_pending_mode" = 'FIXED_DAY'
    AND "personal_budget_cycle_pending_day" BETWEEN 1 AND 28
    AND "personal_budget_cycle_pending_effective_from" IS NOT NULL
  )
  OR (
    "personal_budget_cycle_pending_mode" IN ('CALENDAR_MONTH', 'END_OF_MONTH')
    AND "personal_budget_cycle_pending_day" IS NULL
    AND "personal_budget_cycle_pending_effective_from" IS NOT NULL
  )
);
