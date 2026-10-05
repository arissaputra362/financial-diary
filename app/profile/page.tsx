"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type MeState = {
  user: { id: string; email: string; displayName: string };
  household: { id: string; name: string } | null;
  role: string;
  status: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/auth/me");
        if (res.status === 401) {
          router.push("/login");
          return;
        }
        const data = await res.json();
        setMe(data);
      } catch {
        // handled by error state
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } finally {
      setLoggingOut(false);
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

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Profil
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">
            {me?.user?.displayName || "Pengguna"}
          </h1>
        </div>

        <Card>
          <dl className="space-y-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Nama</dt>
              <dd className="mt-1 text-slate-900">{me?.user?.displayName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Email</dt>
              <dd className="mt-1 text-slate-900">{me?.user?.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Keluarga</dt>
              <dd className="mt-1 text-slate-900">{me?.household?.name || "-"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">Status</dt>
              <dd className="mt-1 text-slate-900">
                {me?.role === "OWNER" ? "Pemilik keluarga" : "Anggota"}
              </dd>
            </div>
          </dl>
        </Card>

        <Button
          variant="secondary"
          onClick={handleLogout}
          isLoading={loggingOut}
          className="w-full"
        >
          Keluar
        </Button>
      </div>
    </AppShell>
  );
}
