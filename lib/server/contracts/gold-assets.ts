import { z } from "zod";
import { hasAtMostTwoDecimals } from "@/lib/money-input";
import { GoldAssetType, GoldBrand, WalletScope } from "@/lib/generated/prisma/enums";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal perolehan tidak valid.").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Tanggal perolehan tidak valid.");

export const goldAssetInputSchema = z.object({
  scope: z.nativeEnum(WalletScope).default(WalletScope.PERSONAL),
  type: z.nativeEnum(GoldAssetType).default(GoldAssetType.BULLION),
  brand: z.nativeEnum(GoldBrand).default(GoldBrand.OTHER),
  brandCustomName: z.string().trim().max(100, "Nama merek maksimal 100 karakter.").optional(),
  name: z.string().trim().min(1, "Nama aset emas wajib diisi.").max(150, "Nama aset maksimal 150 karakter."),
  weightGrams: z.number().finite().positive("Berat emas harus lebih besar dari 0 gram.").max(2_147_483.647, "Berat emas terlalu besar.").refine((value) => Number.isInteger(value * 1000), "Berat maksimal tiga angka desimal."),
  purityPermille: z.number().int().min(1).max(1000).default(999),
  serialNumber: z.string().trim().max(100, "Nomor seri maksimal 100 karakter.").optional(),
  buyPriceMinor: z.number().finite().nonnegative("Harga beli tidak boleh negatif.").refine(hasAtMostTwoDecimals, "Harga beli maksimal dua angka desimal."),
  purchaseDate: dateSchema,
  notes: z.string().trim().optional(),
  receiptId: z.string().uuid().optional(),
});

export type GoldAssetInput = z.infer<typeof goldAssetInputSchema>;
