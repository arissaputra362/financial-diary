/*
  Canonical category vocabulary (A-09 / design 03 §2.2). Labels are the
  Indonesian strings ship-ready for the UI; `income` never appears on money-out
  and non-income categories never appear on money-in.
*/

import type { TransactionType } from "@/types/api";

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

export const CATEGORY_EMOJI: Record<string, string> = {
  food: "🍔",
  transport: "🚗",
  bills: "⚡",
  shopping: "🛍️",
  health: "🏥",
  education: "🎓",
  entertainment: "🎬",
  income: "💰",
  gift_donation: "🎁",
  other: "🏷️",
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

export function categoryEmoji(category: string | null | undefined): string {
  if (!category) return "🏷️";
  return CATEGORY_EMOJI[category] ?? "🏷️";
}

/*
  Pastel badge background/text pairs per category (design 01 §5.5). Transfer
  legs use the sky tone from TransactionList since they carry no category.
*/
export const CATEGORY_TONES: Record<string, string> = {
  food: "bg-orange-100 text-orange-600",
  transport: "bg-indigo-100 text-indigo-600",
  bills: "bg-blue-100 text-blue-600",
  shopping: "bg-pink-100 text-pink-600",
  health: "bg-rose-100 text-rose-600",
  education: "bg-amber-100 text-amber-700",
  entertainment: "bg-purple-100 text-purple-600",
  income: "bg-emerald-100 text-emerald-700",
  gift_donation: "bg-teal-100 text-teal-700",
  other: "bg-slate-100 text-slate-600",
};

export function categoryTone(category: string | null | undefined): string {
  if (!category) return CATEGORY_TONES.other;
  return CATEGORY_TONES[category] ?? CATEGORY_TONES.other;
}

/**
  Transfer legs share one transfer_group_id and are stored as plain money
  in/out rows, so their displayed type is detected from the group id.
*/
export function isTransferLeg(row: { transferGroupId: string | null }): boolean {
  return row.transferGroupId !== null;
}

export const TYPE_LABELS: Record<TransactionType, string> = {
  MONEY_OUT: "Uang keluar",
  MONEY_IN: "Uang masuk",
  TRANSFER: "Transfer",
};