import { expect, test, type Page, type Route } from "@playwright/test";
import type { OcrDraftDTO, OcrJobDTO } from "../../../../types/api";
import { devFixtureEmail, signUpOwner, todayJakarta } from "../../../../e2e/helpers";

/*
  T-012 round 2: BUG-2 two-tab replay.

  Round 1 defect: after a retry conflict the client refreshed the stale FAILED
  target job, so tab B showed "cannot rescan" and dead-ended even though tab A
  had already produced a newer attempt. These tests drive two real pages in the
  same session, with tab A's retry state simulated at the network boundary (no
  live Gemini / Blob call is authorized).
*/

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=",
  "base64",
);

const DEAD_END = /tidak bisa dipindai ulang dari kartu ini/;

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

function json(route: Route, status: number, body: unknown): Promise<void> {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

function duplicate(status: number, extra: Record<string, unknown> = {}) {
  return {
    error: { code: "DUPLICATE_RECEIPT", message: "Struk ini sudah pernah diproses.", fieldErrors: null },
    status,
    ...extra,
  };
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

/** page B: first upload FAILED, later receipt POSTs answer from `latest()`. */
function mockTabB(page: Page, latest: () => { status: number; body: unknown }) {
  let receiptsCalls = 0;
  const callTimes: number[] = [];
  page.route("**/api/ocr/receipts", async (route) => {
    receiptsCalls += 1;
    callTimes.push(Date.now());
    if (receiptsCalls === 1) {
      await json(route, 200, {
        job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }),
        draft: null,
      });
      return;
    }
    const next = latest();
    await json(route, next.status, next.body);
  });
  return {
    get calls() {
      return receiptsCalls;
    },
    get times() {
      return callTimes;
    },
  };
}

test.beforeEach(async ({ page }) => {
  await signUpOwner(page, devFixtureEmail());
});

test.describe("BUG-2 two tabs on the same FAILED receipt", () => {
  test("tab A retried to SUCCEEDED, tab B reaches the editable review", async ({ context, page: tabB }) => {
    const tabA = await context.newPage();

    /* Tab A: the FAILED upload, then a retry that succeeds. */
    await tabA.route("**/api/ocr/receipts", (route) =>
      json(route, 200, { job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }), draft: null }),
    );
    let tabARetryUrl = "";
    await tabA.route("**/api/ocr/jobs/*/retry", async (route) => {
      tabARetryUrl = route.request().url();
      await json(route, 200, { job: job({ id: "job-2", status: "SUCCEEDED", confidence: 0.92 }), draft: draft() });
    });

    /* Tab B: stale FAILED state; the receipt's latest job is the SUCCEEDED attempt. */
    const tabBState = mockTabB(tabB, () => ({
      status: 409,
      body: duplicate(409, { job: job({ id: "job-2", status: "SUCCEEDED", confidence: 0.92 }), draft: draft() }),
    }));
    await tabB.route("**/api/ocr/jobs/*/retry", (route) =>
      json(route, 409, {
        error: { code: "OCR_NOT_RETRYABLE", message: "Struk ini tidak bisa dipindai ulang.", fieldErrors: null },
      }),
    );

    await openScanner(tabA);
    await uploadReceipt(tabA);
    await expect(tabA.getByText("Struk gagal dibaca")).toBeVisible();

    await openScanner(tabB);
    await uploadReceipt(tabB);
    await expect(tabB.getByText("Struk gagal dibaca")).toBeVisible();

    /* Tab A wins the race. */
    await tabA.getByRole("button", { name: "Pindai ulang" }).click();
    await expect(tabA.getByText("Struk berhasil dibaca!")).toBeVisible();
    expect(tabARetryUrl).toContain("/api/ocr/jobs/job-1/retry");

    /* Tab B now hits the conflict and must resolve to the latest job. */
    await tabB.getByRole("button", { name: "Pindai ulang" }).click();
    await expect(tabB.getByText("Struk berhasil dibaca!")).toBeVisible({ timeout: 10_000 });
    await expect(tabB.getByLabel("Toko")).toHaveValue("Pasar Segar");
    await expect(tabB.getByText(DEAD_END)).toHaveCount(0);
    expect(tabBState.calls).toBeGreaterThanOrEqual(2);
    await tabA.close();
  });

  test("tab A's retry lands FAILED, tab B sees the newest FAILED attempt and can retry it", async ({
    context,
    page: tabB,
  }) => {
    const tabA = await context.newPage();
    await tabA.route("**/api/ocr/receipts", (route) =>
      json(route, 200, { job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }), draft: null }),
    );
    await tabA.route("**/api/ocr/jobs/*/retry", (route) =>
      json(route, 200, {
        job: job({ id: "job-2", status: "FAILED", errorCode: "OCR_RATE_LIMITED" }),
        draft: null,
      }),
    );

    const tabBState = mockTabB(tabB, () => ({
      status: 409,
      body: duplicate(409, {
        job: job({ id: "job-2", status: "FAILED", errorCode: "OCR_RATE_LIMITED" }),
        draft: null,
      }),
    }));

    const retryUrls: string[] = [];
    let tabBRetries = 0;
    await tabB.route("**/api/ocr/jobs/*/retry", async (route) => {
      retryUrls.push(route.request().url());
      tabBRetries += 1;
      if (tabBRetries === 1) {
        await json(route, 409, {
          error: { code: "OCR_NOT_RETRYABLE", message: "Struk ini tidak bisa dipindai ulang.", fieldErrors: null },
        });
        return;
      }
      await json(route, 200, { job: job({ id: "job-3", status: "SUCCEEDED", confidence: 0.92 }), draft: draft() });
    });

    await openScanner(tabA);
    await uploadReceipt(tabA);
    await tabA.getByRole("button", { name: "Pindai ulang" }).click();
    await expect(tabA.getByText("Layanan baca struk sedang ramai.")).toBeVisible();

    await openScanner(tabB);
    await uploadReceipt(tabB);
    await expect(tabB.getByText("Struk gagal dibaca")).toBeVisible();

    await tabB.getByRole("button", { name: "Pindai ulang" }).click();
    /* Latest attempt is the newer FAILED job, so retry stays available. */
    await expect(tabB.getByText("Layanan baca struk sedang ramai.")).toBeVisible({ timeout: 10_000 });
    await expect(tabB.getByRole("button", { name: "Pindai ulang" })).toBeEnabled();
    await expect(tabB.getByText(DEAD_END)).toHaveCount(0);
    expect(tabBState.calls).toBeGreaterThanOrEqual(2);

    await tabB.getByRole("button", { name: "Pindai ulang" }).click();
    await expect(tabB.getByText("Struk berhasil dibaca!")).toBeVisible({ timeout: 10_000 });
    expect(retryUrls[1]).toContain("/api/ocr/jobs/job-2/retry");
    await tabA.close();
  });

  test("latest job stays PROCESSING: in-progress notice, no retry, poll is paced and stops on close", async ({
    page,
  }) => {
    const state = mockTabB(page, () => ({
      status: 409,
      body: duplicate(409, { job: job({ id: "job-2", status: "PROCESSING" }), draft: null }),
    }));
    await page.route("**/api/ocr/jobs/*/retry", (route) =>
      json(route, 409, {
        error: { code: "OCR_RETRY_IN_PROGRESS", message: "Pemindaian masih berjalan.", fieldErrors: null },
      }),
    );

    await openScanner(page);
    await uploadReceipt(page);
    await expect(page.getByText("Struk gagal dibaca")).toBeVisible();
    await page.getByRole("button", { name: "Pindai ulang" }).click();

    await expect(page.getByText("Struk sedang diproses")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pindai ulang" })).toHaveCount(0);
    await expect(page.getByText(DEAD_END)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Pilih struk lain" })).toBeVisible();

    const baseline = state.calls;
    await page.waitForTimeout(7_000);
    const duringWait = state.calls - baseline;

    /* ~2s polling: 3-4 requests in 7s, never a hot loop. */
    expect(duringWait).toBeGreaterThanOrEqual(2);
    expect(duringWait).toBeLessThanOrEqual(5);
    /* Only the poll requests after the conflict resolution must be paced. */
    const pollTimes = state.times.slice(baseline);
    for (let index = 1; index < pollTimes.length; index += 1) {
      expect(pollTimes[index]! - pollTimes[index - 1]!).toBeGreaterThanOrEqual(1_500);
    }

    /* Closing the sheet must stop the poll. */
    await page.getByRole("button", { name: "Tutup" }).click();
    await expect(page.getByRole("dialog", { name: "Tambah transaksi" })).toHaveCount(0);
    const afterClose = state.calls;
    await page.waitForTimeout(5_000);
    expect(state.calls).toBe(afterClose);
  });

  test("two tabs racing: tab B shows in-progress then resolves to the review once tab A finishes", async ({
    context,
    page: tabB,
  }) => {
    const tabA = await context.newPage();
    let releaseTabA: (() => void) | undefined;
    const tabAGate = new Promise<void>((resolve) => {
      releaseTabA = resolve;
    });

    await tabA.route("**/api/ocr/receipts", (route) =>
      json(route, 200, { job: job({ id: "job-1", status: "FAILED", errorCode: "OCR_TIMEOUT" }), draft: null }),
    );
    await tabA.route("**/api/ocr/jobs/*/retry", async (route) => {
      await tabAGate;
      await json(route, 200, { job: job({ id: "job-2", status: "SUCCEEDED", confidence: 0.92 }), draft: draft() });
    });

    let latestCalls = 0;
    const state = mockTabB(tabB, () => {
      latestCalls += 1;
      /* First conflict read sees PROCESSING, the next poll sees the result. */
      return latestCalls === 1
        ? { status: 409, body: duplicate(409, { job: job({ id: "job-2", status: "PROCESSING" }), draft: null }) }
        : {
            status: 409,
            body: duplicate(409, { job: job({ id: "job-2", status: "SUCCEEDED", confidence: 0.92 }), draft: draft() }),
          };
    });
    await tabB.route("**/api/ocr/jobs/*/retry", (route) =>
      json(route, 409, {
        error: { code: "OCR_RETRY_IN_PROGRESS", message: "Pemindaian masih berjalan.", fieldErrors: null },
      }),
    );

    await openScanner(tabA);
    await uploadReceipt(tabA);
    await expect(tabA.getByText("Struk gagal dibaca")).toBeVisible();

    await openScanner(tabB);
    await uploadReceipt(tabB);
    await expect(tabB.getByText("Struk gagal dibaca")).toBeVisible();

    /* Tab A starts the retry and keeps it in flight. */
    await tabA.getByRole("button", { name: "Pindai ulang" }).click();
    await expect(tabA.getByRole("button", { name: "Memindai ulang" })).toBeDisabled();

    await tabB.getByRole("button", { name: "Pindai ulang" }).click();
    await expect(tabB.getByText("Struk sedang diproses")).toBeVisible();
    await expect(tabB.getByText(DEAD_END)).toHaveCount(0);

    /* Tab A finishes: tab B's poll picks up the automated result. */
    releaseTabA?.();
    await expect(tabB.getByText("Struk berhasil dibaca!")).toBeVisible({ timeout: 15_000 });
    await expect(tabB.getByLabel("Toko")).toHaveValue("Pasar Segar");
    await expect(tabA.getByText("Struk berhasil dibaca!")).toBeVisible();
    expect(state.calls).toBeGreaterThanOrEqual(2);
    await tabA.close();
  });
});


