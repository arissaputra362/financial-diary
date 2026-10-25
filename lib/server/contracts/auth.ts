import { z } from "zod";

/*
  Auth contracts (feat-auth-approval §Validasi Rules, A-20, A-05).
  Email is normalized (lowercase + trim) at the contract boundary.
*/

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Masukkan alamat email yang benar.")
  .email("Masukkan alamat email yang benar.");

export const signupSchema = z.object({
  email: emailSchema,
  displayName: z
    .string()
    .trim()
    .min(1, "Nama tidak boleh kosong dan maksimal 60 karakter.")
    .max(60, "Nama tidak boleh kosong dan maksimal 60 karakter."),
  password: z.string().min(8, "Kata sandi minimal 8 karakter."),
  inviteCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Masukkan kata sandi Anda."),
  rememberSession: z.boolean().optional().default(false),
});

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Nama tidak boleh kosong.")
    .max(60, "Nama maksimal 60 karakter."),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Masukkan kata sandi saat ini."),
  newPassword: z.string().min(8, "Kata sandi baru minimal 8 karakter."),
});

/** Owner decision payloads (approve/decline/revoke), reason ≤200 (A-20). */
export const decisionSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(200, "Alasan maksimal 200 karakter.")
    .optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
