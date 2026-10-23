import { z } from "zod";
import { walletInstitutionSchema } from "./institutions";

/*
  Wallet contracts (T-009 / F6, A-36/A-49, design 06 §6/§12).

  Money is integer minor units, IDR scale 0 (A-05). `scope` is create-only
  (C-31): the create schema accepts it with a Pribadi default, while the update
  schema deliberately does not declare it, so any `scope` in a PATCH payload is
  an unrecognized key rejected as 422 `VALIDATION_ERROR` with
  `fieldErrors.scope` (A-36).

  T-011 adds an optional `institution` discriminated union. On create, omitted
  or `NONE` means manual; on update, omitted means unchanged and `NONE` clears.
*/

export const WALLET_SCOPES = ["PERSONAL", "SHARING"] as const;
export const WALLET_VIEWS = ["active", "archived", "all"] as const;

const INT32_MAX = 2_147_483_647;

const walletNameSchema = z
  .string({ message: "Nama dompet belum diisi." })
  .trim()
  .min(1, "Nama dompet belum diisi.")
  .max(80, "Nama dompet maksimal 80 karakter.");

const walletPurposeSchema = z
  .string()
  .trim()
  .max(80, "Tujuan penggunaan maksimal 80 karakter.");

const openingBalanceSchema = z
  .number({ message: "Saldo awal harus berupa angka." })
  .int("Saldo awal harus berupa bilangan bulat.")
  .min(0, "Saldo awal tidak boleh negatif.")
  .max(INT32_MAX, "Saldo awal terlalu besar.");

export const createWalletSchema = z.object({
  name: walletNameSchema,
  purpose: walletPurposeSchema.optional(),
  scope: z.enum(WALLET_SCOPES, { message: "Pilih jenis dompet." }).default("PERSONAL"),
  openingBalanceMinor: openingBalanceSchema.optional(),
  institution: walletInstitutionSchema.optional(),
});

/** Update surface is `name`/`purpose`/`openingBalanceMinor`/`institution`. No `scope` (C-31). */
export const updateWalletSchema = z
  .object({
    name: walletNameSchema.optional(),
    purpose: walletPurposeSchema.nullable().optional(),
    openingBalanceMinor: openingBalanceSchema.optional(),
    institution: walletInstitutionSchema.optional(),
  })
  .strict();

export const listWalletsQuerySchema = z.object({
  view: z.enum(WALLET_VIEWS, { message: "Tampilan dompet tidak dikenal." }).optional(),
});

export type CreateWalletInput = z.infer<typeof createWalletSchema>;
export type UpdateWalletInput = z.infer<typeof updateWalletSchema>;
export type ListWalletsQuery = z.infer<typeof listWalletsQuerySchema>;
