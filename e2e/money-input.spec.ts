import { expect, test, type Locator, type Page } from "@playwright/test";
import { devFixtureEmail, ensureWallet, signUpOwner, todayJakarta } from "./helpers";

/*
  T-013 browser evidence (design 01 §5.8). Each scoped rupiah field must reject
  letters, group digits live with dots, keep the caret on the edited digit, and
  submit the exact integer. Runs at 390px and 1280px through the mobile and
  desktop Playwright projects.
*/

const DIGITS = "22000000";
const GROUPED = "22.000.000";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

async function clearField(field: Locator): Promise<void> {
  await field.click();
  await field.press("Control+a");
  await field.press("Delete");
  await expect(field).toHaveValue("");
}

async function typeDigits(field: Locator, digits: string, grouped: string): Promise<void> {
  await clearField(field);
  await field.pressSequentially(digits, { delay: 15 });
  await expect(field).toHaveValue(grouped);
}

/*
  The native setter bypasses React's value tracker, so the dispatched input
  event reaches onChange exactly like a real paste (raw text + insertFromPaste).
*/
async function pasteInto(field: Locator, text: string): Promise<void> {
  await field.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    input.setSelectionRange(value.length, value.length);
    input.dispatchEvent(
      new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: value }),
    );
  }, text);
}

async function expectSharedMoneyBehaviour(field: Locator): Promise<void> {
  /* Letters and symbols insert nothing. */
  await clearField(field);
  await field.pressSequentially("abcRp+,-.", { delay: 10 });
  await expect(field).toHaveValue("");

  /* Live grouping on every keystroke. */
  await field.pressSequentially(DIGITS, { delay: 15 });
  await expect(field).toHaveValue(GROUPED);

  /* A letter typed over a selection keeps the selected digits. */
  await field.evaluate((element) => (element as HTMLInputElement).setSelectionRange(3, 6));
  await field.press("a");
  await expect(field).toHaveValue(GROUPED);
  expect(
    await field.evaluate((element) => [
      (element as HTMLInputElement).selectionStart,
      (element as HTMLInputElement).selectionEnd,
    ]),
  ).toEqual([3, 6]);

  /* Middle edit keeps the caret on the edited digit. */
  await field.evaluate((element) => (element as HTMLInputElement).setSelectionRange(3, 3));
  await field.press("5");
  await expect(field).toHaveValue("225.000.000");
  expect(
    await field.evaluate((element) => (element as HTMLInputElement).selectionStart),
  ).toBe(3);

  /* Edit at the very start also keeps the caret at the start. */
  await clearField(field);
  await field.pressSequentially(DIGITS, { delay: 15 });
  await field.evaluate((element) => (element as HTMLInputElement).setSelectionRange(0, 0));
  await field.press("9");
  await expect(field).toHaveValue("922.000.000");
  expect(
    await field.evaluate((element) => (element as HTMLInputElement).selectionStart),
  ).toBe(1);

  /* Paste normalizes to digits and regroups. */
  await clearField(field);
  await pasteInto(field, "Rp 2.500.000");
  await expect(field).toHaveValue("2.500.000");

  /* A decimal-comma paste keeps the integer part only (BUG-1). */
  await clearField(field);
  await pasteInto(field, "Rp12.500.000,00");
  await expect(field).toHaveValue("12.500.000");
}

async function pickWallet(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /Pilih dompet/ }).click();
  await page.getByRole("option", { name: new RegExp(name) }).click();
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page, devFixtureEmail());
});

test.describe("IDR money inputs (T-013)", () => {
  test("budget amount groups, filters, and saves the exact integer", async ({ page }) => {
    await page.goto("/budget");
    const field = page.locator("#budget-amount");
    await expect(field).toBeVisible();

    await expectSharedMoneyBehaviour(field);

    await typeDigits(field, DIGITS, GROUPED);
    await page.getByRole("button", { name: "Simpan budget" }).click();
    await expect(page.getByText("Budget bulan ini tersimpan.")).toBeVisible();

    const response = await page.request.get("/api/budget");
    expect(response.ok()).toBe(true);
    expect(((await response.json()) as { budgetMinor: number }).budgetMinor).toBe(22_000_000);
  });

  test("budget decimal-comma paste saves the integer rupiah", async ({ page }) => {
    await page.goto("/budget");
    const field = page.locator("#budget-amount");
    await expect(field).toBeVisible();

    await clearField(field);
    await pasteInto(field, "Rp12.500.000,00");
    await expect(field).toHaveValue("12.500.000");

    await page.getByRole("button", { name: "Simpan budget" }).click();
    await expect(page.getByText("Budget bulan ini tersimpan.")).toBeVisible();

    const response = await page.request.get("/api/budget");
    expect(response.ok()).toBe(true);
    expect(((await response.json()) as { budgetMinor: number }).budgetMinor).toBe(12_500_000);
  });

  test("goal target groups, filters, and saves the exact integer", async ({ page }) => {
    await page.goto("/budget");
    const field = page.locator("#goal-target");
    await expect(field).toBeVisible();

    await expectSharedMoneyBehaviour(field);

    await page.getByLabel("Nama target").fill("Target T-013");
    await typeDigits(field, DIGITS, GROUPED);
    await page.getByRole("button", { name: "Simpan target" }).click();
    await expect(page.getByTestId("goal-item")).toBeVisible();

    const response = await page.request.get("/api/goals");
    expect(response.ok()).toBe(true);
    const rows = ((await response.json()) as { rows: Array<{ name: string; targetAmountMinor: number }> }).rows;
    expect(rows.find((row) => row.name === "Target T-013")?.targetAmountMinor).toBe(22_000_000);
  });

  test("goal add amount groups, filters, and saves the exact integer", async ({ page }) => {
    const created = await page.request.post("/api/goals", {
      data: { name: "Target saldo T-013", targetAmountMinor: 30_000_000 },
    });
    expect(created.status()).toBe(201);

    await page.goto("/budget");
    const item = page.getByTestId("goal-item");
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Catat progres" }).click();

    const dialog = page.getByTestId("adjust-dialog");
    const field = dialog.locator("#goal-adjust-amount");
    await expect(field).toBeVisible();

    await expectSharedMoneyBehaviour(field);

    await typeDigits(field, DIGITS, GROUPED);
    await dialog.getByRole("button", { name: "Simpan progres", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const response = await page.request.get("/api/goals");
    const rows = ((await response.json()) as { rows: Array<{ name: string; savedAmountMinor: number }> }).rows;
    expect(rows.find((row) => row.name === "Target saldo T-013")?.savedAmountMinor).toBe(22_000_000);
  });

  test("manual transaction amount groups, filters, and saves the exact integer", async ({ page }) => {
    const wallet = await ensureWallet(page);
    await page.goto("/transactions?add=1");

    const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
    await expect(dialog).toBeVisible();
    const field = page.locator("#amount");
    await expect(field).toBeVisible();

    await expectSharedMoneyBehaviour(field);

    await typeDigits(field, DIGITS, GROUPED);
    await dialog.getByRole("button", { name: "Makanan" }).click();
    await pickWallet(page, wallet.name);
    await page.getByRole("button", { name: "Simpan transaksi" }).click();
    await expect(page.getByText("Transaksi tersimpan.")).toBeVisible();

    const response = await page.request.get("/api/transactions");
    expect(response.ok()).toBe(true);
    const rows = ((await response.json()) as { rows: Array<{ amountMinor: number }> }).rows;
    expect(rows.some((row) => row.amountMinor === 22_000_000)).toBe(true);
  });

  test("manual transaction decimal-comma paste saves the integer rupiah", async ({ page }) => {
    const wallet = await ensureWallet(page);
    await page.goto("/transactions?add=1");

    const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
    await expect(dialog).toBeVisible();
    const field = page.locator("#amount");
    await expect(field).toBeVisible();

    await clearField(field);
    await pasteInto(field, "Rp12.500.000,00");
    await expect(field).toHaveValue("12.500.000");

    await dialog.getByRole("button", { name: "Makanan" }).click();
    await pickWallet(page, wallet.name);
    await page.getByRole("button", { name: "Simpan transaksi" }).click();
    await expect(page.getByText("Transaksi tersimpan.")).toBeVisible();

    const response = await page.request.get("/api/transactions");
    expect(response.ok()).toBe(true);
    const rows = ((await response.json()) as { rows: Array<{ amountMinor: number }> }).rows;
    expect(rows.some((row) => row.amountMinor === 12_500_000)).toBe(true);
  });

  test("OCR review amount groups, filters, and posts the exact integer", async ({ page }) => {
    const wallet = await ensureWallet(page);
    await page.route("**/api/ocr/receipts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          job: {
            id: "job-t013",
            receiptId: "receipt-t013",
            status: "SUCCEEDED",
            errorCode: null,
            model: null,
            confidence: 0.9,
            receiptSharedWithHousehold: false,
          },
          draft: {
            merchant: "Pasar Segar",
            totalAmountMinor: 64_800,
            currencyCode: "IDR",
            occurredAt: todayJakarta(),
            category: "food",
            taxAmountMinor: null,
            confidence: 0.9,
            missingFields: [],
            notes: null,
          },
        }),
      }),
    );

    let posted: { amountMinor?: number; source?: string } | null = null;
    await page.route("**/api/transactions", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posted = route.request().postDataJSON() as { amountMinor?: number; source?: string };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ transactions: [] }),
      });
    });

    await page.goto("/transactions");
    await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
    await page.getByRole("tab", { name: "Scan struk" }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "struk.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await expect(page.getByText("Struk berhasil dibaca!")).toBeVisible();

    const field = page.locator("#ocr-amount");
    await expect(field).toHaveValue("64.800");

    await expectSharedMoneyBehaviour(field);

    await typeDigits(field, DIGITS, GROUPED);
    await pickWallet(page, wallet.name);
    await page.getByRole("button", { name: "Sudah benar, simpan transaksi" }).click();
    await expect(page.getByText("Transaksi tersimpan.")).toBeVisible();

    expect(posted).not.toBeNull();
    expect(posted!.amountMinor).toBe(22_000_000);
    expect(posted!.source).toBe("OCR");
  });

  test("wallet opening balance groups, filters, and saves the exact integer", async ({ page }) => {
    const name = `Dompet T-013 ${Date.now()}`;
    await page.goto("/home");
    await page.getByRole("button", { name: /Buat dompet pertama|Dompet baru/ }).first().click();

    const dialog = page.getByRole("dialog", { name: "Buat dompet" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Nama", { exact: true }).fill(name);

    const field = dialog.locator("#wallet-opening");
    await expectSharedMoneyBehaviour(field);

    await typeDigits(field, DIGITS, GROUPED);
    await dialog.getByRole("button", { name: "Buat dompet" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Dompet tersimpan." })).toBeVisible();

    const response = await page.request.get("/api/wallets");
    expect(response.ok()).toBe(true);
    const wallets = ((await response.json()) as { wallets: Array<{ name: string; openingBalanceMinor: number }> }).wallets;
    expect(wallets.find((row) => row.name === name)?.openingBalanceMinor).toBe(22_000_000);
  });
});
