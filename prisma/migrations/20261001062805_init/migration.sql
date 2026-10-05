-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MembershipEventType" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'REVOKED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('MONEY_IN', 'MONEY_OUT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'OCR');

-- CreateEnum
CREATE TYPE "OcrJobStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" VARCHAR NOT NULL,
    "password_hash" VARCHAR NOT NULL,
    "display_name" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household" (
    "id" UUID NOT NULL,
    "name" VARCHAR NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL,
    "invited_by_user_id" UUID,
    "inviteId" UUID,
    "requested_at" TIMESTAMPTZ,
    "approved_at" TIMESTAMPTZ,
    "approved_by_user_id" UUID,
    "declined_at" TIMESTAMPTZ,
    "declined_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by_user_id" UUID,
    "decision_reason" VARCHAR,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "code_hash" VARCHAR NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "redeemed_at" TIMESTAMPTZ,
    "redeemed_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_event" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "event_type" "MembershipEventType" NOT NULL,
    "previous_status" "MembershipStatus",
    "next_status" "MembershipStatus",
    "reason" VARCHAR,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membership_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_version" VARCHAR NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'IDR',
    "category" VARCHAR,
    "merchant" VARCHAR,
    "note" TEXT,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "source" "TransactionSource" NOT NULL,
    "receipt_id" UUID,
    "transfer_group_id" UUID,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_goal" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "name" VARCHAR NOT NULL,
    "target_amount_minor" INTEGER NOT NULL,
    "saved_amount_minor" INTEGER NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'IDR',
    "deadline" DATE,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "savings_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "content_sha256" VARCHAR NOT NULL,
    "mime_type" VARCHAR NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "storage_key" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocr_job" (
    "id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "status" "OcrJobStatus" NOT NULL,
    "model" VARCHAR,
    "result_json" JSONB,
    "confidence" DOUBLE PRECISION,
    "error_code" VARCHAR,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "ocr_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advisor_insight" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "source_period_start" DATE NOT NULL,
    "source_period_end" DATE NOT NULL,
    "model" VARCHAR NOT NULL,
    "headline" VARCHAR NOT NULL,
    "summary" TEXT NOT NULL,
    "actions_json" JSONB NOT NULL,
    "limitations" TEXT,
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "advisor_insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_budget" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'IDR',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_key" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" VARCHAR NOT NULL,
    "request_hash" VARCHAR NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_key_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_email_idx" ON "user"("email");

-- CreateIndex
CREATE INDEX "household_owner_user_id_idx" ON "household"("owner_user_id");

-- CreateIndex
CREATE INDEX "membership_household_id_status_idx" ON "membership"("household_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "membership_user_id_household_id_key" ON "membership"("user_id", "household_id");

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_hash_key" ON "invite"("code_hash");

-- CreateIndex
CREATE INDEX "invite_household_id_created_at_idx" ON "invite"("household_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "membership_event_membership_id_idx" ON "membership_event"("membership_id");

-- CreateIndex
CREATE INDEX "membership_event_household_id_created_at_idx" ON "membership_event"("household_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "session_expires_at_idx" ON "session"("expires_at");

-- CreateIndex
CREATE INDEX "transaction_household_id_deleted_at_occurred_at_idx" ON "transaction"("household_id", "deleted_at", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transaction_household_id_transfer_group_id_type_key" ON "transaction"("household_id", "transfer_group_id", "type");

-- CreateIndex
CREATE INDEX "savings_goal_household_id_deleted_at_deadline_idx" ON "savings_goal"("household_id", "deleted_at", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_household_id_content_sha256_key" ON "receipt"("household_id", "content_sha256");

-- CreateIndex
CREATE INDEX "ocr_job_receipt_id_idx" ON "ocr_job"("receipt_id");

-- CreateIndex
CREATE INDEX "advisor_insight_household_id_generated_at_idx" ON "advisor_insight"("household_id", "generated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "household_budget_household_id_period_start_key" ON "household_budget"("household_id", "period_start");

-- CreateIndex
CREATE INDEX "idempotency_key_expires_at_idx" ON "idempotency_key"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_key_user_id_key_key" ON "idempotency_key"("user_id", "key");

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_declined_by_user_id_fkey" FOREIGN KEY ("declined_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership" ADD CONSTRAINT "membership_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "invite"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invite" ADD CONSTRAINT "invite_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "membership"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "membership_event" ADD CONSTRAINT "membership_event_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipt"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_deleted_by_user_id_fkey" FOREIGN KEY ("deleted_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ocr_job" ADD CONSTRAINT "ocr_job_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipt"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "advisor_insight" ADD CONSTRAINT "advisor_insight_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "advisor_insight" ADD CONSTRAINT "advisor_insight_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "household_budget" ADD CONSTRAINT "household_budget_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "household_budget" ADD CONSTRAINT "household_budget_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "idempotency_key" ADD CONSTRAINT "idempotency_key_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ============================================================
-- Raw SQL appendix (ERD §3 constraints marked `*`)
-- These constraints cannot be expressed in schema.prisma.
-- ============================================================

-- ERD §3.3: one ACTIVE membership per user (PENDING or APPROVED).
-- Plain UNIQUE(user_id) would lock a user to their first household forever (D-5).
CREATE UNIQUE INDEX "membership_user_active_key"
    ON "membership"("user_id")
    WHERE "status" IN ('PENDING', 'APPROVED');

-- ERD §3.7: amount must be positive (IDR scale 0, integer rupiah).
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_amount_minor_positive"
    CHECK ("amount_minor" > 0);

-- ERD §3.7: TRANSFER rows must carry a transfer_group_id; MONEY_IN/MONEY_OUT must not.
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_transfer_group_consistency"
    CHECK ((("type") = 'TRANSFER') = (("transfer_group_id") IS NOT NULL));

-- ERD §3.8: goal target must be positive.
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_target_positive"
    CHECK ("target_amount_minor" > 0);

-- ERD §3.8 (D-18): saved amount can never go negative (atomic delta updates).
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_saved_nonnegative"
    CHECK ("saved_amount_minor" >= 0);

-- ERD §3.12: budget amount must be positive.
ALTER TABLE "household_budget" ADD CONSTRAINT "household_budget_amount_positive"
    CHECK ("amount_minor" > 0);

-- ERD §3.10: at most one PROCESSING OCR job per receipt (concurrent upload guard).
CREATE UNIQUE INDEX "ocr_job_receipt_processing_key"
    ON "ocr_job"("receipt_id")
    WHERE "status" = 'PROCESSING';
