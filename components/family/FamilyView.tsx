"use client";

import { useState } from "react";
import { Check, Clock, Crown, KeyRound, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

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
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const isOwner = me?.role === "OWNER";

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    try {
      const res = await fetch("/api/family/invites", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setInviteCode(data.plaintextCode);
      }
    } finally {
      setCreatingInvite(false);
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
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5C7191]">
              Kelola keluarga
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#17304F]">
              {me?.household?.name || "Keluarga"}
            </h1>
          </div>
          {isOwner && (
            <Button onClick={handleCreateInvite} isLoading={creatingInvite}>
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Undang anggota
            </Button>
          )}
        </div>

        {inviteCode && (
          <Card variant="tint">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#17304F]">
              <KeyRound className="h-4 w-4 text-[#1D4F87]" aria-hidden="true" />
              Kode undangan
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded-2xl border border-[#D8E2EE] bg-white px-4 py-2 text-2xl font-bold tracking-widest text-[#17304F]">
                {inviteCode}
              </code>
              <p className="text-xs text-[#46597A]">
                Bagikan kode ini ke anggota. Kode hanya tampil sekali.
              </p>
            </div>
          </Card>
        )}

        {isOwner && pending.length > 0 && (
          <Card>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#17304F]">
              <Users className="h-5 w-5 text-[#1D4F87]" aria-hidden="true" />
              Permintaan bergabung ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((m) => (
                <div key={m.id} className="rounded-2xl bg-[#EFF4FA] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-[#17304F]">{m.user?.displayName ?? "Anggota"}</p>
                      {m.user?.email ? (
                        <p className="truncate text-sm text-[#46597A]">{m.user.email}</p>
                      ) : null}
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#FDF3D7] px-3 py-1 text-xs font-semibold text-[#8A5A00]">
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
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#17304F]">
            <Users className="h-5 w-5 text-[#1D4F87]" aria-hidden="true" />
            Anggota aktif ({active.length})
          </h2>
          <div className="divide-y divide-[#EAEEF4]">
            {active.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-[#17304F]">
                    {m.user?.displayName ?? "Anggota"}
                    {m.userId === me?.user.id ? " (Kamu)" : ""}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-[#E6ECF4] px-2.5 py-0.5 text-xs font-semibold text-[#46597A]">
                    {m.role === "OWNER" ? (
                      <Crown className="h-3.5 w-3.5 text-[#166534]" aria-hidden="true" />
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
                    onClick={() => handleDecision(m.id, "revoke")}
                    disabled={actionId === m.id}
                    className="text-[#B91C1C] hover:bg-[#FDECEC] hover:text-[#B91C1C]"
                  >
                    Hapus akses
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card variant="tint">
          <div className="space-y-3 text-sm text-[#17304F]">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4F87]" aria-hidden="true" />
              Item terhapus tetap di Trash sampai dipulihkan
            </p>
            <p className="flex items-start gap-2">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4F87]" aria-hidden="true" />
              Akses diperiksa ulang di setiap permintaan
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
