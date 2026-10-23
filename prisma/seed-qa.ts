/*
  QA seed for T-006 retroactive QA. Deterministic IDs so E2E selectors/assertions
  are stable. Run through the local ws bridge:
    NODE_OPTIONS not needed; neonConfig is set here (script is not bundled).
*/
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../lib/generated/prisma/client";
import { neonConfig } from "@neondatabase/serverless";
import { WebSocket } from "ws";
import bcrypt from "bcryptjs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const u = new URL(url);
neonConfig.webSocketConstructor = WebSocket;
neonConfig.wsProxy = () => `127.0.0.1:${process.env.BRIDGE_PORT || 5433}/v1?address=${u.hostname}:${u.port || 5432}`;
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineConnect = false;

const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const U = (n: number) => `a0000000-0000-4000-8000-00000000000${n}`;
const UB = (n: number) => `b0000000-0000-4000-8000-00000000000${n}`;
const TX = (n: number) => `d0000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const WA = "f0000000-0000-4000-8000-000000000001";
const WB = "f0000000-0000-4000-8000-000000000002";

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

async function main() {
  // FK-safe cleanup (children first)
  await prisma.idempotencyKey.deleteMany();
  await prisma.ocrJob.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.savingsGoal.deleteMany();
  await prisma.householdBudget.deleteMany();
  await prisma.advisorInsight.deleteMany();
  await prisma.membershipEvent.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.session.deleteMany();
  await prisma.household.deleteMany();
  await prisma.user.deleteMany();

  const pw = await bcrypt.hash("QATest123!", 10);
  await prisma.user.createMany({
    data: [
      { id: U(1), email: "qa-owner@test.local", displayName: "QA Owner", passwordHash: pw },
      { id: U(2), email: "qa-member@test.local", displayName: "QA Member", passwordHash: pw },
      { id: U(3), email: "qa-pending@test.local", displayName: "QA Pending", passwordHash: pw },
      { id: UB(1), email: "qa-owner-b@test.local", displayName: "QA Owner B", passwordHash: pw },
    ],
  });

  await prisma.household.createMany({
    data: [
      { id: A, name: "QA Test Household", ownerUserId: U(1) },
      { id: B, name: "QA Household B", ownerUserId: UB(1) },
    ],
  });

  await prisma.membership.createMany({
    data: [
      { id: "c0000000-0000-4000-8000-000000000001", householdId: A, userId: U(1), role: "OWNER", status: "APPROVED", approvedAt: daysAgo(10) },
      { id: "c0000000-0000-4000-8000-000000000002", householdId: A, userId: U(2), role: "MEMBER", status: "APPROVED", approvedAt: daysAgo(5) },
      { id: "c0000000-0000-4000-8000-000000000003", householdId: A, userId: U(3), role: "MEMBER", status: "PENDING", requestedAt: daysAgo(1) },
      { id: "c0000000-0000-4000-8000-000000000004", householdId: B, userId: UB(1), role: "OWNER", status: "APPROVED", approvedAt: daysAgo(10) },
    ],
  });

  await prisma.wallet.createMany({
    data: [
      { id: WA, householdId: A, createdByUserId: U(1), scope: "SHARING", name: "Dompet Keluarga", openingBalanceMinor: 0, systemKey: "legacy_default" },
      { id: WB, householdId: B, createdByUserId: UB(1), scope: "SHARING", name: "Dompet Keluarga", openingBalanceMinor: 0, systemKey: "legacy_default" },
    ],
  });

  await prisma.transaction.createMany({
    data: [
      { id: TX(1), householdId: A, createdByUserId: U(1), type: "MONEY_OUT", amountMinor: 50000, category: "food", merchant: "Warung Test", occurredAt: daysAgo(1), source: "MANUAL", walletId: WA },
      { id: TX(2), householdId: A, createdByUserId: U(1), type: "MONEY_OUT", amountMinor: 25000, category: "transport", merchant: "Ojek Online", occurredAt: daysAgo(0), source: "MANUAL", walletId: WA },
      { id: TX(3), householdId: A, createdByUserId: U(1), type: "MONEY_IN", amountMinor: 1000000, category: "income", note: "Gaji", occurredAt: daysAgo(2), source: "MANUAL", walletId: WA },
      { id: TX(4), householdId: A, createdByUserId: U(2), type: "MONEY_OUT", amountMinor: 200000, category: "bills", merchant: "PLN", occurredAt: daysAgo(3), source: "MANUAL", walletId: WA },
      { id: TX(5), householdId: A, createdByUserId: U(1), type: "MONEY_OUT", amountMinor: 150000, category: "shopping", merchant: "Tokoku", occurredAt: daysAgo(5), source: "MANUAL", walletId: WA },      { id: TX(8), householdId: A, createdByUserId: U(1), type: "MONEY_OUT", amountMinor: 75000, category: "food", merchant: "Toko Dihapus", occurredAt: daysAgo(4), source: "MANUAL", deletedAt: daysAgo(1), deletedByUserId: U(1), walletId: WA },
      { id: TX(9), householdId: B, createdByUserId: UB(1), type: "MONEY_OUT", amountMinor: 900000, category: "food", merchant: "Household B Only", occurredAt: daysAgo(1), source: "MANUAL", walletId: WB },
    ],
  });

  await prisma.householdBudget.create({
    data: { householdId: A, periodStart: monthStart(), amountMinor: 5000000, createdByUserId: U(1) },
  });

  await prisma.savingsGoal.createMany({
    data: [
      { id: "e0000000-0000-4000-8000-000000000001", householdId: A, createdByUserId: U(1), name: "Liburan", targetAmountMinor: 1000000, savedAmountMinor: 250000 },
      { id: "e0000000-0000-4000-8000-000000000002", householdId: A, createdByUserId: U(1), name: "Dana Darurat", targetAmountMinor: 500000, savedAmountMinor: 500000 },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    households: await prisma.household.count(),
    memberships: await prisma.membership.count(),
    transactions: await prisma.transaction.count(),
    budgets: await prisma.householdBudget.count(),
    goals: await prisma.savingsGoal.count(),
  };
  console.log("SEED OK", JSON.stringify(counts));
}

main().catch((e) => { console.error("SEED FAIL", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
