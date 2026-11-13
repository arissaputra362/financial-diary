import { cn } from "@/lib/utils";
import { GoldAssetType, JewelryType } from "@/lib/generated/prisma/enums";
import { GOLD_TYPE_ICONS, JEWELRY_TYPE_ICONS } from "./goldAssetIcons";

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

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-2xl bg-card/75 text-green shadow-sm",
        size === "sm" ? "h-8 w-8 rounded-xl" : size === "md" ? "h-11 w-11" : "h-16 w-16",
        className,
      )}
    >
      <Icon
        weight="duotone"
        className={size === "sm" ? "h-5 w-5" : size === "md" ? "h-6 w-6" : "h-9 w-9"}
      />
    </span>
  );
}
