import { expect, test } from "@playwright/test";
import { signUpOwner } from "./helpers";

/*
  Responsive smoke (A-23, T-005). Every assertion is observable in the browser:
  HTTP status, visible heading, layout width, live nav targets, keyboard focus.
  Runs on mobile (390x844), tablet (768x1024), and desktop (1280x800). Each test
  signs up a fresh owner so the protected dashboard renders with a session.
*/

const liveRoutes = ["/home", "/budget", "/transactions", "/family"];

test.beforeEach(async ({ page }) => {
  await signUpOwner(page);
});

test.describe("live routes", () => {
  for (const route of liveRoutes) {
    test(`${route} responds 200 with a visible heading`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  }

  test("/savings is gone (regression guard for WO-005)", async ({ page }) => {
    const response = await page.goto("/savings");
    expect(response?.status()).toBe(404);
  });

  test("unknown route shows the Indonesian 404 with a live CTA", async ({
    page,
  }) => {
    await page.goto("/halaman-tidak-ada");
    await expect(
      page.getByRole("heading", { name: "Halaman tidak ditemukan" }),
    ).toBeVisible();
    const cta = page.getByRole("link", { name: "Kembali ke Beranda" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/");
  });
});

test.describe("layout", () => {
  test("no horizontal overflow", async ({ page }) => {
    for (const route of liveRoutes) {
      await page.goto(route);
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
    }
  });
});

test.describe("navigation", () => {
  test("every visible nav link points to a live route", async ({ page }) => {
    await page.goto("/home");

    const nav = page.locator('nav[aria-label="Navigasi utama"]:visible');
    await expect(nav).toHaveCount(1);

    const hrefs = await nav.locator("a[href]").evaluateAll((links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      const response = await page.request.get(href);
      expect(response.status(), `dead nav link: ${href}`).toBeLessThan(400);
    }
  });

  test("keyboard focus reaches a nav link with a visible outline", async ({
    page,
  }) => {
    await page.goto("/home");

    let focusedNavLink = false;
    for (let i = 0; i < 12 && !focusedNavLink; i += 1) {
      await page.keyboard.press("Tab");
      focusedNavLink = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active.tagName !== "A") return false;
        if (!active.closest('nav[aria-label="Navigasi utama"]')) return false;
        const style = getComputedStyle(active);
        const outlineVisible =
          style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
        return outlineVisible;
      });
    }

    expect(focusedNavLink, "no nav link received visible keyboard focus").toBe(
      true,
    );
  });
});
