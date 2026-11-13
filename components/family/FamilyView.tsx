"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check, Clock, Copy, Crown, KeyRound, Link as LinkIcon, Pencil, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { apiRequest } from "@/lib/api-client";
import { formatDateLabel } from "@/lib/dates";
import { formatIDR, formatSignedIDR } from "@/lib/format";
import type { DashboardDTO, TransactionDTO } from "@/types/api";
import { CategoryIcon, categoryLabel, isTransferLeg } from "@/components/transactions/categories";

type Member = {
  id: string;
  userId: string;
  role: string;
  status: string;
  user?: { id: string; displayName: string; email: string; avatarUrl?: string | null } | null;
  requestedAt?: string | null;
  approvedAt?: string | null;
};

type MeState = {
  user: { id: string; email: string; displayName: string };
  household: { id: string; name: string } | null;
  role: string;
  status: string;
};

export default function FamilyView({
  initialMe,
  initialMembers,
}: {
  initialMe: MeState;
  initialMembers: Member[];
}) {
  const [me] = useState<MeState | null>(initialMe);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const loading = false;
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteCopyError, setInviteCopyError] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState(initialMe.household?.name ?? "");
  const [editOpen, setEditOpen] = useState(false);
  const [householdDraft, setHouseholdDraft] = useState(initialMe.household?.name ?? "");
  const [savingHousehold, setSavingHousehold] = useState(false);
  const [householdError, setHouseholdError] = useState("");
  const [householdNotice, setHouseholdNotice] = useState("");
  const [memberToRevoke, setMemberToRevoke] = useState<Member | null>(null);
  const editDialogRef = useRef<HTMLDivElement>(null);
  const [sharedOverview, setSharedOverview] = useState<DashboardDTO | null>(null);
  const [overviewError, setOverviewError] = useState(false);

  const isOwner = me?.role === "OWNER";

  useDialogFocusTrap(editOpen, editDialogRef, () => setEditOpen(false));

  useEffect(() => {
    let active = true;
    apiRequest<DashboardDTO>("/api/dashboard?period=7D")
      .then((response) => {
        if (!active) return;
        if (!response.ok || !response.data) {
          setOverviewError(true);
          return;
        }
        setSharedOverview(response.data);
      })
      .catch(() => {
        if (active) setOverviewError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSaveHousehold = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHouseholdError("");
    setSavingHousehold(true);
    try {
      const result = await apiRequest<{ id: string; name: string }>("/api/family", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: householdDraft }),
      });
      if (!result.ok || !result.data) {
        setHouseholdError(result.data?.error?.message ?? "Nama keluarga belum berhasil diperbarui.");
        return;
      }
      setHouseholdName(result.data.name);
      setHouseholdDraft(result.data.name);
      setHouseholdNotice("Informasi keluarga berhasil diperbarui.");
      setEditOpen(false);
    } catch {
      setHouseholdError("Koneksi bermasalah. Coba lagi.");
    } finally {
      setSavingHousehold(false);
    }
  };

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    try {
      const res = await fetch("/api/family/invites", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const code = typeof data.plaintextCode === "string" ? data.plaintextCode : null;
        setInviteCode(code);
        setInviteLink(
          code ? `${window.location.origin}/signup?invite=${encodeURIComponent(code)}` : null,
        );
        setInviteCopied(false);
        setInviteCopyError(null);
      }
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setInviteCopyError(null);
    } catch {
      setInviteCopied(false);
      setInviteCopyError("Link tidak dapat disalin otomatis. Salin dari kolom di sebelah kiri.");
    }
  };

  const handleDecision = async (membershipId: string, action: "approve" | "decline" | "revoke") => {
    setActionId(membershipId);
    try {
      const res = await fetch(`/api/family/members/${membershipId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        // Reload members
        const membersRes = await fetch("/api/family/members");
        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setMembers(Array.isArray(membersData) ? membersData : []);
        }
      }
    } finally {
      setActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5" aria-busy="true" aria-label="Memuat keluarga">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const pending = members.filter((m) => m.status === "PENDING");
  const active = members.filter((m) => m.status === "APPROVED");

  return (
    <div className="space-y-5 sm:space-y-6">
        <PageHeader
          eyebrow="Kelola keluarga"
          title={householdName || "Keluarga"}
          titleClassName="text-xl font-extrabold"
          actionsClassName="ml-auto w-full flex-wrap gap-2 sm:w-auto"
          leading={
            <Link
              href="/home"
              aria-label="Kembali ke Beranda"
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full border border-card-border bg-card text-ink-3 shadow-xs hover:bg-canvas md:flex"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          }
          beforeTitle={
            <Link
              href="/profile"
              className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-green hover:bg-mint md:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Kembali ke Profil
            </Link>
          }
          actions={isOwner ? (
            <>
              <Button
                variant="secondary"
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setHouseholdDraft(householdName);
                  setHouseholdError("");
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit informasi
              </Button>
              <Button onClick={handleCreateInvite} isLoading={creatingInvite} className="flex-1 sm:flex-none">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Undang anggota
              </Button>
            </>
          ) : null}
        />

        {householdNotice ? (
          <p role="status" className="rounded-2xl bg-mint px-4 py-3 text-sm font-medium text-green">
            {householdNotice}
          </p>
        ) : null}

        <SharedFinanceOverview
          householdName={householdName}
          members={active}
          overview={sharedOverview}
          error={overviewError}
        />

        {inviteCode && (
          <Card variant="tint">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <LinkIcon className="h-4 w-4 text-green" aria-hidden="true" />
              Undangan anggota
            </p>
            <div className="space-y-3">
              {inviteLink && (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    readOnly
                    value={inviteLink}
                    aria-label="Link undangan"
                    className="min-w-0 flex-1 rounded-2xl border border-card-border bg-card px-4 py-2 text-sm text-ink-2"
                  />
                  <Button size="sm" variant="secondary" onClick={handleCopyInviteLink}>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    {inviteCopied ? "Tersalin" : "Salin link"}
                  </Button>
                </div>
              )}
              {inviteCopyError && (
                <p className="text-xs text-danger" role="alert">
                  {inviteCopyError}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded-2xl border border-card-border bg-card px-4 py-2 text-2xl font-bold tracking-widest text-ink">
                  {inviteCode}
                </code>
                <p className="text-xs text-ink-2">
                  Link membuka form pendaftaran dengan kode terisi otomatis. Kode berlaku 7 hari dan hanya tampil sekali.
                </p>
              </div>
            </div>
          </Card>
        )}

        {isOwner && pending.length > 0 && (
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink">
              <Users className="h-5 w-5 text-green" aria-hidden="true" />
              Permintaan bergabung ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((m) => (
                <div key={m.id} className="rounded-2xl border border-warning-border bg-warning-bg/45 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <MemberAvatar member={m} />
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{m.user?.displayName ?? "Anggota"}</p>
                          {m.user?.email ? (
                            <p className="truncate text-sm text-ink-2">{m.user.email}</p>
                          ) : null}
                        </div>
                      </div>
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-warning-bg px-3 py-1 text-xs font-semibold text-warning">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        Menunggu persetujuan
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleDecision(m.id, "approve")}
                        isLoading={actionId === m.id}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Izinkan bergabung
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleDecision(m.id, "decline")}
                        disabled={actionId === m.id}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Tolak
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-ink">
            <Users className="h-5 w-5 text-green" aria-hidden="true" />
            Anggota aktif ({active.length})
          </h2>
          <div className="divide-y divide-row-divider">
            {active.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <MemberAvatar member={m} />
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {m.user?.displayName ?? "Anggota"}
                      {m.userId === me?.user.id ? " (Kamu)" : ""}
                    </p>
                  <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-chip-slate px-2.5 py-0.5 text-xs font-semibold text-ink-2">
                    {m.role === "OWNER" ? (
                      <Crown className="h-3.5 w-3.5 text-green" aria-hidden="true" />
                    ) : (
                      <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {m.role === "OWNER" ? "Pemilik keluarga" : "Anggota"}
                  </span>
                  </div>
                </div>
                {isOwner && m.role !== "OWNER" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setMemberToRevoke(m)}
                    disabled={actionId === m.id}
                    className="text-danger hover:bg-danger-bg hover:text-danger"
                  >
                    Hapus akses
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card variant="tint">
          <div className="space-y-3 text-sm text-ink">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green" aria-hidden="true" />
              Item terhapus tetap di Trash sampai dipulihkan
            </p>
            <p className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-green" aria-hidden="true" />
              Akses diperiksa ulang di setiap permintaan
            </p>
          </div>
        </Card>

        {editOpen ? (
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim/40 p-0 sm:items-center sm:p-4"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEditOpen(false);
            }}
          >
            <div
              ref={editDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-household-title"
              className="w-full rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="edit-household-title" className="text-lg font-semibold text-ink">
                    Edit informasi keluarga
                  </h2>
                  <p className="mt-1 text-sm text-ink-3">Ubah nama yang tampil di halaman keluarga.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  aria-label="Tutup"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-surface-subtle"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <form onSubmit={handleSaveHousehold} className="mt-5 space-y-4">
                <label htmlFor="household-name" className="block text-sm font-semibold text-ink-2">
                  Nama keluarga
                </label>
                <input
                  id="household-name"
                  autoFocus
                  required
                  maxLength={80}
                  value={householdDraft}
                  onChange={(event) => setHouseholdDraft(event.target.value)}
                  className="min-h-12 w-full rounded-2xl border border-input-border bg-card px-4 text-base text-ink outline-none focus:border-green focus:ring-4 focus:ring-green/15"
                />
                {householdError ? <p role="alert" className="text-sm text-danger">{householdError}</p> : null}
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={savingHousehold}>
                    Batal
                  </Button>
                  <Button type="submit" isLoading={savingHousehold} loadingLabel="Menyimpan">
                    Simpan
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
        <ConfirmActionDialog
          open={memberToRevoke !== null}
          title="Hapus akses anggota?"
          description={memberToRevoke ? `${memberToRevoke.user?.displayName ?? "Anggota ini"} tidak akan bisa lagi mengakses data keluarga.` : ""}
          confirmLabel="Hapus akses"
          busy={memberToRevoke !== null && actionId === memberToRevoke.id}
          onCancel={() => setMemberToRevoke(null)}
          onConfirm={() => {
            if (!memberToRevoke) return;
            void handleDecision(memberToRevoke.id, "revoke").then(() => setMemberToRevoke(null));
          }}
        />
    </div>
  );
}

function SharedFinanceOverview({
  householdName,
  members,
  overview,
  error,
}: {
  householdName: string;
  members: Member[];
  overview: DashboardDTO | null;
  error: boolean;
}) {
  const sharedRows = overview?.recentActivity
    .filter((row) => row.wallet?.scope === "SHARING")
    .slice(0, 3) ?? [];
  const sharedDays = overview?.spending.byDay.slice(-7) ?? [];
  const maxSpending = Math.max(1, ...sharedDays.map((day) => day.amountMinor));
  const hasSpending = sharedDays.some((day) => day.amountMinor > 0);

  return (
    <section aria-labelledby="shared-finance-title" className="space-y-4">
      <div className="relative overflow-hidden rounded-feature surface-hero p-5 text-white shadow-bento sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">
              Keuangan bersama
            </p>
            <h2 id="shared-finance-title" className="mt-1 text-xl font-bold tracking-tight">
              {householdName || "Keluarga"}
            </h2>
          </div>
          <Users className="h-5 w-5 text-white/80" aria-hidden="true" />
        </div>
        <p className="mt-5 text-xs text-white/75">Saldo bersama</p>
        <p className="financial-value mt-1 text-3xl font-bold tracking-tight">
          {overview ? formatIDR(overview.sharedBalanceMinor) : error ? "Tidak tersedia" : "Memuat..."}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex -space-x-2" aria-label={`${members.length} anggota aktif`}>
            {members.slice(0, 4).map((member) => (
              <MemberAvatar key={member.id} member={member} compact />
            ))}
            {members.length > 4 ? (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-green bg-white/20 text-xs font-bold text-white">
                +{members.length - 4}
              </span>
            ) : null}
          </div>
          <span className="text-xs text-white/80">{members.length} anggota aktif</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-feature border border-card-border bg-card p-4 shadow-bento sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink">Pengeluaran bersama</h3>
              <p className="mt-0.5 text-xs text-ink-3">7 hari terakhir</p>
            </div>
            <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-semibold text-green">
              Harian
            </span>
          </div>
          {hasSpending ? (
            <div
              className="mt-5 flex h-28 items-end gap-2"
              role="img"
              aria-label="Grafik pengeluaran bersama 7 hari terakhir"
            >
              {sharedDays.map((day) => (
                <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="flex h-24 w-full items-end">
                    <div
                      className="mx-auto w-full max-w-7 rounded-t-lg bg-gradient-to-t from-brand-green to-[#54d68a]"
                      style={{ height: `${Math.max(8, Math.round((day.amountMinor / maxSpending) * 96))}px` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-ink-3">
                    {new Date(`${day.date}T00:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "short" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 rounded-2xl bg-surface-subtle p-4 text-center text-sm text-ink-2">
              Belum ada pengeluaran bersama.
            </p>
          )}
        </div>

        <div className="rounded-feature border border-card-border bg-card p-4 shadow-bento sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-ink">Aktivitas keluarga</h3>
            <Link href="/transactions" className="text-xs font-semibold text-green hover:text-green-hover">
              Lihat semua
            </Link>
          </div>
          {sharedRows.length > 0 ? (
            <ul className="mt-3 divide-y divide-row-divider">
              {sharedRows.map((row) => <SharedActivityRow key={row.id} row={row} />)}
            </ul>
          ) : (
            <p className="mt-3 rounded-2xl bg-surface-subtle p-4 text-center text-sm text-ink-2">
              Belum ada aktivitas bersama.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function SharedActivityRow({ row }: { row: TransactionDTO }) {
  const transfer = isTransferLeg(row);
  return (
    <li className="flex items-center gap-3 py-3">
      <CategoryIcon category={row.category} transfer={transfer} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">
          {row.merchant ?? row.note ?? categoryLabel(row.category)}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-3">{formatDateLabel(row.occurredAt)}</p>
      </div>
      <p className={`shrink-0 text-sm font-bold tabular-nums ${row.type === "MONEY_IN" ? "text-green" : "text-ink"}`}>
        {transfer ? formatIDR(row.amountMinor) : formatSignedIDR(row.type === "MONEY_IN" ? row.amountMinor : -row.amountMinor)}
      </p>
    </li>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function MemberAvatar({ member, compact = false }: { member: Member; compact?: boolean }) {
  const name = member.user?.displayName ?? "Anggota";
  const size = compact ? "h-9 w-9 text-xs" : "h-10 w-10 text-sm";
  return member.user?.avatarUrl ? (
    <Image
      src={member.user.avatarUrl}
      alt={`Foto ${name}`}
      width={compact ? 36 : 40}
      height={compact ? 36 : 40}
      unoptimized
      className={`${size} shrink-0 rounded-full border-2 border-green object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${size} flex shrink-0 items-center justify-center rounded-full border-2 border-green bg-mint font-bold text-green`}
    >
      {initials(name)}
    </span>
  );
}
