"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ChevronRight, ImagePlus, KeyRound, LogOut, Pencil, Users, X } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiRequest } from "@/lib/api-client";
import { ThemeControl } from "@/components/profile/ThemeControl";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";

type MeState = {
  user: { id: string; email: string; displayName: string; avatarUrl: string | null };
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
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [presetSaving, setPresetSaving] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const editDialogRef = useRef<HTMLDivElement>(null);

  useDialogFocusTrap(editOpen, editDialogRef, () => setEditOpen(false));

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
      setEditOpen(false);
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
    if (!currentPassword && !newPassword && !confirmPassword) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Isi kata sandi saat ini, kata sandi baru, dan konfirmasinya.");
      return;
    }
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

  const saveAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarError("");
    setAvatarMessage("");
    setAvatarSaving(true);
    try {
      const body = new FormData();
      body.append("photo", file);
      const result = await apiRequest<{ avatarUrl: string }>("/api/profile/avatar", {
        method: "PUT",
        body,
      });
      if (!result.ok || !result.data) {
        setAvatarError(result.data?.error?.message ?? "Foto profil belum berhasil diperbarui.");
        return;
      }
      setMe((current) => current ? { ...current, user: { ...current.user, avatarUrl: result.data!.avatarUrl } } : current);
      setAvatarVersion((version) => version + 1);
      setAvatarMessage("Foto profil berhasil diperbarui.");
      setEditOpen(false);
    } catch {
      setAvatarError("Koneksi bermasalah. Coba lagi.");
    } finally {
      setAvatarSaving(false);
    }
  };

  const choosePreset = async (preset: AvatarPreset) => {
    setAvatarError("");
    setAvatarMessage("");
    setPresetSaving(preset.id);
    try {
      const body = new FormData();
      body.append("preset", preset.id);
      const result = await apiRequest<{ avatarUrl: string }>("/api/profile/avatar", {
        method: "PUT",
        body,
      });
      if (!result.ok || !result.data) {
        setAvatarError(result.data?.error?.message ?? "Avatar belum berhasil dipilih.");
        return;
      }
      setMe((current) => current ? { ...current, user: { ...current.user, avatarUrl: result.data!.avatarUrl } } : current);
      setAvatarVersion((version) => version + 1);
      setAvatarMessage("Avatar berhasil diperbarui.");
      setEditOpen(false);
    } catch {
      setAvatarError("Koneksi bermasalah. Coba lagi.");
    } finally {
      setPresetSaving(null);
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
        <PageHeader
          eyebrow="Profil"
          title={<span className="min-w-0 truncate">{me?.user?.displayName || "Pengguna"}</span>}
          leading={
            <ProfileAvatar
              name={me?.user?.displayName || "Pengguna"}
              src={me?.user?.avatarUrl ? `${me.user.avatarUrl}${me.user.avatarUrl.includes("?") ? "&" : "?"}v=${avatarVersion}` : null}
              size="large"
            />
          }
        />

        <Card>
          <div className="flex items-start gap-4">
            <ProfileAvatar
              name={me?.user?.displayName || "Pengguna"}
              src={me?.user?.avatarUrl ? `${me.user.avatarUrl}${me.user.avatarUrl.includes("?") ? "&" : "?"}v=${avatarVersion}` : null}
              size="large"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-ink">{me?.user?.displayName || "Pengguna"}</h2>
                  <p className="mt-1 break-words text-sm text-ink-2">{me?.user?.email}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => {
                  setNameDraft(me?.user?.displayName ?? "");
                  setAvatarError("");
                  setAvatarMessage("");
                  setNameError("");
                  setEditOpen(true);
                }}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit profil
                </Button>
              </div>
              <dl className="mt-5 grid gap-3 border-t border-row-divider pt-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-3">Keluarga</dt>
                  <dd className="mt-1 text-sm font-medium text-ink">{me?.household?.name || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-3">Peran</dt>
                  <dd className="mt-1 text-sm font-medium text-ink">{me?.role === "OWNER" ? "Pemilik keluarga" : "Anggota"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-3">Status</dt>
                  <dd className="mt-1 text-sm font-medium text-green">{me?.status === "APPROVED" ? "Aktif" : me?.status}</dd>
                </div>
              </dl>
            </div>
          </div>
          {nameMessage || avatarMessage ? (
            <p role="status" className="mt-4 text-sm text-green">{nameMessage || avatarMessage}</p>
          ) : null}
        </Card>

        <Card>
          <ThemeControl />
        </Card>

        <Card>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">
            Pengaturan akun
          </p>
          <nav aria-label="Menu profil" className="divide-y divide-row-divider">
            <Link
              href="/family"
              className="flex min-h-12 items-center justify-between gap-3 py-2 text-ink"
            >
              <span className="flex items-center gap-3">
                <Users className="h-4 w-4 text-blue" aria-hidden="true" />
                <span className="font-medium">Keluarga</span>
              </span>
              <ChevronRight className="h-4 w-4 text-ink-3" aria-hidden="true" />
            </Link>
          </nav>
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
              aria-labelledby="edit-profile-title"
              className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-card-border bg-card p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="edit-profile-title" className="text-lg font-semibold text-ink">Edit profil</h2>
                  <p className="mt-1 text-sm text-ink-3">Perbarui nama dan foto profilmu.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  aria-label="Tutup edit profil"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-surface-subtle"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={saveName} className="mt-5 space-y-3">
                <label htmlFor="profile-name" className="block text-sm font-medium text-ink-2">Nama yang ditampilkan</label>
                <input
                  id="profile-name"
                  autoFocus
                  autoComplete="name"
                  maxLength={60}
                  required
                  value={nameDraft}
                  onChange={(event) => setNameDraft(event.target.value)}
                  className="min-h-12 w-full rounded-2xl border border-input-border bg-card px-4 text-base text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15"
                />
                <div className="flex justify-end">
                  <Button type="submit" isLoading={nameSaving} loadingLabel="Menyimpan nama">
                    Simpan nama
                  </Button>
                </div>
              </form>

              <div className="mt-6 border-t border-row-divider pt-5">
                <p className="text-sm font-semibold text-ink">Foto profil</p>
                <p className="mt-1 text-xs text-ink-3">Upload foto sendiri atau pilih avatar.</p>
                <label className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-brand-green px-4 text-sm font-semibold text-white hover:bg-brand-green-hover">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  {avatarSaving ? "Mengunggah..." : "Upload foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={avatarSaving || presetSaving !== null}
                    onChange={saveAvatar}
                  />
                </label>
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {AVATAR_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => void choosePreset(preset)}
                      disabled={presetSaving !== null || avatarSaving}
                      aria-label={`Pilih avatar ${preset.label}`}
                      className="rounded-2xl p-1 outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-50"
                    >
                      <Image
                        src={`/api/profile/avatar?preset=${encodeURIComponent(preset.id)}`}
                        alt=""
                        width={72}
                        height={72}
                        unoptimized
                        loading="lazy"
                        className={`aspect-square rounded-full ${preset.tone}`}
                      />
                      <span className="mt-1 block text-[11px] font-medium text-ink-2">{preset.label}</span>
                    </button>
                  ))}
                </div>
                {nameError || avatarError ? <p role="alert" className="mt-3 text-sm text-danger">{nameError || avatarError}</p> : null}
              </div>

              <div className="mt-6 border-t border-row-divider pt-5">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-blue" aria-hidden="true" />
                  <h3 className="text-sm font-semibold text-ink">Ganti kata sandi</h3>
                </div>
                <p className="mt-1 text-xs text-ink-3">Kosongkan semua kolom jika tidak ingin mengganti kata sandi.</p>
                <form onSubmit={savePassword} className="mt-3 space-y-3">
                  <label className="block text-sm font-medium text-ink-2" htmlFor="current-password">Kata sandi saat ini</label>
                  <input id="current-password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="min-h-11 w-full rounded-2xl border border-input-border bg-card px-4 text-base text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
                  <label className="block text-sm font-medium text-ink-2" htmlFor="new-password">Kata sandi baru</label>
                  <input id="new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="min-h-11 w-full rounded-2xl border border-input-border bg-card px-4 text-base text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
                  <label className="block text-sm font-medium text-ink-2" htmlFor="confirm-password">Ulangi kata sandi baru</label>
                  <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="min-h-11 w-full rounded-2xl border border-input-border bg-card px-4 text-base text-ink outline-none focus:border-blue focus:ring-4 focus:ring-blue/15" />
                  <p className="text-xs text-ink-3">Minimal 8 karakter. Perangkat lain akan diminta masuk kembali.</p>
                  {passwordError ? <p role="alert" className="text-sm text-danger">{passwordError}</p> : null}
                  {passwordMessage ? <p role="status" className="text-sm text-green">{passwordMessage}</p> : null}
                  <div className="flex justify-end">
                    <Button type="submit" isLoading={passwordSaving} loadingLabel="Menyimpan kata sandi">
                      Simpan kata sandi
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

type AvatarPreset = { id: string; label: string; emoji: string; tone: string };

const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "leaf", label: "Daun", emoji: "🌿", tone: "bg-mint" },
  { id: "finny", label: "Finny", emoji: "😊", tone: "bg-blue-tint" },
  { id: "ocean", label: "Ombak", emoji: "🌊", tone: "bg-blue-wash" },
  { id: "sun", label: "Matahari", emoji: "☀️", tone: "bg-warning-bg" },
  { id: "woman", label: "Wanita", emoji: "👩", tone: "bg-pink-50" },
  { id: "man", label: "Pria", emoji: "👨", tone: "bg-blue-50" },
  { id: "boy", label: "Anak laki-laki", emoji: "👦", tone: "bg-sky-50" },
  { id: "girl", label: "Anak perempuan", emoji: "👧", tone: "bg-purple-50" },
];

function ProfileAvatar({
  name,
  src,
  size,
}: {
  name: string;
  src: string | null;
  size: "large" | "small";
}) {
  const className = size === "large" ? "h-14 w-14 text-lg" : "h-10 w-10 text-sm";
  return src ? (
    <Image
      src={src}
      alt={`Foto profil ${name}`}
      width={56}
      height={56}
      unoptimized
      className={`${className} shrink-0 rounded-full object-cover ring-2 ring-mint`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-blue-tint font-bold text-blue`}
    >
      {initials(name)}
    </span>
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
