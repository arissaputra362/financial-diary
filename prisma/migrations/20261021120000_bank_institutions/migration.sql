-- T-011 / A-52..A-55 — official bank catalog + private Quick Add institutions.
--
-- Additive only:
--   1. create global read-only `bank_institution`
--   2. create per-user `user_custom_institution` with soft archive
--   3. add two nullable institution references to `wallet`
--   4. add FKs, the XOR CHECK, the partial unique active-name index, and lookups
--
-- No backfill: every existing wallet keeps both references NULL (manual) and
-- remains valid. The official catalog is populated separately by the versioned
-- static OJK seed (prisma/seed-bank-institutions.ts), outside this migration.
--
-- Rollback: before references exist, drop the new columns/tables. After
-- references exist, forward-fix or deactivate catalog/custom rows; never
-- hard-delete a referenced row.

-- ─── Official catalog (global, read-only for users) ─────────────────────────

CREATE TABLE "bank_institution" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(160) NOT NULL,
    "normalized_name" VARCHAR(160) NOT NULL,
    "source" VARCHAR(40) NOT NULL DEFAULT 'OJK_OFFICE_LIST',
    "source_url" VARCHAR(500) NOT NULL,
    "source_as_of" DATE NOT NULL,
    "source_ref" VARCHAR(255),
    "seed_version" VARCHAR(40) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_institution_pkey" PRIMARY KEY ("id")
);

-- One selectable row per normalized official name; a source collision must stop
-- the seed instead of silently choosing one row (A-53).
CREATE UNIQUE INDEX "bank_institution_normalized_name_key"
    ON "bank_institution"("normalized_name");
CREATE INDEX "bank_institution_is_active_normalized_name_idx"
    ON "bank_institution"("is_active", "normalized_name");

-- ─── Private per-user list (Quick Add) ──────────────────────────────────────

CREATE TABLE "user_custom_institution" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "normalized_name" VARCHAR(80) NOT NULL,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_custom_institution_pkey" PRIMARY KEY ("id")
);

-- At most one ACTIVE row per (user, normalized name). A plain unique constraint
-- would block re-adding a name after archive, so the partial index is required.
CREATE UNIQUE INDEX "user_custom_institution_active_name_uq"
    ON "user_custom_institution"("user_id", "normalized_name")
    WHERE "archived_at" IS NULL;
CREATE INDEX "user_custom_institution_user_id_archived_at_normalized_name_idx"
    ON "user_custom_institution"("user_id", "archived_at", "normalized_name");

ALTER TABLE "user_custom_institution" ADD CONSTRAINT "user_custom_institution_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ─── Wallet references (optional; manual = both NULL) ───────────────────────

ALTER TABLE "wallet" ADD COLUMN "official_institution_id" UUID;
ALTER TABLE "wallet" ADD COLUMN "custom_institution_id" UUID;

ALTER TABLE "wallet" ADD CONSTRAINT "wallet_official_institution_id_fkey"
    FOREIGN KEY ("official_institution_id") REFERENCES "bank_institution"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_custom_institution_id_fkey"
    FOREIGN KEY ("custom_institution_id") REFERENCES "user_custom_institution"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A wallet references at most one institution; both NULL means manual (A-55).
ALTER TABLE "wallet" ADD CONSTRAINT "wallet_institution_at_most_one"
    CHECK ("official_institution_id" IS NULL OR "custom_institution_id" IS NULL);

-- ─── Verification notes ─────────────────────────────────────────────────────
-- After `prisma migrate deploy`, the seed step reports inserted/updated/
-- deactivated rows. Verify:
--   SELECT count(*) FROM wallet WHERE official_institution_id IS NOT NULL
--     OR custom_institution_id IS NOT NULL;  -- 0 immediately after migration
--   SELECT indexdef FROM pg_indexes
--    WHERE indexname = 'user_custom_institution_active_name_uq';
--   SELECT conname FROM pg_constraint WHERE conname = 'wallet_institution_at_most_one';
