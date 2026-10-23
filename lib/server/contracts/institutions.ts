import { z } from "zod";
import { INSTITUTION_NAME_MAX_LENGTH } from "@/lib/institution-name";

/*
  Institution contracts (T-011 / A-54, A-57).

  Quick Add has exactly one required name field and no classification. The wallet
  request uses a discriminated union so a client can never submit two references
  in one payload; `NONE` is an explicit clear/manual choice, while omitting the
  field on PATCH means "leave the label unchanged".
*/

export const institutionNameSchema = z
  .string({ message: "Nama bank atau penyedia belum diisi." })
  .trim()
  .min(1, "Nama bank atau penyedia belum diisi.")
  .max(
    INSTITUTION_NAME_MAX_LENGTH,
    `Nama bank atau penyedia maksimal ${INSTITUTION_NAME_MAX_LENGTH} karakter.`,
  );

export const quickAddInstitutionSchema = z
  .object({ name: institutionNameSchema })
  .strict();

export const listInstitutionsQuerySchema = z.object({
  q: z.string().trim().max(80, "Kata pencarian terlalu panjang.").optional(),
});

export const institutionIdSchema = z.string().uuid("Pilih bank atau penyedia.");

export const walletInstitutionSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("OFFICIAL"), id: institutionIdSchema }).strict(),
    z.object({ kind: z.literal("CUSTOM"), id: institutionIdSchema }).strict(),
    z.object({ kind: z.literal("NONE") }).strict(),
  ],
  { message: "Pilih bank atau penyedia yang valid." },
);

export type QuickAddInstitutionInput = z.infer<typeof quickAddInstitutionSchema>;
export type ListInstitutionsQuery = z.infer<typeof listInstitutionsQuerySchema>;
export type WalletInstitutionInput = z.infer<typeof walletInstitutionSchema>;
