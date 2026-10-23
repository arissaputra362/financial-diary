-- T-015 (AC-F2-2c): personal monthly budget per user.
--
-- Additive only: a new table, no existing table is altered. Access is always
-- resolved from the session user; there is no owner override and no
-- client-supplied user_id.

CREATE TABLE "personal_budget" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'IDR',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_budget_pkey" PRIMARY KEY ("id")
);

-- One row per user per month (ERD §3.12b).
CREATE UNIQUE INDEX "personal_budget_household_id_user_id_period_start_key"
    ON "personal_budget"("household_id", "user_id", "period_start");

-- Lookup index for the session-user read.
CREATE INDEX "personal_budget_user_id_period_start_idx"
    ON "personal_budget"("user_id", "period_start");

ALTER TABLE "personal_budget" ADD CONSTRAINT "personal_budget_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "personal_budget" ADD CONSTRAINT "personal_budget_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "personal_budget" ADD CONSTRAINT "personal_budget_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ERD §3.12b: amount must be positive, mirroring household_budget_amount_positive.
ALTER TABLE "personal_budget" ADD CONSTRAINT "personal_budget_amount_positive"
    CHECK ("amount_minor" > 0);
