import { expect, test } from "@playwright/test";
import { devFixtureEmail, signUpOwner } from "./helpers";

/*
  T-011 UI flow (design 07 §§2-5): create with an official bank, Quick Add a
  private provider, cancel persistence, detail label, and the manual path.
  Runs at 390/768/1280 through the three configured Playwright projects.

  Prerequisite: the local DB has the versioned OJK seed applied
  (`bun prisma/seed-bank-institutions.ts`). The first assertion fails clearly
  when that operational step was skipped; the test never invents bank names.
*/
test.describe("bank picker and private Quick Add (T-011)", () => {
  test("creates, labels, clears, and persists a canceled Quick Add", async ({ page }) => {
    await signUpOwner(page, devFixtureEmail());
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Beranda" })).toBeVisible();

    const catalog = await page.request.get("/api/institutions");
    expect(catalog.status()).toBe(200);
    const catalogBody = (await catalog.json()) as { official: unknown[] };
    expect(
      catalogBody.official.length,
      "Official catalog is empty. Run: bun run seed:institutions",
    ).toBeGreaterThan(0);

    /* ── Create with an official bank ───────────────────────────── */
    await page.getByRole("button", { name: /Buat dompet pertama|Dompet baru/ }).first().click();
    const form = page.getByRole("dialog", { name: "Buat dompet" });
    await expect(form).toBeVisible();
    await form.getByLabel("Nama", { exact: true }).fill("Dompet BCA E2E");

    await form.getByRole("button", { name: /Pilih bank atau penyedia/ }).click();
    const picker = page.getByRole("dialog", { name: "Pilih bank atau penyedia" });
    await expect(picker).toBeVisible();
    await picker.getByLabel("Cari bank atau penyedia").fill("BANK CENTRAL ASIA");
    const officialOption = picker.getByRole("option", { name: /PT BANK CENTRAL ASIA Tbk/ });
    await expect(officialOption).toBeVisible();
    await officialOption.click();

    await expect(picker).toBeHidden();
    await expect(form.getByRole("button", { name: /PT BANK CENTRAL ASIA Tbk/ })).toBeVisible();
    await form.getByRole("button", { name: "Buat dompet" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Dompet tersimpan." })).toBeVisible();
    const card = page.getByRole("button", { name: /Dompet BCA E2E.*PT BANK CENTRAL ASIA Tbk/ });
    await expect(card).toBeVisible();
    await card.click();

    const detail = page.getByRole("dialog", { name: "Detail dompet" });
    await expect(detail).toBeVisible();
    await expect(detail.getByText("Bank atau penyedia")).toBeVisible();
    await expect(detail.getByText("PT BANK CENTRAL ASIA Tbk")).toBeVisible();

    /* ── Clear the label through the manual path ────────────────── */
    await detail.getByRole("button", { name: "Ubah dompet" }).click();
    const edit = page.getByRole("dialog", { name: "Ubah dompet" });
    await expect(edit).toBeVisible();
    await edit.getByRole("button", { name: /PT BANK CENTRAL ASIA Tbk/ }).click();
    await page.getByRole("dialog", { name: "Pilih bank atau penyedia" })
      .getByRole("button", { name: /Dompet manual \/ bank lain/ })
      .click();
    await edit.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Perubahan disimpan." })).toBeVisible();

    await page.getByRole("button", { name: /Dompet BCA E2E/ }).first().click({ timeout: 30_000 });
    const manualDetail = page.getByRole("dialog", { name: "Detail dompet" });
    await expect(manualDetail.getByText("Bank atau penyedia")).toHaveCount(0);
    await manualDetail.getByRole("button", { name: "Tutup detail dompet" }).click();

    /* ── Quick Add persists when the parent wallet is canceled ───── */
    await page.getByRole("button", { name: /Buat dompet pertama|Dompet baru/ }).first().click();
    const canceledForm = page.getByRole("dialog", { name: "Buat dompet" });
    await canceledForm.getByRole("button", { name: /Pilih bank atau penyedia/ }).click();
    const canceledPicker = page.getByRole("dialog", { name: "Pilih bank atau penyedia" });
    await canceledPicker.getByRole("button", { name: "Tambah bank atau penyedia" }).click();

    const add = page.getByRole("dialog", { name: "Tambah bank atau penyedia" });
    await expect(add).toBeVisible();
    const addInput = add.getByLabel("Nama bank atau penyedia");
    await expect(addInput).toBeVisible();
    await addInput.fill("Bank Batal E2E");
    await add.getByRole("button", { name: "Simpan" }).click();
    await expect(add).toBeHidden();
    await expect(canceledPicker.getByRole("status")).toContainText(
      "baru saja terpilih di daftar pribadimu",
    );
    await canceledPicker.getByRole("button", { name: "Tutup pilih bank atau penyedia" }).click();
    await canceledForm.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Buat dompet" })).toHaveCount(0);

    await page.getByRole("button", { name: /Buat dompet pertama|Dompet baru/ }).first().click();
    const reopened = page.getByRole("dialog", { name: "Buat dompet" });
    await reopened.getByRole("button", { name: /Pilih bank atau penyedia/ }).click();
    const reopenedPicker = page.getByRole("dialog", { name: "Pilih bank atau penyedia" });
    await reopenedPicker.getByLabel("Cari bank atau penyedia").fill("Bank Batal E2E");
    await expect(
      reopenedPicker.getByRole("button", { name: "Pilih Bank Batal E2E" }),
    ).toBeVisible();
    await reopenedPicker.getByRole("button", { name: "Tutup pilih bank atau penyedia" }).click();
    await reopened.getByRole("button", { name: "Batal", exact: true }).click();
  });

  test("archives and restores a private provider without losing an existing wallet label", async ({ page }) => {
    const provider = "Bank Arsip E2E";
    const walletName = "Dompet Arsip E2E";

    await signUpOwner(page, devFixtureEmail());
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: "Beranda" })).toBeVisible();

    /* ── Quick Add + create a wallet that uses the private provider ── */
    await page.getByRole("button", { name: /Buat dompet pertama|Dompet baru/ }).first().click();
    const form = page.getByRole("dialog", { name: "Buat dompet" });
    await form.getByLabel("Nama", { exact: true }).fill(walletName);
    await form.getByRole("button", { name: /Pilih bank atau penyedia/ }).click();

    const picker = page.getByRole("dialog", { name: "Pilih bank atau penyedia" });
    await picker.getByRole("button", { name: "Tambah bank atau penyedia" }).click();
    const add = page.getByRole("dialog", { name: "Tambah bank atau penyedia" });
    await add.getByLabel("Nama bank atau penyedia").fill(provider);
    await add.getByRole("button", { name: "Simpan" }).click();
    await expect(add).toBeHidden();
    await expect(picker.getByRole("status")).toContainText("baru saja terpilih");
    await picker.getByRole("button", { name: "Tutup pilih bank atau penyedia" }).click();
    await form.getByRole("button", { name: "Buat dompet" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Dompet tersimpan." })).toBeVisible();

    /* ── Archive from the picker's Aktif view ─────────────────────── */
    await page.getByRole("button", { name: /Buat dompet pertama|Dompet baru/ }).first().click();
    const manageForm = page.getByRole("dialog", { name: "Buat dompet" });
    await manageForm.getByRole("button", { name: /Pilih bank atau penyedia/ }).click();
    const managePicker = page.getByRole("dialog", { name: "Pilih bank atau penyedia" });

    await expect(managePicker.getByRole("tab", { name: "Aktif" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await managePicker.getByRole("button", { name: `Arsipkan ${provider}` }).click();
    const confirm = managePicker.getByRole("group", { name: `Konfirmasi arsip ${provider}` });
    await expect(confirm).toContainText("Bukan hapus permanen");
    await confirm.getByRole("button", { name: "Arsipkan", exact: true }).click();

    await expect(managePicker.getByRole("status")).toContainText("diarsipkan");
    await expect(managePicker.getByRole("button", { name: `Pilih ${provider}` })).toHaveCount(0);

    /* ── Archived entry is visible in Arsip, not as a selectable option ── */
    await managePicker.getByRole("tab", { name: "Arsip" }).click();
    await expect(managePicker.getByRole("tab", { name: "Arsip" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(managePicker.getByText(/Diarsipkan/)).toBeVisible();
    await expect(managePicker.getByRole("button", { name: `Pulihkan ${provider}` })).toBeVisible();

    await managePicker.getByRole("button", { name: "Tutup pilih bank atau penyedia" }).click();
    await manageForm.getByRole("button", { name: "Batal", exact: true }).click();

    /* ── Existing wallet keeps the archived provider label ────────── */
    await page.getByRole("button", { name: new RegExp(walletName) }).first().click();
    const detail = page.getByRole("dialog", { name: "Detail dompet" });
    await expect(detail.getByText("Bank atau penyedia")).toBeVisible();
    await expect(detail.getByText(provider)).toBeVisible();
    await detail.getByRole("button", { name: "Tutup detail dompet" }).click();

    /* ── Restore returns the entry to Aktif ──────────────────────── */
    await page.getByRole("button", { name: /Buat dompet pertama|Dompet baru/ }).first().click();
    const restoreForm = page.getByRole("dialog", { name: "Buat dompet" });
    await restoreForm.getByRole("button", { name: /Pilih bank atau penyedia/ }).click();
    const restorePicker = page.getByRole("dialog", { name: "Pilih bank atau penyedia" });
    await restorePicker.getByRole("tab", { name: "Arsip" }).click();
    await restorePicker.getByRole("button", { name: `Pulihkan ${provider}` }).click();

    await expect(restorePicker.getByRole("status")).toContainText("dipulihkan");
    await expect(restorePicker.getByRole("tab", { name: "Aktif" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(restorePicker.getByRole("button", { name: `Pilih ${provider}` })).toBeVisible();

    await restorePicker.getByRole("button", { name: "Tutup pilih bank atau penyedia" }).click();
    await restoreForm.getByRole("button", { name: "Batal", exact: true }).click();
  });
});
