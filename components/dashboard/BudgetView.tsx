"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, PiggyBank, RefreshCw, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { GoalsSection } from "@/components/goals/GoalsSection";
import { formatDateLabel, formatDateRangeLabel } from "@/lib/dates";
import { formatIDR } from "@/lib/format";
import { isValidMoneyAmount } from "@/lib/money-input";
import type { BudgetCycleDTO, BudgetCycleModeDTO, MonthlyBudgetDTO } from "@/types/api";

export type Me = {
  role: string;
  status: string;
  household: { id: string; name: string } | null;
};

type BudgetScope = MonthlyBudgetDTO["scope"];
type BudgetMap = Record<BudgetScope, MonthlyBudgetDTO | null>;
type AmountMap = Record<BudgetScope, string>;
type CycleInput = { mode: BudgetCycleModeDTO; day: string };
type CycleMap = Record<BudgetScope, CycleInput>;

const SCOPE_OPTIONS: ReadonlyArray<{ value: BudgetScope; label: string }> = [
  { value: "PERSONAL", label: "Pribadi" },
  { value: "SHARED", label: "Bersama" },
];

const CYCLE_OPTIONS: ReadonlyArray<{ value: BudgetCycleModeDTO; label: string }> = [
  { value: "CALENDAR_MONTH", label: "Awal bulan" },
  { value: "FIXED_DAY", label: "Tanggal tertentu" },
  { value: "END_OF_MONTH", label: "Akhir bulan" },
];

function cycleLabel(cycle: BudgetCycleDTO): string {
  if (cycle.mode === "FIXED_DAY") return `Tanggal ${cycle.day ?? 1} setiap bulan`;
  if (cycle.mode === "END_OF_MONTH") return "Akhir bulan";
  return "Awal bulan";
}

function toCycleInput(cycle: BudgetCycleDTO): { mode: BudgetCycleModeDTO; day: string } {
  return {
    mode: cycle.mode,
    day: cycle.mode === "FIXED_DAY" && cycle.day ? String(cycle.day) : "10",
  };
}

function BudgetCycleFields({
  value,
  onChange,
  idPrefix,
}: {
  value: CycleInput;
  onChange: (value: CycleInput) => void;
  idPrefix: string;
}) {
  const dayValid = value.mode !== "FIXED_DAY" ||
    (Number.isInteger(Number(value.day)) && Number(value.day) >= 1 && Number(value.day) <= 28);
  return (
    <div className="space-y-3">
      <SegmentedControl
        label="Siklus budget"
        value={value.mode}
        options={CYCLE_OPTIONS}
        onChange={(mode) => onChange({ ...value, mode })}
      />
      {value.mode === "FIXED_DAY" ? (
        <div className="max-w-xs space-y-2">
          <label htmlFor={`${idPrefix}-budget-cycle-day`} className="block text-sm font-semibold text-ink">
            Tanggal mulai (1 sampai 28)
          </label>
          <input
            id={`${idPrefix}-budget-cycle-day`}
            name={`${idPrefix}-budget-cycle-day`}
            type="number"
            inputMode="numeric"
            min={1}
            max={28}
            step={1}
            value={value.day}
            onChange={(event) => onChange({ ...value, day: event.target.value })}
            aria-invalid={!dayValid ? true : undefined}
            aria-describedby={!dayValid ? `${idPrefix}-budget-cycle-day-error` : `${idPrefix}-budget-cycle-day-helper`}
            className="w-full rounded-2xl border border-input-border bg-card px-4 py-3 text-[15px] tabular-nums text-ink focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
          />
          {!dayValid ? (
            <p id={`${idPrefix}-budget-cycle-day-error`} role="alert" className="text-xs text-danger">
              Tanggal harus antara 1 dan 28.
            </p>
          ) : (
            <p id={`${idPrefix}-budget-cycle-day-helper`} className="text-xs text-placeholder">
              Contoh tanggal 10: 10 Oktober sampai 9 November.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Budget page (AC-F2-2, AC-F2-2c, AC-F2-3). The mode pill selects one
 * independent cap: `Bersama` keeps the household budget and its OWNER-only edit
 * rule; `Pribadi` is the viewer's own cap and every approved member can edit it.
 * Both scopes are fetched in parallel and kept apart. The server is the source
 * of truth: a save replaces only the saved scope from the returned DTO.
 */
export function BudgetView({
  initialScope = "SHARED",
  initialData,
}: {
  initialScope?: BudgetScope;
  initialData?: { me: Me; budgets: BudgetMap };
}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(initialData?.me ?? null);
  const [scope, setScope] = useState<BudgetScope>(initialScope);
  const [budgets, setBudgets] = useState<BudgetMap>(
    initialData?.budgets ?? { SHARED: null, PERSONAL: null },
  );
  const [amountInputs, setAmountInputs] = useState<AmountMap>({ SHARED: "", PERSONAL: "" });
  const [cycleInputs, setCycleInputs] = useState<CycleMap>(() => ({
    SHARED: toCycleInput(initialData?.budgets.SHARED?.cycle ?? { mode: "CALENDAR_MONTH", day: null }),
    PERSONAL: toCycleInput(initialData?.budgets.PERSONAL?.cycle ?? { mode: "CALENDAR_MONTH", day: null }),
  }));
  const [loading, setLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoScope, setUndoScope] = useState<BudgetScope | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!undoAvailable) return;
    const timer = window.setTimeout(() => {
      setUndoAvailable(false);
      setUndoScope(null);
      setNotice(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [undoAvailable, notice]);

  useEffect(() => {
    if (initialData && reloadToken === 0) return;
    let active = true;
    async function load() {
      try {
        const [meResponse, sharedResponse, personalResponse] = await Promise.all([
          apiRequest<Me>("/api/auth/me"),
          apiRequest<MonthlyBudgetDTO>("/api/budget?scope=shared"),
          apiRequest<MonthlyBudgetDTO>("/api/budget?scope=personal"),
        ]);
        if (!active) return;
        if (meResponse.status === 401 || sharedResponse.status === 401 || personalResponse.status === 401) {
          router.push("/login");
          return;
        }
        if (
          !meResponse.ok ||
          !meResponse.data ||
          !sharedResponse.ok ||
          !sharedResponse.data ||
          !personalResponse.ok ||
          !personalResponse.data
        ) {
          setLoadError(true);
          return;
        }
        setMe(meResponse.data);
        setBudgets({ SHARED: sharedResponse.data, PERSONAL: personalResponse.data });
        setCycleInputs({
          SHARED: toCycleInput(sharedResponse.data.cycle),
          PERSONAL: toCycleInput(personalResponse.data.cycle),
        });
        setAmountInputs({
          SHARED: sharedResponse.data.budgetMinor
            ? String(sharedResponse.data.budgetMinor)
            : "",
          PERSONAL: personalResponse.data.budgetMinor
            ? String(personalResponse.data.budgetMinor)
            : "",
        });
        if (meResponse.data.status !== "APPROVED") {
          router.push("/waiting-for-approval");
          return;
        }
        setLoadError(false);
      } catch {
        if (active) setLoadError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [initialData, reloadToken, router]);

  const isOwner = me?.role === "OWNER";
  const activeBudget = budgets[scope];
  const amountInput = amountInputs[scope];
  const cycleInput = cycleInputs[scope];
  const canEdit = scope === "PERSONAL" || isOwner;
  const parsedAmount = amountInput ? Number(amountInput) : 0;
  const amountValid = isValidMoneyAmount(parsedAmount);

  const retry = () => {
    setLoading(true);
    setLoadError(false);
    setReloadToken((token) => token + 1);
  };

  const changeScope = (next: BudgetScope) => {
    if (next === scope) return;
    setFieldError(null);
    setNotice(null);
    setScope(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFieldError(null);
    setNotice(null);
    if (!amountValid) {
      setFieldError("Budget harus lebih dari 0.");
      return;
    }
    if (!activeBudget) return;
    const cycleDay = Number(cycleInput.day);
    if (!activeBudget.isSet && cycleInput.mode === "FIXED_DAY" &&
      (!Number.isInteger(cycleDay) || cycleDay < 1 || cycleDay > 28)) {
      setFieldError("Tanggal siklus harus antara 1 dan 28.");
      return;
    }
    setSaving(true);
    try {
      if (!activeBudget.isSet) {
        const cycleResponse = await apiRequest<MonthlyBudgetDTO>("/api/budget/cycle", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            scope: scope === "PERSONAL" ? "personal" : "shared",
            mode: cycleInput.mode,
            day: cycleInput.mode === "FIXED_DAY" ? cycleDay : null,
          }),
        });
        if (cycleResponse.status === 401) {
          router.push("/login");
          return;
        }
        if (!cycleResponse.ok || !cycleResponse.data) {
          setFieldError(
            cycleResponse.data?.error?.fieldErrors?.day?.[0] ??
              cycleResponse.data?.error?.fieldErrors?.mode?.[0] ??
              "Siklus belum bisa disimpan. Coba lagi.",
          );
          return;
        }
        setBudgets((current) => ({ ...current, [scope]: cycleResponse.data }));
      }
      const response = await apiRequest<MonthlyBudgetDTO>("/api/budget", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountMinor: parsedAmount,
          scope: scope === "PERSONAL" ? "personal" : "shared",
        }),
      });
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (response.status === 403) {
        setFieldError(
          scope === "PERSONAL"
            ? "Budget pribadi belum bisa disimpan. Coba lagi."
            : "Hanya pemilik keluarga yang dapat mengatur budget.",
        );
        return;
      }
      if (!response.ok || !response.data) {
        setFieldError(
          response.data?.error?.fieldErrors?.amountMinor?.[0] ?? "Budget belum bisa disimpan. Coba lagi.",
        );
        return;
      }
      const saved = response.data;
      setBudgets((current) => ({ ...current, [scope]: saved }));
      setAmountInputs((current) => ({
        ...current,
        [scope]: saved.budgetMinor ? String(saved.budgetMinor) : "",
      }));
      setNotice(
        scope === "PERSONAL" ? "Budget pribadi tersimpan." : "Budget bersama tersimpan.",
      );
    } catch {
      setFieldError("Budget belum bisa disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await apiRequest<MonthlyBudgetDTO>(
        `/api/budget?scope=${scope === "PERSONAL" ? "personal" : "shared"}`,
        { method: "DELETE" },
      );
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !response.data) {
        setDeleteError(response.data?.error?.message ?? "Budget belum bisa dihapus. Coba lagi.");
        return;
      }
      setBudgets((current) => ({ ...current, [scope]: response.data }));
      setAmountInputs((current) => ({ ...current, [scope]: "" }));
      setDeleteOpen(false);
      setNotice("Budget periode ini dihapus. Transaksimu tetap tersimpan.");
      setUndoAvailable(true);
      setUndoScope(scope);
    } catch {
      setDeleteError("Budget belum bisa dihapus. Periksa koneksi lalu coba lagi.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleUndoDelete = async () => {
    const targetScope = undoScope ?? scope;
    try {
      const response = await apiRequest<MonthlyBudgetDTO>(
        `/api/budget/restore?scope=${targetScope === "PERSONAL" ? "personal" : "shared"}`,
        { method: "POST" },
      );
      if (response.status === 401) {
        router.push("/login");
        return;
      }
      if (!response.ok || !response.data) {
        setFieldError("Budget belum bisa dipulihkan. Coba muat ulang halaman.");
        setUndoAvailable(false);
        return;
      }
      const restored = response.data;
      setBudgets((current) => ({ ...current, [targetScope]: restored }));
      setAmountInputs((current) => ({
        ...current,
        [targetScope]: restored.budgetMinor ? String(restored.budgetMinor) : "",
      }));
      setNotice("Budget dipulihkan.");
      setUndoAvailable(false);
      setUndoScope(null);
    } catch {
      setFieldError("Budget belum bisa dipulihkan. Coba muat ulang halaman.");
      setUndoAvailable(false);
      setUndoScope(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={me?.household?.name ?? "Keluarga"}
        title="Budget"
        icon={PiggyBank}
        description="Budget keluarga dan budget pribadimu dihitung terpisah."
      />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : loadError ? (
        <div className="rounded-3xl border border-danger-border bg-danger-bg p-6 text-center">
          <p className="text-[15px] font-semibold text-danger">Budget belum bisa dimuat.</p>
          <p className="mt-1 text-sm text-ink-2">Periksa koneksimu lalu coba lagi.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-hover"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Coba lagi
          </button>
        </div>
      ) : (
        <>
          <SegmentedControl
            label="Mode budget"
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={changeScope}
          />

          {activeBudget ? (
            <BudgetContent
              budget={activeBudget}
              scope={scope}
              canEdit={canEdit}
              amountInput={amountInput}
              onAmountChange={(value) =>
                setAmountInputs((current) => ({ ...current, [scope]: value }))
              }
              onSubmit={handleSubmit}
              saving={saving}
              fieldError={fieldError}
              notice={notice}
              amountValid={amountValid}
              previewAmount={parsedAmount}
              cycleInput={cycleInput}
              onCycleChange={(value) => setCycleInputs((current) => ({ ...current, [scope]: value }))}
              onCycleSaved={(saved) =>
                setBudgets((current) => ({ ...current, [scope]: saved }))
              }
              onDelete={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              undoAvailable={undoAvailable}
              onUndo={() => void handleUndoDelete()}
            />
          ) : null}
          <GoalsSection />
          <ConfirmActionDialog
            open={deleteOpen}
            title="Hapus budget periode ini?"
            description={`Budget ${scope === "PERSONAL" ? "Pribadi" : "Bersama"} untuk ${formatDateRangeLabel(activeBudget?.periodStart ?? "", activeBudget?.periodEnd ?? "")} akan dihapus. Transaksi tetap tersimpan dan tidak berubah.`}
            confirmLabel="Hapus budget"
            error={deleteError}
            busy={deleteBusy}
            onCancel={() => setDeleteOpen(false)}
            onConfirm={() => void handleDelete()}
          />
        </>
      )}
    </div>
  );
}

interface BudgetContentProps {
  budget: MonthlyBudgetDTO;
  scope: BudgetScope;
  canEdit: boolean;
  amountInput: string;
  onAmountChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  saving: boolean;
  fieldError: string | null;
  notice: string | null;
  amountValid: boolean;
  previewAmount: number;
  cycleInput: CycleInput;
  onCycleChange: (value: CycleInput) => void;
  onCycleSaved: (budget: MonthlyBudgetDTO) => void;
  onDelete: () => void;
  undoAvailable: boolean;
  onUndo: () => void;
}

function BudgetContent({
  budget,
  scope,
  canEdit,
  amountInput,
  onAmountChange,
  onSubmit,
  saving,
  fieldError,
  notice,
  amountValid,
  previewAmount,
  cycleInput,
  onCycleChange,
  onCycleSaved,
  onDelete,
  undoAvailable,
  onUndo,
}: BudgetContentProps) {
  const isPersonal = scope === "PERSONAL";
  const spentPercent =
    budget.isSet && budget.budgetMinor && budget.budgetMinor > 0
      ? Math.min(100, Math.round((budget.spentMinor / budget.budgetMinor) * 100))
      : 0;
  const longRemaining = formatIDR(budget.remainingMinor ?? 0).length > 16;
  const amountLength = Math.max(
    formatIDR(budget.budgetMinor ?? 0).length,
    formatIDR(budget.spentMinor).length,
  );
  const veryLongAmounts = amountLength > 16;
  const longAmounts = amountLength > 13;

  return (
    <>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section
          id="budget-summary"
          aria-labelledby="budget-summary-title"
          className="rounded-3xl border border-card-border bg-card p-6 shadow-bento lg:col-span-7"
        >
          <h2
            id="budget-summary-title"
            className="flex items-center gap-2 text-lg font-semibold text-ink"
          >
            <Wallet className="h-5 w-5 text-blue" aria-hidden="true" />
            Budget periode ini
          </h2>
          <p className="mt-1 text-sm font-medium text-ink-2">
            {formatDateRangeLabel(budget.periodStart, budget.periodEnd)}
          </p>
          <p className="mt-1 text-xs text-ink-3">Siklus: {cycleLabel(budget.cycle)}</p>

          {budget.isSet ? (
            <>
              <p
                className={
                  longRemaining
                    ? "mt-4 whitespace-nowrap text-[clamp(1.1rem,4.5vw,1.875rem)] font-bold tracking-tight tabular-nums text-ink"
                    : "mt-4 whitespace-nowrap text-[clamp(1.6rem,6vw,1.875rem)] font-bold tracking-tight tabular-nums text-ink"
                }
              >
                {formatIDR(budget.remainingMinor ?? 0)}
              </p>
              <p className="mt-1 text-sm text-ink-2">
                {isPersonal ? "sisa dari budget pribadimu" : "sisa dari budget bersama"}
              </p>
              <div
                className="mt-5 h-3 overflow-hidden rounded-full bg-bar-track"
                role="img"
                aria-label={`${spentPercent} persen budget terpakai`}
              >
                <div
                  className="h-full rounded-full bg-blue"
                  style={{ width: `${spentPercent}%` }}
                />
              </div>
              <div
                className={
                  veryLongAmounts
                    ? "mt-3 grid grid-cols-1 gap-3 text-sm"
                    : longAmounts
                      ? "mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"
                      : "mt-3 grid grid-cols-2 gap-3 text-sm"
                }
              >
                <div className="min-w-0 rounded-2xl bg-blue-wash p-3">
                  <p className="text-xs font-semibold text-ink-2">Budget</p>
                  <p className="mt-1 whitespace-nowrap font-bold tabular-nums text-ink">
                    {formatIDR(budget.budgetMinor ?? 0)}
                  </p>
                </div>
                <div className="min-w-0 rounded-2xl bg-blue-wash p-3">
                  <p className="text-xs font-semibold text-ink-2">Terpakai</p>
                  <p className="mt-1 whitespace-nowrap font-bold tabular-nums text-ink">
                    {formatIDR(budget.spentMinor)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-ink-3">
                {isPersonal
                  ? "Dihitung dari dompet pribadimu."
                  : "Dihitung dari dompet keluarga saja."}
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-lg font-bold text-ink">
                {isPersonal
                  ? "Belum ada budget pribadi untuk periode ini"
                  : "Belum ada budget untuk periode ini"}
              </p>
              <p className="mt-1 text-sm text-ink-2">
                {isPersonal
                  ? "Isi budget di samping supaya pengeluaran pribadimu lebih terkendali."
                  : canEdit
                    ? "Isi budget di samping supaya pengeluaran keluarga lebih terkendali."
                    : "Pemilik keluarga belum mengatur budget untuk periode ini."}
              </p>
              <p className="mt-3 text-xs text-ink-3">
                {isPersonal
                  ? "Dihitung dari dompet pribadimu."
                  : "Dihitung dari dompet keluarga saja."}
              </p>
            </>
          )}
        </section>

        <section
          aria-labelledby="budget-form-title"
          className="rounded-3xl border border-card-border bg-card p-6 shadow-bento lg:col-span-5"
        >
          <h2 id="budget-form-title" className="text-lg font-semibold text-ink">
            {isPersonal
              ? budget.isSet
                ? "Ubah budget pribadi"
                : "Atur budget pribadi"
              : canEdit
                ? budget.isSet
                  ? "Ubah budget"
                  : "Atur budget"
                : "Budget keluarga"}
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {isPersonal
              ? "Hanya kamu yang bisa melihat dan mengubah budget pribadi ini."
              : "Berlaku untuk dompet keluarga bersama."}
          </p>

          {notice ? (
            <div role="status" aria-live="polite" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-mint px-4 py-3 text-sm font-medium text-green">
              <span>{notice}</span>
              {undoAvailable ? (
                <button type="button" onClick={onUndo} className="min-h-11 rounded-full px-4 font-bold text-green underline underline-offset-2">
                  Batalkan
                </button>
              ) : null}
            </div>
          ) : null}

          {canEdit ? (
            <form className="mt-4 space-y-3" onSubmit={onSubmit} noValidate>
              {!budget.isSet ? (
                <div className="space-y-3 rounded-2xl bg-blue-wash p-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">Pilih siklus budget</p>
                    <p className="mt-1 text-xs text-ink-3">Siklus ini langsung dipakai untuk budget pertamamu.</p>
                  </div>
                  <BudgetCycleFields value={cycleInput} onChange={onCycleChange} idPrefix="setup" />
                </div>
              ) : null}
              <label htmlFor="budget-amount" className="block text-sm font-semibold text-ink">
                {isPersonal
                  ? "Budget pribadi periode ini (rupiah)"
                  : "Budget bersama periode ini (rupiah)"}
              </label>
              <MoneyInput
                id="budget-amount"
                name="budget-amount"
                value={amountInput}
                onValueChange={onAmountChange}
                aria-invalid={fieldError ? true : undefined}
                aria-describedby={fieldError ? "budget-amount-error" : "budget-amount-helper"}
                placeholder="Contoh: 3000000"
                className="w-full rounded-2xl border border-input-border bg-card px-4 py-3 text-[15px] tabular-nums text-ink placeholder:text-placeholder focus:border-blue focus:outline-none focus:ring-4 focus:ring-blue/15"
              />
              {fieldError ? (
                <p id="budget-amount-error" role="alert" className="text-xs text-danger">
                  {fieldError}
                </p>
              ) : (
                <p id="budget-amount-helper" className="text-xs text-placeholder">
                  Angka saja. Titik ribuan muncul otomatis.
                </p>
              )}
              {amountValid ? (
                <p className="text-sm font-semibold text-ink">
                  Akan disimpan: <span className="tabular-nums">{formatIDR(previewAmount)}</span>
                </p>
              ) : null}
              <Button type="submit" isLoading={saving} disabled={!amountValid || saving} className="w-full">
                {budget.isSet ? "Simpan perubahan budget" : "Simpan budget"}
              </Button>
              {budget.isSet ? (
                <Button type="button" variant="danger" onClick={onDelete} className="w-full">
                  Hapus budget periode ini
                </Button>
              ) : null}
            </form>
          ) : (
            <p className="mt-4 text-sm text-ink-2">
              Hanya pemilik keluarga yang dapat mengubah budget. Kamu tetap bisa melihat sisa budget di halaman ini.
            </p>
          )}
        </section>
      </div>

      {budget.isSet ? <BudgetCycleCard
        key={`${scope}-cycle`}
        budget={budget}
        scope={scope}
        canEdit={canEdit}
        onSaved={onCycleSaved}
      /> : null}
    </>
  );
}

function BudgetCycleCard({
  budget,
  scope,
  canEdit,
  onSaved,
}: {
  budget: MonthlyBudgetDTO;
  scope: BudgetScope;
  canEdit: boolean;
  onSaved: (budget: MonthlyBudgetDTO) => void;
}) {
  const initial = toCycleInput(budget.cycle);
  const [mode, setMode] = useState<BudgetCycleModeDTO>(initial.mode);
  const [day, setDay] = useState(initial.day);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isPersonal = scope === "PERSONAL";
  const parsedDay = Number(day);
  const dayValid =
    mode !== "FIXED_DAY" || (Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 28);

  const changeMode = (next: BudgetCycleModeDTO) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!dayValid) {
      setError("Tanggal harus antara 1 dan 28.");
      return;
    }
    setSaving(true);
    try {
      const response = await apiRequest<MonthlyBudgetDTO>("/api/budget/cycle", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scope: isPersonal ? "personal" : "shared",
          mode,
          day: mode === "FIXED_DAY" ? parsedDay : null,
        }),
      });
      if (response.status === 403) {
        setError(
          isPersonal
            ? "Siklus budget pribadi belum bisa disimpan. Coba lagi."
            : "Hanya pemilik keluarga yang dapat mengubah siklus budget bersama.",
        );
        return;
      }
      if (!response.ok || !response.data) {
        setError(
          response.data?.error?.fieldErrors?.day?.[0] ??
            response.data?.error?.fieldErrors?.mode?.[0] ??
            "Siklus budget belum bisa disimpan. Coba lagi.",
        );
        return;
      }
      const saved = response.data;
      const sameAsActive =
        budget.cycle.mode === mode &&
        (mode !== "FIXED_DAY" || budget.cycle.day === parsedDay);
      onSaved(saved);
      setNotice(
        saved.nextCycle
          ? `Siklus budget disimpan. Berlaku mulai ${formatDateLabel(saved.nextCycle.effectiveFrom)}.`
          : sameAsActive
            ? "Siklus budget disimpan."
            : "Siklus budget disimpan dan langsung berlaku untuk periode ini.",
      );
    } catch {
      setError("Siklus budget belum bisa disimpan. Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="budget-cycle-title"
      className="rounded-3xl border border-card-border bg-card p-6 shadow-bento"
    >
      <h2
        id="budget-cycle-title"
        className="flex items-center gap-2 text-lg font-semibold text-ink"
      >
        <CalendarClock className="h-5 w-5 text-blue" aria-hidden="true" />
        {isPersonal ? "Siklus budget pribadi" : "Siklus budget bersama"}
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {isPersonal
          ? "Atur sendiri periode budget pribadimu."
          : "Siklus ini dipakai untuk budget bersama."}
      </p>
      <p className="mt-3 text-sm font-semibold text-ink">
        Periode berjalan: {formatDateRangeLabel(budget.periodStart, budget.periodEnd)}
      </p>
      <p className="mt-1 text-xs text-ink-3">Siklus saat ini: {cycleLabel(budget.cycle)}</p>
      {budget.nextCycle && !notice ? (
        <p className="mt-2 rounded-2xl bg-warning-bg px-4 py-3 text-sm text-warning">
          Perubahan siklus akan berlaku mulai {formatDateLabel(budget.nextCycle.effectiveFrom)}.
        </p>
      ) : null}

      {canEdit ? (
        <form className="mt-5 space-y-4" onSubmit={handleSubmit} noValidate>
          <BudgetCycleFields
            value={{ mode, day }}
            idPrefix="edit"
            onChange={(value) => {
              changeMode(value.mode);
              setDay(value.day);
            }}
          />

          <p className="text-xs text-placeholder">
            {budget.isSet
              ? "Perubahan berlaku mulai periode berikutnya, supaya angka periode yang sudah berjalan tidak berubah."
              : "Periode ini belum punya budget, jadi siklus baru langsung dipakai saat disimpan."}
          </p>
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p role="status" aria-live="polite" className="rounded-2xl bg-mint px-4 py-3 text-sm font-medium text-green">
              {notice}
            </p>
          ) : null}
          <Button type="submit" isLoading={saving} disabled={!dayValid || saving}>
            Simpan siklus
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink-2">
          Hanya pemilik keluarga yang dapat mengubah siklus budget bersama. Kamu tetap bisa melihat periode dan sisa budget.
        </p>
      )}
    </section>
  );
}
