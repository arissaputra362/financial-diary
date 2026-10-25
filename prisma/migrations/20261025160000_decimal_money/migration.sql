-- Preserve existing whole-rupiah values while allowing two fractional digits.
-- Numeric avoids floating-point drift in stored monetary amounts.
ALTER TABLE "transaction"
  ALTER COLUMN "amount_minor" TYPE DECIMAL(18, 2)
  USING "amount_minor"::DECIMAL(18, 2);

ALTER TABLE "wallet"
  ALTER COLUMN "opening_balance_minor" TYPE DECIMAL(18, 2)
  USING "opening_balance_minor"::DECIMAL(18, 2);

ALTER TABLE "savings_goal"
  ALTER COLUMN "target_amount_minor" TYPE DECIMAL(18, 2)
    USING "target_amount_minor"::DECIMAL(18, 2),
  ALTER COLUMN "saved_amount_minor" TYPE DECIMAL(18, 2)
    USING "saved_amount_minor"::DECIMAL(18, 2);

ALTER TABLE "household_budget"
  ALTER COLUMN "amount_minor" TYPE DECIMAL(18, 2)
  USING "amount_minor"::DECIMAL(18, 2);

ALTER TABLE "personal_budget"
  ALTER COLUMN "amount_minor" TYPE DECIMAL(18, 2)
  USING "amount_minor"::DECIMAL(18, 2);

ALTER TABLE "gold_asset"
  ALTER COLUMN "buy_price_minor" TYPE DECIMAL(18, 2)
  USING "buy_price_minor"::DECIMAL(18, 2);
