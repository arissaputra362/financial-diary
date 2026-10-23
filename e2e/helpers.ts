import { randomUUID } from "node:crypto";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { WalletScope } from "../types/api";

/*
  Shared E2E helpers (T-005). The dashboard requires an approved session, so each
  test signs up a fresh owner household through the real API; the Set-Cookie is
  stored in the page's browser context, so subsequent page navigations and API
  requests are authenticated.
*/

let sequence = 0;

/**
 * Reserved fixture prefix for the T-008 developer test-gap specs. Kept distinct
 * from the QA prefixes so `e2e/cleanup-dev-fixtures.ts` can delete exactly these
 * local rows children-first.
 */
export function devFixtureEmail(): string {
  return `qa-t008-dev-${randomUUID()}@test.local`;
}

export async function signUpOwner(page: Page, email?: string): Promise<string> {
  const unique = `${Date.now()}-${process.pid}-${sequence++}`;
  const fixtureEmail = email ?? `e2e-${unique}@test.local`;
  const response = await page.request.post("/api/auth/signup", {
    data: {
      email: fixtureEmail,
      displayName: "E2E Owner",
      password: "password123",
    },
  });
  expect(response.status(), `signup failed: ${await response.text()}`).toBe(201);
  return fixtureEmail;
}

/** Today's date-only string on the Asia/Jakarta calendar (valid `occurredAt`). */
export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type SeededWallet = {
  id: string;
  name: string;
  scope: WalletScope;
};

/** Create a real wallet so transaction fixtures satisfy the current contract. */
export async function createWallet(
  page: Page,
  input: {
    name: string;
    scope?: WalletScope;
    openingBalanceMinor?: number;
  },
): Promise<SeededWallet> {
  const response = await page.request.post("/api/wallets", {
    data: {
      name: input.name,
      scope: input.scope ?? "SHARING",
      openingBalanceMinor: input.openingBalanceMinor ?? 0,
    },
  });
  expect(response.status(), `wallet create failed: ${await response.text()}`).toBe(201);
  const body = (await response.json()) as SeededWallet;
  return { id: body.id, name: body.name, scope: body.scope };
}

/*
  A page-scoped reusable wallet keeps transaction seeds cheap: every call in one
  test shares the same household wallet, while a fresh page gets a fresh one.
*/
const defaultWalletByPage = new WeakMap<Page, Promise<SeededWallet>>();

export function ensureWallet(page: Page): Promise<SeededWallet> {
  let wallet = defaultWalletByPage.get(page);
  if (!wallet) {
    wallet = createWallet(page, { name: "Dompet E2E", scope: "SHARING" });
    defaultWalletByPage.set(page, wallet);
  }
  return wallet;
}

export async function seedTransaction(
  page: Page,
  body: {
    type: "MONEY_IN" | "MONEY_OUT";
    amountMinor: number;
    category: string;
    merchant: string;
  },
  walletId?: string,
): Promise<void> {
  const wallet = walletId ?? (await ensureWallet(page)).id;
  const response = await page.request.post("/api/transactions", {
    data: { ...body, walletId: wallet, occurredAt: todayJakarta() },
  });
  expect(response.status(), `seed transaction failed: ${await response.text()}`).toBe(201);
}

export type MemberSession = {
  context: BrowserContext;
  page: Page;
  email: string;
};

/**
 * Smallest member-role fixture for T-015: create an invite as the owner, redeem
 * it in a separate browser context, then approve the pending membership. The
 * member page is a real session, so role-gated UI is exercised through the
 * shipped auth path rather than a mocked role.
 */
export async function signUpMember(
  browser: Browser,
  ownerPage: Page,
  baseURL: string,
): Promise<MemberSession> {
  const inviteResponse = await ownerPage.request.post("/api/family/invites");
  expect(inviteResponse.status(), `invite failed: ${await inviteResponse.text()}`).toBe(201);
  const invite = (await inviteResponse.json()) as { plaintextCode: string };

  const email = `e2e-member-${Date.now()}-${process.pid}-${sequence++}@test.local`;
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const signupResponse = await page.request.post("/api/auth/signup", {
    data: {
      email,
      displayName: "E2E Member",
      password: "password123",
      inviteCode: invite.plaintextCode,
    },
  });
  expect(signupResponse.status(), `member signup failed: ${await signupResponse.text()}`).toBe(
    201,
  );

  const membersResponse = await ownerPage.request.get("/api/family/members");
  expect(membersResponse.status()).toBe(200);
  const members = (await membersResponse.json()) as Array<{
    id: string;
    user: { email: string } | null;
  }>;
  const membership = members.find((member) => member.user?.email === email);
  expect(membership, "new member must appear in the owner's member list").toBeTruthy();

  const approveResponse = await ownerPage.request.post(
    `/api/family/members/${membership?.id}/approve`,
  );
  expect(approveResponse.status(), `approve failed: ${await approveResponse.text()}`).toBe(200);

  return { context, page, email };
}
