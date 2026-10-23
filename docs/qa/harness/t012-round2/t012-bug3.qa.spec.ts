import { expect, test } from "@playwright/test";
import { createWallet, devFixtureEmail, signUpOwner } from "../../../../e2e/helpers";

/*
  T-012 round 2, out-of-scope probe: the known duplicate-on-rapid-save defect
  (BUG-3) is tracked separately. This only records whether it still reproduces
  in the current tree, so T-012 evidence is honest about it.
*/

test("BUG-3 probe: double submit on manual save", async ({ page }) => {
  await signUpOwner(page, devFixtureEmail());
  const wallet = await createWallet(page, { name: "Dompet BUG3 QA" });
  await page.goto("/transactions?month=2025-03");
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  await page.locator("#amount").fill("7777");
  await dialog.getByRole("button", { name: "Makanan" }).click();
  await dialog.getByRole("button", { name: /Pilih dompet/ }).click();
  await page.getByRole("option", { name: new RegExp(wallet.name) }).click();

  /* Path 1: a real rapid double click on the submit button. */
  await page.getByRole("button", { name: "Simpan transaksi" }).dblclick();
  await expect(dialog).toHaveCount(0);
  await page.waitForTimeout(1500);

  const count7777 = async () => {
    const ledger = await page.request.get("/api/transactions?limit=50");
    const rows = (await ledger.json()).rows as Array<{ amountMinor: number }>;
    return rows.filter((row) => row.amountMinor === 7777).length;
  };
  const afterDoubleClick = await count7777();
  console.log(`[BUG3] after real dblclick: ${afterDoubleClick} transaction(s) of 7777`);

  /* Path 2: two submit events in one task (worst case for the client guard). */
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  await page.locator("#amount").fill("8888");
  await dialog.getByRole("button", { name: "Makanan" }).click();
  await dialog.getByRole("button", { name: /Pilih dompet/ }).click();
  await page.getByRole("option", { name: new RegExp(wallet.name) }).click();
  await page.locator("form").evaluate((form) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await page.waitForTimeout(2500);
  const ledger = await page.request.get("/api/transactions?limit=50");
  const rows = (await ledger.json()).rows as Array<{ amountMinor: number }>;
  const sameTask = rows.filter((row) => row.amountMinor === 8888).length;
  console.log(`[BUG3] after two same-task submits: ${sameTask} transaction(s) of 8888`);

  test.info().annotations.push(
    { type: "BUG3-dblclick", description: String(afterDoubleClick) },
    { type: "BUG3-same-task", description: String(sameTask) },
  );
});
