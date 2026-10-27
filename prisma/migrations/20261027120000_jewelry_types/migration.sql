CREATE TYPE "JewelryType" AS ENUM ('RING', 'NECKLACE', 'BRACELET', 'EARRINGS', 'OTHER');

ALTER TABLE "gold_asset"
ADD COLUMN "jewelry_type" "JewelryType";

UPDATE "gold_asset"
SET "jewelry_type" = 'OTHER'
WHERE "type" = 'JEWELRY';