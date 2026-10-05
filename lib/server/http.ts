/*
  Pure HTTP plumbing shared by every route handler: JSON parsing, Zod
  validation, typed error mapping, and path params. No database import, so route
  tests can exercise real parsing/error behaviour without Prisma.
*/

import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { decisionSchema, loginSchema, signupSchema, type DecisionInput, type LoginInput, type SignupInput } from "./contracts/auth";
import { AppError, badRequest, unprocessable } from "./errors";

export async function parseJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw badRequest("INVALID_JSON", "Format data tidak valid.");
  }
}

export function validationError(error: ZodError): AppError {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.map(String).join(".") || "form";
    fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
  }
  return unprocessable(fieldErrors);
}

export function respondError(error: unknown): NextResponse {
  const appError =
    error instanceof AppError
      ? error
      : new AppError({ code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server.", statusCode: 500 });
  return NextResponse.json(
    { error: { code: appError.code, message: appError.message, fieldErrors: appError.fieldErrors } },
    { status: appError.statusCode },
  );
}

export function parseSignup(input: unknown): SignupInput {
  const result = signupSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseLogin(input: unknown): LoginInput {
  const result = loginSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseDecision(input: unknown): DecisionInput {
  const result = decisionSchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function pathParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest("INVALID_PATH", "Permintaan tidak valid.");
  }
  return value;
}
