"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowUpRight, Eye, EyeOff, History } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { RecentActivityCard } from "@/components/dashboard/RecentActivityCard";
import { apiRequest } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import type { DashboardDTO, WalletCardDTO, WalletDTO } from "@/types/api";
import { WalletDetailSheet } from "./WalletDetailSheet";
import { WalletFormSheet } from "./WalletFormSheet";
import { WalletManageSheet } from "./WalletManageSheet";
import { WalletSummaryPair } from "./WalletSummaryPair";
import { useWallets } from "./useWallets";

type FormState = { open: boolean; mode: "create" | "edit"; wallet: WalletDTO | null };

/**
 * Dedicated wallet screen using the existing list and wallet management flows.
 * The hero keeps Pribadi and Bersama as two independent bands (never summed,
 * A-44) and offers the three frequent actions from the phase 2 mockup.
 */
export function WalletManagementView() {
  const { wallets, loading, error, reload } = useWallets("active");
  const [overview, setOverview] = useState<DashboardDTO | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [amountVisible, setAmountVisible] = useState(true);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<"active" | "archived">("active");
  const [form, setForm] = useState<FormState>({ open: false, mode: "create", wallet: null });
  const [detail, setDetail] = useState<WalletDTO | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<WalletDTO | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<DashboardDTO>("/api/dashboard")
      .then((response) => { if (active && response.ok) setOverview(response.data ?? null); })
      .catch(() => { if (active) setOverview(null); })
      .finally(() => { if (active) setOverviewLoading(false); });
    return () => { active = false; };
  }, []);

  const openDetail = async (card: WalletCardDTO) => {
    const response = await apiRequest<WalletDTO>(`/api/wallets/${card.id}`);
    if (response.ok && response.data) setDetail(response.data);
  };

  const archiveWallet = async () => {
    if (!archiveCandidate) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      const response = await apiRequest(`/api/wallets/${archiveCandidate.id}/archive`, { method: "POST" });
      if (!response.ok) {
        setArchiveError("Dompet belum bisa diarsipkan. Coba lagi.");
        return;
      }
      setArchiveCandidate(null);
      setDetail(null);
      setManageOpen(false);
      setNotice("Dompet diarsipkan.");
      reload();
    } catch {
      setArchiveError("Dompet belum bisa diarsipkan. Periksa koneksimu lalu coba lagi.");
    } finally {
      setArchiving(false);
    }
  };

  const restoreWallet = async (wallet: WalletDTO) => {
    const response = await apiRequest(`/api/wallets/${wallet.id}/restore`, { method: "POST" });
    if (!response.ok) {
      setNotice("Dompet belum bisa dipulihkan. Coba lagi.");
      return;
    }
    setDetail(null);
    setManageOpen(false);
    setNotice("Dompet dipulihkan.");
    reload();
  };

  const cardWallets: WalletCardDTO[] = wallets.map((wallet) => ({
    id: wallet.id,
    name: wallet.name,
    purpose: wallet.purpose,
    scope: wallet.scope,
    balanceMinor: wallet.balanceMinor,
    archivedAt: wallet.archivedAt,
    canEdit: wallet.canEdit,
    canArchive: wallet.canArchive,
    canRestore: wallet.canRestore,
    institution: wallet.institution ? { kind: wallet.institution.kind, name: wallet.institution.name } : null,
  }));

  const money = (value: number) =>
    overviewLoading ? "Memuat…" : overview ? (amountVisible ? formatIDR(value) : "••••••") : "Tidak tersedia";

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader title="Wallet" description="Kelola saldo dan dompet pribadi maupun bersama." />
      {notice ? <p role="status" aria-live="polite" className="rounded-xl bg-mint px-4 py-3 text-sm font-medium text-green">{notice}</p> : null}

      <section
        aria-labelledby="wallet-hero-title"
        className="relative overflow-hidden rounded-feature surface-hero p-5 text-white shadow-bento sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p id="wallet-hero-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
            Saldo utama
          </p>
          <button
            type="button"
            onClick={() => setAmountVisible((visible) => !visible)}
            aria-label={amountVisible ? "Sembunyikan saldo" : "Tampilkan saldo"}
            aria-pressed={amountVisible}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {amountVisible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="min-w-0 rounded-2xl bg-black/15 p-3">
            <p className="text-[11px] font-medium text-white/85">Pribadi</p>
            <p className="financial-value mt-1 truncate text-lg font-bold tabular-nums">
              {money(overview?.personalBalanceMinor ?? 0)}
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-black/15 p-3">
            <p className="text-[11px] font-medium text-white/85">Bersama</p>
            <p className="financial-value mt-1 truncate text-lg font-bold tabular-nums">
              {money(overview?.sharedBalanceMinor ?? 0)}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <Link
            href="/transactions?add=1&type=MONEY_IN"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-white text-green transition-colors hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold">Uang masuk</span>
          </Link>
          <Link
            href="/transactions?add=1&type=TRANSFER"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold">Transfer</span>
          </Link>
          <Link
            href="/transactions"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <History className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold">Riwayat</span>
          </Link>
        </div>

        <p className="mt-3 text-xs text-white/85">
          {loading ? "Memuat daftar wallet…" : `${wallets.length} wallet aktif`}
        </p>
      </section>

      <WalletSummaryPair
        wallets={cardWallets}
        loading={loading}
        error={error}
        onReload={reload}
        onOpenWallet={openDetail}
        onManageWallet={() => { setManageTab("active"); setManageOpen(true); }}
        onCreate={() => setForm({ open: true, mode: "create", wallet: null })}
        onOpenArchive={() => { setManageTab("archived"); setManageOpen(true); }}
        showAllLink={false}
      />

      <section aria-label="Aktivitas terbaru">
        {overviewLoading ? (
          <Skeleton className="h-56 w-full" aria-label="Memuat aktivitas wallet" />
        ) : overview ? (
            <RecentActivityCard initialRows={overview.recentActivity} />
        ) : (
          <p role="status" className="rounded-2xl border border-card-border bg-card p-5 text-sm text-ink-2">Aktivitas terbaru belum bisa dimuat.</p>
        )}
      </section>

      <WalletManageSheet
        key={manageOpen ? `${manageTab}-open` : "manage-closed"}
        open={manageOpen}
        initialTab={manageTab}
        onClose={() => setManageOpen(false)}
        onEdit={(wallet) => { setManageOpen(false); setForm({ open: true, mode: "edit", wallet }); }}
        onArchive={(wallet) => { setArchiveError(null); setArchiveCandidate(wallet); }}
        onRestore={(wallet) => void restoreWallet(wallet)}
        onCreate={() => { setManageOpen(false); setForm({ open: true, mode: "create", wallet: null }); }}
      />
      <WalletDetailSheet
        wallet={detail}
        onClose={() => setDetail(null)}
        onEdit={(wallet) => { setDetail(null); setForm({ open: true, mode: "edit", wallet }); }}
        onArchive={(wallet) => { setArchiveError(null); setArchiveCandidate(wallet); }}
        onRestore={(wallet) => void restoreWallet(wallet)}
      />
      <WalletFormSheet
        key={form.open ? `${form.mode}-${form.wallet?.id ?? "new"}` : "form-closed"}
        open={form.open}
        mode={form.mode}
        wallet={form.wallet}
        onClose={() => setForm({ open: false, mode: "create", wallet: null })}
        onSaved={() => { setForm({ open: false, mode: "create", wallet: null }); setNotice(form.mode === "create" ? "Dompet tersimpan." : "Perubahan disimpan."); reload(); }}
      />
      <ConfirmActionDialog
        open={archiveCandidate !== null}
        title="Arsipkan dompet?"
        description={archiveCandidate ? `“${archiveCandidate.name}” akan dipindahkan ke Arsip. Riwayat dan saldo tetap tersimpan, dan dompet bisa dipulihkan nanti.` : "Dompet akan dipindahkan ke Arsip."}
        confirmLabel="Arsipkan dompet"
        busy={archiving}
        error={archiveError}
        onCancel={() => { if (!archiving) { setArchiveCandidate(null); setArchiveError(null); } }}
        onConfirm={() => void archiveWallet()}
      />
    </div>
  );
}
