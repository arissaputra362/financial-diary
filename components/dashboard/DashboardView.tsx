"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, UserRound } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/Skeleton";
import { currentMonthKey } from "@/lib/dates";
import type { DashboardDTO } from "@/types/api";
import { BalanceHero } from "./BalanceHero";
import { FinnyTipCard } from "./FinnyTipCard";
import { MonthlySummaryCard } from "./MonthlySummaryCard";
import { RecentActivityCard } from "./RecentActivityCard";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

function greetingForNow(): string {
  const hour = Number(hourFormatter.format(new Date()));
  if (hour < 11) return "Selamat pagi";
  if (hour < 15) return "Selamat siang";
  if (hour < 19) return "Selamat sore";
  return "Selamat malam";
}

/**
 * Dashboard orchestrator (AC-F2-*; T-009 AC-F6-7; T-010 R-9 order). One
 * `GET /api/dashboard` call is the single source of truth. Wallet lifecycle
 * actions are handled on the dedicated wallet screen.
 */
export function DashboardView({ initialData }: { initialData?: DashboardDTO }) {
  const router = useRouter();
  const [data, setData] = useState<DashboardDTO | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<{ user?: { displayName?: string } }>("/api/auth/me")
      .then((response) => {
        if (active && response.ok) {
          setDisplayName(response.data?.user?.displayName?.trim() || null);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (initialData && reloadToken === 0) return;
    let active = true;
    apiRequest<DashboardDTO>("/api/dashboard?period=7D")
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
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialData, reloadToken, router]);

  const retry = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  const firstName = displayName?.split(/\s+/u)[0] ?? null;
  const month = currentMonthKey();

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-green">FinDiary</p>
          <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-ink sm:text-2xl">
            {greetingForNow()}
            {firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="mt-1 text-xs text-ink-3 sm:text-sm">{dateFormatter.format(new Date())}</p>
        </div>
        <Link
          href="/profile"
          aria-label="Buka profil"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-success-border bg-mint text-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring md:hidden"
        >
          <UserRound className="h-5 w-5" aria-hidden="true" />
        </Link>
      </header>

      {loading ? (
        <DashboardSkeleton />
      ) : error ? (
        <div className="rounded-feature border border-danger-border bg-danger-bg p-6 text-center">
          <p className="text-[15px] font-semibold text-danger">{error}</p>
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
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5">
          <div className="order-1 lg:col-span-8 lg:self-stretch">
            <BalanceHero
              sharedBalanceMinor={data.sharedBalanceMinor}
              personalBalanceMinor={data.personalBalanceMinor}
              wallets={data.wallets}
            />
          </div>

          <div className="order-3 lg:order-2 lg:col-span-4 lg:self-stretch">
            <FinnyTipCard
              sharedBudget={data.monthlyBudget}
              personalBudget={data.personalMonthlyBudget}
            />
          </div>

          <div className="order-2 lg:order-3 lg:col-span-7">
            <MonthlySummaryCard
              month={month}
              spending={data.spending}
              personalSpending={data.personalSpending}
              refreshToken={reloadToken}
            />
          </div>

          <div className="order-4 lg:col-span-5">
            <RecentActivityCard initialRows={data.recentActivity} />
          </div>
        </div>
      ) : null}
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
      className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5"
      aria-busy="true"
      aria-label="Memuat ringkasan"
    >
      <Skeleton className="h-52 rounded-feature lg:col-span-8" />
      <Skeleton className="h-52 rounded-feature lg:col-span-4" />
      <Skeleton className="h-72 rounded-feature lg:col-span-7" />
      <Skeleton className="h-72 rounded-feature lg:col-span-5" />
    </div>
  );
}
