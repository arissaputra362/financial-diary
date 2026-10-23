/*
  T-008 developer fixture cleanup (test tooling, not app code).

  The AC-F2-8 / AC-F5-2 Playwright specs sign up real local owners with the
  reserved prefix `qa-t008-dev-<uuid>@test.local` plus one seeded transaction.
  This standalone Bun script removes exactly those fixture graphs, children
  first (FK RESTRICT order), so the local DB is left as found.

  Hard guards: it refuses to run unless DATABASE_URL targets the approved local
  database `financial_planner_t003` on a loopback host. It never touches rows
  outside the reserved prefix. Use `--dry-run` to list matches without deleting.

  Run:  bun e2e/cleanup-dev-fixtures.ts [--dry-run]
*/

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const EMAIL_PREFIX = "qa-t008-dev-";
const EMAIL_SUFFIX = "@test.local";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCAL_DATABASES = new Set(["financial_planner_t003"]);

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error("Refusing cleanup: DATABASE_URL is not set.");
  process.exit(1);
}

const parsed = new URL(rawUrl);
const databaseName = parsed.pathname.replace(/^\//, "");
if (!LOCAL_HOSTS.has(parsed.hostname) || !LOCAL_DATABASES.has(databaseName)) {
  console.error(
    `Refusing cleanup: target host=${parsed.hostname} database=${databaseName} is not the approved local target.`,
  );
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: rawUrl.replace(/\?.*$/, ""),
    options: "-c TimeZone=UTC",
  }),
});

async function findFixtureUsers() {
  return prisma.user.findMany({
    where: {
      AND: [{ email: { startsWith: EMAIL_PREFIX } }, { email: { endsWith: EMAIL_SUFFIX } }],
    },
    select: { id: true, email: true },
  });
}

async function deleteFixtureGraph(userId: string, email: string): Promise<number> {
  const households = await prisma.household.findMany({
    where: { ownerUserId: userId },
    select: { id: true },
  });
  const householdIds = households.map((household) => household.id);

  await prisma.idempotencyKey.deleteMany({ where: { userId } });
  /* Transactions reference receipts; delete them before receipts. */
  await prisma.transaction.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.ocrJob.deleteMany({ where: { receipt: { householdId: { in: householdIds } } } });
  await prisma.receipt.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.savingsGoal.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.advisorInsight.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.householdBudget.deleteMany({ where: { householdId: { in: householdIds } } });
  /* T-011: wallets reference the household; clear custom refs before deleting
     the private rows so a shared wallet never blocks the user cleanup. */
  const customInstitutions = await prisma.userCustomInstitution.findMany({
    where: { userId },
    select: { id: true },
  });
  const customIds = customInstitutions.map((row) => row.id);
  if (customIds.length > 0) {
    await prisma.wallet.updateMany({
      where: { customInstitutionId: { in: customIds } },
      data: { customInstitutionId: null },
    });
  }
  await prisma.wallet.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.userCustomInstitution.deleteMany({ where: { userId } });
  /* Membership references invite, so membership must go first. */
  await prisma.membershipEvent.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.membership.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.invite.deleteMany({ where: { householdId: { in: householdIds } } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
  await prisma.membershipEvent.deleteMany({ where: { actorUserId: userId } });
  await prisma.membership.deleteMany({ where: { userId } });
  await prisma.invite.deleteMany({ where: { createdByUserId: userId } });
  await prisma.user.delete({ where: { id: userId } });

  console.log(`  removed ${email} (households=${householdIds.length})`);
  return householdIds.length;
}

async function main(): Promise<void> {
  console.log(`Target: host=${parsed.hostname} database=${databaseName}`);
  const users = await findFixtureUsers();
  console.log(`Found ${users.length} ${EMAIL_PREFIX}*${EMAIL_SUFFIX} fixture user(s).`);

  if (dryRun) {
    for (const user of users) console.log(`  would remove ${user.email}`);
    return;
  }

  for (const user of users) {
    await deleteFixtureGraph(user.id, user.email);
  }

  const remaining = await findFixtureUsers();
  console.log(`Remaining ${EMAIL_PREFIX}*${EMAIL_SUFFIX} user(s): ${remaining.length}`);
}

main()
  .catch((error: unknown) => {
    console.error("Cleanup failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
