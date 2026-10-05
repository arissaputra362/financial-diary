/*
  Composition root and per-request authentication context (ADR-006, ADR-002).

  Route handlers depend on this module for `createServices` and
  `authenticatedRequest`; they import transport helpers from `./http` and cookie
  helpers from `./session`. Service/family authorization is enforced here and in
  the service layer.
*/

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { accessDeniedForStatus, unauthorized } from "./errors";
import { createAuthRepositories } from "./repositories/auth";
import type { Db } from "./repositories/types";
import { SESSION_COOKIE, verifySession } from "./session";
import { AuthService, type AuthRepositories, type AuthStateDTO } from "./services/auth";
import { FamilyService } from "./services/family";

export type Services = { auth: AuthService; family: FamilyService };

export function createServices(): Services {
  const repos = createAuthRepositories(prisma);

  /*
    Owner bootstrap, invite redeem, and membership transitions each run in one
    interactive transaction (dev plan §Database & Model). The transaction gets
    its own repository bundle bound to the tx client so all writes commit or
    roll back together.
  */
  const transaction = <T>(fn: (repos: AuthRepositories) => Promise<T>): Promise<T> =>
    prisma.$transaction((tx) => fn(createAuthRepositories(tx as unknown as Db)));

  return {
    auth: new AuthService(repos, transaction),
    family: new FamilyService(repos),
  };
}

export type AuthenticatedContext = {
  state: AuthStateDTO;
  userId: string;
  householdId: string;
  role: string;
  sessionId: string;
  auth: AuthService;
  family: FamilyService;
};

/**
 * Verifies the JWT, revalidates the session + membership from the DB, and
 * rejects non-approved members on protected routes with a typed 403.
 * The caller (route handler) reissues the sliding cookie via `setSessionCookie`.
 */
export async function authenticatedRequest(
  options: { approvedOnly?: boolean } = {},
): Promise<AuthenticatedContext> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw unauthorized();

  const claims = await verifySession(token);
  const services = createServices();
  const revalidated = await services.auth.revalidate(claims.sid);

  if (options.approvedOnly) {
    const denial = accessDeniedForStatus(revalidated.state.status);
    if (denial) throw denial;
  }

  return {
    state: revalidated.state,
    userId: revalidated.userId,
    householdId: revalidated.householdId ?? "",
    role: revalidated.role,
    sessionId: revalidated.sessionId,
    auth: services.auth,
    family: services.family,
  };
}
