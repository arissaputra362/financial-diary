"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PiggyBank, RefreshCw, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { apiRequest } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { AdvisorPanel } from "@/components/goals/AdvisorPanel";
import { GoalsSection } from "@/components/goals/GoalsSection";
import { formatIDR } from "@/lib/format";
import { isValidMoneyAmount } from "@/lib/money-input";
import type { MonthlyBudgetDTO } from "@/types/api";

export type Me = {
  role: string;
  status: string;
  household: { id: string; name: string } | null;
};

type BudgetScope = MonthlyBudgetDTO["scope"];
type BudgetMap = Record<BudgetScope, MonthlyBudgetDTO | null>;
type AmountMap = Record<BudgetScope, string>;

const SCOPE_OPTIONS: ReadonlyArray<{ value: BudgetScope; label: string }> = [
  { value: "PERSONAL", label: "Pribadi" },
  { value: "SHARED", label: "Bersama" },
];

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
  const [loading, setLoading] = useState(!initialData);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

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
    setSaving(true);
    try {
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
        scope === "PERSONAL" ? "Budget pribadi tersimpan." : "Budget bulan ini tersimpan.",
      );
    } catch {
      setFieldError("Budget belum bisa disimpan. Coba lagi.");
    } finally {
      setSaving(false);
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
            />
          ) : null}
          {/* <AdvisorPanel /> */}
          <GoalsSection />
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
          Budget bulan ini
        </h2>

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
              {isPersonal ? "sisa dari budget pribadimu" : "sisa dari budget bulan ini"}
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
              {isPersonal ? "Belum ada budget pribadi bulan ini" : "Belum ada budget bulan ini"}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {isPersonal
                ? "Isi budget di samping supaya pengeluaran pribadimu lebih terkendali."
                : canEdit
                  ? "Isi budget di samping supaya pengeluaran keluarga lebih terkendali."
                  : "Pemilik keluarga belum mengatur budget bulan ini."}
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
          <p
            role="status"
            aria-live="polite"
            className="mt-4 rounded-2xl bg-mint px-4 py-3 text-sm font-medium text-green"
          >
            {notice}
          </p>
        ) : null}

        {canEdit ? (
          <form className="mt-4 space-y-3" onSubmit={onSubmit} noValidate>
            <label htmlFor="budget-amount" className="block text-sm font-semibold text-ink">
              {isPersonal ? "Budget pribadi bulan ini (rupiah)" : "Budget bulan ini (rupiah)"}
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
              Simpan budget
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-ink-2">
            Hanya pemilik keluarga yang dapat mengubah budget. Kamu tetap bisa melihat sisa budget di halaman ini.
          </p>
        )}
      </section>
    </div>
  );
}
