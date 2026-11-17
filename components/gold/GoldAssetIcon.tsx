import { cn } from "@/lib/utils";
import { GoldAssetType, JewelryType } from "@/lib/generated/prisma/enums";
import { GOLD_TYPE_ICONS, JEWELRY_TYPE_ICONS } from "./goldAssetIcons";

function getIllustrationPaths(type: GoldAssetType, jewelryType?: JewelryType | null) {
  if (type === GoldAssetType.BULLION) {
    return {
      light: "/gold-icons/gold-bullion.png",
      dark: "/gold-icons/gold-bullion-dark.png",
    };
  }

  const name = (jewelryType ?? JewelryType.OTHER).toLowerCase();
  return {
    light: `/gold-icons/jewelry/${name}.png`,
    dark: `/gold-icons/jewelry/dark/${name}.png`,
  };
}

export function GoldAssetIcon({
  type,
  jewelryType,
  size = "sm",
  className,
}: {
  type: GoldAssetType;
  jewelryType?: JewelryType | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const spec =
    type === GoldAssetType.BULLION
      ? GOLD_TYPE_ICONS.BULLION
      : JEWELRY_TYPE_ICONS[jewelryType ?? JewelryType.OTHER];
  const Icon = spec.icon;
  const illustration = getIllustrationPaths(type, jewelryType);
  const isIllustration = size === "lg";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-card/75 text-green shadow-sm",
        size === "sm" ? "h-8 w-8 rounded-xl" : size === "md" ? "h-11 w-11" : "h-16 w-16",
        className,
      )}
    >
      {isIllustration ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={illustration.light}
            alt=""
            className="gold-asset-icon-light h-full w-full scale-[1.16] object-contain"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={illustration.dark}
            alt=""
            className="gold-asset-icon-dark hidden h-full w-full scale-[1.16] object-contain"
          />
        </>
      ) : (
        <Icon
          weight="duotone"
          className={size === "sm" ? "h-5 w-5" : "h-6 w-6"}
        />
      )}
    </span>
  );
}
