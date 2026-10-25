import { GoldAssetType, WalletScope } from "@/lib/generated/prisma/enums";
import { roundMoneyValue } from "@/lib/money-input";
import {
  calculateAssetValuation,
  calculatePnL,
  getPurityLabel,
  milligramsToGrams,
} from "@/lib/gold";
import { GoldRepository } from "@/lib/server/repositories/gold";
import { GoldPriceService } from "@/lib/server/services/gold-price";
import type {
  CreateGoldAssetInput,
  GoldAssetDTO,
  GoldPortfolioSummaryDTO,
} from "@/types/gold";

export class GoldService {
  /**
   * Mengambil ringkasan tabungan emas dan rincian portofolio
   */
  static async getPortfolioSummary(
    householdId: string,
    userId: string,
    filterScope?: WalletScope
  ): Promise<GoldPortfolioSummaryDTO> {
    const assets = await GoldRepository.findActiveByHousehold(householdId, userId, filterScope);
    const priceInfo = await GoldPriceService.getDailyPrices(assets.map((asset) => asset.brand));

    let totalEstimatedValueMinor = 0;
    let totalCostBasisMinor = 0;
    let totalWeightMilligrams = 0;
    let bullionWeightMilligrams = 0;
    let jewelryWeightMilligrams = 0;

    const decoratedAssets: GoldAssetDTO[] = assets.map((asset) => {
      const buyPriceMinor = Number(asset.buyPriceMinor);
      const weightGrams = milligramsToGrams(asset.weightMilligrams);
      const estimatedValuationMinor = calculateAssetValuation(
        asset.type,
        asset.brand,
        asset.weightMilligrams,
        asset.purityPermille,
        priceInfo
      );
      const { unrealizedPnLMinor, unrealizedPnLPercent } = calculatePnL(
        estimatedValuationMinor,
        buyPriceMinor
      );

      totalEstimatedValueMinor += estimatedValuationMinor;
      totalCostBasisMinor = roundMoneyValue(totalCostBasisMinor + buyPriceMinor);
      totalWeightMilligrams += asset.weightMilligrams;

      if (asset.type === GoldAssetType.BULLION) {
        bullionWeightMilligrams += asset.weightMilligrams;
      } else {
        jewelryWeightMilligrams += asset.weightMilligrams;
      }

      return {
        id: asset.id,
        householdId: asset.householdId,
        createdByUserId: asset.createdByUserId,
        scope: asset.scope,
        type: asset.type,
        brand: asset.brand,
        brandCustomName: asset.brandCustomName,
        name: asset.name,
        weightGrams,
        weightMilligrams: asset.weightMilligrams,
        purityPermille: asset.purityPermille,
        purityLabel: getPurityLabel(asset.purityPermille),
        serialNumber: asset.serialNumber,
        buyPriceMinor,
        purchaseDate: asset.purchaseDate.toISOString().split("T")[0],
        notes: asset.notes,
        receiptId: asset.receiptId,
        createdAt: asset.createdAt.toISOString(),
        estimatedValuationMinor,
        unrealizedPnLMinor,
        unrealizedPnLPercent,
      };
    });

    const totalPnL = calculatePnL(
      totalEstimatedValueMinor,
      totalCostBasisMinor
    );

    return {
      totalEstimatedValueMinor,
      totalCostBasisMinor,
      totalUnrealizedPnLMinor: totalPnL.unrealizedPnLMinor,
      totalUnrealizedPnLPercent: totalPnL.unrealizedPnLPercent,
      totalWeightGrams: milligramsToGrams(totalWeightMilligrams),
      bullionWeightGrams: milligramsToGrams(bullionWeightMilligrams),
      jewelryWeightGrams: milligramsToGrams(jewelryWeightMilligrams),
      itemCount: decoratedAssets.length,
      assets: decoratedAssets,
      priceInfo,
    };
  }

  static async createAsset(
    householdId: string,
    userId: string,
    input: CreateGoldAssetInput
  ) {
    return GoldRepository.create(householdId, userId, input);
  }

  static async deleteAsset(
    householdId: string,
    assetId: string,
    userId: string
  ) {
    const existing = await GoldRepository.findById(householdId, assetId);
    if (!existing) {
      throw new Error("Asset not found");
    }
    // Only creator or owner can delete PERSONAL asset
    if (existing.scope === WalletScope.PERSONAL && existing.createdByUserId !== userId) {
      throw new Error("Unauthorized to delete this personal asset");
    }
    return GoldRepository.softDelete(householdId, assetId, userId);
  }

  static async restoreAsset(householdId: string, assetId: string) {
    return GoldRepository.restore(householdId, assetId);
  }
}
