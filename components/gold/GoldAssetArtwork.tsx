import { JewelryType } from "@/lib/generated/prisma/enums";
import type { GoldAssetDTO } from "@/types/gold";
import { GoldAssetIcon } from "./GoldAssetIcon";

const BRAND_LABELS: Record<GoldAssetDTO["brand"], string> = {
  ANTAM: "ANTAM",
  UBS: "UBS",
  LOTUS_ARCHI: "LOTUS ARCHI",
  GALERI_24: "GALERI 24",
  OTHER: "LAINNYA",
};

const JEWELRY_LABELS: Record<JewelryType, string> = {
  RING: "CINCIN",
  NECKLACE: "KALUNG",
  BRACELET: "GELANG",
  EARRINGS: "ANTING",
  OTHER: "LAINNYA",
};

export function getGoldBrandLabel(asset: Pick<GoldAssetDTO, "brand" | "brandCustomName">): string {
  return asset.brandCustomName?.trim() || BRAND_LABELS[asset.brand];
}

export function getJewelryTypeLabel(type: JewelryType | null | undefined): string {
  return type ? JEWELRY_LABELS[type] : JEWELRY_LABELS.OTHER;
}

interface GoldAssetArtworkProps {
  asset: Pick<GoldAssetDTO, "type" | "jewelryType" | "brand" | "brandCustomName">;
  size?: "card" | "detail";
}

export function GoldAssetArtwork({ asset, size = "card" }: GoldAssetArtworkProps) {
  const isDetail = size === "detail";
  const label =
    asset.type === "BULLION"
      ? getGoldBrandLabel(asset)
      : getJewelryTypeLabel(asset.jewelryType);
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-mint ${isDetail ? "h-44" : "h-32"}`}
    >
      <div className="flex flex-col items-center justify-center gap-2">
        <GoldAssetIcon
          type={asset.type}
          jewelryType={asset.jewelryType}
          size="lg"
          className={isDetail ? "h-24 w-24 rounded-3xl" : undefined}
        />
        <span className="text-[9px] font-extrabold tracking-[0.12em] text-green sm:text-[10px]">
          {label}
        </span>
      </div>
    </div>
  );
}
