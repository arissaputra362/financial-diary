import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

/*
   T-009 / AC-F6-12 browser accessibility pass (QA-owned, scratch).

   Real Chromium against a disposable LOCAL database (`financial_planner_dev_t009r1`).
   Covers the PM C-32 picker -> create-wallet flow, focus trap + focus return for
   the wallet sheets and the receipt viewer, accurate `aria-selected`, roving
   tabindex / Arrow navigation, responsive layout at 390/768/1280, no horizontal
   overflow, touch-target size, and "scope is not colour only".

   No live Gemini / Vercel Blob: the receipt-image request is intercepted inside
   the browser, so the server Blob client is never contacted.
*/

const DB = process.env["QA_T009_DB_URL"] ??
  "postgresql://postgres:postgres@localhost:5432/financial_planner_dev_t009r1";
const PREFIX = "qa-t009-a11y-";
const PW = "password123";

const results: Array<{ id: string; name: string; pass: boolean; detail: string }> = [];
const consoleWarnings: string[] = [];
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
  /* FK order: children before parents. */
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
    data: { email, displayName: "QA A11y Owner", password: PW },
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
      "','image/jpeg',11,'receipts/qa-t009-a11y/never-read')",
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
      merchant: "Toko Struk QA",
      walletId,
    },
  });
  expect(response.status(), "receipt transaction failed").toBe(201);
}

async function smallTouchTargets(page: Page): Promise<Array<{ label: string; h: number; w: number }>> {
  return page.evaluate(() => {
    const out: Array<{ label: string; h: number; w: number }> = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      "button, [role='button'], a[href], input, select, textarea",
    );
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(node);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (rect.height >= 44 || rect.width >= 44) continue;
      out.push({
        label: (node.getAttribute("aria-label") || node.textContent || node.tagName).trim().slice(0, 60),
        h: Math.round(rect.height),
        w: Math.round(rect.width),
      });
    }
    return out;
  });
}

/** Visible text of the rendered DOM only (inline RSC/dev scripts excluded). */
async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style").forEach((n) => n.remove());
    return (clone as HTMLElement).innerText;
  });
}

/** Tab trap check with synthetic keydown on window. */
async function tabEscapesSynthetic(page: Page, selector: string): Promise<string> {
  return page.evaluate(async (sel) => {
    const panel = document.querySelector<HTMLElement>(sel);
    if (!panel) return "no-panel";
    let outside = 0;
    for (let i = 0; i < 20; i += 1) {
      const active = document.activeElement;
      if (!active || !panel.contains(active)) outside += 1;
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    }
    return String(outside);
  }, selector);
}

/** Tab trap check with real browser key presses. */
async function tabEscapesReal(page: Page, selector: string): Promise<string> {
  for (let i = 0; i < 14; i += 1) {
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

test.beforeEach(async ({ page }) => {
  page.on("console", (message) => {
    if (message.type() === "error") consoleWarnings.push(message.text().slice(0, 220));
  });
  await cleanupFixtures();
});

test.afterAll(() => {
  try {
    cleanupFixtures();
  } catch {
    /* best effort */
  }
  const unique = Array.from(new Set(consoleWarnings));
  console.log("\nCONSOLE_ERRORS=" + JSON.stringify(unique.slice(0, 5)));
  const passed = results.filter((r) => r.pass).length;
  console.log("SUMMARY pass=" + passed + " fail=" + (results.length - passed) + " total=" + results.length);
});

/* ---- responsive + non-colour semantics (runs on all three viewports) -------- */

test("wallet surfaces: layout, no horizontal overflow, touch targets, scope by text", async ({
  page,
}, testInfo) => {
  const width = page.viewportSize()?.width ?? 0;
  await signUp(page, "layout-" + testInfo.project.name);
  await createWallet(page, { name: "Bersama QA", scope: "SHARING", purpose: "Biaya rumah" });
  await createWallet(page, { name: "Pribadi QA", scope: "PERSONAL", openingBalanceMinor: 50_000 });

  await page.goto("/home");
  await expect(page.getByRole("button", { name: /Bersama QA.*buka detail/ })).toBeVisible();
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  rec(
    "RESP-" + width + "-a",
    "/home has no horizontal overflow at " + width,
    overflow.scrollWidth <= overflow.clientWidth + 1,
    "scrollWidth=" + overflow.scrollWidth + " clientWidth=" + overflow.clientWidth,
  );

  const scoped = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('section[aria-labelledby="wallets-title"]');
    const small: Array<{ label: string; h: number; w: number }> = [];
    for (const node of section?.querySelectorAll<HTMLElement>("button, [role='button'], a[href], input, select, textarea") ?? []) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height >= 44) continue;
      small.push({ label: (node.getAttribute("aria-label") || node.textContent || node.tagName).trim().slice(0, 50), h: Math.round(rect.height), w: Math.round(rect.width) });
    }
    return small;
  });
  rec(
    "RESP-" + width + "-b",
    "/home wallet surfaces: every wallet control is at least 44px tall",
    scoped.length === 0,
    "count=" + scoped.length + " " + JSON.stringify(scoped.slice(0, 8)),
  );
  const pageWide = await smallTouchTargets(page);
  rec(
    "RESP-" + width + "-b2",
    "INFORMATIONAL: whole /home page, controls under 44px in both axes (not wallet-only)",
    true,
    "count=" + pageWide.length + " " + JSON.stringify(pageWide.slice(0, 8)),
  );

  const scopeText = await visibleText(page);
  const pillsWithText = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("span")).filter((n) =>
        ["Pribadi", "Bersama"].includes((n.textContent ?? "").trim()),
      ).length,
  );
  rec(
    "RESP-" + width + "-c",
    "scope is never colour-only (scope pill carries a text label plus an icon)",
    pillsWithText >= 2 && /Pribadi/.test(scopeText) && /Bersama/.test(scopeText),
    "pillsWithText=" + pillsWithText,
  );

  await page.goto("/transactions");
  await expect(page.getByRole("button", { name: "Tambah transaksi" }).first()).toBeVisible();
  const overflowTx = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  rec(
    "RESP-" + width + "-d",
    "/transactions has no horizontal overflow at " + width,
    overflowTx.scrollWidth <= overflowTx.clientWidth + 1,
    "scrollWidth=" + overflowTx.scrollWidth + " clientWidth=" + overflowTx.clientWidth,
  );

  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  const field = page.getByRole("button", { name: /Pilih dompet/ });
  await expect(field).toBeVisible();
  const box = await field.boundingBox();
  rec(
    "RESP-" + width + "-e",
    "wallet field trigger meets the 44px touch target",
    !!box && box.height >= 44 && box.width >= 44,
    box ? "h=" + Math.round(box.height) + " w=" + Math.round(box.width) : "no box",
  );
  const sheetControls = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[aria-labelledby="add-transaction-title"]');
    const small: Array<{ label: string; h: number; w: number }> = [];
    for (const node of panel?.querySelectorAll<HTMLElement>("button, [role='button'], a[href], input, select, textarea") ?? []) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.height >= 44) continue;
      small.push({ label: (node.getAttribute("aria-label") || node.textContent || node.tagName).trim().slice(0, 50), h: Math.round(rect.height), w: Math.round(rect.width) });
    }
    return small;
  });
  rec(
    "RESP-" + width + "-f",
    "add-transaction sheet (incl. nested wallet picker field): every control is at least 44px tall",
    sheetControls.length === 0,
    "count=" + sheetControls.length + " " + JSON.stringify(sheetControls.slice(0, 8)),
  );
});

/* ---- wallet picker semantics (single viewport; keyboard mechanics) --------- */

test("wallet picker: aria-selected, roving tabindex, Arrow navigation, Tab trap, focus return", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "keyboard mechanics need one deterministic viewport");

  await signUp(page, "picker");
  await createWallet(page, { name: "Bersama Satu", scope: "SHARING" });
  await createWallet(page, { name: "Bersama Dua", scope: "SHARING" });
  await createWallet(page, { name: "Pribadi Satu", scope: "PERSONAL" });

  await page.goto("/transactions");
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  await page.getByRole("button", { name: /Pilih dompet/ }).click();

  const picker = page.getByRole("dialog", { name: "Pilih dompet" });
  await expect(picker).toBeVisible();
  const optionCount = await picker.getByRole("option").count();
  rec("PICK-a", "picker lists every active wallet as an option", optionCount === 3, "options=" + optionCount);
  const selectedBefore = await picker.locator('[role="option"][aria-selected="true"]').count();
  rec(
    "PICK-b",
    "with nothing bound yet, no option claims aria-selected=true",
    selectedBefore === 0,
    "selected=" + selectedBefore,
  );

  await picker.getByRole("option", { name: /Bersama Satu/ }).click();
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: /Bersama Satu/ }).click();
  await expect(picker).toBeVisible();
  const selectedCount = await picker.locator('[role="option"][aria-selected="true"]').count();
  const selectedAttr = await picker.getByRole("option", { name: /Bersama Satu/ }).getAttribute("aria-selected");
  rec(
    "PICK-c",
    "reopened picker marks exactly the bound wallet aria-selected=true",
    selectedCount === 1 && selectedAttr === "true",
    "count=" + selectedCount + " boundAttr=" + selectedAttr,
  );
  const checkIcons = await picker.locator('[role="option"][aria-selected="true"] svg').count();
  const srOnly = await picker.locator('[role="option"][aria-selected="true"]').locator(".sr-only").count();
  rec(
    "PICK-d",
    "selected state is not colour-only (check icon plus sr-only text)",
    checkIcons >= 1 && srOnly >= 1,
    "checkIcons=" + checkIcons + " srOnly=" + srOnly,
  );

  const tabbableCount = await picker.locator('[role="option"][tabindex="0"]').count();
  const tabbableId = await picker.locator('[role="option"][tabindex="0"]').getAttribute("data-wallet-option");
  const boundId = await picker.getByRole("option", { name: /Bersama Satu/ }).getAttribute("data-wallet-option");
  rec(
    "PICK-e",
    "roving tabindex: exactly one tabbable option, and it is the selected wallet",
    tabbableCount === 1 && tabbableId === boundId,
    "tabbableId=" + tabbableId + " boundId=" + boundId,
  );

  await picker.getByRole("option", { name: /Bersama Satu/ }).focus();
  await page.keyboard.press("ArrowDown");
  const moved = await page.evaluate(() => document.activeElement?.getAttribute("data-wallet-option"));
  const movedLabel = await page.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 30));
  rec("PICK-f", "ArrowDown moves focus to the next option in the group", !!moved && moved !== boundId,
    "activeId=" + moved + " label=" + movedLabel);
  const tabbableAfterArrow = await picker.locator('[role="option"][tabindex="0"]').count();
  rec("PICK-g", "the roving tabindex follows the arrow focus", tabbableAfterArrow === 1,
    "tabbableCount=" + tabbableAfterArrow);

  /* Enter and Space must activate an option (native button semantics). */
  await picker.getByRole("option", { name: /Bersama Dua/ }).focus();
  await page.keyboard.press("Space");
  await expect(picker).toBeHidden();
  const spaceBound = await page.getByRole("button", { name: /Bersama Dua/ }).count();
  rec("PICK-f2", "Space activates the focused option and binds it to the field", spaceBound === 1, "fieldWithOption=" + spaceBound);
  await page.getByRole("button", { name: /Bersama Dua/ }).click();
  await expect(picker).toBeVisible();
  await picker.getByRole("option", { name: /Pribadi Satu/ }).focus();
  await page.keyboard.press("Enter");
  await expect(picker).toBeHidden();
  const enterBound = await page.getByRole("button", { name: /Pribadi Satu/ }).count();
  rec("PICK-f3", "Enter activates the focused option and binds it to the field", enterBound === 1, "fieldWithOption=" + enterBound);

  /* Reopen the picker for the Tab-trap checks (Enter/Space closed it above). */
  await page.getByRole("button", { name: /Pribadi Satu/ }).click();
  await expect(picker).toBeVisible();
  const synthetic = await tabEscapesSynthetic(page, '[aria-labelledby="wallet-picker-title"]');
  rec("PICK-h1", "Tab cycles inside the picker panel (synthetic keydown)", synthetic === "0", "outside=" + synthetic);
  const real = await tabEscapesReal(page, '[aria-labelledby="wallet-picker-title"]');
  rec("PICK-h2", "Tab cycles inside the picker panel (real key presses)", real === "0", "result=" + real);

  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  const parentOpen = await page.locator('[aria-labelledby="add-transaction-title"]').count();
  const focusBack = await page.evaluate(() => document.activeElement?.getAttribute("aria-haspopup") ?? null);
  rec(
    "PICK-i",
    "Escape closes the picker AND leaves the parent add-transaction sheet open",
    parentOpen === 1,
    "parentDialogs=" + parentOpen,
  );
  rec(
    "PICK-j",
    "Escape closes the picker and focus returns to the wallet field trigger",
    focusBack === "dialog",
    "activeAriaHaspopup=" + focusBack,
  );
});

/* ---- C-32 create-wallet flow inside the picker ---------------------------- */

test("C-32 flow: picker -> create wallet -> auto-select; cancel leaves the field unchanged", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single viewport is enough for the C-32 flow");

  await signUp(page, "c32");
  await createWallet(page, { name: "Bersama Awal", scope: "SHARING" });
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  await page.getByRole("button", { name: /Pilih dompet/ }).click();

  const picker = page.getByRole("dialog", { name: "Pilih dompet" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Buat dompet baru" }).click();

  await expect(picker).toBeHidden();
  rec(
    "C32-a",
    "clicking 'Buat dompet baru' closes the picker first (PM decision C-32)",
    (await picker.count()) === 0,
    "pickerCount=" + (await picker.count()),
  );
  const form = page.getByRole("dialog", { name: "Buat dompet" });
  await expect(form).toBeVisible();
  rec("C32-b", "the create-wallet form opens on top of the closed picker", true, "form visible");

  await form.getByLabel("Nama").fill("Dompet Baru C32");
  await form.getByRole("button", { name: "Bersama" }).click();
  await form.getByRole("button", { name: "Buat dompet" }).click();
  await expect(form).toBeHidden();

  await expect(page.getByRole("button", { name: /Dompet Baru C32/ })).toBeVisible();
  rec("C32-c", "the created wallet is auto-selected into the originating field", true, "field shows the new wallet");
  const focusAfterSave = await page.evaluate(() => ({
    hasPopup: document.activeElement?.getAttribute("aria-haspopup") ?? null,
    text: (document.activeElement?.textContent ?? "").trim().slice(0, 40),
    isBody: document.activeElement?.tagName === "BODY",
  }));
  rec(
    "C32-g",
    "after saving, focus returns to the wallet field trigger that opened the picker (design 06 §12/§14 C-32)",
    focusAfterSave.hasPopup === "dialog",
    "active=" + JSON.stringify(focusAfterSave),
  );
  await expect(picker).toBeHidden();
  rec("C32-d", "the picker is not reopened after creating a wallet", true, "still closed");

  await page.getByRole("button", { name: /Dompet Baru C32/ }).click();
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Buat dompet baru" }).click();
  await expect(picker).toBeHidden();
  const cancelForm = page.getByRole("dialog", { name: "Buat dompet" });
  await expect(cancelForm).toBeVisible();
  await cancelForm.getByRole("button", { name: "Batal" }).click();
  await expect(cancelForm).toBeHidden();
  const stillSelected = await page.getByRole("button", { name: /Dompet Baru C32/ }).count();
  rec(
    "C32-e",
    "cancelling the create form leaves the originating field unchanged",
    stillSelected === 1,
    "fieldWithNewWallet=" + stillSelected,
  );
  await expect(picker).toBeHidden();
  rec("C32-f", "cancelling does not reopen the picker", true, "closed");
  const focusAfterCancel = await page.evaluate(() => ({
    hasPopup: document.activeElement?.getAttribute("aria-haspopup") ?? null,
    text: (document.activeElement?.textContent ?? "").trim().slice(0, 40),
    isBody: document.activeElement?.tagName === "BODY",
  }));
  rec(
    "C32-h",
    "after cancelling, focus returns to the wallet field trigger (not left on body/behind the overlay)",
    focusAfterCancel.hasPopup === "dialog",
    "active=" + JSON.stringify(focusAfterCancel),
  );
});

/* ---- focus trap + focus return for the wallet sheets ---------------------- */

test("wallet sheets: focus trap on open, Escape closes, focus returns to the trigger", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single viewport is enough");

  await signUp(page, "sheets");
  await createWallet(page, { name: "Bersama Kelola", scope: "SHARING" });
  await createWallet(page, { name: "Pribadi Kelola", scope: "PERSONAL" });
  await page.goto("/home");
  const card = page.getByRole("button", { name: /Bersama Kelola.*buka detail/ });
  await expect(card).toBeVisible();

  await card.click();
  const detail = page.getByRole("dialog", { name: "Detail dompet" });
  await expect(detail).toBeVisible();
  const detailTrap = await tabEscapesReal(page, '[aria-labelledby="wallet-detail-title"]');
  rec("SHEET-detail-a", "detail sheet traps Tab focus (real key presses)", detailTrap === "0", "result=" + detailTrap);
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  const detailReturn = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null,
  );
  rec(
    "SHEET-detail-b",
    "Escape closes the detail sheet and focus returns to the card that opened it",
    String(detailReturn).includes("buka detail"),
    "active=" + detailReturn,
  );

  await page.getByRole("button", { name: "Kelola", exact: true }).first().click();
  const manage = page.getByRole("dialog", { name: "Kelola dompet" });
  await expect(manage).toBeVisible();
  const manageTrap = await tabEscapesReal(page, '[aria-labelledby="wallet-manage-title"]');
  rec("SHEET-manage-a", "manage sheet traps Tab focus (real key presses)", manageTrap === "0", "result=" + manageTrap);
  await page.keyboard.press("Escape");
  await expect(manage).toBeHidden();
  const manageReturn = await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName ?? null,
  );
  rec(
    "SHEET-manage-b",
    "Escape closes the manage sheet and focus returns to its 'Kelola' trigger",
    manageReturn === "Kelola",
    "active=" + manageReturn,
  );

  await page.getByRole("button", { name: "Dompet baru" }).click();
  const form = page.getByRole("dialog", { name: "Buat dompet" });
  await expect(form).toBeVisible();
  const formTrap = await tabEscapesReal(page, '[aria-labelledby="wallet-form-title"]');
  rec("SHEET-form-a", "create-wallet form traps Tab focus (real key presses)", formTrap === "0", "result=" + formTrap);
  const firstFocus = await page.evaluate(() => ({
    id: document.activeElement?.id ?? null,
    tag: document.activeElement?.tagName ?? null,
    label: document.activeElement?.getAttribute("aria-label") ?? null,
    insidePanel: !!document.activeElement?.closest('[aria-labelledby="wallet-form-title"]'),
  }));
  rec(
    "SHEET-form-b",
    "opening the form moves focus to the first control inside the panel",
    firstFocus.insidePanel === true,
    "initialFocus=" + JSON.stringify(firstFocus),
  );
  await page.keyboard.press("Escape");
  await expect(form).toBeHidden();
  const formReturn = await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName ?? null,
  );
  rec(
    "SHEET-form-c",
    "Escape closes the form and focus returns to the 'Dompet baru' trigger",
    formReturn.includes("Dompet baru"),
    "active=" + formReturn,
  );
});

/* ---- receipt viewer (image bytes intercepted, no live Blob) ---------------- */

test("receipt viewer: focus trap, focus return, blob: src (no storage key / public URL)", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-390", "single viewport is enough");

  const owner = await signUp(page, "viewer");
  const walletId = await createWallet(page, { name: "Bersama Struk", scope: "SHARING" });
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
  await page.getByRole("button", { name: /Buka detail transaksi.*Toko Struk QA/ }).click();
  await page.getByRole("button", { name: "Lihat struk" }).click();

  const viewer = page.getByRole("dialog", { name: "Foto struk" });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator("img")).toBeVisible();
  const src = await viewer.locator("img").getAttribute("src");
  rec(
    "VIEWER-a",
    "viewer renders the bytes fetched from the authenticated route as a blob: URL",
    !!src && src.startsWith("blob:"),
    "src=" + src,
  );
  const rendered = await visibleText(page);
  const attrs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("img, source, video")).map((n) =>
      Array.from(n.attributes).map((a) => a.name + "=" + a.value).join(" "),
    ),
  );
  rec(
    "VIEWER-b",
    "DOM carries no storage key, public Blob URL, job id or draft payload",
    !/receipts\//.test(rendered) && !/blob\.vercel/.test(rendered) && !/result_json/.test(rendered) &&
      !JSON.stringify(attrs).includes("receipts/") && !JSON.stringify(attrs).includes("vercel"),
    "imageRequests=" + imageRequests,
  );

  const trap = await tabEscapesReal(page, '[role="dialog"][aria-label="Foto struk"]');
  rec("VIEWER-c", "receipt viewer traps Tab focus (real key presses)", trap === "0", "result=" + trap);

  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  const detailStillOpen = await page.locator('[aria-labelledby="transaction-detail-title"], [role="dialog"]').count();
  const returned = await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? document.activeElement?.tagName ?? null,
  );
  rec(
    "VIEWER-d",
    "Escape closes the viewer and focus returns to the 'Lihat struk' trigger",
    returned === "Lihat struk",
    "active=" + returned,
  );
  rec(
    "VIEWER-e",
    "Escape inside the viewer does not close the transaction detail sheet",
    detailStillOpen >= 1,
    "dialogsAfterEscape=" + detailStillOpen,
  );
});





