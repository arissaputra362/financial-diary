import { expect, test } from "@playwright/test";
import { seedTransaction, signUpOwner } from "./helpers";

/*
  T-005 dashboard E2E (AC-F2-7, AC-F2-8, AC-F2-10). Runs on mobile (390x844),
  tablet (768x1024), and desktop (1280x800).
*/

test.beforeEach(async ({ page }) => {
  await signUpOwner(page);
});

test.describe("activity filters (AC-F2-7, AC-F2-8)", () => {
  test("every filter change changes the rows or shows filtered-empty", async ({ page }) => {
    await seedTransaction(page, {
      type: "MONEY_IN",
      amountMinor: 5_000_000,
      category: "income",
      merchant: "Gaji E2E",
    });
    await seedTransaction(page, {
      type: "MONEY_OUT",
      amountMinor: 150_000,
      category: "food",
      merchant: "Belanja E2E",
    });

    await page.goto("/home");
    await expect(page.getByText("Gaji E2E")).toBeVisible();
    await expect(page.getByText("Belanja E2E")).toBeVisible();

    /* Filters stay available behind the compact disclosure on the dashboard. */
    await page.getByRole("button", { name: "Filter" }).click();

    /* type=MONEY_IN -> the money-out row disappears. */
    await page.getByRole("button", { name: "Uang masuk", exact: true }).click();
    await expect(page.getByText("Gaji E2E")).toBeVisible();
    await expect(page.getByText("Belanja E2E")).toBeHidden();

    /* source=OCR with no scanned receipts -> filtered-empty state. */
    await page.getByRole("button", { name: "Struk hasil scan" }).click();
    await expect(page.getByText("Tidak ada aktivitas yang cocok")).toBeVisible();

    /* reset restores the full list. */
    await page.getByRole("button", { name: "Reset filter" }).first().click();
    await expect(page.getByText("Belanja E2E")).toBeVisible();
  });
});

test.describe("navigation per breakpoint (AC-F2-10, AC-VIS-3)", () => {
  test("exactly one navigation is visible, destinations match, and every item has an icon", async ({ page }) => {
    await page.goto("/home");
    const width = page.viewportSize()?.width ?? 0;
    const bottom = page.locator('[data-nav="bottom"]');
    const top = page.locator('[data-nav="top"]');

    await expect(page.locator('nav[aria-label="Navigasi utama"]:visible')).toHaveCount(1);

    const expected =
      width < 768
        ? [
            { name: "Beranda", href: "/home" },
            { name: "Aktivitas", href: "/transactions" },
            { name: "Tambah transaksi", href: "/transactions?add=1" },
            { name: "Wallet", href: "/wallet" },
          ]
        : [
            { name: "Beranda Financial Diary", href: "/home" },
            { name: "Beranda", href: "/home" },
            { name: "Aktivitas", href: "/transactions" },
            { name: "Wallet", href: "/wallet" },
            { name: "Budget", href: "/budget" },
            { name: "Emas", href: "/gold" },
            { name: "Keluarga", href: "/family" },
            { name: "Tambah transaksi", href: "/transactions?add=1" },
            { name: "Buka profil kamu", href: "/profile" },
          ];

    const visibleNav = page.locator('nav[aria-label="Navigasi utama"]:visible');
    await expect(visibleNav.getByRole("link")).toHaveCount(expected.length);
    for (const item of expected) {
      const link = visibleNav.getByRole("link", { name: item.name, exact: true });
      await expect(link).toHaveAttribute("href", item.href);
      /* AC-VIS-3: no empty/placeholder icons in the navigation. */
      await expect(link.locator("svg")).toHaveCount(1);
    }

    if (width < 768) {
      await expect(bottom).toBeVisible();
      await expect(top).toBeHidden();
      await bottom.getByRole("button", { name: "Lainnya" }).click();
      const moreMenu = page.getByRole("navigation", { name: "Navigasi utama" }).getByLabel("Menu lainnya");
      for (const item of [
        { name: "Budget", href: "/budget" },
        { name: "Emas", href: "/gold" },
        { name: "Keluarga", href: "/family" },
        { name: "Profil", href: "/profile" },
      ]) {
        await expect(moreMenu.getByRole("link", { name: item.name })).toHaveAttribute("href", item.href);
      }
    } else {
      await expect(top).toBeVisible();
      await expect(bottom).toBeHidden();
    }
  });

  test("the Add action opens the add sheet (A-27)", async ({ page }) => {
    await page.goto("/home");
    const width = page.viewportSize()?.width ?? 0;
    const scope = width < 768 ? page.locator('[data-nav="bottom"]') : page.locator('[data-nav="top"]');

    await scope.getByRole("link", { name: "Tambah transaksi" }).click();
    await expect(page.getByRole("heading", { name: "Tambah transaksi" })).toBeVisible();
  });
});

test.describe("wallet screen and transaction entry intents", () => {
  test("wallet page exposes balance and existing wallet creation flow", async ({ page }) => {
    await page.goto("/wallet");
    await expect(page.getByRole("heading", { name: "Wallet", exact: true })).toBeVisible();
    await expect(page.getByText("Saldo utama")).toBeVisible();
    await page.getByRole("button", { name: "Buat wallet" }).click();
    await expect(page.getByRole("heading", { name: "Buat dompet" })).toBeVisible();
  });

  test("dashboard receipt shortcut deep link opens the scan tab", async ({ page }) => {
    await page.goto("/transactions?add=1&scan=1");
    await expect(page.getByRole("dialog").getByRole("tab", { name: "Scan struk" })).toHaveAttribute("aria-selected", "true");
  });

  test("wallet transfer shortcut preselects transfer entry", async ({ page }) => {
    await page.goto("/transactions?add=1&type=TRANSFER");
    await expect(page.getByRole("button", { name: "Transfer", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("budget page (AC-F2-2, AC-F2-3)", () => {
  test("owner can set a budget and the dashboard budget card reflects it", async ({ page }) => {
    await page.goto("/budget");
    await page.getByLabel("Budget bersama periode ini (rupiah)").fill("3000000");
    await page.getByRole("button", { name: "Simpan budget" }).click();
    await expect(page.getByText("Budget bersama tersimpan.")).toBeVisible();

    await page.goto("/home");
    await expect(page.getByText("Progress budget")).toBeVisible();
  });
});
