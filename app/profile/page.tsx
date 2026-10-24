"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, LogOut, User, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

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
        <div className="space-y-5" aria-busy="true" aria-label="Memuat profil">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-4 px-1">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DCEBFA] text-[#1D4F87]"
          >
            <User className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5C7191]">
              Profil
            </p>
            <h1 className="mt-1 truncate text-2xl font-bold tracking-tight text-[#17304F]">
              {me?.user?.displayName || "Pengguna"}
            </h1>
          </div>
        </div>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#5C7191]">
            Pengaturan akun
          </p>
          <nav aria-label="Menu profil" className="divide-y divide-[#EAEEF4]">
            <Link
              href="/family"
              className="flex min-h-12 items-center justify-between gap-3 py-2 text-[#17304F]"
            >
              <span className="flex items-center gap-3">
                <Users className="h-4 w-4 text-[#1D4F87]" aria-hidden="true" />
                <span className="font-medium">Keluarga</span>
              </span>
              <ChevronRight className="h-4 w-4 text-[#5C7191]" aria-hidden="true" />
            </Link>
          </nav>
        </Card>

        <Card>
          <dl className="divide-y divide-[#EAEEF4]">
            <div className="py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium uppercase tracking-wider text-[#5C7191]">Nama</dt>
              <dd className="mt-1 text-[#17304F]">{me?.user?.displayName}</dd>
            </div>
            <div className="py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium uppercase tracking-wider text-[#5C7191]">Email</dt>
              <dd className="mt-1 break-words text-[#17304F]">{me?.user?.email}</dd>
            </div>
            <div className="py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium uppercase tracking-wider text-[#5C7191]">Keluarga</dt>
              <dd className="mt-1 text-[#17304F]">{me?.household?.name || "-"}</dd>
            </div>
            <div className="py-3 first:pt-0 last:pb-0">
              <dt className="text-xs font-medium uppercase tracking-wider text-[#5C7191]">Status</dt>
              <dd className="mt-1 inline-flex items-center rounded-full bg-[#E6ECF4] px-3 py-1 text-sm font-semibold text-[#46597A]">
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
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Keluar
        </Button>
      </div>
    </AppShell>
  );
}
