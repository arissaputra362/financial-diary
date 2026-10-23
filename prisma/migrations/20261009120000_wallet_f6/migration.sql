-- T-009 / F6 — Multi-wallet Pribadi & Sharing (A-36..A-48).
--
-- Safe additive/idempotent rollout:
--   Step 1  create wallet + enum, add nullable transaction.wallet_id + indexes
--   Step 2  idempotent backfill (one default SHARING wallet per household,
--           system_key='legacy_default', opening 0, name "Dompet Keluarga"),
--           then attach every pre-wallet transaction row (trashed + transfer legs)
--   Step 3  verify (comments; enforced by NOT NULL below)
--   Step 4  enforce wallet_id NOT NULL + household-qualified composite FK + index
--
-- Rollback: drop NOT NULL/FK/index with no data loss; steps 1-2 are re-runnable
-- because the default wallet is guarded by system_key. No hard delete anywhere.

-- ─── Step 1: enum + wallet table ────────────────────────────────────────────

CREATE TYPE "WalletScope" AS ENUM ('PERSONAL', 'SHARING');

CREATE TABLE "wallet" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "scope" "WalletScope" NOT NULL,
    "name" VARCHAR NOT NULL,
    "purpose" VARCHAR,
    "opening_balance_minor" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ,
    "archived_by_user_id" UUID,
    "system_key" VARCHAR,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_pkey" PRIMARY KEY ("id")
);

-- CHECK opening_balance_minor >= 0 (raw SQL appendix, A-36).
ALTER TABLE "wallet"
    ADD CONSTRAINT "wallet_opening_balance_minor_check"
    CHECK ("opening_balance_minor" >= 0);

-- UNIQUE(household_id, system_key) — idempotency key for the migrated default.
CREATE UNIQUE INDEX "wallet_household_id_system_key_key" ON "wallet"("household_id", "system_key");
-- UNIQUE(household_id, id) — FK target enabling the household-qualified transaction FK.
CREATE UNIQUE INDEX "wallet_household_id_id_key" ON "wallet"("household_id", "id");
-- idx(household_id, scope, archived_at) — picker/carousel/summary reads.
CREATE INDEX "wallet_household_id_scope_archived_at_idx" ON "wallet"("household_id", "scope", "archived_at");

ALTER TABLE "wallet" ADD CONSTRAINT "wallet_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_archived_by_user_id_fkey"
    FOREIGN KEY ("archived_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Nullable in step 1; set NOT NULL in step 4 after backfill.
ALTER TABLE "transaction" ADD COLUMN "wallet_id" UUID;

-- Per-wallet activity/balance index (A-37).
CREATE INDEX "transaction_household_id_wallet_id_deleted_at_occurred_at_idx"
    ON "transaction"("household_id", "wallet_id", "deleted_at", "occurred_at" DESC);

-- ─── Step 2: idempotent backfill ────────────────────────────────────────────

-- One default SHARING wallet per household existing at migration time.
-- gen_random_uuid() is built into PostgreSQL 13+ (Neon is 15+).
INSERT INTO "wallet" ("id", "household_id", "created_by_user_id", "scope", "name", "purpose", "opening_balance_minor", "system_key")
SELECT gen_random_uuid(), h."id", h."owner_user_id", 'SHARING', 'Dompet Keluarga', NULL, 0, 'legacy_default'
FROM "household" h
WHERE NOT EXISTS (
    SELECT 1 FROM "wallet" w
    WHERE w."household_id" = h."id" AND w."system_key" = 'legacy_default'
);

-- Attach every pre-wallet row (including trashed rows and both transfer legs).
-- Filtering by household_id only guarantees no cross-household linking.
UPDATE "transaction" t
SET "wallet_id" = w."id"
FROM "wallet" w
WHERE w."household_id" = t."household_id"
  AND w."system_key" = 'legacy_default'
  AND t."wallet_id" IS NULL;

-- ─── Step 4: enforce ────────────────────────────────────────────────────────

-- Fails closed if any row was left unattached (step 3 verification).
ALTER TABLE "transaction" ALTER COLUMN "wallet_id" SET NOT NULL;

-- Household-qualified FK: a cross-household transaction↔wallet link is
-- impossible at the DB level (defense in depth on top of the service check).
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_household_id_wallet_id_fkey"
    FOREIGN KEY ("household_id", "wallet_id") REFERENCES "wallet"("household_id", "id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
