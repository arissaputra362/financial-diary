-- T-011 provenance correction (A-53): the OJK workbook states only the month
-- ("Juni 2026"), so a calendar day must not be invented.
--
-- The earlier T-011 migration is already applied and is left untouched. This
-- migration converts its `source_as_of` DATE into a month-level `source_period`
-- string without losing any stored value: every existing date maps to its
-- `YYYY-MM` period. Actual import time stays in the existing `created_at` /
-- `updated_at` timestamptz columns; `source_period` is the publication period.

ALTER TABLE "bank_institution" ADD COLUMN "source_period" VARCHAR(7);

UPDATE "bank_institution"
SET "source_period" = to_char("source_as_of", 'YYYY-MM');

ALTER TABLE "bank_institution" ALTER COLUMN "source_period" SET NOT NULL;

ALTER TABLE "bank_institution" DROP COLUMN "source_as_of";

ALTER TABLE "bank_institution" ADD CONSTRAINT "bank_institution_source_period_format"
    CHECK ("source_period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

COMMENT ON COLUMN "bank_institution"."source_period" IS
    'Publication period from the source in YYYY-MM form; no inferred day.';
