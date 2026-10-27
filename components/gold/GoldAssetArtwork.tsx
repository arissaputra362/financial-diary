import { useId } from "react";
import { JewelryType } from "@/lib/generated/prisma/enums";
import type { GoldAssetDTO } from "@/types/gold";

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
  const id = useId().replace(/:/g, "");
  const isDetail = size === "detail";
  const label = asset.type === "BULLION"
    ? getGoldBrandLabel(asset)
    : getJewelryTypeLabel(asset.jewelryType);

  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-gold-art-backdrop ${isDetail ? "h-44" : "h-32"}`}>
      <div className="absolute inset-x-8 bottom-2 h-4 rounded-full bg-gold-art-shadow/15 blur-md" />
      <div className="relative flex flex-col items-center justify-center">
        {asset.type === "BULLION" ? (
          <BullionSilhouette id={id} className={isDetail ? "h-[4.6rem] w-36" : "h-16 w-28"} />
        ) : (
          <JewelrySilhouette
            id={id}
            type={asset.jewelryType}
            className={isDetail ? "h-16 w-24" : "h-14 w-20"}
          />
        )}
        <span className="mt-0.5 text-[9px] font-extrabold tracking-[0.12em] text-gold-art-ink sm:text-[10px]">
          {label}
        </span>
      </div>
    </div>
  );
}

function BullionSilhouette({ id, className }: { id: string; className: string }) {
  return (
    <svg viewBox="0 0 144 80" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-bar-top`} x1="25" y1="10" x2="117" y2="33" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF0A6" />
          <stop offset="0.5" stopColor="#E9BE50" />
          <stop offset="1" stopColor="#C28C25" />
        </linearGradient>
        <linearGradient id={`${id}-bar-front`} x1="31" y1="31" x2="110" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5D77A" />
          <stop offset="0.54" stopColor="#D5A83E" />
          <stop offset="1" stopColor="#A9751E" />
        </linearGradient>
      </defs>
      <path d="m24 18 94 0 16 17-107 0L24 18Z" fill={`url(#${id}-bar-top)`} stroke="#A9751E" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m27 35 107 0-11 32-96 0 0-32Z" fill={`url(#${id}-bar-front)`} stroke="#A9751E" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m29 38 101 0" stroke="#FFF3BD" strokeOpacity=".8" strokeWidth="1.5" />
      <path d="m34 63 84 0" stroke="#8F641D" strokeOpacity=".3" strokeWidth="1" />
      <text x="80" y="57" fill="#765016" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="800" letterSpacing="2" textAnchor="middle">LM</text>
    </svg>
  );
}

function JewelrySilhouette({ id, type, className }: { id: string; type: JewelryType | null; className: string }) {
  return (
    <svg viewBox="0 0 80 56" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-jewel`} x1="16" y1="6" x2="64" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF3B6" />
          <stop offset=".42" stopColor="#D7A537" />
          <stop offset=".68" stopColor="#FFE58E" />
          <stop offset="1" stopColor="#A9751E" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="20" y1="8" x2="57" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFF9D8" />
          <stop offset="1" stopColor="#D9A93C" />
        </linearGradient>
      </defs>
      {type === JewelryType.RING ? (
        <>
          <ellipse cx="40" cy="35" rx="19" ry="13" transform="rotate(-8 40 35)" stroke={`url(#${id}-jewel)`} strokeWidth="6" />
          <ellipse cx="40" cy="35" rx="19" ry="13" transform="rotate(-8 40 35)" stroke={`url(#${id}-shine)`} strokeWidth="1.2" />
          <path d="m34 17 6-7 6 7-2.5 7h-7L34 17Z" fill={`url(#${id}-shine)`} stroke="#9B6B1B" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="m36 17 4 7 4-7" stroke="#FFF7D4" strokeOpacity=".8" strokeWidth="1" />
        </>
      ) : type === JewelryType.NECKLACE ? (
        <>
          <path d="M13 7c3 18 12 26 27 26S64 25 67 7" stroke={`url(#${id}-jewel)`} strokeWidth="4" strokeLinecap="round" />
          <path d="M13 7c3 18 12 26 27 26S64 25 67 7" stroke={`url(#${id}-shine)`} strokeWidth="1" strokeLinecap="round" />
          <path d="m40 31 8 9-8 10-8-10 8-9Z" fill={`url(#${id}-jewel)`} stroke="#9B6B1B" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="m40 35 4 5-4 6-4-6 4-5Z" stroke="#FFF7D4" strokeOpacity=".8" strokeWidth="1" />
        </>
      ) : type === JewelryType.BRACELET ? (
        <>
          <ellipse cx="40" cy="29" rx="29" ry="17" transform="rotate(-12 40 29)" stroke={`url(#${id}-jewel)`} strokeWidth="6" />
          <ellipse cx="40" cy="29" rx="29" ry="17" transform="rotate(-12 40 29)" stroke={`url(#${id}-shine)`} strokeWidth="1.2" />
          <path d="m64 19 4 1-1 4-4-1 1-4Z" fill={`url(#${id}-shine)`} stroke="#9B6B1B" strokeWidth="1" />
        </>
      ) : type === JewelryType.EARRINGS ? (
        <>
          <path d="M25 15v5m0 0a9 9 0 1 0 0 .1m0-.1v-5" stroke={`url(#${id}-jewel)`} strokeWidth="4" strokeLinecap="round" />
          <path d="M55 15v5m0 0a9 9 0 1 0 0 .1m0-.1v-5" stroke={`url(#${id}-jewel)`} strokeWidth="4" strokeLinecap="round" />
          <circle cx="25" cy="9" r="2.5" fill={`url(#${id}-shine)`} stroke="#9B6B1B" />
          <circle cx="55" cy="9" r="2.5" fill={`url(#${id}-shine)`} stroke="#9B6B1B" />
        </>
      ) : (
        <>
          <path d="M40 6c4 8 13 12 23 13-2 15-11 25-23 31-12-6-21-16-23-31C27 18 36 14 40 6Z" fill={`url(#${id}-jewel)`} stroke="#9B6B1B" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M40 13c3 6 9 9 16 10-2 10-8 17-16 22-8-5-14-12-16-22 7-1 13-4 16-10Z" stroke={`url(#${id}-shine)`} strokeWidth="1.5" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
