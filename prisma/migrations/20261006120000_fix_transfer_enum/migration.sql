-- BUG-001 (AC-F3-3): a transfer is persisted as two linked legs
-- (MONEY_OUT + MONEY_IN) that share one transfer_group_id. The enum value
-- TRANSFER is never written; the input contract still accepts type='TRANSFER'
-- and the service translates it to the two legs.
--
-- The init migration's `transaction_transfer_group_consistency` CHECK required
-- (type = 'TRANSFER') = (transfer_group_id IS NOT NULL), so every MONEY_* leg
-- carrying the shared group id failed with SQLSTATE 23514. This drops that
-- constraint and removes the now-unused TRANSFER enum value.

-- 1. Drop the CHECK that forbade a transfer_group_id on MONEY_IN/MONEY_OUT.
ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_transfer_group_consistency";

-- 2. PostgreSQL cannot drop a value from an existing enum in place: rename the
--    old type, then create the new one without TRANSFER.
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
CREATE TYPE "TransactionType" AS ENUM ('MONEY_IN', 'MONEY_OUT');

-- 3. Re-point the column at the new enum. The cast fails closed (invalid input
--    value, SQLSTATE 22P02) if any row still holds 'TRANSFER', so no existing
--    data is silently discarded.
ALTER TABLE "transaction"
  ALTER COLUMN "type" TYPE "TransactionType"
  USING ("type"::text::"TransactionType");

-- 4. Drop the superseded enum type.
DROP TYPE "TransactionType_old";
