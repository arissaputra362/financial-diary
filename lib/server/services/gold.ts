import { createHash } from "node:crypto";
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
import { conflict, forbidden, notFound } from "@/lib/server/errors";
import { createVercelBlobStore } from "@/lib/server/providers/blob";
import type {
  CreateGoldAssetInput,
  GoldAssetDTO,
  GoldPortfolioSummaryDTO,
} from "@/types/gold";

export class GoldService {
  static async saveScannedImage(
    householdId: string,
    userId: string,
    bytes: Uint8Array,
    mimeType: string,
  ): Promise<string> {
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    const existing = await GoldRepository.findReceiptByHash(householdId, contentSha256);
    if (existing) {
      if (existing.uploadedByUserId !== userId) {
        throw conflict("GOLD_SCAN_ALREADY_EXISTS", "Foto ini sudah tersimpan pada akun keluarga lain.");
      }
      return existing.id;
    }

    const storageKey = `receipts/${householdId}/${contentSha256}`;
    await createVercelBlobStore().put(bytes, storageKey, mimeType);
    try {
      const created = await GoldRepository.createScanReceipt({
        householdId,
        uploadedByUserId: userId,
        contentSha256,
        mimeType,
        sizeBytes: bytes.byteLength,
        storageKey,
      });
      return created.id;
    } catch (error) {
      /* The household/hash unique key also serializes a concurrent duplicate. */
      const winner = await GoldRepository.findReceiptByHash(householdId, contentSha256);
      if (winner?.uploadedByUserId === userId) return winner.id;
      if (winner) throw conflict("GOLD_SCAN_ALREADY_EXISTS", "Foto ini sudah tersimpan pada akun keluarga lain.");
      throw error;
    }
  }

  static async getAssetImage(householdId: string, userId: string, assetId: string) {
    const receipt = await GoldRepository.findImageForAsset(householdId, assetId, userId);
    if (!receipt) return null;
    const image = await createVercelBlobStore().get(receipt.storageKey);
    return image ? { mimeType: receipt.mimeType, stream: image.stream } : null;
  }

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
        jewelryType: asset.jewelryType,
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
    await this.assertReceiptOwner(householdId, userId, input.receiptId);
    return GoldRepository.create(householdId, userId, input);
  }

  static async updateAsset(
    householdId: string,
    assetId: string,
    userId: string,
    input: CreateGoldAssetInput,
  ) {
    const existing = await GoldRepository.findById(householdId, assetId);
    if (!existing || existing.deletedAt) throw notFound("Catatan emas tidak ditemukan.");
    if (existing.scope === WalletScope.PERSONAL && existing.createdByUserId !== userId) {
      throw forbidden("GOLD_ASSET_ACCESS_DENIED", "Kamu tidak dapat mengubah catatan emas pribadi ini.");
    }
    if (input.receiptId !== existing.receiptId) {
      await this.assertReceiptOwner(householdId, userId, input.receiptId);
    }
    const updated = await GoldRepository.update(householdId, assetId, input);
    if (!updated) throw notFound("Catatan emas tidak ditemukan.");
    return updated;
  }

  private static async assertReceiptOwner(
    householdId: string,
    userId: string,
    receiptId?: string,
  ): Promise<void> {
    if (!receiptId) return;
    const receipt = await GoldRepository.findReceiptById(householdId, receiptId);
    if (!receipt || receipt.uploadedByUserId !== userId) {
      throw notFound("Foto hasil pindai tidak tersedia.");
    }
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
