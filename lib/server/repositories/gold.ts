import { prisma } from "@/lib/db";
import { GoldAssetType, GoldBrand, JewelryType, WalletScope } from "@/lib/generated/prisma/enums";
import { gramsToMilligrams } from "@/lib/gold";
import type { CreateGoldAssetInput } from "@/types/gold";

export class GoldRepository {
  /**
   * Mengambil seluruh aset emas aktif untuk household dengan isolasi scope.
   * Emas PERSONAL hanya dapat dilihat oleh pembuatnya.
   */
  static async findActiveByHousehold(
    householdId: string,
    userId: string,
    filterScope?: WalletScope
  ) {
    const whereClause: {
      householdId: string;
      deletedAt: null;
      scope?: WalletScope;
      createdByUserId?: string;
      OR?: Array<{ scope: WalletScope } | { scope: WalletScope; createdByUserId: string }>;
    } = {
      householdId,
      deletedAt: null,
      OR: [
        { scope: WalletScope.SHARING },
        { scope: WalletScope.PERSONAL, createdByUserId: userId },
      ],
    };

    if (filterScope) {
      whereClause.scope = filterScope;
      if (filterScope === WalletScope.PERSONAL) {
        whereClause.createdByUserId = userId;
      }
    }

    return prisma.goldAsset.findMany({
      where: whereClause,
      orderBy: { purchaseDate: "desc" },
    });
  }

  static async findById(householdId: string, assetId: string) {
    return prisma.goldAsset.findFirst({
      where: {
        id: assetId,
        householdId,
      },
    });
  }

  static async findReceiptByHash(householdId: string, contentSha256: string) {
    return prisma.receipt.findUnique({
      where: { householdId_contentSha256: { householdId, contentSha256 } },
      select: { id: true, uploadedByUserId: true },
    });
  }

  static async findReceiptById(householdId: string, receiptId: string) {
    return prisma.receipt.findFirst({
      where: { id: receiptId, householdId },
      select: { id: true, uploadedByUserId: true },
    });
  }

  static async createScanReceipt(data: {
    householdId: string;
    uploadedByUserId: string;
    contentSha256: string;
    mimeType: string;
    sizeBytes: number;
    storageKey: string;
  }) {
    return prisma.receipt.create({ data, select: { id: true } });
  }

  static async findImageForAsset(householdId: string, assetId: string, userId: string) {
    const asset = await prisma.goldAsset.findFirst({
      where: {
        id: assetId,
        householdId,
        deletedAt: null,
        OR: [
          { scope: WalletScope.SHARING },
          { scope: WalletScope.PERSONAL, createdByUserId: userId },
        ],
      },
      select: {
        receipt: { select: { id: true, mimeType: true, storageKey: true } },
      },
    });
    return asset?.receipt ?? null;
  }

  static async create(
    householdId: string,
    userId: string,
    input: CreateGoldAssetInput
  ) {
    return prisma.goldAsset.create({
      data: {
        householdId,
        createdByUserId: userId,
        ...this.toWriteData(input),
      },
    });
  }

  static async update(
    householdId: string,
    assetId: string,
    input: CreateGoldAssetInput,
  ) {
    const result = await prisma.goldAsset.updateMany({
      where: { id: assetId, householdId, deletedAt: null },
      data: this.toWriteData(input),
    });
    if (result.count === 0) return null;
    return prisma.goldAsset.findUnique({ where: { id: assetId } });
  }

  private static toWriteData(input: CreateGoldAssetInput) {
    return {
      scope: input.scope,
      type: input.type,
      jewelryType: input.type === GoldAssetType.JEWELRY ? input.jewelryType ?? JewelryType.OTHER : null,
      brand: input.brand ?? GoldBrand.OTHER,
      brandCustomName: input.brandCustomName ?? null,
      name: input.name,
      weightMilligrams: gramsToMilligrams(input.weightGrams),
      purityPermille: input.purityPermille ?? 999,
      serialNumber: input.serialNumber ?? null,
      buyPriceMinor: input.buyPriceMinor,
      purchaseDate: new Date(input.purchaseDate),
      notes: input.notes ?? null,
      receiptId: input.receiptId ?? null,
    };
  }

  static async softDelete(
    householdId: string,
    assetId: string,
    deletedByUserId: string
  ) {
    return prisma.goldAsset.updateMany({
      where: {
        id: assetId,
        householdId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedByUserId,
      },
    });
  }

  static async restore(householdId: string, assetId: string) {
    return prisma.goldAsset.updateMany({
      where: {
        id: assetId,
        householdId,
        deletedAt: { not: null },
      },
      data: {
        deletedAt: null,
        deletedByUserId: null,
      },
    });
  }
}
