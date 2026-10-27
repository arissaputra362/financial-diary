"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

const REMEMBERED_EMAIL_KEY = "financial_planner_remembered_email";

type LoginFormProps = {
  /** Where to land after a successful sign-in (already validated as in-app). */
  redirectTo?: string;
  /** Invite code prefilled from `?invite=`, uppercased by the route. */
  initialInviteCode?: string;
  /** Start in signup mode (`/signup`). */
  initialSignup?: boolean;
};

/*
  Client form only. Search params are read by the server route and passed as
  props, so this component never needs `useSearchParams`/Suspense and the page
  ships fully rendered HTML.
*/
export function LoginForm({
  redirectTo = "/transactions",
  initialInviteCode = "",
  initialSignup = false,
}: LoginFormProps) {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(initialSignup);
  const [email, setEmail] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [authenticatedUser, setAuthenticatedUser] = useState<{
    displayName: string;
    email: string;
  } | null>(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(initialSignup && initialInviteCode));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialSignup) return;
    const timer = window.setTimeout(() => {
      const rememberedEmail = window.localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (!rememberedEmail) return;
      setEmail(rememberedEmail);
      setRememberEmail(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialSignup]);

  useEffect(() => {
    if (!initialSignup || !initialInviteCode) return;

    let active = true;
    fetch("/api/auth/me")
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setCheckingSession(false);
          return;
        }
        const data = await response.json();
        if (data.user?.email && data.user?.displayName) {
          setAuthenticatedUser({
            email: data.user.email,
            displayName: data.user.displayName,
          });
        }
        setCheckingSession(false);
      })
      .catch(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [initialSignup, initialInviteCode]);

  const handleUseInvite = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok && response.status !== 401) {
        setError("Sesi belum berhasil dikeluarkan. Coba lagi.");
        return;
      }
      setAuthenticatedUser(null);
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
      if (!isSignup) {
        if (rememberEmail) {
          window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      }
      const body = isSignup
        ? { email, displayName, password, inviteCode: inviteCode || undefined }
        : { email, password, rememberSession: rememberEmail };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error?.fieldErrors) {
          const firstField = Object.keys(data.error.fieldErrors)[0];
          setError(data.error.fieldErrors[firstField][0]);
        } else {
          setError(data.error?.message || "Terjadi kesalahan. Silakan coba lagi.");
        }
        return;
      }

      // Success - the response is an AuthStateDTO; redirect based on nextAction.
      const nextAction = data.nextAction;
      const status = data.status;
      if (nextAction === "WAIT_FOR_APPROVAL" || status === "PENDING") {
        router.push("/waiting-for-approval");
      } else if (nextAction === "OPEN_HOME") {
        router.push(redirectTo);
      } else if (status === "DECLINED" || status === "REVOKED") {
        router.push("/waiting-for-approval");
      } else {
        router.push("/login");
      }
    } catch {
      setError("Terjadi kesalahan jaringan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-card-border bg-card p-8 shadow-bento">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              Financial Diary
            </h1>
            <p className="mt-1 text-ink-2">Keuangan keluarga jadi lebih mudah.</p>
          </div>

          <noscript>
            <div
              className="mb-4 rounded-2xl border border-danger-border bg-danger-bg p-3 text-sm text-danger"
              role="alert"
            >
              JavaScript belum aktif di browser ini. Aktifkan JavaScript, lalu muat ulang halaman untuk masuk.
            </div>
          </noscript>

          {initialSignup && initialInviteCode && checkingSession && (
            <div className="mb-6 rounded-2xl border border-card-border bg-blue-wash p-4 text-sm text-ink-2">
              Memeriksa sesi akun...
            </div>
          )}

          {initialSignup && initialInviteCode && !checkingSession && authenticatedUser && (
            <div className="mb-6 rounded-2xl border border-success-border bg-success-bg p-4">
              <p className="font-semibold text-ink">Anda masih login</p>
              <p className="mt-1 text-sm text-ink-2">
                Saat ini masuk sebagai {authenticatedUser.displayName} ({authenticatedUser.email}).
                Link undangan ini digunakan untuk membuat akun anggota baru dan tidak akan mengubah akun yang sedang aktif.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/transactions")}
                  className="min-h-11 rounded-full bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:bg-brand-green-hover"
                  disabled={loading}
                >
                  Kembali ke aplikasi
                </button>
                <button
                  type="button"
                  onClick={handleUseInvite}
                  className="min-h-11 rounded-full border border-success-border bg-card px-4 py-2 text-sm font-semibold text-green hover:bg-success-bg"
                  disabled={loading}
                >
                  {loading ? "Keluar..." : "Keluar dan gunakan undangan"}
                </button>
              </div>
            </div>
          )}

          {(!initialSignup || !initialInviteCode || (!checkingSession && !authenticatedUser)) && (
          <>
          <div
            className="mb-6 flex rounded-full bg-blue-wash p-1"
            role="group"
            aria-label="Pilih mode akun"
          >
            <button
              type="button"
              onClick={() => setIsSignup(false)}
              aria-pressed={!isSignup}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/25 ${
                !isSignup
                  ? "bg-card text-ink shadow-sm"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => setIsSignup(true)}
              aria-pressed={isSignup}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/25 ${
                isSignup
                  ? "bg-card text-ink shadow-sm"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              Buat akun
            </button>
          </div>

          {error && (
            <div
              className="mb-4 rounded-2xl border border-danger-border bg-danger-bg p-3 text-sm text-danger"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* `method="post"` keeps credentials out of the URL if the client
              bundle fails to boot and the browser submits the form natively. */}
          <form method="post" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-ink-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
                required
                className="w-full rounded-2xl border border-input-border px-4 py-3 text-ink outline-none transition-all placeholder:text-placeholder focus:border-blue focus:ring-4 focus:ring-blue/15"
                placeholder="nama@contoh.com"
                disabled={loading}
              />
            </div>

            {isSignup && (
              <div>
                <label htmlFor="displayName" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-ink-2">
                  Nama tampil
                </label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  maxLength={60}
                  className="w-full rounded-2xl border border-input-border px-4 py-3 text-ink outline-none transition-all placeholder:text-placeholder focus:border-blue focus:ring-4 focus:ring-blue/15"
                  placeholder="Nama Anda"
                  disabled={loading}
                />
              </div>
            )}

            <div className="relative">
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-ink-2">
                Kata sandi
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-2xl border border-input-border px-4 py-3 pr-12 text-ink outline-none transition-all placeholder:text-placeholder focus:border-blue focus:ring-4 focus:ring-blue/15"
                  placeholder="Minimal 8 karakter"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-blue-wash hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue/25"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {!isSignup && (
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-input-border text-green focus:ring-green/25"
                />
                Ingat email saya di perangkat ini
              </label>
            )}

            {isSignup && (
              <div>
                <label htmlFor="inviteCode" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-ink-2">
                  Kode undangan (opsional)
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-input-border px-4 py-3 text-ink outline-none transition-all placeholder:text-placeholder focus:border-blue focus:ring-4 focus:ring-blue/15"
                  placeholder="Masukkan kode undangan"
                  disabled={loading}
                />
                <p className="mt-1.5 text-xs text-ink-3">
                  Punya kode undangan? Masukkan untuk bergabung ke keluarga yang sudah ada. Tanpa kode, kamu akan membuat keluarga baru.
                </p>
              </div>
            )}

            <Button
              type="submit"
              isLoading={loading}
              loadingLabel="Memproses..."
              className="w-full"
            >
              {isSignup ? "Buat akun keluarga" : "Masuk"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-2">
            {isSignup ? "Sudah punya akun? " : "Belum punya akun? "}
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="font-semibold text-blue hover:text-ink"
            >
              {isSignup ? "Masuk" : "Buat akun"}
            </button>
          </p>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
