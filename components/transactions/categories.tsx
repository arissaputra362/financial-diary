/*
  Canonical category vocabulary (A-09 / design 03 §2.2). Labels are the
  Indonesian strings ship-ready for the UI; `income` never appears on money-out
  and non-income categories never appear on money-in.
*/

import { Car, CurrencyCircleDollar, FilmSlate, ForkKnife, Gift, GraduationCap, Heart, Receipt, ShoppingBag, Tag } from "@phosphor-icons/react";
import { ArrowLeftRight } from "lucide-react";
import type { ReactNode } from "react";
import type { TransactionType } from "@/types/api";
import { cn } from "@/lib/utils";

export const CATEGORY_LABELS: Record<string, string> = {
  food: "Makanan",
  transport: "Transportasi",
  bills: "Tagihan",
  shopping: "Belanja",
  health: "Kesehatan",
  education: "Pendidikan",
  entertainment: "Hiburan",
  income: "Pendapatan",
  gift_donation: "Hadiah/Donasi",
  other: "Lainnya",
};

const MONEY_OUT_CATEGORIES = [
  "food",
  "transport",
  "bills",
  "shopping",
  "health",
  "education",
  "entertainment",
  "gift_donation",
  "other",
] as const;

const MONEY_IN_CATEGORIES = ["income", "gift_donation", "other"] as const;

export function categoriesForType(type: TransactionType): readonly string[] {
  return type === "MONEY_IN" ? MONEY_IN_CATEGORIES : MONEY_OUT_CATEGORIES;
}

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "Tanpa kategori";
  return CATEGORY_LABELS[category] ?? "Lainnya";
}

export function categoryGlyph(category: string | null | undefined): ReactNode {
  const props = { className: "h-5 w-5", weight: "duotone" as const, "aria-hidden": true as const };
  switch (category) {
    case "food": return <ForkKnife {...props} />;
    case "transport": return <Car {...props} />;
    case "bills": return <Receipt {...props} />;
    case "shopping": return <ShoppingBag {...props} />;
    case "health": return <Heart {...props} />;
    case "education": return <GraduationCap {...props} />;
    case "entertainment": return <FilmSlate {...props} />;
    case "income": return <CurrencyCircleDollar {...props} />;
    case "gift_donation": return <Gift {...props} />;
    default: return <Tag {...props} />;
  }

}

/* Pastel badge background/text pairs per category. */
export const CATEGORY_TONES: Record<string, string> = {
  food: "bg-category-orange-bg text-category-orange-text",
  transport: "bg-category-indigo-bg text-category-indigo-text",
  bills: "bg-category-blue-bg text-category-blue-text",
  shopping: "bg-category-pink-bg text-category-pink-text",
  health: "bg-category-rose-bg text-category-rose-text",
  education: "bg-category-amber-bg text-category-amber-text",
  entertainment: "bg-category-purple-bg text-category-purple-text",
  income: "bg-category-emerald-bg text-category-emerald-text",
  gift_donation: "bg-category-teal-bg text-category-teal-text",
  other: "bg-category-slate-bg text-category-slate-text",
};

export function categoryTone(category: string | null | undefined): string {
  if (!category) return CATEGORY_TONES.other;
  return CATEGORY_TONES[category] ?? CATEGORY_TONES.other;
}

export function CategoryIcon({
  category,
  size = "md",
  transfer = false,
  className,
}: {
  category?: string | null;
  size?: "sm" | "md";
  transfer?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        size === "sm" ? "h-8 w-8 rounded-lg" : "h-11 w-11 rounded-2xl",
        transfer ? "bg-mint text-green" : categoryTone(category),
        className,
      )}
    >
      {transfer ? (
        <ArrowLeftRight className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.25} />
      ) : (
        categoryGlyph(category)
      )}
    </span>
  );
}

/* Transfer legs share one transfer_group_id and are stored as plain money
   in/out rows, so their displayed type is detected from the group id. */
export function isTransferLeg(row: { transferGroupId: string | null }): boolean {
  return row.transferGroupId !== null;
}

export const TYPE_LABELS: Record<TransactionType, string> = {
  MONEY_OUT: "Uang keluar",
  MONEY_IN: "Uang masuk",
  TRANSFER: "Transfer",
};
