import {
  Circle,
  CircleNotch,
  Coins,
  Diamond,
  DotsThree,
  Ear,
  Link,
  type IconProps,
} from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { GoldAssetType, JewelryType } from "@/lib/generated/prisma/enums";

export type GoldIconSpec = {
  icon: ComponentType<IconProps>;
  weight: "duotone";
};

export const JEWELRY_TYPE_OPTIONS: Array<{ value: JewelryType; label: string }> = [
  { value: JewelryType.RING, label: "Cincin" },
  { value: JewelryType.NECKLACE, label: "Kalung" },
  { value: JewelryType.BRACELET, label: "Gelang" },
  { value: JewelryType.EARRINGS, label: "Anting" },
  { value: JewelryType.OTHER, label: "Lainnya" },
];

/** Category icon used by the form, filter chips, and the asset card. */
export const GOLD_TYPE_ICONS: Record<GoldAssetType, GoldIconSpec> = {
  [GoldAssetType.BULLION]: { icon: Coins, weight: "duotone" },
  [GoldAssetType.JEWELRY]: { icon: Diamond, weight: "duotone" },
};

/** Jewelry subtype icon used by the form picker and the asset card. */
export const JEWELRY_TYPE_ICONS: Record<JewelryType, GoldIconSpec> = {
  [JewelryType.RING]: { icon: Circle, weight: "duotone" },
  [JewelryType.NECKLACE]: { icon: Link, weight: "duotone" },
  [JewelryType.BRACELET]: { icon: CircleNotch, weight: "duotone" },
  [JewelryType.EARRINGS]: { icon: Ear, weight: "duotone" },
  [JewelryType.OTHER]: { icon: DotsThree, weight: "duotone" },
};
