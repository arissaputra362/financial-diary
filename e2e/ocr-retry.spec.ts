import { expect, test, type Page, type Route } from "@playwright/test";
import type { OcrDraftDTO, OcrJobDTO } from "../types/api";
import { devFixtureEmail, signUpOwner, todayJakarta } from "./helpers";

/*
  T-012 OCR retry UI (design 03 §3.5, 2026-10-23 revision). The backend flow is
  covered by the service/route tests; these specs drive the real browser against
  deterministic OCR responses so the picker, same-photo retry, different-photo
  upload, retry failure, and image-unavailable states can be checked without
  calling Gemini or Blob storage.
*/

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

/* Different bytes, same declared MIME: the normal new-upload path. */
const OTHER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

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

function draft(): OcrDraftDTO {
  return {
    merchant: "Pasar Segar",
    totalAmountMinor: 64_800,
    currencyCode: "IDR",
    occurredAt: todayJakarta(),
    category: "food",
    taxAmountMinor: null,
    confidence: 0.92,
    missingFields: [],
    notes: null,
  };
}

function duplicateBody(failed: OcrJobDTO) {
  return {
    error: { code: "DUPLICATE_RECEIPT", message: "Struk ini sudah pernah diproses.", fieldErrors: null },
    job: failed,
    draft: null,
  };
}

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function openScanner(page: Page): Promise<void> {
  await page.goto("/transactions");
  await page.getByRole("button", { name: "Tambah transaksi" }).first().click();
  await page.getByRole("tab", { name: "Scan struk" }).click();
}

async function uploadReceipt(page: Page, buffer: Buffer = PNG): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: "struk.png",
    mimeType: "image/png",
    buffer,
  });
}

/*
  Real picker check: the button must open the native file chooser, and no retry
  request may run before a file is chosen.
*/
async function pickReceipt(
  page: Page,
  buttonName: "Pindai ulang" | "Pilih foto struk",
  buffer: Buffer = PNG,
): Promise<void> {
  const chooserPromise = page.waitForEvent("filechooser");
  /* Scope to the visible pill: the hidden file input shares the same aria-label. */
  await page.locator("button", { hasText: buttonName }).first().click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "struk.png", mimeType: "image/png", buffer });
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page, devFixtureEmail());
});

test.describe("OCR retry picker (AC-F3-10, AC-F3-11)", () => {
  test("Pindai ulang opens the picker, then identical bytes retry the FAILED job", async ({ page }) => {
    let uploadCount = 0;
    const failed = job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" });
    await page.route("**/api/ocr/receipts", (route) => {
      uploadCount += 1;
      return uploadCount === 1
        ? json(route, 200, { job: failed, draft: null })
        : json(route, 409, duplicateBody(failed));
    });

    let retryCount = 0;
    let releaseRetry: (() => void) | undefined;
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    let retryRequest: import("@playwright/test").Request | null = null;
    await page.route("**/api/ocr/jobs/*/retry", async (route) => {
      retryCount += 1;
      retryRequest = route.request();
      await retryGate;
      await json(route, 200, {
        job: job({ id: "job-2", status: "SUCCEEDED", confidence: 0.92 }),
        draft: draft(),
      });
    });

    await openScanner(page);
    await uploadReceipt(page);

    await expect(page.getByText("Struk gagal dibaca")).toBeVisible();
    await expect(page.getByText("Struk ini belum bisa dibaca otomatis.")).toBeVisible();
    await expect(page.getByText("Waktu baca habis.")).toBeVisible();
    await expect(
      page.getByText("Kamu bisa memilih gambar struk lagi atau menggantinya dengan foto lain."),
    ).toBeVisible();
    await expect(
      page.getByText("Percobaan yang gagal tadi tidak mengubah catatan keuangan apa pun."),
    ).toBeVisible();

    /* The picker opens first; no retry runs until a file is chosen. */
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Pindai ulang" }).click();
    const chooser = await chooserPromise;
    expect(retryCount).toBe(0);

    await chooser.setFiles({ name: "struk.png", mimeType: "image/png", buffer: PNG });
    /* Real pressed state: the primary action is disabled while the request runs. */
    await expect(page.getByRole("button", { name: "Memindai ulang" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Isi manual" })).toBeEnabled();
    releaseRetry?.();

    await expect(page.getByText("Struk berhasil dibaca!")).toBeVisible();
    await expect(page.getByLabel("Toko")).toHaveValue("Pasar Segar");

    /* Review only: retry never creates a transaction by itself. */
    const ledger = await page.request.get("/api/transactions");
    expect(ledger.ok()).toBe(true);
    expect((await ledger.json()).rows).toHaveLength(0);

    expect(uploadCount).toBe(2);
    expect(retryCount).toBe(1);
    expect(retryRequest).not.toBeNull();
    expect(retryRequest!.method()).toBe("POST");
    expect(retryRequest!.postData()).toBeNull();
    expect(retryRequest!.headers()["idempotency-key"]).toBeTruthy();
    expect(retryRequest!.url()).toContain("/api/ocr/jobs/job-1/retry");
  });

  test("a different photo follows the normal upload path and never calls retry", async ({ page }) => {
    let uploadCount = 0;
    let retryCount = 0;
    await page.route("**/api/ocr/receipts", (route) => {
      uploadCount += 1;
      if (uploadCount === 1) {
        return json(route, 200, {
          job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }),
          draft: null,
        });
      }
      return json(route, 200, {
        job: job({ id: "job-2", status: "SUCCEEDED", confidence: 0.9 }),
        draft: draft(),
      });
    });
    await page.route("**/api/ocr/jobs/*/retry", (route) => {
      retryCount += 1;
      return json(route, 200, { job: job({ id: "unused", status: "FAILED" }), draft: null });
    });

    await openScanner(page);
    await uploadReceipt(page);
    await expect(page.getByText("Waktu baca habis.")).toBeVisible();

    await pickReceipt(page, "Pindai ulang", OTHER_PNG);

    await expect(page.getByText("Struk berhasil dibaca!")).toBeVisible();
    await expect(page.getByLabel("Toko")).toHaveValue("Pasar Segar");
    expect(uploadCount).toBe(2);
    expect(retryCount).toBe(0);
  });

  test("a failed retry stays retryable and the next retry targets the newest job", async ({ page }) => {
    let uploadCount = 0;
    await page.route("**/api/ocr/receipts", (route) => {
      uploadCount += 1;
      if (uploadCount === 1) {
        return json(route, 200, {
          job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }),
          draft: null,
        });
      }
      if (uploadCount === 2) {
        return json(
          route,
          409,
          duplicateBody(job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" })),
        );
      }
      return json(
        route,
        409,
        duplicateBody(job({ id: "job-2", status: "FAILED", errorCode: "OCR_RATE_LIMITED" })),
      );
    });

    const retryUrls: string[] = [];
    let retryCount = 0;
    await page.route("**/api/ocr/jobs/*/retry", async (route) => {
      retryUrls.push(route.request().url());
      retryCount += 1;
      if (retryCount === 1) {
        await json(route, 200, {
          job: job({ id: "job-2", status: "FAILED", errorCode: "OCR_RATE_LIMITED" }),
          draft: null,
        });
        return;
      }
      await json(route, 200, {
        job: job({ id: "job-3", status: "SUCCEEDED", confidence: 0.92 }),
        draft: draft(),
      });
    });

    await openScanner(page);
    await uploadReceipt(page);
    await expect(page.getByText("Waktu baca habis.")).toBeVisible();

    await pickReceipt(page, "Pindai ulang");
    await expect(page.getByText("Layanan baca struk sedang ramai.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pindai ulang" })).toBeEnabled();
    await expect(
      page.getByText("Kamu bisa memilih gambar struk lagi atau menggantinya dengan foto lain."),
    ).toBeVisible();

    await pickReceipt(page, "Pindai ulang");
    await expect(page.getByText("Struk berhasil dibaca!")).toBeVisible();

    expect(retryUrls).toHaveLength(2);
    expect(retryUrls[0]).toContain("/api/ocr/jobs/job-1/retry");
    expect(retryUrls[1]).toContain("/api/ocr/jobs/job-2/retry");
  });
});

test.describe("retry conflict resolves the receipt's latest job (BUG-2)", () => {
  test("OCR_RETRY_IN_PROGRESS shows progress without retry, then opens the automated result", async ({
    page,
  }) => {
    let uploadCount = 0;
    await page.route("**/api/ocr/receipts", async (route) => {
      uploadCount += 1;
      if (uploadCount === 1) {
        await json(route, 200, {
          job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }),
          draft: null,
        });
        return;
      }
      if (uploadCount === 2) {
        /* Same bytes: dedup returns the FAILED job that the client retries. */
        await json(
          route,
          409,
          duplicateBody(job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" })),
        );
        return;
      }
      /* Latest attempt is still PROCESSING in the other tab. */
      if (uploadCount === 3) {
        await json(route, 409, duplicateBody(job({ id: "job-2", status: "PROCESSING" })));
        return;
      }
      /* The next poll sees the successful attempt. */
      await json(route, 409, {
        ...duplicateBody(job({ id: "job-3", status: "SUCCEEDED", confidence: 0.92 })),
        draft: draft(),
      });
    });
    await page.route("**/api/ocr/jobs/*/retry", (route) =>
      json(route, 409, {
        error: { code: "OCR_RETRY_IN_PROGRESS", message: "Pemindaian masih berjalan.", fieldErrors: null },
      }),
    );

    await openScanner(page);
    await uploadReceipt(page);
    await expect(page.getByText("Waktu baca habis.")).toBeVisible();
    await pickReceipt(page, "Pindai ulang");

    await expect(page.getByText("Struk sedang diproses")).toBeVisible();
    await expect(page.getByText("Pemindaian struk ini masih berjalan.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pindai ulang" })).toHaveCount(0);

    await expect(page.getByText("Struk berhasil dibaca!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("Toko")).toHaveValue("Pasar Segar");
    expect(uploadCount).toBeGreaterThanOrEqual(4);
  });

  test("OCR_NOT_RETRYABLE hydrates the review when the latest attempt already succeeded", async ({
    page,
  }) => {
    let uploadCount = 0;
    await page.route("**/api/ocr/receipts", async (route) => {
      uploadCount += 1;
      if (uploadCount === 1) {
        await json(route, 200, {
          job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }),
          draft: null,
        });
        return;
      }
      if (uploadCount === 2) {
        await json(
          route,
          409,
          duplicateBody(job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" })),
        );
        return;
      }
      await json(
        route,
        409,
        {
          ...duplicateBody(job({ id: "job-2", status: "SUCCEEDED", confidence: 0.92 })),
          draft: draft(),
        },
      );
    });
    await page.route("**/api/ocr/jobs/*/retry", (route) =>
      json(route, 409, {
        error: { code: "OCR_NOT_RETRYABLE", message: "Struk ini tidak bisa dipindai ulang.", fieldErrors: null },
      }),
    );

    await openScanner(page);
    await uploadReceipt(page);
    await expect(page.getByText("Waktu baca habis.")).toBeVisible();
    await pickReceipt(page, "Pindai ulang");

    await expect(page.getByText("Struk berhasil dibaca!")).toBeVisible();
    await expect(page.getByLabel("Toko")).toHaveValue("Pasar Segar");
    await expect(page.getByText(/tidak bisa dipindai ulang/)).toHaveCount(0);
  });

  test("OCR_NOT_RETRYABLE keeps the newest FAILED attempt retryable", async ({ page }) => {
    let uploadCount = 0;
    await page.route("**/api/ocr/receipts", (route) => {
      uploadCount += 1;
      if (uploadCount === 1) {
        return json(route, 200, {
          job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }),
          draft: null,
        });
      }
      if (uploadCount === 2) {
        return json(
          route,
          409,
          duplicateBody(job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" })),
        );
      }
      return json(
        route,
        409,
        duplicateBody(job({ id: "job-2", status: "FAILED", errorCode: "OCR_RATE_LIMITED" })),
      );
    });

    const retryUrls: string[] = [];
    await page.route("**/api/ocr/jobs/*/retry", async (route) => {
      retryUrls.push(route.request().url());
      if (retryUrls.length === 1) {
        await json(route, 409, {
          error: { code: "OCR_NOT_RETRYABLE", message: "Struk ini tidak bisa dipindai ulang.", fieldErrors: null },
        });
        return;
      }
      await json(route, 200, {
        job: job({ id: "job-3", status: "SUCCEEDED", confidence: 0.92 }),
        draft: draft(),
      });
    });

    await openScanner(page);
    await uploadReceipt(page);
    await expect(page.getByText("Waktu baca habis.")).toBeVisible();
    await pickReceipt(page, "Pindai ulang");

    await expect(page.getByText("Layanan baca struk sedang ramai.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pindai ulang" })).toBeEnabled();

    await pickReceipt(page, "Pindai ulang");
    await expect(page.getByText("Struk berhasil dibaca!")).toBeVisible();

    expect(retryUrls[1]).toContain("/api/ocr/jobs/job-2/retry");
  });

  test("a conflict without a readable latest job uses the generic copy", async ({ page }) => {
    let uploadCount = 0;
    await page.route("**/api/ocr/receipts", (route) => {
      uploadCount += 1;
      if (uploadCount === 1) {
        return json(route, 200, {
          job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }),
          draft: null,
        });
      }
      if (uploadCount === 2) {
        return json(
          route,
          409,
          duplicateBody(job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" })),
        );
      }
      return json(route, 409, {
        error: { code: "DUPLICATE_RECEIPT", message: "Struk ini sudah pernah diproses.", fieldErrors: null },
        job: null,
        draft: null,
      });
    });
    await page.route("**/api/ocr/jobs/*/retry", (route) =>
      json(route, 409, {
        error: { code: "OCR_NOT_RETRYABLE", message: "Struk ini tidak bisa dipindai ulang.", fieldErrors: null },
      }),
    );

    await openScanner(page);
    await uploadReceipt(page);
    await expect(page.getByText("Waktu baca habis.")).toBeVisible();
    await pickReceipt(page, "Pindai ulang");

    await expect(
      page.getByText(
        "Struk ini sudah tidak bisa dipindai ulang dari kartu ini. Pilih foto struk atau isi manual.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Pindai ulang" })).toHaveCount(0);
    await expect(page.locator("button", { hasText: "Pilih foto struk" })).toBeVisible();
  });
});

test.describe("stored image unavailable (AC-F3-12)", () => {
  test("identical photo with a missing blob shows Variant B and stays there", async ({ page }) => {
    const failed = job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" });
    let uploadCount = 0;
    await page.route("**/api/ocr/receipts", (route) => {
      uploadCount += 1;
      if (uploadCount === 1) {
        return json(route, 200, { job: failed, draft: null });
      }
      /* Same bytes: existing dedup returns the same FAILED job. */
      return json(route, 409, duplicateBody(failed));
    });

    let retryCount = 0;
    await page.route("**/api/ocr/jobs/*/retry", (route) => {
      retryCount += 1;
      return json(route, 409, {
        error: { code: "OCR_IMAGE_UNAVAILABLE", message: "Struk tidak bisa diproses.", fieldErrors: null },
      });
    });

    await openScanner(page);
    await uploadReceipt(page);
    await pickReceipt(page, "Pindai ulang");

    await expect(
      page.getByText(
        "Gambar struk yang lama sudah tidak bisa diproses. Pilih foto struk lain atau isi manual.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Pindai ulang" })).toHaveCount(0);
    await expect(page.locator("button", { hasText: "Pilih foto struk" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Isi manual" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Batal" })).toBeVisible();
    await expect(page.getByText(/Percobaan yang gagal tadi tidak mengubah catatan keuangan/)).toBeVisible();
    expect(retryCount).toBe(1);

    /*
      Pilih foto struk opens the picker again. The identical file is still the
      known-unavailable receipt, so the card stays in Variant B and no retry or
      new job is attempted.
    */
    await pickReceipt(page, "Pilih foto struk");
    await expect(
      page.getByText(
        "Gambar struk yang lama sudah tidak bisa diproses. Pilih foto struk lain atau isi manual.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Pindai ulang" })).toHaveCount(0);
    expect(uploadCount).toBe(3);
    expect(retryCount).toBe(1);

    /* Isi manual opens an empty manual form (no partial OCR values). */
    await page.getByRole("button", { name: "Isi manual" }).click();
    await expect(page.getByRole("tab", { name: "Isi manual" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("#amount")).toHaveValue("");
    await expect(page.locator("#merchant")).toHaveValue("");
  });

  test("a generic upload error offers Pilih foto struk without a retry claim", async ({ page }) => {
    let retryCount = 0;
    await page.route("**/api/ocr/jobs/*/retry", (route) => {
      retryCount += 1;
      return json(route, 500, { error: { code: "INTERNAL", message: "Gagal." } });
    });

    await openScanner(page);
    await page.locator('input[type="file"]').setInputFiles({
      name: "catatan.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("bukan struk"),
    });

    await expect(page.getByText("Format foto harus JPG, PNG, atau WebP.")).toBeVisible();
    await expect(page.locator("button", { hasText: "Pilih foto struk" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Isi manual" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pindai ulang" })).toHaveCount(0);

    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("button", { hasText: "Pilih foto struk" }).first().click();
    await chooserPromise;
    expect(retryCount).toBe(0);
  });
});
