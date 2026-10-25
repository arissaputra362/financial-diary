import type { GoldAssetType, GoldBrand, WalletScope } from "@/lib/generated/prisma/enums";

export interface GoldPriceItemDTO {
  brand: GoldBrand;
  buyPriceMinor: number;
  buybackPriceMinor: number;
  sourceDate: string; // YYYY-MM-DD
  sourceRef: string;
}

export interface GoldPriceResponseDTO {
  prices: GoldPriceItemDTO[];
  jewelryBaseBuybackMinor: number; // Harga dasar buyback per gram 24K untuk acuan perhiasan
  lastUpdated: string;
  isStale: boolean;
}

export interface GoldAssetDTO {
  id: string;
  householdId: string;
  createdByUserId: string;
  scope: WalletScope;
  type: GoldAssetType;
  brand: GoldBrand;
  brandCustomName: string | null;
  name: string;
  weightGrams: number; // weightMilligrams / 1000
  weightMilligrams: number;
  purityPermille: number;
  purityLabel: string;
  serialNumber: string | null;
  buyPriceMinor: number;
  purchaseDate: string;
  notes: string | null;
  receiptId: string | null;
  createdAt: string;
  estimatedValuationMinor: number;
  unrealizedPnLMinor: number;
  unrealizedPnLPercent: number;
}

export interface GoldPortfolioSummaryDTO {
  totalEstimatedValueMinor: number;
  totalCostBasisMinor: number;
  totalUnrealizedPnLMinor: number;
  totalUnrealizedPnLPercent: number;
  totalWeightGrams: number;
  bullionWeightGrams: number;
  jewelryWeightGrams: number;
  itemCount: number;
  assets: GoldAssetDTO[];
  priceInfo: GoldPriceResponseDTO;
}

export interface CreateGoldAssetInput {
  scope: WalletScope;
  type: GoldAssetType;
  brand?: GoldBrand;
  brandCustomName?: string;
  name: string;
  weightGrams: number;
  purityPermille?: number;
  serialNumber?: string;
  buyPriceMinor: number;
  purchaseDate: string;
  notes?: string;
  receiptId?: string;
}

export interface GoldScanResultDTO {
  scanType: "BULLION_CERTICARD" | "JEWELRY_RECEIPT" | "UNKNOWN";
  brand: GoldBrand;
  brandCustomName?: string;
  name: string;
  weightGrams: number;
  purityPermille: number;
  serialNumber?: string;
  buyPriceMinor?: number;
  purchaseDate?: string;
  merchantName?: string;
  confidence: number;
  receiptId?: string;
}
