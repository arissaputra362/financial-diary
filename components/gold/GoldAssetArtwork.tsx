import { Gem, Sparkles } from "lucide-react";
import type { GoldAssetDTO } from "@/types/gold";

const BRAND_LABELS: Record<GoldAssetDTO["brand"], string> = {
  ANTAM: "ANTAM",
  UBS: "UBS",
  LOTUS_ARCHI: "LOTUS ARCHI",
  GALERI_24: "GALERI 24",
  OTHER: "LAINNYA",
};

export function getGoldBrandLabel(asset: Pick<GoldAssetDTO, "brand" | "brandCustomName">): string {
  return asset.brandCustomName?.trim() || BRAND_LABELS[asset.brand];
}

interface GoldAssetArtworkProps {
  asset: Pick<GoldAssetDTO, "type" | "brand" | "brandCustomName">;
  size?: "card" | "detail";
}

export function GoldAssetArtwork({ asset, size = "card" }: GoldAssetArtworkProps) {
  const isDetail = size === "detail";
  const brand = getGoldBrandLabel(asset);

  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-linear-to-br from-[#FFF8E7] via-[#F8F1DE] to-[#EAF1F8] ${isDetail ? "h-44" : "h-32"}`}>
      <div className="absolute inset-x-8 bottom-2 h-5 rounded-full bg-[#C6A65C]/20 blur-md" />
      {asset.type === "BULLION" ? (
        <div className={`relative flex flex-col items-center justify-center rounded-2xl border border-[#C99D3D]/40 bg-linear-to-br from-[#F5D77A] via-[#D5A83E] to-[#A9751E] text-[#68470D] shadow-[0_8px_18px_rgba(137,96,22,0.2)] ${isDetail ? "h-24 w-32" : "h-20 w-28"}`}>
          <span className="text-2xl font-black tracking-[0.18em]">LM</span>
          <span className="mt-0.5 max-w-[6rem] truncate rounded-full bg-white/50 px-2 py-0.5 text-[9px] font-extrabold tracking-wide">
            {brand}
          </span>
          <span className="absolute inset-x-2 top-2 h-px bg-white/50" />
        </div>
      ) : (
        <div className={`relative flex flex-col items-center justify-center rounded-full border border-[#E8D6A8] bg-white/75 text-[#B88729] shadow-sm ${isDetail ? "h-24 w-24" : "h-20 w-20"}`}>
          <Gem className={isDetail ? "h-10 w-10" : "h-8 w-8"} strokeWidth={1.5} aria-hidden="true" />
          <Sparkles className="absolute right-3 top-3 h-4 w-4 text-[#D5AC56]" aria-hidden="true" />
          <span className="mt-1 text-[8px] font-bold tracking-[0.12em]">PERHIASAN</span>
        </div>
      )}
    </div>
  );
}
