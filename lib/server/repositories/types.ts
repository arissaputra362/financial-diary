import type { PrismaClient } from "@/lib/generated/prisma/client";

/*
  Every repository receives its Prisma client through this type. Repositories never
  import lib/db.ts directly, so unit tests can inject a mock client (ADR-006) and
  the composition root (services, T-004+) wires the real one.
*/
export type Db = PrismaClient;