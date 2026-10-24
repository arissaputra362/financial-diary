import { expect, test } from "@playwright/test";

/*
  Regression guard for the Safari iOS "stuck on Memuat..." report: the auth
  screens must ship their form in the server HTML, so a client bundle that is
  slow, blocked, or fails to parse can never leave a bare loading screen.
*/

test("login HTML contains the form, not a client-side loading fallback", async ({
  request,
}) => {
  const response = await request.get("/login");
  expect(response.status()).toBe(200);
  const html = await response.text();

  expect(html).not.toContain("BAILOUT_TO_CLIENT_SIDE_RENDERING");
  expect(html).not.toContain("Memuat...");
  expect(html).toContain('id="email"');
  expect(html).toContain('id="password"');
});

test("signup prefills the invite code from the link", async ({ page }) => {
  await page.goto("/signup?invite=abc123");
  await expect(page.locator("#inviteCode")).toHaveValue("ABC123");
});
