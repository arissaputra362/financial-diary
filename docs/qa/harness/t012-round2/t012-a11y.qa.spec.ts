import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import type { OcrJobDTO } from "../../../../types/api";
import { devFixtureEmail, signUpOwner } from "../../../../e2e/helpers";

/*
  T-012 round 2: accessibility and antislop pass on the UI touched by the fix
  (global Add action, Add sheet close controls, OCR retry / in-progress states).
  Checks 44px targets, focus return, aria-live, no em dash, approved palette.
*/

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

const APPROVED = new Set([
  "#14273F", "#1D4F87", "#DCEBFA", "#EFF4FA", "#166534", "#155C30", "#DCFCE7",
  "#17304F", "#46597A", "#5C7191", "#5C6C86", "#D8E2EE", "#C9D6E4", "#EAEEF4",
  "#BFD3E8", "#BCD6EF", "#BBE5C7", "#F3C2C2", "#8A5A00", "#FDF3D7", "#B91C1C",
  "#FDECEC", "#E6ECF4", "#991B1B", "#173F6C", "#FFFFFF",
]);

function job(overrides: Partial<OcrJobDTO> & Pick<OcrJobDTO, "id" | "status">): OcrJobDTO {
  return {
    receiptId: "receipt-1",
    errorCode: null,
    model: null,
    confidence: null,
    receiptSharedWithHousehold: false,
    ...overrides,
  };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function navTrigger(page: Page): Locator {
  const width = page.viewportSize()?.width ?? 0;
  return page
    .locator(width < 768 ? '[data-nav="bottom"]' : '[data-nav="top"]')
    .getByRole("link", { name: "Tambah transaksi" });
}

async function assertTarget(locator: Locator, label: string, minWidth = 0): Promise<void> {
  await expect(locator, `${label} must be visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${label} must have a box`).not.toBeNull();
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(44);
  if (minWidth > 0) expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(minWidth);
}

async function assertPalette(scope: Locator): Promise<void> {
  const unapproved = await scope.evaluateAll((nodes, approved) => {
    const allowed = new Set(approved as string[]);
    const found = new Set<string>();
    for (const node of nodes) {
      const className = typeof node.className === "string" ? node.className : "";
      for (const match of className.match(/#[0-9A-Fa-f]{6}/g) ?? []) {
        if (!allowed.has(match.toUpperCase())) found.add(match);
      }
    }
    return [...found];
  }, [...APPROVED]);
  expect(unapproved, "only approved palette tokens").toEqual([]);
}

async function assertNoEmDash(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const hits: string[] = [];
    if (document.body.innerText.includes("\u2014")) hits.push("visible text");
    for (const element of Array.from(document.querySelectorAll("[aria-label],[title],[alt],[placeholder]"))) {
      for (const attribute of ["aria-label", "title", "alt", "placeholder"]) {
        const value = element.getAttribute(attribute);
        if (value?.includes("\u2014")) hits.push(`${attribute}: ${value}`);
      }
    }
    return hits;
  });
  expect(offenders, "no em dash in UI copy").toEqual([]);
}

async function openSheetFromNav(page: Page): Promise<void> {
  const trigger = navTrigger(page);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Tambah transaksi" })).toBeVisible();
}

async function openScanner(page: Page): Promise<void> {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  await page.getByRole("tab", { name: "Scan struk" }).click();
}

async function uploadReceipt(page: Page): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: "struk.png",
    mimeType: "image/png",
    buffer: PNG,
  });
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page, devFixtureEmail());
});

test("Add action and Add sheet: 44px targets, focus return, palette, no em dash", async ({ page }) => {
  await page.goto("/transactions?month=2025-03");
  const trigger = navTrigger(page);
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });

  await openSheetFromNav(page);
  await assertTarget(trigger, "global Add action", 44);
  await assertTarget(page.getByRole("button", { name: "Tutup" }), "sheet close", 44);
  await assertTarget(dialog.getByRole("tab", { name: "Isi manual" }), "Isi manual tab", 44);
  await assertTarget(dialog.getByRole("tab", { name: "Scan struk" }), "Scan struk tab", 44);
  await assertTarget(dialog.getByRole("button", { name: "Batal", exact: true }), "Batal", 44);
  await assertTarget(page.getByRole("button", { name: "Simpan transaksi" }), "Simpan transaksi", 44);

  await assertPalette(dialog);
  await assertNoEmDash(page);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger, "focus returns to the global Add action").toBeFocused();
  await expect(page).not.toHaveURL(/add=1/);
});

test("OCR retry state: targets, live region focus, palette, no em dash", async ({ page }) => {
  await page.route("**/api/ocr/receipts", (route) =>
    json(route, 200, { job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }), draft: null }),
  );
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/ocr/jobs/*/retry", async (route) => {
    await gate;
    await json(route, 200, {
      job: job({ id: "job-2", status: "SUCCEEDED", confidence: 0.92 }),
      draft: {
        merchant: "Pasar Segar",
        totalAmountMinor: 64_800,
        currencyCode: "IDR",
        occurredAt: new Date().toISOString().slice(0, 10),
        category: "food",
        taxAmountMinor: null,
        confidence: 0.92,
        missingFields: [],
        notes: null,
      },
    });
  });

  await openScanner(page);
  await uploadReceipt(page);
  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  await expect(page.getByText("Struk gagal dibaca")).toBeVisible();

  await assertTarget(page.getByRole("button", { name: "Pindai ulang" }), "Pindai ulang", 44);
  await assertTarget(dialog.getByRole("button", { name: "Isi manual" }), "Isi manual", 44);
  await assertTarget(dialog.getByRole("button", { name: "Batal", exact: true }), "Batal", 44);
  const live = dialog.locator('[aria-live="polite"]');
  await expect(live).toHaveCount(1);
  await assertPalette(dialog);

  await page.getByRole("button", { name: "Pindai ulang" }).click();
  await expect(page.getByRole("button", { name: "Memindai ulang" })).toBeDisabled();
  /* Focus stays inside the sheet on the live region while the retry runs. */
  await expect(live).toBeFocused();
  release?.();
  await expect(page.getByText("Struk berhasil dibaca!")).toBeVisible();
  await assertNoEmDash(page);
});

test("OCR in-progress state: targets, live region, palette, no em dash", async ({ page }) => {
  let uploads = 0;
  await page.route("**/api/ocr/receipts", (route) => {
    uploads += 1;
    if (uploads === 1) {
      return json(route, 200, { job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }), draft: null });
    }
    return json(route, 409, {
      error: { code: "DUPLICATE_RECEIPT", message: "Struk ini sudah pernah diproses.", fieldErrors: null },
      job: job({ id: "job-2", status: "PROCESSING" }),
      draft: null,
    });
  });
  await page.route("**/api/ocr/jobs/*/retry", (route) =>
    json(route, 409, {
      error: { code: "OCR_RETRY_IN_PROGRESS", message: "Pemindaian masih berjalan.", fieldErrors: null },
    }),
  );

  await openScanner(page);
  await uploadReceipt(page);
  await expect(page.getByText("Struk gagal dibaca")).toBeVisible();
  await page.getByRole("button", { name: "Pindai ulang" }).click();

  const dialog = page.getByRole("dialog", { name: "Tambah transaksi" });
  await expect(page.getByText("Struk sedang diproses")).toBeVisible();
  await assertTarget(dialog.getByRole("button", { name: "Pilih struk lain" }), "Pilih struk lain", 44);
  await assertTarget(dialog.getByRole("button", { name: "Isi manual" }), "Isi manual", 44);
  await assertTarget(dialog.getByRole("button", { name: "Batal", exact: true }), "Batal", 44);
  await expect(dialog.locator('[aria-live="polite"]')).toHaveCount(1);
  await assertPalette(dialog);
  await assertNoEmDash(page);
});

