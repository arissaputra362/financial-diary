"use client";

import { useEffect, useRef, useState } from "react";
import { CircleDollarSign, Wallet as WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { TextArea } from "@/components/ui/TextArea";
import { ScopePill } from "@/components/wallets/scope";
import { WalletFormSheet } from "@/components/wallets/WalletFormSheet";
import { WalletPickerSheet } from "@/components/wallets/WalletPickerSheet";
import { apiRequest, idempotencyHeaders } from "@/lib/api-client";
import { todayJakarta, toJakartaDateOnly, yesterdayJakarta } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { isValidMoneyAmount } from "@/lib/money-input";
import { cn } from "@/lib/utils";
import type { TransactionDTO, TransactionType, WalletDTO, WalletRefDTO } from "@/types/api";
import { categoriesForType, CATEGORY_EMOJI, CATEGORY_LABELS } from "./categories";

const INT32_MAX = 2_147_483_647;

export interface ManualEntryFormProps {
  onCreated?: (rows: TransactionDTO[]) => void;
  initialRow?: TransactionDTO;
  onUpdated?: (row: TransactionDTO) => void;
  onCancel: () => void;
  onSwitchToScan?: () => void;
}

/**
 * Money in / money out / transfer form (design 03 §2). Transfer asks for the
 * amount once; the server creates both legs. All copy is plain Indonesian and
 * errors render per field.
 */
export function ManualEntryForm({ onCreated, initialRow, onUpdated, onCancel, onSwitchToScan }: ManualEntryFormProps) {
  const initialRowId = initialRow?.id;
  const formRef = useRef<HTMLFormElement>(null);
  const initialDate = initialRow ? toJakartaDateOnly(new Date(initialRow.occurredAt)) : todayJakarta();
  const [type, setType] = useState<TransactionType>(initialRow?.type ?? "MONEY_OUT");
  const [amountDigits, setAmountDigits] = useState(initialRow ? String(initialRow.amountMinor) : "");
  const [category, setCategory] = useState<string | null>(initialRow?.category ?? null);
  const [dateChoice, setDateChoice] = useState<"today" | "yesterday" | "custom">(() =>
    initialDate === todayJakarta() ? "today" : initialDate === yesterdayJakarta() ? "yesterday" : "custom",
  );
  const [customDate, setCustomDate] = useState(initialDate);
  const [merchant, setMerchant] = useState(initialRow?.merchant ?? "");
  const [note, setNote] = useState(initialRow?.note ?? "");
  const [wallet, setWallet] = useState<WalletDTO | WalletRefDTO | null>(initialRow?.wallet ?? null);
  const [fromWallet, setFromWallet] = useState<WalletDTO | null>(null);
  const [toWallet, setToWallet] = useState<WalletDTO | null>(null);
  const [pickerTarget, setPickerTarget] = useState<"wallet" | "from" | "to" | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  /*
    C-32: creating a wallet from inside the picker closes the picker first, so
    the create sheet remembers which field the new wallet belongs to. Clearing
    it never reopens the picker.
  */
  const [createTarget, setCreateTarget] = useState<"wallet" | "from" | "to" | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (initialRowId) formRef.current?.querySelector<HTMLInputElement>("#amount")?.focus();
  }, [initialRowId]);

  const occurredAt = dateChoice === "today" ? todayJakarta() : dateChoice === "yesterday" ? yesterdayJakarta() : customDate;
  const amountMinor = amountDigits ? Number(amountDigits) : 0;
  const categories = categoriesForType(type);

  /** Writes a wallet into the field the picker (or create sheet) was opened for. */
  const bindWallet = (target: "wallet" | "from" | "to" | null, selected: WalletDTO) => {
    if (target === "from") setFromWallet(selected);
    else if (target === "to") setToWallet(selected);
    else setWallet(selected);
  };

  /** A bound wallet clears its own server-side validation message. */
  const clearWalletFieldErrors = () => {
    setFieldErrors((current) => {
      const next = { ...current };
      delete next.walletId;
      delete next.fromWalletId;
      delete next.toWalletId;
      return next;
    });
  };

  const changeType = (next: TransactionType) => {
    setType(next);
    if (next !== "TRANSFER" && category && !categoriesForType(next).includes(category)) {
      setCategory(null);
    }
    setFieldErrors({});
  };

  const validate = (): boolean => {
    const errors: Record<string, string[]> = {};
    if (!isValidMoneyAmount(amountMinor)) {
      errors.amountMinor = ["Jumlah harus lebih dari 0."];
    } else if (amountMinor > INT32_MAX) {
      errors.amountMinor = ["Jumlah terlalu besar."];
    }
    if (type !== "TRANSFER" && !category) {
      errors.category = ["Pilih kategori yang sesuai."];
    }
    if (type === "TRANSFER") {
      if (!fromWallet) errors.fromWalletId = ["Pilih dompet asal."];
      if (!toWallet) errors.toWalletId = ["Pilih dompet tujuan."];
      else if (fromWallet && fromWallet.id === toWallet.id) {
        errors.toWalletId = ["Dompet asal dan tujuan harus berbeda."];
      }
    } else if (!wallet) {
      errors.walletId = ["Pilih dompet."];
    }
    if (occurredAt > todayJakarta()) {
      errors.occurredAt = ["Tanggal tidak boleh di masa depan."];
    }
    if (merchant.length > 120) {
      errors.merchant = ["Nama toko maksimal 120 karakter."];
    }
    if (note.length > 500) {
      errors.note = ["Catatan maksimal 500 karakter."];
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        type,
        amountMinor,
        occurredAt,
        merchant: merchant.trim() || undefined,
        note: note.trim() || undefined,
        ...(type === "TRANSFER"
          ? { fromWalletId: fromWallet?.id, toWalletId: toWallet?.id }
          : { category, walletId: wallet?.id }),
      };
      const response = await apiRequest<{ transactions: TransactionDTO[] }>(
        initialRow ? `/api/transactions/${initialRow.id}` : "/api/transactions",
        {
          method: initialRow ? "PATCH" : "POST",
          headers: {
            "content-type": "application/json",
            ...(!initialRow ? idempotencyHeaders() : {}),
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.status === 401) {
        setFormError("Sesi berakhir. Masuk lagi untuk menyimpan.");
        return;
      }
      if (!response.ok) {
        setFieldErrors(response.data?.error?.fieldErrors ?? {});
        setFormError(response.data?.error?.message ?? "Transaksi belum tersimpan. Coba lagi.");
        return;
      }
      if (initialRow) {
        const updated = response.data?.transactions?.[0];
        if (!updated) {
          setFormError("Perubahan belum dapat ditampilkan. Muat ulang transaksi.");
          return;
        }
        onUpdated?.(updated);
      } else {
        onCreated?.(response.data?.transactions ?? []);
      }
    } catch {
      setFormError("Transaksi belum tersimpan. Periksa koneksimu lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wider text-ink-2">
          Jenis transaksi <span className="text-danger" aria-hidden="true">*</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(
            initialRow
              ? ([["MONEY_OUT", "Uang keluar (-)"], ["MONEY_IN", "Uang masuk (+)"]] as const)
              : ([
                  ["MONEY_OUT", "Uang keluar (-)"],
                  ["MONEY_IN", "Uang masuk (+)"],
                  ["TRANSFER", "Transfer"],
                ] as const)
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              onClick={() => changeType(value)}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors",
                type === value
                  ? "bg-brand-blue text-white"
                  : "border border-blue-border bg-card text-blue hover:bg-blue-wash",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <Field
        id="amount"
        label="Jumlah"
        required
        error={fieldErrors.amountMinor?.[0]}
        helperText={type === "TRANSFER" ? "Masukkan sekali saja, kedua sisi dibuat otomatis." : undefined}
      >
        <div className="flex items-center gap-2 rounded-2xl border border-input-border bg-card px-4 py-3 focus-within:border-blue focus-within:ring-4 focus-within:ring-blue/15">
          <span className="text-lg font-semibold text-ink-2">Rp</span>
          <MoneyInput
            id="amount"
            value={amountDigits}
            onValueChange={setAmountDigits}
            placeholder="0"
            aria-invalid={fieldErrors.amountMinor ? true : undefined}
            className="w-full min-w-0 bg-transparent text-2xl font-bold tabular-nums text-ink outline-none placeholder:text-placeholder/60"
          />
        </div>
        {amountDigits ? (
          <p className="text-xs text-ink-3">Terbaca: {formatIDR(amountMinor)}</p>
        ) : null}
      </Field>

      {type === "TRANSFER" ? (
        <>
          <WalletField
            label="Dari dompet"
            wallet={fromWallet}
            error={fieldErrors.fromWalletId?.[0]}
            onPick={() => setPickerTarget("from")}
          />
          <WalletField
            label="Ke dompet"
            wallet={toWallet}
            error={fieldErrors.toWalletId?.[0]}
            onPick={() => setPickerTarget("to")}
          />
        </>
      ) : (
        <WalletField
          label={type === "MONEY_IN" ? "Ke dompet" : "Dari dompet"}
          wallet={wallet}
          error={fieldErrors.walletId?.[0]}
          onPick={() => setPickerTarget("wallet")}
        />
      )}

      {type !== "TRANSFER" ? (
        <fieldset>
          <legend className="text-xs font-medium uppercase tracking-wider text-ink-2">
            Kategori <span className="text-danger" aria-hidden="true">*</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((value) => {
              const selected = category === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  aria-label={CATEGORY_LABELS[value]}
                  onClick={() => setCategory(value)}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-all",
                    selected
                      ? "border-blue bg-blue-tint text-blue"
                      : "border-blue-border bg-card text-ink-2 hover:bg-blue-wash",
                  )}
                >
                  <span aria-hidden="true">{CATEGORY_EMOJI[value]}</span>
                  {CATEGORY_LABELS[value]}
                </button>
              );
            })}
          </div>
          {fieldErrors.category?.[0] ? (
            <p role="alert" className="mt-1.5 text-xs text-danger">
              {fieldErrors.category[0]}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <fieldset>
        <legend className="text-xs font-medium uppercase tracking-wider text-ink-2">
          Tanggal <span className="text-danger" aria-hidden="true">*</span>
        </legend>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(
            [
              ["today", "Hari ini"],
              ["yesterday", "Kemarin"],
              ["custom", "Pilih tanggal"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={dateChoice === value}
              onClick={() => setDateChoice(value)}
              className={cn(
                "min-h-11 rounded-full px-4 text-sm font-semibold transition-colors",
                dateChoice === value
                  ? "bg-brand-blue text-white"
                  : "border border-blue-border bg-card text-blue hover:bg-blue-wash",
              )}
            >
              {label}
            </button>
          ))}
          {dateChoice === "custom" ? (
            <input
              type="date"
              aria-label="Tanggal transaksi"
              value={customDate}
              max={todayJakarta()}
              onChange={(event) => setCustomDate(event.target.value)}
              className="min-h-11 rounded-2xl border border-input-border bg-card px-3 text-sm text-ink accent-blue focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
            />
          ) : null}
        </div>
        {fieldErrors.occurredAt?.[0] ? (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {fieldErrors.occurredAt[0]}
          </p>
        ) : null}
      </fieldset>

      <Input
        id="merchant"
        label="Nama toko (opsional)"
        value={merchant}
        maxLength={120}
        error={fieldErrors.merchant?.[0]}
        placeholder="mis. Pasar Segar"
        onChange={(event) => setMerchant(event.target.value)}
      />

      <TextArea
        id="note"
        label="Catatan (opsional)"
        value={note}
        maxLength={500}
        error={fieldErrors.note?.[0]}
        placeholder='mis. "Belanja mingguan di pasar"'
        onChange={(event) => setNote(event.target.value)}
      />

      {formError ? (
        <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button type="submit" size="lg" isLoading={submitting} loadingLabel={initialRow ? "Menyimpan perubahan" : "Menyimpan"} className="sm:flex-1">
          {initialRow ? "Simpan perubahan" : "Simpan transaksi"}
        </Button>
        <Button type="button" variant="secondary" size="lg" onClick={onCancel} disabled={submitting}>
          Batal
        </Button>
      </div>

      {!initialRow ? (
        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-3">
          <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
          Ada struk?{" "}
          <button type="button" onClick={() => onSwitchToScan?.()} className="font-semibold text-blue underline">
            Scan struk
          </button>
        </p>
      ) : null}
      </form>

      <WalletPickerSheet
        key={pickerKey}
        open={pickerTarget !== null}
        selectedWalletId={
          pickerTarget === "from"
            ? (fromWallet?.id ?? null)
            : pickerTarget === "to"
              ? (toWallet?.id ?? null)
              : (wallet?.id ?? null)
        }
        onClose={() => setPickerTarget(null)}
        onSelect={(selected) => {
          bindWallet(pickerTarget, selected);
          clearWalletFieldErrors();
        }}
        onCreate={() => {
          /*
            C-32: the picker closes first, then the create sheet opens on top of
            it. `pickerKey` remounts the picker so its list is refetched (and the
            new wallet appears) the next time it opens.
          */
          setCreateTarget(pickerTarget);
          setPickerTarget(null);
          setPickerKey((key) => key + 1);
          setFormOpen(true);
        }}
      />

      <WalletFormSheet
        key={formOpen ? "open" : "closed"}
        open={formOpen}
        mode="create"
        onClose={() => {
          /* Cancelling leaves the field value exactly as it was. */
          setFormOpen(false);
          setCreateTarget(null);
        }}
        onSaved={(created) => {
          /* C-32: auto-select into the field the picker was opened for. */
          bindWallet(createTarget, created);
          clearWalletFieldErrors();
          setFormOpen(false);
          setCreateTarget(null);
        }}
      />
    </>
  );
}

function WalletField({
  label,
  wallet,
  error,
  onPick,
}: {
  label: string;
  wallet: Pick<WalletDTO, "id" | "name" | "scope"> | null;
  error?: string;
  onPick: () => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-ink-2">
        {label} <span className="text-danger" aria-hidden="true">*</span>
      </p>
      <button
        type="button"
        onClick={onPick}
        aria-haspopup="dialog"
        className={cn(
          "mt-1.5 flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border bg-card px-4 text-left",
          error ? "border-danger" : "border-input-border",
        )}
      >
        {wallet ? (
          <span className="flex min-w-0 items-center gap-2">
            <ScopePill scope={wallet.scope} />
            <span className="truncate text-[15px] font-semibold text-ink">{wallet.name}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-ink-2">
            <WalletIcon className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm">Pilih dompet</span>
          </span>
        )}
        <span aria-hidden="true" className="text-ink-3">
          &gt;
        </span>
      </button>
      {error ? (
        <p role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
