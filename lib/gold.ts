import { GoldAssetType, GoldBrand } from "@/lib/generated/prisma/enums";
import type { GoldPriceResponseDTO } from "@/types/gold";

export function gramsToMilligrams(grams: number): number {
  return Math.round(grams * 1000);
}

export function milligramsToGrams(milligrams: number): number {
  return milligrams / 1000;
}

export function formatGrams(grams: number): string {
  // Format with up to 3 decimals, trimming unnecessary trailing zeros
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 3,
  }).format(grams) + " gr";
}

export function getPurityLabel(purityPermille: number): string {
  if (purityPermille >= 990) return "24K (99.9%)";
  if (purityPermille >= 910) return "22K (91.6%)";
  if (purityPermille >= 750) return "18K (75%)";
  if (purityPermille >= 700) return "17K (70%)";
  if (purityPermille >= 420) return "10K (42%)";
  if (purityPermille >= 375) return "9K (37.5%)";
  return `${(purityPermille / 10).toFixed(1)}%`;
}

export function parsePurityPermille(input: string | number): number {
  if (typeof input === "number") {
    if (input <= 1) return Math.round(input * 1000);
    if (input <= 24) {
      // Input in Karat (e.g. 18 -> 18/24 = 750)
      return Math.round((input / 24) * 1000);
    }
    if (input <= 100) {
      // Input in Percentage (e.g. 70 -> 700)
      return Math.round(input * 10);
    }
    return Math.min(1000, Math.max(1, Math.round(input)));
  }

  const clean = input.toUpperCase().replace(/\s+/g, "");
  if (clean.includes("24K") || clean.includes("999") || clean.includes("FINEGOLD")) return 999;
  if (clean.includes("22K") || clean.includes("916")) return 916;
  if (clean.includes("18K") || clean.includes("750")) return 750;
  if (clean.includes("17K") || clean.includes("700")) return 700;
  if (clean.includes("16K") || clean.includes("650")) return 650;
  if (clean.includes("10K") || clean.includes("420")) return 420;
  if (clean.includes("9K") || clean.includes("375")) return 375;

  const num = parseFloat(clean);
  if (!isNaN(num)) {
    return parsePurityPermille(num);
  }
  return 999;
}

export function calculateAssetValuation(
  type: GoldAssetType,
  brand: GoldBrand,
  weightMilligrams: number,
  purityPermille: number,
  priceInfo: GoldPriceResponseDTO
): number {
  const grams = weightMilligrams / 1000;

  if (type === GoldAssetType.BULLION) {
    // Cari buyback price untuk brand yang bersangkutan
    const matched = priceInfo.prices.find((p) => p.brand === brand);
    const buybackPerGram = matched
      ? matched.buybackPriceMinor
      : priceInfo.jewelryBaseBuybackMinor;
    return Math.round(grams * buybackPerGram);
  }

  // JEWELRY: gram x (purity / 1000) x baseBuybackRate
  const purityFactor = Math.min(1, Math.max(0, purityPermille / 1000));
  return Math.round(grams * purityFactor * priceInfo.jewelryBaseBuybackMinor);
}

export function calculatePnL(valuationMinor: number, buyPriceMinor: number) {
  const pnlMinor = valuationMinor - buyPriceMinor;
  const pnlPercent =
    buyPriceMinor > 0 ? (pnlMinor / buyPriceMinor) * 100 : 0;

  return {
    unrealizedPnLMinor: pnlMinor,
    unrealizedPnLPercent: Math.round(pnlPercent * 10) / 10, // 1 decimal place
  };
}
