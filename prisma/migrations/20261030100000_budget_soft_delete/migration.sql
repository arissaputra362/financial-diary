ALTER TABLE "household_budget"
ADD COLUMN "deleted_at" TIMESTAMPTZ;

ALTER TABLE "personal_budget"
ADD COLUMN "deleted_at" TIMESTAMPTZ;
