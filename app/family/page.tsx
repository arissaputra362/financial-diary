"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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

export default function FamilyPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeState | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const isOwner = me?.role === "OWNER";

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.status === 401) {
          router.push("/login");
          return;
        }
        const meData = await meRes.json();
        setMe(meData);

        if (meData.status !== "APPROVED") {
          router.push("/waiting-for-approval");
          return;
        }

        const membersRes = await fetch("/api/family/members");
        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setMembers(Array.isArray(membersData) ? membersData : []);
        }
      } catch {
        // handled by error state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

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
        <div className="flex items-center justify-center py-20">
          <p className="text-slate-500">Memuat...</p>
        </div>
      </AppShell>
    );
  }

  const pending = members.filter((m) => m.status === "PENDING");
  const active = members.filter((m) => m.status === "APPROVED");

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Kelola keluarga
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
              {me?.household?.name || "Keluarga"}
            </h1>
          </div>
          {isOwner && (
            <Button onClick={handleCreateInvite} isLoading={creatingInvite}>
              + Undang anggota
            </Button>
          )}
        </div>

        {/* Invite code display */}
        {inviteCode && (
          <Card variant="sky">
            <p className="text-sm font-medium text-slate-700 mb-2">Kode undangan</p>
            <div className="flex items-center gap-3">
              <code className="text-2xl font-bold tracking-widest text-slate-900 bg-white px-4 py-2 rounded-xl">
                {inviteCode}
              </code>
              <p className="text-xs text-slate-500">
                Bagikan kode ini ke anggota. Kode hanya tampil sekali.
              </p>
            </div>
          </Card>
        )}

        {/* Pending requests (Owner only) */}
        {isOwner && pending.length > 0 && (
          <Card variant="peach">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">
              Permintaan bergabung ({pending.length})
            </h2>
            <div className="space-y-3">
              {pending.map((m) => (
                <div key={m.id} className="flex items-center justify-between bg-white/60 rounded-2xl p-4">
                  <div>
                    <p className="font-medium text-slate-900">{m.user?.displayName ?? "Anggota"}</p>
                    <p className="text-sm text-slate-500">
                      {m.user?.email ? `${m.user.email} • Menunggu persetujuan` : "Menunggu persetujuan"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleDecision(m.id, "approve")}
                      isLoading={actionId === m.id}
                    >
                      Izinkan bergabung
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleDecision(m.id, "decline")}
                      disabled={actionId === m.id}
                    >
                      Tolak
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Active members */}
        <Card>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Anggota aktif ({active.length})
          </h2>
          <div className="space-y-3">
            {active.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-slate-900">
                    {m.user?.displayName ?? "Anggota"}
                    {m.userId === me?.user.id ? " (Kamu)" : ""}
                  </p>
                  <p className="text-sm text-slate-500">
                    {m.role === "OWNER" ? "Pemilik keluarga" : "Anggota"}
                  </p>
                </div>
                {isOwner && m.role !== "OWNER" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDecision(m.id, "revoke")}
                    disabled={actionId === m.id}
                  >
                    Hapus akses
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Security info */}
        <Card variant="sky">
          <div className="space-y-2 text-sm text-slate-700">
            <p>🔒 Item terhapus tetap di Trash sampai dipulihkan</p>
            <p>🔑 Akses diperiksa ulang di setiap permintaan</p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}