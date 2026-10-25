"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, KeyRound, LogOut, User, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiRequest } from "@/lib/api-client";

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
  const [nameDraft, setNameDraft] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [nameError, setNameError] = useState("");
  const [passwordError, setPasswordError] = useState("");

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
        setNameDraft(data?.user?.displayName ?? "");
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

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNameError("");
    setNameMessage("");
    setNameSaving(true);
    try {
      const result = await apiRequest<{ displayName: string }>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: nameDraft }),
      });
      if (!result.ok || !result.data) {
        setNameError(result.data?.error?.message ?? "Nama belum berhasil diperbarui.");
        return;
      }
      setNameDraft(result.data.displayName);
      setMe((current) => current ? { ...current, user: { ...current.user, displayName: result.data!.displayName } } : current);
      setNameMessage("Nama berhasil diperbarui.");
    } catch {
      setNameError("Koneksi bermasalah. Coba lagi.");
    } finally {
      setNameSaving(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi kata sandi baru belum sama.");
      return;
    }
    setPasswordSaving(true);
    try {
      const result = await apiRequest<{ updated: boolean }>("/api/profile/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!result.ok) {
        setPasswordError(result.data?.error?.message ?? "Kata sandi belum berhasil diperbarui.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Kata sandi berhasil diperbarui. Perangkat lain perlu masuk kembali.");
    } catch {
      setPasswordError("Koneksi bermasalah. Coba lagi.");
    } finally {
      setPasswordSaving(false);
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
          <div className="mb-4 flex items-center gap-2">
            <User className="h-4 w-4 text-[#1D4F87]" aria-hidden="true" />
            <h2 className="font-semibold text-[#17304F]">Nama profil</h2>
          </div>
          <form onSubmit={saveName} className="space-y-3">
            <label htmlFor="profile-name" className="block text-sm font-medium text-[#46597A]">Nama yang ditampilkan</label>
            <input
              id="profile-name"
              autoComplete="name"
              maxLength={60}
              required
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              className="min-h-12 w-full rounded-2xl border border-[#C9D6E4] bg-white px-4 text-base text-[#17304F] outline-none focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15"
            />
            {nameError ? <p role="alert" className="text-sm text-[#B91C1C]">{nameError}</p> : null}
            {nameMessage ? <p role="status" className="text-sm text-[#166534]">{nameMessage}</p> : null}
            <Button type="submit" isLoading={nameSaving} loadingLabel="Menyimpan nama" disabled={nameDraft.trim() === me?.user.displayName}>
              Simpan nama
            </Button>
          </form>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-[#1D4F87]" aria-hidden="true" />
            <h2 className="font-semibold text-[#17304F]">Ganti kata sandi</h2>
          </div>
          <form onSubmit={savePassword} className="space-y-3">
            <label className="block text-sm font-medium text-[#46597A]" htmlFor="current-password">Kata sandi saat ini</label>
            <input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#C9D6E4] bg-white px-4 text-base text-[#17304F] outline-none focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15" />
            <label className="block text-sm font-medium text-[#46597A]" htmlFor="new-password">Kata sandi baru</label>
            <input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#C9D6E4] bg-white px-4 text-base text-[#17304F] outline-none focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15" />
            <label className="block text-sm font-medium text-[#46597A]" htmlFor="confirm-password">Ulangi kata sandi baru</label>
            <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-h-12 w-full rounded-2xl border border-[#C9D6E4] bg-white px-4 text-base text-[#17304F] outline-none focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15" />
            <p className="text-xs text-[#5C7191]">Minimal 8 karakter. Perangkat lain akan diminta masuk kembali.</p>
            {passwordError ? <p role="alert" className="text-sm text-[#B91C1C]">{passwordError}</p> : null}
            {passwordMessage ? <p role="status" className="text-sm text-[#166534]">{passwordMessage}</p> : null}
            <Button type="submit" isLoading={passwordSaving} loadingLabel="Menyimpan kata sandi">
              Simpan kata sandi
            </Button>
          </form>
        </Card>

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
