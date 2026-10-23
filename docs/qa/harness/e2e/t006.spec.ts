import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const SHOTS = path.resolve("../agent-comms/2026-10-06-qa-t006-screenshots");
const RECEIPT = path.resolve("docs/qa/harness/fixtures/receipt.png");
const consoleErrors: string[] = [];

async function login(page: Page, redirect = "/transactions") {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(`[console] ${m.text()}`); });
  page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${e.message}`));
  await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
  await page.fill("#email", "qa-owner@test.local");
  await page.fill("#password", "QATest123!");
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(new RegExp(redirect.replace("/", "\\/")), { timeout: 30_000 });
}

test("T1 manual transaction happy path", async ({ page }) => {
  await login(page);
  const merchant = `Warung E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Tambah transaksi" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.locator("#amount").fill("50000");
  await page.getByRole("button", { name: "Makanan" }).click();
  await page.locator("#merchant").fill(merchant);
  await page.screenshot({ path: path.join(SHOTS, "journey-T1-01-form-filled.png"), fullPage: true });
  await page.getByRole("button", { name: "Simpan transaksi" }).click();
  await expect(page.getByText("Transaksi tersimpan.")).toBeVisible();
  await expect(page.getByText(merchant)).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "journey-T1-02-saved.png"), fullPage: true });
});

test("T5 soft delete + undo", async ({ page }) => {
  await login(page);
  const merchant = `Hapus E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Tambah transaksi" }).click();
  await page.locator("#amount").fill("12345");
  await page.getByRole("button", { name: "Lainnya" }).click();
  await page.locator("#merchant").fill(merchant);
  await page.getByRole("button", { name: "Simpan transaksi" }).click();
  await expect(page.getByText("Transaksi tersimpan.")).toBeVisible();

  const row = page.locator("li", { hasText: merchant });
  await row.getByRole("button", { name: /Hapus transaksi/ }).click();
  await expect(page.getByRole("button", { name: /Undo/ })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "journey-T5-01-undo-toast.png"), fullPage: true });
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(page.getByText("Transaksi dikembalikan.")).toBeVisible();
  await expect(page.locator("li", { hasText: merchant })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "journey-T5-02-restored.png"), fullPage: true });
});

test("T6 trash tab + restore", async ({ page }) => {
  await login(page);
  const merchant = `Trash E2E ${Date.now()}`;
  await page.getByRole("button", { name: "Tambah transaksi" }).click();
  await page.locator("#amount").fill("777");
  await page.getByRole("button", { name: "Lainnya" }).click();
  await page.locator("#merchant").fill(merchant);
  await page.getByRole("button", { name: "Simpan transaksi" }).click();
  await expect(page.getByText("Transaksi tersimpan.")).toBeVisible();
  await page.locator("li", { hasText: merchant }).getByRole("button", { name: /Hapus transaksi/ }).click();
  await page.waitForTimeout(6000); // let undo toast expire
  await page.getByRole("tab", { name: "Trash" }).click();
  await expect(page.locator("li", { hasText: merchant })).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "journey-T6-01-trash.png"), fullPage: true });
  await page.locator("li", { hasText: merchant }).getByRole("button", { name: /Pulihkan transaksi/ }).click();
  await expect(page.getByText("Transaksi dipulihkan ke daftar aktivitas.")).toBeVisible();
});

test("T7 transfer (expected bug)", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Tambah transaksi" }).click();
  await page.getByRole("button", { name: "Transfer" }).first().click();
  await page.locator("#amount").fill("300000");
  await page.getByRole("button", { name: "Simpan transaksi" }).click();
  // The service/DB conflict surfaces as a generic server error.
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  console.log("TRANSFER FORM ALERT:", await alert.textContent());
  await page.screenshot({ path: path.join(SHOTS, "journey-T7-01-transfer-error.png"), fullPage: true });
});

test("T9 form validation messages", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Tambah transaksi" }).click();
  await page.getByRole("button", { name: "Simpan transaksi" }).click();
  await expect(page.getByText("Jumlah harus lebih dari 0.")).toBeVisible();
  await expect(page.getByText("Pilih kategori yang sesuai.")).toBeVisible();
  await page.screenshot({ path: path.join(SHOTS, "journey-T9-01-validation.png"), fullPage: true });
});

test("T2 OCR upload -> review -> save (real Gemini + Blob)", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Tambah transaksi" }).click();
  await page.getByRole("tab", { name: "Scan struk" }).click();
  await page.screenshot({ path: path.join(SHOTS, "journey-T2-01-pick-file.png"), fullPage: true });
  await page.getByLabel("Pilih foto struk").setInputFiles(RECEIPT);
  await expect(page.getByText("Struk berhasil dibaca!").first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: path.join(SHOTS, "journey-T2-02-review.png"), fullPage: true });
  await page.getByRole("button", { name: /Sudah benar, simpan transaksi/ }).click();
  await expect(page.getByText("Transaksi tersimpan.")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: path.join(SHOTS, "journey-T2-03-saved.png"), fullPage: true });
});

test("post-login default landing target", async ({ page }) => {
  await login(page, "/home");
  await page.waitForLoadState("networkidle");
  console.log("POST-LOGIN URL:", page.url());
  console.log("POST-LOGIN H1:", await page.locator("h1").first().textContent().catch(() => "n/a"));
  await page.screenshot({ path: path.join(SHOTS, "journey-A2-post-login-landing.png"), fullPage: true });
});

for (const [label, width, height] of [["mobile-390", 390, 844], ["tablet-768", 768, 1024], ["desktop-1280", 1280, 800]] as const) {
  test(`responsive snapshot ${label}`, async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width, height });
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Aktivitas" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`OVERFLOW ${label}: ${overflow}`);
    await page.screenshot({ path: path.join(SHOTS, `responsive-${label}.png`), fullPage: true });
  });
}

test.afterAll(() => {
  if (consoleErrors.length) console.log("CONSOLE/PAGE ERRORS:\n" + consoleErrors.join("\n"));
  else console.log("CONSOLE/PAGE ERRORS: none");
});
