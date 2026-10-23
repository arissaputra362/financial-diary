import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/*
  Prisma 7 requires driver-adapter mode (ADR-001). The adapter depends on the
  target: Neon cloud only accepts its WebSocket serverless driver, while a local
  or self-hosted PostgreSQL talks plain TCP through @prisma/adapter-pg. The
  connection string decides which; migrations use prisma7.config.ts either way.
  DATABASE_URL is read here, not from lib/env.ts, because this module is the
  lowest server-only layer and env validation (T-004) will wrap it later.
*/
function isNeonConnection(connectionString: string): boolean {
  return connectionString.includes("neon.tech");
}

/*
  Prisma's pg adapter encodes/decodes `timestamptz` assuming a UTC session:
  Date parameters go out as a UTC wall-clock string with no offset, and result
  text comes back with its offset rewritten to +00:00. Both only round-trip
  when the database session timezone is UTC; on a non-UTC server every instant
  shifts by the session offset (observed +07 on the local Asia/Bangkok DB,
  T-008 QA finding). Pin the session to UTC so a stored instant equals the
  app's UTC instant regardless of the server's `timezone` setting. Neon's
  driver already runs in UTC, so the Neon branch is unchanged.
*/
const PG_UTC_SESSION_OPTIONS = "-c TimeZone=UTC";

/** node-postgres does not understand Prisma's `?schema=` query param. */
function pgConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("schema");
    return url.toString();
  } catch {
    return connectionString;
  }
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in .env (local) or the deployment environment.",
    );
  }
  const adapter = isNeonConnection(connectionString)
    ? new PrismaNeon({ connectionString })
    : new PrismaPg({
        connectionString: pgConnectionString(connectionString),
        options: PG_UTC_SESSION_OPTIONS,
      });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/*
  Reuse one client across hot reloads in development; a fresh client per module
  evaluation would exhaust Neon's connection pool.
*/
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}