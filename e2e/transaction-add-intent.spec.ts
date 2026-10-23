import { expect, test } from "@playwright/test";
import { createWallet, devFixtureEmail, signUpOwner } from "./helpers";

/*
  AC-F3-14 add-intent lifecycle. The sheet is opened from the global Add action,
  closed through every documented path, and reopened in one click. Closing must
  consume `?add=1` with `router.replace` (no new history entry) while keeping the
  selected month or the Trash tab. The suite runs on mobile, tablet, and desktop,
  so both the bottom bar and the floating navbar entry points are covered.
*/

type ClosePath = "X" | "Batal" | "Escape" | "backdrop";

async function closeSheet(page: import("@playwright/test").Page, path: ClosePath): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  if (path === "X") {
    await page.getByRole("button", { name: "Tutup" }).click();
  } else if (path === "Batal") {
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  } else if (path === "Escape") {
    await page.keyboard.press("Escape");
  } else {
    /* The overlay covers the viewport; the panel is bottom (mobile) or centered. */
    await page.mouse.click(6, 6);
  }
  await expect(dialog).toHaveCount(0);
}

function navScope(page: import("@playwright/test").Page) {
  const width = page.viewportSize()?.width ?? 0;
  return page.locator(width < 768 ? '[data-nav="bottom"]' : '[data-nav="top"]');
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page, devFixtureEmail());
});

test.describe("Add intent close and reopen (AC-F3-14)", () => {
  for (const path of ["X", "Batal", "Escape", "backdrop"] as const) {
    test(`closing with ${path} removes add=1 without a history entry and reopens in one click`, async ({
      page,
    }) => {
      await page.goto("/transactions");
      const trigger = navScope(page).getByRole("link", { name: "Tambah transaksi" });

      await trigger.click();
      await expect(page.getByRole("dialog", { name: "Tambah transaksi" })).toBeVisible();
      await expect(page).toHaveURL(/add=1/);

      const historyBeforeClose = await page.evaluate(() => history.length);
      await closeSheet(page, path);

      await expect(page).not.toHaveURL(/add=1/);
      expect(await page.evaluate(() => history.length)).toBe(historyBeforeClose);
      await expect(page.getByRole("dialog", { name: "Tambah transaksi" })).toHaveCount(0);

      /* One more activation of the global Add action reopens a clean sheet. */
      await trigger.click();
      const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("tab", { name: "Isi manual" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.locator("#amount")).toHaveValue("");
    });
  }

  test("closing keeps the selected month and returns focus to the trigger", async ({ page }) => {
    await page.goto("/transactions?month=2025-03");
    await expect(page.getByText("Maret 2025", { exact: true })).toBeVisible();

    const trigger = page.getByRole("button", { name: "Tambah transaksi" }).first();
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "Tambah transaksi" })).toBeVisible();

    await closeSheet(page, "X");

    await expect(page).toHaveURL(/month=2025-03/);
    await expect(page).not.toHaveURL(/add=1/);
    await expect(page.getByText("Maret 2025", { exact: true })).toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("cross-page Add returns focus to the visible page trigger after close", async ({ page }) => {
    await page.goto("/home");
    await navScope(page).getByRole("link", { name: "Tambah transaksi" }).click();
    await expect(page.getByRole("dialog", { name: "Tambah transaksi" })).toBeVisible();

    await closeSheet(page, "X");

    await expect(page).not.toHaveURL(/add=1/);
    await expect(page.locator("[data-add-transaction-trigger]")).toBeFocused();
  });

  test("closing keeps the Trash tab selected", async ({ page }) => {
    await page.goto("/transactions?view=trash");
    await expect(page.getByRole("tab", { name: "Trash" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
    await expect(page.getByRole("dialog", { name: "Tambah transaksi" })).toBeVisible();
    await closeSheet(page, "Batal");

    await expect(page).toHaveURL(/view=trash/);
    await expect(page).not.toHaveURL(/add=1/);
    await expect(page.getByRole("tab", { name: "Trash" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  /*
    BUG-1 regression: the close path clears the intent asynchronously through
    `router.replace`. A global Add tap during that transition must still open a
    fresh sheet. No URL cleanup is awaited before the tap.
  */
  const raceCases = [
    { path: "X", view: "month" },
    { path: "Batal", view: "trash" },
    { path: "Escape", view: "month" },
    { path: "backdrop", view: "trash" },
  ] as const;

  for (const { path, view } of raceCases) {
    test(`${path} close then global Add at 0/50/100/150 ms still opens and keeps ${view}`, async ({
      page,
    }) => {
      const startUrl = view === "trash" ? "/transactions?view=trash" : "/transactions?month=2025-03";
      await page.goto(startUrl);
      const trigger = navScope(page).getByRole("link", { name: "Tambah transaksi" });
      const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });

      for (const delay of [0, 50, 100, 150] as const) {
        await trigger.click();
        await expect(dialog).toBeVisible();
        const historyBefore = await page.evaluate(() => history.length);

        await closeSheet(page, path);
        if (delay > 0) await page.waitForTimeout(delay);

        /* Deliberately no URL assertion between close and reopen. */
        await trigger.click();
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole("tab", { name: "Isi manual" })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        expect(await page.evaluate(() => history.length)).toBe(historyBefore);

        await closeSheet(page, "X");
        await expect(page).not.toHaveURL(/add=1/);
        if (view === "trash") {
          await expect(page).toHaveURL(/view=trash/);
          await expect(page.getByRole("tab", { name: "Trash" })).toHaveAttribute(
            "aria-selected",
            "true",
          );
        } else {
          await expect(page).toHaveURL(/month=2025-03/);
          await expect(page.getByText("Maret 2025", { exact: true })).toBeVisible();
        }
      }
    });
  }

  test("two consecutive close/reopen cycles still work", async ({ page }) => {
    await page.goto("/transactions?month=2025-03");
    const trigger = navScope(page).getByRole("link", { name: "Tambah transaksi" });
    const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });

    /* Cycle 1: close with X, reopen. */
    await trigger.click();
    await expect(dialog).toBeVisible();
    await closeSheet(page, "X");
    await trigger.click();
    await expect(dialog).toBeVisible();

    /* Cycle 2: close with Batal, reopen. */
    await closeSheet(page, "Batal");
    await trigger.click();
    await expect(dialog).toBeVisible();

    await closeSheet(page, "Escape");
    await expect(page).not.toHaveURL(/add=1/);
    await expect(page).toHaveURL(/month=2025-03/);
  });

  test("saving from the add intent writes the URL once and creates one transaction", async ({
    page,
  }) => {
    const wallet = await createWallet(page, { name: "Dompet Simpan E2E" });
    await page.addInitScript(() => {
      const tracked = window as unknown as { __replaceStateCalls?: number };
      tracked.__replaceStateCalls = 0;
      const original = history.replaceState.bind(history);
      history.replaceState = function (...args: Parameters<History["replaceState"]>) {
        tracked.__replaceStateCalls = (tracked.__replaceStateCalls ?? 0) + 1;
        return original(...args);
      };
    });

    await page.goto("/transactions?month=2025-03&add=1");
    const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
    await expect(dialog).toBeVisible();

    await page.locator("#amount").fill("12500");
    await dialog.getByRole("button", { name: "Makanan" }).click();
    await dialog.getByRole("button", { name: /Pilih dompet/ }).click();
    await page.getByRole("option", { name: new RegExp(wallet.name) }).click();

    const writesBefore = await page.evaluate(
      () => (window as unknown as { __replaceStateCalls?: number }).__replaceStateCalls ?? 0,
    );
    await page.getByRole("button", { name: "Simpan transaksi" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Transaksi tersimpan.")).toBeVisible();
    await expect(page).not.toHaveURL(/add=1/);
    await expect(page).toHaveURL(/month=2025-03/);
    const writesAfter = await page.evaluate(
      () => (window as unknown as { __replaceStateCalls?: number }).__replaceStateCalls ?? 0,
    );
    expect(writesAfter - writesBefore).toBe(1);

    const ledger = await page.request.get("/api/transactions");
    expect(ledger.ok()).toBe(true);
    const rows = (await ledger.json()).rows as Array<{ amountMinor: number }>;
    expect(rows.filter((row) => row.amountMinor === 12500)).toHaveLength(1);
  });
});
