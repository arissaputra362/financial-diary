import { expect, test } from "@playwright/test";
import { devFixtureEmail, seedTransaction, signUpOwner } from "./helpers";

/*
  AC-F5-2 transaction undo-toast oracle: the toast appears after a successful
  soft delete, stays visible for 4.5-5.5 seconds, undo within that window
  restores the row, and once it expires there is no undo action left (restore is
  only available from the Trash tab).

  Each test signs up a `qa-t008-dev-` fixture household and seeds one real
  transaction, so the toast timing is browser-observed, not simulated.
*/

const MERCHANT = "Belanja undo E2E";

test.beforeEach(async ({ page }) => {
  await signUpOwner(page, devFixtureEmail());
  await seedTransaction(page, {
    type: "MONEY_OUT",
    amountMinor: 150_000,
    category: "food",
    merchant: MERCHANT,
  });
});

async function openActivityWithRow(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/transactions");
  await expect(page.getByText(MERCHANT)).toBeVisible();
}

function undoToast(page: import("@playwright/test").Page) {
  return page.getByRole("status").filter({ hasText: "dipindahkan" });
}

test.describe("transaction undo toast timing (AC-F5-2)", () => {
  test("stays visible for 4.5-5.5 seconds, then the undo action is gone", async ({ page }) => {
    await openActivityWithRow(page);
    await page.getByRole("button", { name: /Hapus transaksi/ }).first().click();

    const toast = undoToast(page);
    await expect(toast).toBeVisible();
    const appearedAt = Date.now();
    await expect(toast).toBeHidden({ timeout: 8_000 });
    const visibleMs = Date.now() - appearedAt;

    expect(visibleMs).toBeGreaterThanOrEqual(4_500);
    expect(visibleMs).toBeLessThanOrEqual(5_500);
    await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);
  });

  test("undo within the window restores the transaction", async ({ page }) => {
    await openActivityWithRow(page);
    await page.getByRole("button", { name: /Hapus transaksi/ }).first().click();
    await expect(undoToast(page)).toBeVisible();

    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByText(MERCHANT)).toBeVisible();
    await expect(undoToast(page)).toHaveCount(0);

    const trash = await page.request.get("/api/transactions/trash");
    expect(trash.ok()).toBe(true);
    expect((await trash.json()).rows).toHaveLength(0);
  });

  test("after expiry restore is only available from the Trash tab", async ({ page }) => {
    await openActivityWithRow(page);
    await page.getByRole("button", { name: /Hapus transaksi/ }).first().click();

    const toast = undoToast(page);
    await expect(toast).toBeVisible();
    await expect(toast).toBeHidden({ timeout: 8_000 });
    await expect(page.getByRole("button", { name: /Undo/ })).toHaveCount(0);
    await expect(page.getByText(MERCHANT)).toHaveCount(0);

    await page.getByRole("tab", { name: "Trash" }).click();
    await expect(page.getByText(MERCHANT)).toBeVisible();
    await page.getByRole("button", { name: /Pulihkan transaksi/ }).click();
    await expect(page.getByText("Trash masih kosong")).toBeVisible();

    await page.getByRole("tab", { name: "Transaksi" }).click();
    await expect(page.getByText(MERCHANT)).toBeVisible();
  });
});
