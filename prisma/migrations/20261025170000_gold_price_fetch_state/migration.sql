CREATE TABLE "gold_price_fetch_state" (
  "provider_key" VARCHAR(80) NOT NULL,
  "last_attempt_date" DATE NOT NULL,
  "last_error" VARCHAR(200),
  CONSTRAINT "gold_price_fetch_state_pkey" PRIMARY KEY ("provider_key")
);
