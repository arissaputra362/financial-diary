import { describe, expect, it } from "vitest";
import { GoldAssetType, GoldBrand } from "@/lib/generated/prisma/enums";
import {
  calculateAssetValuation,
  calculatePnL,
  formatGrams,
  getPurityLabel,
  gramsToMilligrams,
  milligramsToGrams,
  parsePurityPermille,
} from "./gold";
import type { GoldPriceResponseDTO } from "@/types/gold";

const MOCK_PRICE_INFO: GoldPriceResponseDTO = {
  prices: [
    {
      brand: GoldBrand.ANTAM,
      buyPriceMinor: 1500000,
      buybackPriceMinor: 1350000,
      sourceDate: "2026-10-25",
      sourceRef: "Antam Test",
    },
    {
      brand: GoldBrand.UBS,
      buyPriceMinor: 1480000,
      buybackPriceMinor: 1330000,
      sourceDate: "2026-10-25",
      sourceRef: "UBS Test",
    },
  ],
  jewelryBaseBuybackMinor: 1350000,
  lastUpdated: "2026-10-25T10:00:00Z",
  isStale: false,
};

describe("Gold Unit Calculations (Fitur 8)", () => {
  it("converts grams to milligrams and vice-versa precisely without floating-point error", () => {
    expect(gramsToMilligrams(1)).toBe(1000);
    expect(gramsToMilligrams(0.5)).toBe(500);
    expect(gramsToMilligrams(12.345)).toBe(12345);

    expect(milligramsToGrams(1000)).toBe(1);
    expect(milligramsToGrams(500)).toBe(0.5);
    expect(milligramsToGrams(12345)).toBe(12.345);
  });

  it("formats gram display correctly", () => {
    expect(formatGrams(5)).toBe("5,0 gr");
    expect(formatGrams(1.25)).toBe("1,25 gr");
  });

  it("parses various purity formats to permille integer", () => {
    expect(parsePurityPermille("24K")).toBe(999);
    expect(parsePurityPermille("999.9")).toBe(999);
    expect(parsePurityPermille("18K")).toBe(750);
    expect(parsePurityPermille("750")).toBe(750);
    expect(parsePurityPermille("17K")).toBe(700);
    expect(parsePurityPermille("70%")).toBe(700);
    expect(parsePurityPermille("10K")).toBe(420);
    expect(parsePurityPermille("9K")).toBe(375);
    expect(parsePurityPermille(18)).toBe(750);
  });

  it("generates correct purity human-readable labels", () => {
    expect(getPurityLabel(999)).toBe("24K (99.9%)");
    expect(getPurityLabel(750)).toBe("18K (75%)");
    expect(getPurityLabel(700)).toBe("17K (70%)");
  });

  it("calculates valuation for Bullion according to brand buyback", () => {
    // 10 grams of Antam Bullion
    const valuationAntam = calculateAssetValuation(
      GoldAssetType.BULLION,
      GoldBrand.ANTAM,
      10000, // 10 grams = 10,000 mg
      999,
      MOCK_PRICE_INFO
    );
    expect(valuationAntam).toBe(10 * 1350000); // 13,500,000

    // 5 grams of UBS Bullion
    const valuationUbs = calculateAssetValuation(
      GoldAssetType.BULLION,
      GoldBrand.UBS,
      5000,
      999,
      MOCK_PRICE_INFO
    );
    expect(valuationUbs).toBe(5 * 1330000); // 6,650,000
  });

  it("calculates valuation for Jewelry proportionally based on purity factor", () => {
    // 4 grams of 18K (75%) Jewelry
    // Valuasi = 4 * 0.75 * 1,350,000 = 4,050,000
    const valuationJewelry = calculateAssetValuation(
      GoldAssetType.JEWELRY,
      GoldBrand.OTHER,
      4000,
      750,
      MOCK_PRICE_INFO
    );
    expect(valuationJewelry).toBe(4050000);
  });

  it("calculates unrealized PnL nominal and percentage", () => {
    // Bought for 10,000,000, current valuation 12,500,000 -> +2,500,000 (+25%)
    const profit = calculatePnL(12500000, 10000000);
    expect(profit.unrealizedPnLMinor).toBe(2500000);
    expect(profit.unrealizedPnLPercent).toBe(25);

    // Bought for 10,000,000, current valuation 9,000,000 -> -1,000,000 (-10%)
    const loss = calculatePnL(9000000, 10000000);
    expect(loss.unrealizedPnLMinor).toBe(-1000000);
    expect(loss.unrealizedPnLPercent).toBe(-10);

    // Bought for 0 (gift/inheritance) -> PnL percent doesn't divide by zero
    const gift = calculatePnL(5000000, 0);
    expect(gift.unrealizedPnLMinor).toBe(5000000);
    expect(gift.unrealizedPnLPercent).toBe(0);
  });
});
