import { prisma } from "@/lib/db";
import { GoldAssetType, GoldBrand, WalletScope } from "@/lib/generated/prisma/enums";
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

  static async create(
    householdId: string,
    userId: string,
    input: CreateGoldAssetInput
  ) {
    return prisma.goldAsset.create({
      data: {
        householdId,
        createdByUserId: userId,
        scope: input.scope,
        type: input.type,
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
      },
    });
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
