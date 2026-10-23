-- T-012 (AC-F3-13): explicit per-receipt OCR attempt order.
--
-- Additive only. Existing jobs are backfilled deterministically by
-- (created_at, id) so receipts with historical multiple jobs receive 1..n
-- without losing rows. The column becomes NOT NULL only after the backfill.
-- The legacy receipt_id index is kept; the composite index already serves it.

ALTER TABLE "ocr_job" ADD COLUMN "attempt" INTEGER;

WITH ranked AS (
  SELECT "id",
         ROW_NUMBER() OVER (
           PARTITION BY "receipt_id"
           ORDER BY "created_at", "id"
         ) AS rn
  FROM "ocr_job"
)
UPDATE "ocr_job" AS j
SET "attempt" = ranked.rn
FROM ranked
WHERE j."id" = ranked."id";

ALTER TABLE "ocr_job" ALTER COLUMN "attempt" SET DEFAULT 1;
ALTER TABLE "ocr_job" ALTER COLUMN "attempt" SET NOT NULL;

CREATE UNIQUE INDEX "ocr_job_receipt_id_attempt_key"
  ON "ocr_job" ("receipt_id", "attempt");

CREATE INDEX "ocr_job_receipt_id_attempt_idx"
  ON "ocr_job" ("receipt_id", "attempt" DESC);
