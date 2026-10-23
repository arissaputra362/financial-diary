import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/*
   T-009 / AC-F6-12 browser retest (QA-owned, scratch) — correction loop round 3.

   Focus: BUG-3 (Escape in a NESTED dialog must close one layer only and keep the
   parent open, focus on the nested trigger), BUG-4 (Tab must never reach the
   parent dialog), BUG-5 (wallet-surface touch targets >= 44px), the reconciled
   C-32 flow, "scope is not colour only", no horizontal overflow, no console
   errors. Real Chromium at 390/768/1280 against the disposable LOCAL database
   `financial_planner_dev_t009r1`. No live Gemini / Vercel Blob call (the receipt
   image response is intercepted inside the browser).
*/

const DB = process.env["QA_T009_DB_URL"] ??
  "postgresql://postgres:postgres@localhost:5432/financial_planner_dev_t009r1";
const PREFIX = "qa-t009-r3-";
const PW = "password123";

const results: Array<{ id: string; name: string; pass: boolean; detail: string }> = [];
function rec(id: string, name: string, pass: boolean, detail: string): void {
  results.push({ id, name, pass, detail });
  console.log((pass ? "PASS" : "FAIL") + " [" + id + "] " + name + " :: " + detail);
}

function sqlQ(sql: string): string {
  return execFileSync("psql", [DB, "-At", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: "postgres" },
  }).trim();
}

async function cleanupFixtures(): Promise<void> {
  const uid = `select id from "user" where email like '${PREFIX}%'`;
  const hh = `select id from household where owner_user_id in (${uid})`;
  const statements: string[] = [
    `delete from membership_event where membership_id in (select id from membership where user_id in (${uid}))`,
    `delete from session where user_id in (${uid})`,
    `delete from idempotency_key where user_id in (${uid})`,
    `delete from "transaction" where household_id in (${hh})`,
    `delete from ocr_job where receipt_id in (select id from receipt where household_id in (${hh}))`,
    `delete from receipt where household_id in (${hh})`,
    `delete from wallet where household_id in (${hh})`,
    `delete from household_budget where household_id in (${hh})`,
    `delete from advisor_insight where household_id in (${hh})`,
    `delete from savings_goal where household_id in (${hh})`,
    `delete from membership where household_id in (${hh}) or user_id in (${uid})`,
    `delete from invite where household_id in (${hh})`,
    `delete from household where owner_user_id in (${uid})`,
    `delete from "user" where email like '${PREFIX}%'`,
  ];
  for (const statement of statements) sqlQ(statement);
}

type Signup = { email: string; userId: string; householdId: string };

async function signUp(page: Page, tag: string): Promise<Signup> {
  const email =
    PREFIX + tag + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + "@test.local";
  const response = await page.request.post("/api/auth/signup", {
    data: { email, displayName: "QA R3 Owner", password: PW },
  });
  expect(response.status(), "signup failed").toBe(201);
  const body = (await response.json()) as { user: { id: string }; household: { id: string } };
  return { email, userId: body.user.id, householdId: body.household.id };
}

async function createWallet(page: Page, body: Record<string, unknown>): Promise<string> {
  const response = await page.request.post("/api/wallets", { data: body });
  expect(response.status(), "wallet create failed: " + JSON.stringify(body)).toBe(201);
  const data = (await response.json()) as { id: string; name: string };
  return data.id;
}

async function seedReceipt(page: Page, owner: Signup): Promise<string> {
  const receiptId = randomUUID();
  sqlQ(
    "insert into receipt (id, household_id, uploaded_by_user_id, content_sha256, mime_type, size_bytes, storage_key) values ('" +
      receiptId +
      "','" +
      owner.householdId +
      "','" +
      owner.userId +
      "','" +
      randomUUID().replace(/-/g, "") +
      "','image/jpeg',11,'receipts/qa-t009-r3/never-read')",
  );
  return receiptId;
}

async function seedReceiptTransaction(page: Page, walletId: string, receiptId: string): Promise<void> {
  const occurredAt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const response = await page.request.post("/api/transactions", {
    data: {
      type: "MONEY_OUT",
      amountMinor: 25_000,
      category: "food",
      occurredAt,
      source: "OCR",
      receiptId,
      merchant: "Toko Struk R3",
      walletId,
    },
  });
  expect(response.status(), "receipt transaction failed").toBe(201);
}

/** Tab-trap check with real browser key presses; returns "" if focus never left `selector`. */
async function tabEscapesReal(page: Page, selector: string, presses = 14): Promise<string> {
  for (let i = 0; i < presses; i += 1) {
    const inside = await page.evaluate((sel) => {
      const panel = document.querySelector<HTMLElement>(sel);
      const active = document.activeElement;
      return !!panel && !!active && panel.contains(active);
    }, selector);
    if (!inside) return "escaped-at-" + i;
    await page.keyboard.press("Tab");
  }
  return "0";
}

const consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 220));
  });
  page.on("pageerror", (error) => consoleErrors.push("pageerror: " + error.message.slice(0, 220)));
  await cleanupFixtures();
});

test.afterAll(() => {
  try {
    cleanupFixtures();
  } catch {
    /* best effort */
  }
  const unique = Array.from(new Set(consoleErrors));
  console.log("\nCONSOLE_ERRORS=" + JSON.stringify(unique.slice(0, 8)));
  const passed = results.filter((r) => r.pass).length;
  console.log("SUMMARY pass=" + passed + " fail=" + (results.length - passed) + " total=" + results.length);
});

/* ---- BUG-3 / BUG-4: nested wallet picker over the add-transaction sheet ---- */

test("nested picker: Escape peels one layer, parent + input preserved, focus on the nested trigger, Tab stays inside", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "nested keyboard mechanics need one deterministic viewport");

  await signUp(page, "nest");
  await createWallet(page, { name: "Bersama Nest", scope: "SHARING" });
  await createWallet(page, { name: "Pribadi Nest", scope: "PERSONAL" });

  await page.goto("/transactions");
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  const addSheet = page.locator('[aria-labelledby="add-transaction-title"]');
  await expect(addSheet).toBeVisible();

  /* Type real input into the parent sheet before opening the nested dialog. */
  await page.getByLabel("Jumlah").fill("125000");
  await page.getByLabel("Nama toko (opsional)").fill("Warung QA Nest");
  const amountBefore = await page.getByLabel("Jumlah").inputValue();

  const field = page.getByRole("button", { name: /Pilih dompet/ });
  await field.click();
  const picker = page.getByRole("dialog", { name: "Pilih dompet" });
  await expect(picker).toBeVisible();

  /* ---- BUG-4: Tab must never reach the parent while the picker is open. */
  const tabInPicker = await tabEscapesReal(page, '[aria-labelledby="wallet-picker-title"]', 16);
  rec("NEST-a", "Tab never leaves the nested picker into the parent sheet", tabInPicker === "0", "result=" + tabInPicker);

  /* ---- BUG-3: Escape closes exactly one layer. */
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  const parentStillOpen = await page.locator('[aria-labelledby="add-transaction-title"]').count();
  rec("NEST-b", "Escape closes the nested picker only; the add-transaction sheet stays open", parentStillOpen === 1, "parentDialogs=" + parentStillOpen);

  const amountAfter = await page.getByLabel("Jumlah").inputValue();
  const merchantAfter = await page.getByLabel("Nama toko (opsional)").inputValue();
  rec(
    "NEST-c",
    "input typed in the parent sheet survives the nested Escape",
    amountBefore === amountAfter && amountAfter === "125.000" && merchantAfter === "Warung QA Nest",
    "amount=" + amountAfter + " merchant=" + merchantAfter,
  );

  const focusAfterNestedEscape = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    hasPopup: document.activeElement?.getAttribute("aria-haspopup") ?? null,
    isBody: document.activeElement?.tagName === "BODY",
  }));
  rec(
    "NEST-d",
    "focus returns to the nested trigger (wallet field), not to BODY",
    focusAfterNestedEscape.hasPopup === "dialog" && focusAfterNestedEscape.isBody === false,
    "active=" + JSON.stringify(focusAfterNestedEscape),
  );

  /* Reopen the picker and confirm the bound/entered state is still usable (no dead end). */
  await page.getByRole("button", { name: /Pilih dompet/ }).click();
  await expect(picker).toBeVisible();
  await picker.getByRole("option", { name: /Bersama Nest/ }).click();
  await expect(picker).toBeHidden();
  const bound = await page.getByRole("button", { name: /Bersama Nest/ }).count();
  rec("NEST-e", "picker remains usable after the nested Escape round-trip", bound === 1, "fieldWithOption=" + bound);

  /* ---- one layer at a time: a second Escape now closes the parent. */
  await page.keyboard.press("Escape");
  await expect(addSheet).toBeHidden();
  const parentAfterSecondEscape = await page.locator('[aria-labelledby="add-transaction-title"]').count();
  rec("NEST-f", "a second Escape closes the parent add-transaction sheet (one layer per press)", parentAfterSecondEscape === 0, "parentDialogs=" + parentAfterSecondEscape);
  const focusAfterParentEscape = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    isBody: document.activeElement?.tagName === "BODY",
    text: (document.activeElement?.textContent ?? "").trim().slice(0, 30),
  }));
  rec(
    "NEST-g",
    "focus after the parent Escape is the 'Tambah transaksi' trigger, not BODY",
    focusAfterParentEscape.isBody === false && focusAfterParentEscape.text.includes("Tambah transaksi"),
    "active=" + JSON.stringify(focusAfterParentEscape),
  );
});

/* ---- BUG-3 / BUG-4: receipt viewer over the transaction detail sheet ------ */

test("receipt viewer over detail sheet: Escape peels one layer, Tab stays inside, focus on 'Lihat struk'", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single deterministic viewport");

  const owner = await signUp(page, "viewer");
  const walletId = await createWallet(page, { name: "Bersama Struk R3", scope: "SHARING" });
  const receiptId = await seedReceipt(page, owner);
  await seedReceiptTransaction(page, walletId, receiptId);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
  let imageRequests = 0;
  await page.route("**/api/ocr/receipts/*/image", async (route) => {
    imageRequests += 1;
    await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });

  await page.goto("/transactions");
  await page.getByRole("button", { name: /Buka detail transaksi.*Toko Struk R3/ }).click();
  const detail = page.locator('[aria-labelledby="transaction-detail-title"]');
  await expect(detail).toBeVisible();
  await page.getByRole("button", { name: "Lihat struk" }).click();
  const viewer = page.getByRole("dialog", { name: "Foto struk" });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("img")).toBeVisible();

  /* ---- BUG-4 */
  const tabInViewer = await tabEscapesReal(page, '[role="dialog"][aria-label="Foto struk"]', 16);
  rec("V3-a", "Tab never leaves the receipt viewer into the transaction detail sheet", tabInViewer === "0", "result=" + tabInViewer);

  /* ---- BUG-3 */
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  const detailStillOpen = await page.locator('[aria-labelledby="transaction-detail-title"]').count();
  rec("V3-b", "Escape closes the receipt viewer only; the transaction detail sheet stays open", detailStillOpen === 1, "detailDialogs=" + detailStillOpen);
  const focus = await page.evaluate(() => ({
    tag: document.activeElement?.tagName ?? null,
    isBody: document.activeElement?.tagName === "BODY",
    text: (document.activeElement?.textContent ?? "").trim(),
  }));
  rec(
    "V3-c",
    "focus returns to the 'Lihat struk' trigger, not to BODY",
    focus.text === "Lihat struk" && focus.isBody === false,
    "active=" + JSON.stringify(focus),
  );

  /* Reopen the viewer: the nested dialog must not be a dead end after Escape. */
  await page.getByRole("button", { name: "Lihat struk" }).click();
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("img")).toBeVisible();
  rec("V3-d", "receipt viewer reopens after the nested Escape round-trip (no dead end)", imageRequests >= 1, "imageRequests=" + imageRequests);

  /* One layer at a time: a second Escape closes the detail sheet. */
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  const detailAfterSecondEscape = await page.locator('[aria-labelledby="transaction-detail-title"]').count();
  rec("V3-e", "a second Escape closes the transaction detail sheet (one layer per press)", detailAfterSecondEscape === 0, "detailDialogs=" + detailAfterSecondEscape);
  const finalFocus = await page.evaluate(() => document.activeElement?.tagName ?? null);
  rec("V3-f", "focus after the detail sheet closes is not left on BODY", finalFocus !== "BODY", "active=" + finalFocus);
});

/* ---- BUG-5: wallet-surface touch targets >= 44px (all three viewports) ---- */

test("wallet surfaces: Kelola, 'Termasuk dompet di Arsip' and manage-sheet actions are >= 44px", async ({
  page,
}, testInfo) => {
  const width = page.viewportSize()?.width ?? 0;
  await signUp(page, "touch-" + testInfo.project.name);
  await createWallet(page, { name: "Bersama Touch", scope: "SHARING" });
  await createWallet(page, { name: "Pribadi Touch", scope: "PERSONAL" });

  await page.goto("/home");
  await expect(page.getByRole("button", { name: /Bersama Touch.*buka detail/ })).toBeVisible();

  /*
    Measures every visible interactive node matching a text/scope predicate and
    returns its box. Plain JS filtering is used instead of Playwright's
    `:text-is()` / `:has-text()` because those are not valid CSS selectors for
    `document.querySelectorAll`.
  */
  const measure = async (
    predicate: { text?: string; within?: string; tags?: string[] },
    label: string,
  ): Promise<Array<{ label: string; h: number; w: number }>> =>
    page.evaluate(
      ({ pred, lbl }) => {
        const out: Array<{ label: string; h: number; w: number }> = [];
        const tags = pred.tags ?? ["button", "[role='button']", "a[href]", "input", "select", "textarea"];
        const root = pred.within ? document.querySelector<HTMLElement>(pred.within) : document;
        if (!root) return out;
        for (const node of root.querySelectorAll<HTMLElement>(tags.join(","))) {
          const text = (node.getAttribute("aria-label") || node.textContent || "").trim();
          if (pred.text !== undefined && text !== pred.text) continue;
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const style = getComputedStyle(node);
          if (style.visibility === "hidden" || style.display === "none") continue;
          out.push({ label: lbl, h: Math.round(rect.height * 100) / 100, w: Math.round(rect.width * 100) / 100 });
        }
        return out;
      },
      { pred: predicate, lbl: label },
    );

  /* 1. Card `Kelola` (BUG-5). */
  const kelola = await measure({ text: "Kelola" }, "Kelola");
  rec(
    "TOUCH-" + width + "-kelola",
    "wallet card 'Kelola' is at least 44px tall",
    kelola.length > 0 && kelola.every((b) => b.h >= 44),
    JSON.stringify(kelola),
  );

  /* 2. Summary helpers (BUG-5). */
  const archiveHelpers = await measure({ text: "Termasuk dompet di Arsip" }, "Termasuk dompet di Arsip");
  rec(
    "TOUCH-" + width + "-arsip",
    "'Termasuk dompet di Arsip' helpers are at least 44px tall",
    archiveHelpers.length >= 2 && archiveHelpers.every((b) => b.h >= 44),
    JSON.stringify(archiveHelpers),
  );

  /* 3. Manage-sheet row actions (BUG-5). */
  await page.getByRole("button", { name: "Kelola", exact: true }).first().click();
  const manage = page.getByRole("dialog", { name: "Kelola dompet" });
  await expect(manage).toBeVisible();
  await expect(manage.getByRole("button", { name: "Ubah" }).first()).toBeVisible();
  const manageActions = [
    ...(await measure({ text: "Ubah", within: '[aria-labelledby="wallet-manage-title"]' }, "manage row action Ubah")),
    ...(await measure({ text: "Arsipkan", within: '[aria-labelledby="wallet-manage-title"]' }, "manage row action Arsipkan")),
  ];
  rec(
    "TOUCH-" + width + "-manage",
    "manage-sheet row actions (Ubah/Arsipkan, Aktif tab) are at least 44px tall",
    manageActions.length >= 2 && manageActions.every((b) => b.h >= 44),
    JSON.stringify(manageActions),
  );

  /* Arsip tab row action (Pulihkan) uses the same min-h-11 pattern; verify too. */
  await manage.getByRole("tab", { name: "Arsip" }).click();
  await expect(manage.getByRole("button", { name: "Pulihkan" }).first()).toBeVisible();
  const restoreActions = await measure({ text: "Pulihkan", within: '[aria-labelledby="wallet-manage-title"]' }, "manage row action Pulihkan");
  rec(
    "TOUCH-" + width + "-manage-arsip",
    "manage-sheet row action (Pulihkan, Arsip tab) is at least 44px tall",
    restoreActions.length >= 1 && restoreActions.every((b) => b.h >= 44),
    JSON.stringify(restoreActions),
  );

  /* 4. Whole wallet section + add-transaction sheet: nothing below 44px (wider sweep). */
  const walletSectionSmall = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('section[aria-labelledby="wallets-title"]');
    const out: Array<{ label: string; h: number; w: number }> = [];
    for (const node of section?.querySelectorAll<HTMLElement>("button, [role='button'], a[href], input, select, textarea") ?? []) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height >= 44) continue;
      out.push({ label: (node.getAttribute("aria-label") || node.textContent || node.tagName).trim().slice(0, 40), h: Math.round(rect.height), w: Math.round(rect.width) });
    }
    return out;
  });
  rec(
    "TOUCH-" + width + "-section",
    "no wallet-section control is below 44px tall",
    walletSectionSmall.length === 0,
    "count=" + walletSectionSmall.length + " " + JSON.stringify(walletSectionSmall.slice(0, 6)),
  );
  await page.keyboard.press("Escape");
  await expect(manage).toBeHidden();

  await page.goto("/transactions");
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  const sheet = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[aria-labelledby="add-transaction-title"]');
    const walletFailures: Array<{ label: string; h: number; w: number }> = [];
    const preExisting: Array<{ label: string; h: number; w: number }> = [];
    for (const node of panel?.querySelectorAll<HTMLElement>("button, [role='button'], a[href], input, select, textarea") ?? []) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height >= 44) continue;
      const label = (node.getAttribute("aria-label") || node.textContent || node.tagName).trim().slice(0, 40);
      const box = { label, h: Math.round(rect.height), w: Math.round(rect.width) };
      /*
        These two controls belong to the T-006 transaction form, not to any F6
        wallet surface: the amount <input> (its 48px wrapper is the tap row) and
        the "Ada struk? Scan struk" text link. Recorded separately as a residual
        so the F6 wallet-surface oracle stays factual.
      */
      if (node.id === "amount" || label === "Scan struk") preExisting.push(box);
      else walletFailures.push(box);
    }
    return { walletFailures, preExisting };
  });
  rec(
    "TOUCH-" + width + "-sheet",
    "add-transaction sheet: every WALLET surface control (field, chips, actions) is at least 44px tall",
    sheet.walletFailures.length === 0,
    "count=" + sheet.walletFailures.length + " " + JSON.stringify(sheet.walletFailures.slice(0, 6)),
  );
  rec(
    "TOUCH-" + width + "-sheet-residual",
    "RESIDUAL (pre-existing, non-wallet): transaction-form amount input and 'Scan struk' link are below 44px",
    true,
    "count=" + sheet.preExisting.length + " " + JSON.stringify(sheet.preExisting.slice(0, 6)),
  );
});

/* ---- responsive + scope-not-colour-only + console cleanliness -------------- */

test("responsive layout, scope by text, no console errors", async ({ page }, testInfo) => {
  const width = page.viewportSize()?.width ?? 0;
  await signUp(page, "resp-" + testInfo.project.name);
  await createWallet(page, { name: "Bersama Resp", scope: "SHARING" });
  await createWallet(page, { name: "Pribadi Resp", scope: "PERSONAL" });

  await page.goto("/home");
  await expect(page.getByRole("button", { name: /Bersama Resp.*buka detail/ })).toBeVisible();
  const home = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  rec("R3-resp-home-" + width, "/home has no horizontal overflow at " + width, home.scrollWidth <= home.clientWidth + 1,
    "scrollWidth=" + home.scrollWidth + " clientWidth=" + home.clientWidth);

  const pillText = await page.evaluate(() =>
    Array.from(document.querySelectorAll("span")).filter((n) => ["Pribadi", "Bersama"].includes((n.textContent ?? "").trim())).length,
  );
  const pillIcons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('section[aria-labelledby="wallets-title"] span[aria-hidden="true"] svg')).length,
  );
  rec(
    "R3-scope-" + width,
    "scope is conveyed by icon AND text label, not colour alone",
    pillText >= 2 && pillIcons >= 2,
    "pillText=" + pillText + " pillIcons=" + pillIcons,
  );

  /* Wallet detail sheet: open, check Tab trap + Escape + focus return. */
  await page.getByRole("button", { name: /Bersama Resp.*buka detail/ }).click();
  const detail = page.getByRole("dialog", { name: "Detail dompet" });
  await expect(detail).toBeVisible();
  const trap = await tabEscapesReal(page, '[aria-labelledby="wallet-detail-title"]', 12);
  rec("R3-detail-trap-" + width, "wallet detail sheet traps Tab focus", trap === "0", "result=" + trap);
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  const returned = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null);
  rec(
    "R3-detail-focus-" + width,
    "Escape closes the detail sheet and focus returns to the wallet card",
    String(returned).includes("buka detail"),
    "active=" + returned,
  );

  /* Manage sheet: open from 'Kelola' (design 06 reconciled: sheet, not a popup menu). */
  await page.getByRole("button", { name: "Kelola", exact: true }).first().click();
  const manage = page.getByRole("dialog", { name: "Kelola dompet" });
  await expect(manage).toBeVisible();
  const manageTrap = await tabEscapesReal(page, '[aria-labelledby="wallet-manage-title"]', 14);
  rec("R3-manage-trap-" + width, "'Kelola' opens the manage sheet, which traps Tab focus", manageTrap === "0", "result=" + manageTrap);
  const manageFocus = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);
  rec("R3-manage-focus-" + width, "manage sheet moves focus into the panel on open", manageFocus !== null, "active=" + manageFocus);
  await page.keyboard.press("Escape");
  await expect(manage).toBeHidden();
  const manageReturn = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? null);
  rec("R3-manage-return-" + width, "Escape closes the manage sheet and focus returns to 'Kelola'", manageReturn === "Kelola", "active=" + manageReturn);
});

/* ---- console cleanliness (incl. the React duplicate-key warning on /home) -- */

test("no console errors while opening every wallet sheet and the nested dialogs", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single deterministic viewport");

  const owner = await signUp(page, "console");
  const walletId = await createWallet(page, { name: "Bersama Console", scope: "SHARING" });
  const receiptId = await seedReceipt(page, owner);
  await seedReceiptTransaction(page, walletId, receiptId);

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route("**/api/ocr/receipts/*/image", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: png });
  });

  const before = consoleErrors.length;

  /* /home: card -> detail, `Kelola` -> manage (design 06 sheet), `Dompet baru` -> create form. */
  await page.goto("/home");
  await expect(page.getByRole("button", { name: /Bersama Console.*buka detail/ })).toBeVisible();
  await page.getByRole("button", { name: /Bersama Console.*buka detail/ }).click();
  await expect(page.getByRole("dialog", { name: "Detail dompet" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Kelola", exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: "Kelola dompet" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dompet baru" }).click();
  await expect(page.getByRole("dialog", { name: "Buat dompet" })).toBeVisible();
  await page.keyboard.press("Escape");

  /* Nested picker over the add-transaction sheet. */
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  await page.getByRole("button", { name: /Pilih dompet/ }).click();
  await expect(page.getByRole("dialog", { name: "Pilih dompet" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  /* Nested receipt viewer over the transaction detail sheet. */
  await page.goto("/transactions");
  await page.getByRole("button", { name: /Buka detail transaksi.*Toko Struk R3/ }).click();
  await page.getByRole("button", { name: "Lihat struk" }).click();
  await expect(page.getByRole("dialog", { name: "Foto struk" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  const produced = consoleErrors.slice(before);
  rec(
    "R3-console",
    "no console errors / uncaught page errors across wallet sheets, picker, viewer and detail",
    produced.length === 0,
    "count=" + produced.length + " " + JSON.stringify(produced.slice(0, 5)),
  );
});




