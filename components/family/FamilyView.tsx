"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clock, Copy, Crown, KeyRound, Link as LinkIcon, Pencil, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmActionDialog } from "@/components/ui/ConfirmActionDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { apiRequest } from "@/lib/api-client";

type Member = {
  id: string;
  userId: string;
  role: string;
  status: string;
  user?: { id: string; displayName: string; email: string } | null;
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

  const isOwner = me?.role === "OWNER";

  useDialogFocusTrap(editOpen, editDialogRef, () => setEditOpen(false));

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
      <AppShell>
        <div className="space-y-5" aria-busy="true" aria-label="Memuat keluarga">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

  const pending = members.filter((m) => m.status === "PENDING");
  const active = members.filter((m) => m.status === "APPROVED");

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Kelola keluarga"
          title={householdName || "Keluarga"}
          icon={Users}
          titleClassName="text-xl font-extrabold"
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
              className="mb-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm font-semibold text-blue hover:bg-blue-wash md:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Kembali ke Profil
            </Link>
          }
          actions={isOwner ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setHouseholdDraft(householdName);
                  setHouseholdError("");
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit informasi
              </Button>
              <Button onClick={handleCreateInvite} isLoading={creatingInvite}>
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

        {inviteCode && (
          <Card variant="tint">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
              <LinkIcon className="h-4 w-4 text-blue" aria-hidden="true" />
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
              <Users className="h-5 w-5 text-blue" aria-hidden="true" />
              Permintaan bergabung ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((m) => (
                <div key={m.id} className="rounded-2xl bg-blue-wash p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{m.user?.displayName ?? "Anggota"}</p>
                      {m.user?.email ? (
                        <p className="truncate text-sm text-ink-2">{m.user.email}</p>
                      ) : null}
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
            <Users className="h-5 w-5 text-blue" aria-hidden="true" />
            Anggota aktif ({active.length})
          </h2>
          <div className="divide-y divide-row-divider">
            {active.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
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
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue" aria-hidden="true" />
              Item terhapus tetap di Trash sampai dipulihkan
            </p>
            <p className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-blue" aria-hidden="true" />
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
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-blue-wash"
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
                  className="min-h-12 w-full rounded-2xl border border-input-border bg-card px-4 text-base text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15"
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
    </AppShell>
  );
}
