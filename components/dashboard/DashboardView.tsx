"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/Skeleton";
import { todayJakarta } from "@/lib/dates";
import type { DashboardDTO, DashboardPeriodKey, WalletCardDTO, WalletDTO } from "@/types/api";
import { WalletDetailSheet } from "@/components/wallets/WalletDetailSheet";
import { WalletFormSheet } from "@/components/wallets/WalletFormSheet";
import { WalletManageSheet } from "@/components/wallets/WalletManageSheet";
import { WalletSummaryPair } from "@/components/wallets/WalletSummaryPair";
import { BudgetCard } from "./BudgetCard";
import { ExpenseHeroCard } from "./ExpenseHeroCard";
import { GoalsSummaryCard } from "./GoalsSummaryCard";
import { RecentActivityCard } from "./RecentActivityCard";
import { SpendingChart } from "./SpendingChart";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

interface FormState {
  open: boolean;
  mode: "create" | "edit";
  wallet: WalletDTO | null;
}

/**
 * Dashboard orchestrator (AC-F2-*; T-009 AC-F6-7; T-010 R-9 order). One
 * `GET /api/dashboard` call is the single source of truth. Wallet
 * creation/editing/archiving happens in sheets here; every figure is rendered
 * exactly as the server computed it.
 */
export function DashboardView({ initialData }: { initialData?: DashboardDTO }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardDTO | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<DashboardPeriodKey>("7D");
  const hasFetchedNonInitialPeriod = useRef(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<"active" | "archived">("active");
  const [form, setForm] = useState<FormState>({ open: false, mode: "create", wallet: null });
  const [detail, setDetail] = useState<WalletDTO | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialData && period === "7D" && reloadToken === 0 && !hasFetchedNonInitialPeriod.current) {
      return;
    }
    if (period !== "7D") hasFetchedNonInitialPeriod.current = true;
    let active = true;
    apiRequest<DashboardDTO>(`/api/dashboard?period=${period}`)
      .then((response) => {
        if (!active) return;
        if (response.status === 401) {
          router.push("/login");
          return;
        }
        if (response.status === 403) {
          router.push("/waiting-for-approval");
          return;
        }
        if (!response.ok || !isDashboardPayload(response.data)) {
          setError("Ringkasan keuangan belum bisa dimuat.");
          return;
        }
        setData(response.data);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Ringkasan keuangan belum bisa dimuat.");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [initialData, period, reloadToken, router]);

  const retry = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  const changePeriod = (next: DashboardPeriodKey) => {
    if (next === period) return;
    setRefreshing(true);
    setPeriod(next);
  };

  const openDetail = async (card: WalletCardDTO) => {
    const response = await apiRequest<WalletDTO>(`/api/wallets/${card.id}`);
    if (response.ok && response.data) setDetail(response.data);
  };

  const archiveWallet = async (wallet: WalletDTO | WalletCardDTO) => {
    const response = await apiRequest(`/api/wallets/${wallet.id}/archive`, { method: "POST" });
    if (!response.ok) {
      setNotice("Dompet belum bisa diarsipkan. Coba lagi.");
      return;
    }
    setDetail(null);
    setManageOpen(false);
    setNotice("Dompet diarsipkan.");
    retry();
  };

  const restoreWallet = async (wallet: WalletDTO | WalletCardDTO) => {
    const response = await apiRequest(`/api/wallets/${wallet.id}/restore`, { method: "POST" });
    if (!response.ok) {
      setNotice("Dompet belum bisa dipulihkan. Coba lagi.");
      return;
    }
    setDetail(null);
    setManageOpen(false);
    setNotice("Dompet dipulihkan.");
    retry();
  };

  const todayMinor =
    data?.spending.byDay.find((day) => day.date === todayJakarta())?.amountMinor ?? 0;

  return (
    <div className="space-y-6">
      <header className="px-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5C7191]">
          Catatan keuangan keluarga
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17304F]">Beranda</h1>
        <p suppressHydrationWarning className="mt-1 text-sm text-[#5C7191]">
          {dateFormatter.format(new Date())}
        </p>
      </header>

      {notice ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl bg-[#DCFCE7] px-4 py-3 text-sm font-medium text-[#166534]"
        >
          {notice}
        </p>
      ) : null}

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div className="rounded-3xl border border-[#F3C2C2] bg-[#FDECEC] p-6 text-center">
          <p className="text-[15px] font-semibold text-[#B91C1C]">{error}</p>
          <p className="mt-1 text-sm text-[#46597A]">Periksa koneksimu lalu coba lagi.</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#166534] px-5 text-sm font-semibold text-white hover:bg-[#155C30]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Coba lagi
          </button>
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <div className="lg:col-span-12">
            <ExpenseHeroCard
              spentMinor={data.monthlyBudget.spentMinor}
              todayMinor={todayMinor}
              remainingMinor={data.monthlyBudget.isSet ? data.monthlyBudget.remainingMinor : null}
            />
          </div>

          <div className="lg:col-span-12">
            <WalletSummaryPair
              sharedBalanceMinor={data.sharedBalanceMinor}
              personalBalanceMinor={data.personalBalanceMinor}
              wallets={data.wallets}
              loading={false}
              error={null}
              onReload={retry}
              onOpenWallet={openDetail}
              onManageWallet={() => {
                setManageTab("active");
                setManageOpen(true);
              }}
              onCreate={() => setForm({ open: true, mode: "create", wallet: null })}
              onOpenArchive={() => {
                setManageTab("archived");
                setManageOpen(true);
              }}
            />
          </div>

          <div className="lg:col-span-12">
            <RecentActivityCard initialRows={data.recentActivity} wallets={data.wallets} />
          </div>

          <div className="lg:col-span-5">
            <BudgetCard
              budget={data.monthlyBudget}
              personalBudget={data.personalMonthlyBudget}
            />
          </div>
          <div className="lg:col-span-7">
            <SpendingChart
              spending={data.spending}
              personalSpending={data.personalSpending}
              period={period}
              onPeriodChange={changePeriod}
              loading={refreshing}
            />
          </div>

          <div className="lg:col-span-12">
            <GoalsSummaryCard goals={data.goals} />
          </div>
        </div>
      ) : null}

      <WalletManageSheet
        key={manageOpen ? `${manageTab}-open` : "manage-closed"}
        open={manageOpen}
        initialTab={manageTab}
        onClose={() => setManageOpen(false)}
        onEdit={(wallet) => {
          setManageOpen(false);
          setForm({ open: true, mode: "edit", wallet });
        }}
        onArchive={(wallet) => void archiveWallet(wallet)}
        onRestore={(wallet) => void restoreWallet(wallet)}
        onCreate={() => {
          setManageOpen(false);
          setForm({ open: true, mode: "create", wallet: null });
        }}
      />

      <WalletDetailSheet
        wallet={detail}
        onClose={() => setDetail(null)}
        onEdit={(wallet) => {
          setDetail(null);
          setForm({ open: true, mode: "edit", wallet });
        }}
        onArchive={(wallet) => void archiveWallet(wallet)}
        onRestore={(wallet) => void restoreWallet(wallet)}
      />

      <WalletFormSheet
        key={form.open ? `${form.mode}-${form.wallet?.id ?? "new"}` : "form-closed"}
        open={form.open}
        mode={form.mode}
        wallet={form.wallet}
        onClose={() => setForm({ open: false, mode: "create", wallet: null })}
        onSaved={() => {
          setForm({ open: false, mode: "create", wallet: null });
          setNotice(form.mode === "create" ? "Dompet tersimpan." : "Perubahan disimpan.");
          retry();
        }}
      />
    </div>
  );
}

/*
  Presentation guard for stale or malformed dashboard payloads. The live route
  always returns the current DTO, but rendering `undefined` as money produces
  `RpNaN`; failing to the existing error state is honest and keeps the user in
  the retry path instead of showing fabricated zeros.
*/
function isDashboardPayload(value: DashboardDTO | null): value is DashboardDTO {
  return Boolean(
    value &&
      Number.isFinite(value.sharedBalanceMinor) &&
      Number.isFinite(value.personalBalanceMinor) &&
      Array.isArray(value.wallets) &&
      Number.isFinite(value.monthlyBudget?.spentMinor) &&
      Number.isFinite(value.personalMonthlyBudget?.spentMinor) &&
      Array.isArray(value.spending?.byDay) &&
      Array.isArray(value.personalSpending?.byDay) &&
      Array.isArray(value.goals) &&
      Array.isArray(value.recentActivity),
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-5 lg:grid-cols-12"
      aria-busy="true"
      aria-label="Memuat ringkasan"
    >
      <Skeleton className="h-40 lg:col-span-12" />
      <Skeleton className="h-24 lg:col-span-6" />
      <Skeleton className="h-24 lg:col-span-6" />
      <Skeleton className="h-44 lg:col-span-12" />
      <Skeleton className="h-64 lg:col-span-12" />
      <Skeleton className="h-56 lg:col-span-5" />
      <Skeleton className="h-56 lg:col-span-7" />
      <Skeleton className="h-48 lg:col-span-12" />
    </div>
  );
}
