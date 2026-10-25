import { z } from "zod";

export const updateHouseholdSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama keluarga belum diisi.")
    .max(80, "Nama keluarga maksimal 80 karakter."),
});

export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;
