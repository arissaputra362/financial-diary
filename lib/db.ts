import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/lib/generated/prisma/client";

/*
  Prisma 7 requires driver-adapter mode (ADR-001). The Neon adapter takes a pooled
  connection string; migrations use the direct (non-pooled) URL via prisma7.config.ts.
  DATABASE_URL is read here, not from lib/env.ts, because this module is the lowest
  server-only layer and env validation (T-004) will wrap it later.
*/
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in .env (local) or the deployment environment.",
    );
  }
  const adapter = new PrismaNeon({ connectionString });
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