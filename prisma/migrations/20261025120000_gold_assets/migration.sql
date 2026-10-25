-- Fitur 8: Tabungan Logam Mulia & Emas Perhiasan

CREATE TYPE "GoldAssetType" AS ENUM ('BULLION', 'JEWELRY');
CREATE TYPE "GoldBrand" AS ENUM ('ANTAM', 'UBS', 'LOTUS_ARCHI', 'GALERI_24', 'OTHER');

CREATE TABLE "gold_asset" (
    "id" UUID NOT NULL,
    "household_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "scope" "WalletScope" NOT NULL DEFAULT 'PERSONAL',
    "type" "GoldAssetType" NOT NULL,
    "brand" "GoldBrand" NOT NULL DEFAULT 'OTHER',
    "brand_custom_name" VARCHAR(100),
    "name" VARCHAR(150) NOT NULL,
    "weight_milligrams" INTEGER NOT NULL,
    "purity_permille" INTEGER NOT NULL DEFAULT 999,
    "serial_number" VARCHAR(100),
    "buy_price_minor" INTEGER NOT NULL,
    "purchase_date" DATE NOT NULL,
    "notes" TEXT,
    "receipt_id" UUID,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_asset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gold_market_price" (
    "id" UUID NOT NULL,
    "brand" "GoldBrand" NOT NULL,
    "buy_price_minor" INTEGER NOT NULL,
    "buyback_price_minor" INTEGER NOT NULL,
    "source_date" DATE NOT NULL,
    "source_ref" VARCHAR(100) NOT NULL,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gold_market_price_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gold_market_price_brand_source_date_key" ON "gold_market_price"("brand", "source_date");
CREATE INDEX "gold_market_price_source_date_idx" ON "gold_market_price"("source_date" DESC);

CREATE INDEX "gold_asset_household_id_scope_deleted_at_idx" ON "gold_asset"("household_id", "scope", "deleted_at");
CREATE INDEX "gold_asset_created_by_user_id_deleted_at_idx" ON "gold_asset"("created_by_user_id", "deleted_at");

ALTER TABLE "gold_asset" ADD CONSTRAINT "gold_asset_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "gold_asset" ADD CONSTRAINT "gold_asset_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "gold_asset" ADD CONSTRAINT "gold_asset_deleted_by_user_id_fkey"
    FOREIGN KEY ("deleted_by_user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "gold_asset" ADD CONSTRAINT "gold_asset_receipt_id_fkey"
    FOREIGN KEY ("receipt_id") REFERENCES "receipt"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "gold_asset" ADD CONSTRAINT "gold_asset_weight_positive"
    CHECK ("weight_milligrams" > 0);
ALTER TABLE "gold_asset" ADD CONSTRAINT "gold_asset_buy_price_non_negative"
    CHECK ("buy_price_minor" >= 0);
ALTER TABLE "gold_asset" ADD CONSTRAINT "gold_asset_purity_valid"
    CHECK ("purity_permille" > 0 AND "purity_permille" <= 1000);
