/*
  T-011 static bank-catalog seed (A-52, A-53, A-58).

  This is an operational tool, NOT an application route. It performs a one-way,
  repeatable upsert of the verified OJK snapshot into `bank_institution`.
  There is no runtime/external/automatic synchronization, cron, or refresh job.

  Usage (from financial-planner-project):
    bun prisma/seed-bank-institutions.ts

  Match key: OJK "Sandi Bank" (`source_ref`). A bank missing from the snapshot is
  deactivated, never deleted, so wallets that reference it keep a resolvable
  label. Name collisions abort the run instead of choosing a row silently.
*/

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import { normalizeInstitutionName } from "../lib/institution-name";
import {
  BANK_INSTITUTION_SEED,
  BANK_INSTITUTION_SEED_VERSION,
  BANK_INSTITUTION_SOURCE_PERIOD,
  BANK_INSTITUTION_SOURCE_SHA256,
  BANK_INSTITUTION_SOURCE_URL,
  type BankInstitutionSeedEntry,
} from "./data/bank-institutions-ojk-2026-06";

const SOURCE = "OJK_OFFICE_LIST";
const MAX_DISPLAY_NAME = 160;

export type SeedReport = {
  version: string;
  sourcePeriod: string;
  /** Operational import time, not the source publication date. */
  importedAt: string;
  total: number;
  inserted: number;
  updated: number;
  reactivated: number;
  unchanged: number;
  deactivated: number;
};

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is required to run the bank-institution seed.");
  /*
    node-postgres understands libpq params such as `sslmode`, but not Prisma's
    `schema` param. Remove only `schema` so a Neon URL keeps its TLS settings.
  */
  const url = new URL(raw);
  url.searchParams.delete("schema");
  return url.toString();
}

export function createSeedPrisma(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl(),
      options: "-c TimeZone=UTC",
    }),
  });
}

/** Fails closed on a duplicate source code/name or an over-long display name. */
export function validateSeedEntries(entries: readonly BankInstitutionSeedEntry[]): void {
  const codes = new Map<string, string>();
  const names = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.code.trim()) throw new Error("Seed entry has an empty OJK bank code.");
    if (!entry.name.trim()) throw new Error(`Seed entry ${entry.code} has an empty name.`);
    if (entry.name.length > MAX_DISPLAY_NAME) {
      throw new Error(`Seed entry ${entry.code} exceeds ${MAX_DISPLAY_NAME} characters.`);
    }
    const normalized = normalizeInstitutionName(entry.name);
    if (normalized.length > MAX_DISPLAY_NAME) {
      throw new Error(
        `Seed entry ${entry.code} normalizes to ${normalized.length} characters (max ${MAX_DISPLAY_NAME}).`,
      );
    }
    if (codes.has(entry.code)) {
      throw new Error(`Duplicate OJK bank code ${entry.code}: ${codes.get(entry.code)} / ${entry.name}`);
    }
    if (names.has(normalized)) {
      throw new Error(
        `Normalized name collision: "${entry.name}" (${entry.code}) and "${names.get(normalized)}". ` +
          "Resolve the source collision before seeding.",
      );
    }
    codes.set(entry.code, entry.name);
    names.set(normalized, entry.name);
  }
}

export async function seedBankInstitutions(
  prisma: PrismaClient,
  entries: readonly BankInstitutionSeedEntry[] = BANK_INSTITUTION_SEED,
): Promise<SeedReport> {
  validateSeedEntries(entries);

  const report: SeedReport = {
    version: BANK_INSTITUTION_SEED_VERSION,
    sourcePeriod: BANK_INSTITUTION_SOURCE_PERIOD,
    importedAt: new Date().toISOString(),
    total: entries.length,
    inserted: 0,
    updated: 0,
    reactivated: 0,
    unchanged: 0,
    deactivated: 0,
  };

  await prisma.$transaction(
    async (tx) => {
      for (const entry of entries) {
        const normalizedName = normalizeInstitutionName(entry.name);
        const byCode = await tx.bankInstitution.findFirst({
          where: { source: SOURCE, sourceRef: entry.code },
        });
        const byName = await tx.bankInstitution.findUnique({ where: { normalizedName } });

        if (byCode && byName && byName.id !== byCode.id) {
          throw new Error(
            `Normalized name "${entry.name}" already belongs to a different catalog row ` +
              `(source_ref=${byName.sourceRef ?? "null"}, id=${byName.id}); refusing to overwrite ` +
              `the row for OJK code ${entry.code}.`,
          );
        }
        if (!byCode && byName && byName.sourceRef && byName.sourceRef !== entry.code) {
          throw new Error(
            `Normalized name "${entry.name}" already belongs to OJK code ${byName.sourceRef}; ` +
              `refusing to overwrite it with code ${entry.code}.`,
          );
        }

        const existing = byCode ?? byName;
        const data = {
          displayName: entry.name,
          normalizedName,
          source: SOURCE,
          sourceUrl: BANK_INSTITUTION_SOURCE_URL,
          sourcePeriod: BANK_INSTITUTION_SOURCE_PERIOD,
          sourceRef: entry.code,
          seedVersion: BANK_INSTITUTION_SEED_VERSION,
          isActive: true,
        };

        if (!existing) {
          await tx.bankInstitution.create({ data });
          report.inserted += 1;
          continue;
        }

        const wasActive = existing.isActive;
        const changed =
          existing.displayName !== data.displayName ||
          existing.normalizedName !== data.normalizedName ||
          existing.sourceUrl !== data.sourceUrl ||
          existing.sourcePeriod !== data.sourcePeriod ||
          existing.sourceRef !== data.sourceRef ||
          existing.seedVersion !== data.seedVersion ||
          !wasActive;

        if (changed) {
          await tx.bankInstitution.update({ where: { id: existing.id }, data });
          if (!wasActive) report.reactivated += 1;
          report.updated += 1;
        } else {
          report.unchanged += 1;
        }
      }

      const codes = entries.map((entry) => entry.code);
      const deactivated = await tx.bankInstitution.updateMany({
        where: {
          source: SOURCE,
          isActive: true,
          OR: [{ sourceRef: null }, { sourceRef: { notIn: codes } }],
        },
        data: { isActive: false },
      });
      report.deactivated = deactivated.count;
    },
    { timeout: 60_000 },
  );

  return report;
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/seed-bank-institutions.ts")) {
  const prisma = createSeedPrisma();
  try {
    const report = await seedBankInstitutions(prisma);
    console.log(
      JSON.stringify(
        {
          ...report,
          sourceUrl: BANK_INSTITUTION_SOURCE_URL,
          sourceSha256: BANK_INSTITUTION_SOURCE_SHA256,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}
