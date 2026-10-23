import { expect, test, type Locator, type Page } from "@playwright/test";
import { createWallet, devFixtureEmail, signUpOwner } from "../../../../e2e/helpers";

/*
  T-012 round 2: add-intent lifecycle on both navigation systems.

  Two close/reopen cycles, then a save, then a third open from the global Add
  action. History must not grow on close or reopen, the save must write the URL
  once, and exactly one transaction must exist afterwards.
*/

async function closeSheet(page: Page, path: "X" | "Batal" | "Escape"): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  if (path === "X") await page.getByRole("button", { name: "Tutup" }).click();
  else if (path === "Batal") await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  else await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
}

function navScope(page: Page): Locator {
  const width = page.viewportSize()?.width ?? 0;
  return page.locator(width < 768 ? '[data-nav="bottom"]' : '[data-nav="top"]');
}

test("two close/reopen cycles, then a third open after save", async ({ page }, testInfo) => {
  await signUpOwner(page, devFixtureEmail());
  const wallet = await createWallet(page, { name: "Dompet Siklus QA" });
  await page.addInitScript(() => {
    const tracked = window as unknown as { __replaceStateCalls?: number };
    tracked.__replaceStateCalls = 0;
    const original = history.replaceState.bind(history);
    history.replaceState = function (...args: Parameters<History["replaceState"]>) {
      tracked.__replaceStateCalls = (tracked.__replaceStateCalls ?? 0) + 1;
      return original(...args);
    };
  });

  await page.goto("/transactions?month=2025-03");
  const trigger = navScope(page).getByRole("link", { name: "Tambah transaksi" });
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  const historyLength = () => page.evaluate(() => history.length);
  const replaceWrites = () =>
    page.evaluate(
      () => (window as unknown as { __replaceStateCalls?: number }).__replaceStateCalls ?? 0,
    );

  const historyStart = await historyLength();

  /* Cycle 1: open, close with X, reopen immediately. */
  await trigger.click();
  await expect(dialog).toBeVisible();
  await closeSheet(page, "X");
  await trigger.click();
  await expect(dialog).toBeVisible();
  expect(await historyLength()).toBe(historyStart);

  /* Cycle 2: close with Batal, reopen immediately. */
  await closeSheet(page, "Batal");
  await trigger.click();
  await expect(dialog).toBeVisible();
  expect(await dialog.getByRole("tab", { name: "Isi manual" }).getAttribute("aria-selected")).toBe("true");
  expect(await page.locator("#amount").inputValue()).toBe("");
  expect(await historyLength()).toBe(historyStart);

  /* Save from the third open (opened through the global Add intent). */
  await page.locator("#amount").fill("12500");
  await dialog.getByRole("button", { name: "Makanan" }).click();
  await dialog.getByRole("button", { name: /Pilih dompet/ }).click();
  await page.getByRole("option", { name: new RegExp(wallet.name) }).click();

  const writesBefore = await replaceWrites();
  console.log(`[CYCLES ${testInfo.project.name}] url before save = ${page.url()}`);
  await page.getByRole("button", { name: "Simpan transaksi" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Transaksi tersimpan.")).toBeVisible();

  /* Next commits the replace after the RSC round trip; wait for the settled URL. */
  await expect(page).not.toHaveURL(/add=1/, { timeout: 10_000 });
  const writesAfter = await replaceWrites();
  console.log(
    `[CYCLES ${testInfo.project.name}] replaceState writes during save = ${writesAfter - writesBefore}, url after save = ${page.url()}`,
  );
  expect(writesAfter - writesBefore, "save writes the URL exactly once").toBe(1);
  await expect(page).toHaveURL(/month=2025-03/);
  expect(await historyLength()).toBe(historyStart);

  const ledger = await page.request.get("/api/transactions?limit=50");
  expect(ledger.ok()).toBe(true);
  const rows = (await ledger.json()).rows as Array<{ amountMinor: number }>;
  expect(rows.filter((row) => row.amountMinor === 12500)).toHaveLength(1);

  /* Third open after save: clean manual sheet, still one history entry. */
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Isi manual" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#amount")).toHaveValue("");
  expect(await historyLength()).toBe(historyStart);
  await closeSheet(page, "Escape");
  await expect(page).not.toHaveURL(/add=1/);
  await expect(page.getByText("Maret 2025", { exact: true })).toBeVisible();
  console.log(`[CYCLES ${testInfo.project.name}] ok, history=${historyStart}`);
});

test("global Add tapped immediately after a save still opens a clean sheet", async ({ page }, testInfo) => {
  await signUpOwner(page, devFixtureEmail());
  const wallet = await createWallet(page, { name: "Dompet Simpan QA" });
  await page.goto("/transactions?month=2025-03");
  const trigger = navScope(page).getByRole("link", { name: "Tambah transaksi" });
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  const historyStart = await page.evaluate(() => history.length);

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.locator("#amount").fill("4321");
  await dialog.getByRole("button", { name: "Makanan" }).click();
  await dialog.getByRole("button", { name: /Pilih dompet/ }).click();
  await page.getByRole("option", { name: new RegExp(wallet.name) }).click();
  await page.getByRole("button", { name: "Simpan transaksi" }).click();
  await expect(dialog).toHaveCount(0);

  /* No settle wait: the save-triggered URL replace is still in flight. */
  await trigger.click();
  await expect(dialog).toBeVisible({ timeout: 1500 });
  await page.waitForTimeout(300);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Isi manual" })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("button", { name: "Tutup" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/add=1/, { timeout: 10_000 });
  await expect(page).toHaveURL(/month=2025-03/);
  await expect(page.getByText("Maret 2025", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(historyStart);

  const ledger = await page.request.get("/api/transactions?limit=50");
  const rows = (await ledger.json()).rows as Array<{ amountMinor: number }>;
  expect(rows.filter((row) => row.amountMinor === 4321)).toHaveLength(1);
  console.log(`[CYCLES-AFTER-SAVE ${testInfo.project.name}] ok`);
});
