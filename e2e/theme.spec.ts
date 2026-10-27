import { expect, test } from "@playwright/test";
test.describe("theme preference", () => {
  test("uses the system preference and follows live OS changes by default", async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/login");

    const root = page.locator("html");
    await expect(root).toHaveAttribute("data-theme", "system");
    await expect(root).toHaveAttribute("data-color-scheme", "dark");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(17, 27, 38)");
    await page.screenshot({ path: testInfo.outputPath("login-dark.png") });

    await page.emulateMedia({ colorScheme: "light" });
    await expect(root).toHaveAttribute("data-color-scheme", "light");
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(241, 245, 250)");
    await page.screenshot({ path: testInfo.outputPath("login-light.png") });
  });

  test("keeps a manual override across reloads and restores system behavior", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/login");

    await page.evaluate(() => {
      localStorage.setItem("financial-diary-theme", "dark");
      window.dispatchEvent(
        new CustomEvent("financial-diary:theme-change", { detail: "dark" }),
      );
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");

    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
    await page.evaluate(() => {
      localStorage.removeItem("financial-diary-theme");
      window.dispatchEvent(
        new CustomEvent("financial-diary:theme-change", { detail: "system" }),
      );
    });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light");
  });
});
