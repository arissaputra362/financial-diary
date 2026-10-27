"use client";

import { useRef, useState } from "react";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { isValidMoneyAmount } from "@/lib/money-input";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { apiRequest, idempotencyHeaders } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { WalletDTO, WalletInstitutionDTO, WalletScope } from "@/types/api";
import { BankPickerSheet } from "./BankPickerSheet";

const INT32_MAX = 2_147_483_647;

export interface WalletFormSheetProps {
  open: boolean;
  mode: "create" | "edit";
  wallet?: WalletDTO | null;
  onClose: () => void;
  onSaved: (wallet: WalletDTO) => void;
}

/*
  Create/edit wallet (design 06 §6.1/§6.2). Scope is create-only (C-31): the
  create mode renders the Pribadi/Bersama choice, the edit mode never renders it
  and never sends `scope` to PATCH.
*/
export function WalletFormSheet({ open, mode, wallet, onClose, onSaved }: WalletFormSheetProps) {
  const [name, setName] = useState(wallet?.name ?? "");
  const [purpose, setPurpose] = useState(wallet?.purpose ?? "");
  const [scope, setScope] = useState<WalletScope>(wallet?.scope ?? "PERSONAL");
  const [openingDigits, setOpeningDigits] = useState(
    mode === "edit" && wallet ? String(wallet.openingBalanceMinor) : "",
  );
  const [institution, setInstitution] = useState<WalletInstitutionDTO | null>(
    wallet?.institution ?? null,
  );
  const [institutionDirty, setInstitutionDirty] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(open, panelRef, onClose);

  const locked = mode === "edit" && (wallet?.openingBalanceLocked ?? false);
  const openingMinor = openingDigits ? Number(openingDigits) : 0;

  if (!open) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const errors: Record<string, string[]> = {};
    if (!name.trim()) errors.name = ["Nama dompet belum diisi."];
    if (name.trim().length > 80) errors.name = ["Nama dompet maksimal 80 karakter."];
    if (purpose.trim().length > 80) errors.purpose = ["Tujuan penggunaan maksimal 80 karakter."];
    if (openingDigits && !isValidMoneyAmount(openingMinor, true)) {
      errors.openingBalanceMinor = ["Saldo awal tidak boleh negatif."];
    } else if (openingMinor > INT32_MAX) {
      errors.openingBalanceMinor = ["Saldo awal terlalu besar."];
    }
    if (institutionDirty && institution && !institution.id) {
      errors.institution = ["Pilih bank atau penyedia dari daftar."];
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    /*
      T-011: omit `institution` unless the user actually changed the label.
      On update that preserves another member's custom label; on create the
      omitted field is simply manual. `NONE` is an explicit clear.
    */
    const institutionPayload = institutionDirty
      ? institution
        ? { kind: institution.kind, id: institution.id! }
        : { kind: "NONE" as const }
      : undefined;

    setSubmitting(true);
    try {
      const response =
        mode === "create"
          ? await apiRequest<WalletDTO>("/api/wallets", {
              method: "POST",
              headers: { "content-type": "application/json", ...idempotencyHeaders() },
              body: JSON.stringify({
                name: name.trim(),
                purpose: purpose.trim() || undefined,
                scope,
                openingBalanceMinor: openingDigits ? openingMinor : undefined,
                ...(institutionPayload ? { institution: institutionPayload } : {}),
              }),
            })
          : await apiRequest<WalletDTO>(`/api/wallets/${wallet?.id}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                name: name.trim(),
                purpose: purpose.trim() || null,
                ...(locked ? {} : { openingBalanceMinor: openingDigits ? openingMinor : 0 }),
                ...(institutionPayload ? { institution: institutionPayload } : {}),
              }),
            });

      if (response.status === 401) {
        setFormError("Sesi berakhir. Masuk lagi untuk menyimpan.");
        return;
      }
      if (!response.ok || !response.data) {
        setFieldErrors(response.data?.error?.fieldErrors ?? {});
        setFormError(response.data?.error?.message ?? "Dompet belum tersimpan. Coba lagi.");
        return;
      }
      onSaved(response.data);
    } catch {
      setFormError("Dompet belum tersimpan. Periksa koneksimu lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim/40 sm:items-center sm:p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
        tabIndex={-1}
        aria-labelledby="wallet-form-title"
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="wallet-form-title" className="text-lg font-semibold tracking-tight text-ink">
            {mode === "create" ? "Buat dompet" : "Ubah dompet"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-blue-wash"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="mt-4 space-y-5">
          <Input
            id="wallet-name"
            label="Nama"
            value={name}
            maxLength={80}
            error={fieldErrors.name?.[0]}
            placeholder="mis. Dompet Keluarga"
            onChange={(event) => setName(event.target.value)}
          />

          <Field
            id="wallet-institution"
            label="Bank atau penyedia (opsional)"
            error={fieldErrors.institution?.[0]}
            helperText={
              institution?.kind === "CUSTOM" && institution.id === null
                ? "Label ini dari daftar pribadi anggota lain. Kamu bisa mempertahankan atau mengosongkannya."
                : "Bisa dilewati. Dompet tanpa bank tetap bisa dibuat (Dompet manual / bank lain)."
            }
          >
            <div className="flex items-stretch gap-2">
              <button
                id="wallet-institution"
                type="button"
                aria-haspopup="dialog"
                aria-label={`Bank atau penyedia (opsional): ${
                  institution ? institution.name : "Pilih bank atau penyedia"
                }`}
                aria-describedby={
                  fieldErrors.institution
                    ? "wallet-institution-error"
                    : "wallet-institution-helper"
                }
                onClick={() => setPickerOpen(true)}
                className={cn(
                  "flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-3 text-left transition-colors",
                  "focus:outline-none focus:ring-4",
                  fieldErrors.institution
                    ? "border-danger focus:border-danger focus:ring-danger/15"
                    : "border-input-border focus:border-blue focus:ring-blue/15",
                )}
              >
                <span
                  className={cn(
                    "truncate text-[15px]",
                    institution ? "font-medium text-ink" : "text-placeholder",
                  )}
                >
                  {institution?.name ?? "Pilih bank atau penyedia"}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
              </button>
              {institution ? (
                <button
                  type="button"
                  aria-label="Kosongkan bank atau penyedia"
                  onClick={() => {
                    setInstitution(null);
                    setInstitutionDirty(true);
                    setFieldErrors((previous) => {
                      if (!previous.institution) return previous;
                      const next = { ...previous };
                      delete next.institution;
                      return next;
                    });
                  }}
                  className="flex min-h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-input-border bg-card text-ink-2 hover:bg-blue-wash"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </Field>

          <Input
            id="wallet-purpose"
            label="Tujuan penggunaan (opsional)"
            value={purpose}
            maxLength={80}
            error={fieldErrors.purpose?.[0]}
            placeholder="mis. Tabungan, Biaya rumah"
            onChange={(event) => setPurpose(event.target.value)}
          />

          {mode === "create" ? (
            <fieldset>
              <legend className="text-xs font-medium uppercase tracking-wider text-ink-2">Jenis dompet</legend>
              <div className="mt-2 flex gap-2">
                {(
                  [
                    ["PERSONAL", "Pribadi"],
                    ["SHARING", "Bersama"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={scope === value}
                    onClick={() => setScope(value)}
                    className={cn(
                      "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors",
                      scope === value
                        ? "bg-brand-blue text-white"
                        : "border border-blue-border bg-card text-blue hover:bg-blue-wash",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-placeholder">
                Bersama: semua anggota keluarga bisa melihat. Pribadi: hanya kamu. Jenis dompet
                hanya bisa dipilih saat pembuatan.
              </p>
            </fieldset>
          ) : null}

          <Field
            id="wallet-opening"
            label="Saldo awal (opsional)"
            error={fieldErrors.openingBalanceMinor?.[0]}
            helperText={
              locked
                ? "Saldo awal terkunci: sudah ada transaksi untuk dompet ini."
                : "Kosong berarti Rp0."
            }
          >
            <div
              className={cn(
                "flex items-center gap-2 rounded-2xl border border-input-border bg-card px-4 py-3 focus-within:border-blue focus-within:ring-4 focus-within:ring-blue/15",
                locked && "bg-blue-wash",
              )}
            >
              <span className="text-lg font-semibold text-ink-2">Rp</span>
              <MoneyInput
                id="wallet-opening"
                value={openingDigits}
                onValueChange={setOpeningDigits}
                disabled={locked}
                placeholder="0"
                aria-invalid={fieldErrors.openingBalanceMinor ? true : undefined}
                className="w-full min-w-0 bg-transparent text-xl font-bold tabular-nums text-ink outline-none placeholder:text-placeholder/60 disabled:cursor-not-allowed disabled:text-ink-2"
              />
            </div>
          </Field>

          {formError ? (
            <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button type="submit" size="lg" isLoading={submitting} loadingLabel="Menyimpan" className="sm:flex-1">
              {mode === "create" ? "Buat dompet" : "Simpan perubahan"}
            </Button>
            <Button type="button" variant="secondary" size="lg" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
          </div>
        </form>
        </div>
      </div>

      {pickerOpen ? (
        <BankPickerSheet
          open
          current={institution}
          onClose={() => setPickerOpen(false)}
          onSelect={(choice) => {
            setInstitution(choice);
            setInstitutionDirty(true);
            setFieldErrors((previous) => {
              if (!previous.institution) return previous;
              const next = { ...previous };
              delete next.institution;
              return next;
            });
          }}
        />
      ) : null}
    </>
  );
}
