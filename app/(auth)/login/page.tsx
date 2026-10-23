"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthForm({ initialSignup = false }: { initialSignup?: boolean }) {
  const REMEMBERED_EMAIL_KEY = "financial_planner_remembered_email";
  const router = useRouter();
  const searchParams = useSearchParams();
  /*
    BUG-003: /home does not exist yet (T-005 Dashboard). Land on /transactions,
    which is live, so a successful sign-in never hits a 404. TODO: change the
    fallback back to /home once T-005 ships.
  */
  const redirectTo = searchParams.get("redirect") || "/transactions";
  const [isSignup, setIsSignup] = useState(initialSignup);
  const [email, setEmail] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
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
        : { email, password };

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
        <div className="rounded-3xl border border-[#D8E2EE] bg-white p-8 shadow-bento">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[#17304F]">
              Financial Planner
            </h1>
            <p className="mt-1 text-[#46597A]">Keuangan keluarga jadi lebih mudah.</p>
          </div>

          <div
            className="mb-6 flex rounded-full bg-[#EFF4FA] p-1"
            role="group"
            aria-label="Pilih mode akun"
          >
            <button
              type="button"
              onClick={() => setIsSignup(false)}
              aria-pressed={!isSignup}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1D4F87]/25 ${
                !isSignup
                  ? "bg-white text-[#17304F] shadow-sm"
                  : "text-[#46597A] hover:text-[#17304F]"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => setIsSignup(true)}
              aria-pressed={isSignup}
              className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1D4F87]/25 ${
                isSignup
                  ? "bg-white text-[#17304F] shadow-sm"
                  : "text-[#46597A] hover:text-[#17304F]"
              }`}
            >
              Buat akun
            </button>
          </div>

          {error && (
            <div
              className="mb-4 rounded-2xl border border-[#F3C2C2] bg-[#FDECEC] p-3 text-sm text-[#B91C1C]"
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#46597A]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
                required
                className="w-full rounded-2xl border border-[#C9D6E4] px-4 py-3 text-[#17304F] outline-none transition-all placeholder:text-[#5C6C86] focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15"
                placeholder="nama@contoh.com"
                disabled={loading}
              />
            </div>

            {isSignup && (
              <div>
                <label htmlFor="displayName" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#46597A]">
                  Nama tampil
                </label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.trim())}
                  required
                  maxLength={60}
                  className="w-full rounded-2xl border border-[#C9D6E4] px-4 py-3 text-[#17304F] outline-none transition-all placeholder:text-[#5C6C86] focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15"
                  placeholder="Nama Anda"
                  disabled={loading}
                />
              </div>
            )}

            <div className="relative">
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#46597A]">
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
                  className="w-full rounded-2xl border border-[#C9D6E4] px-4 py-3 pr-12 text-[#17304F] outline-none transition-all placeholder:text-[#5C6C86] focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15"
                  placeholder="Minimal 8 karakter"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-[#5C7191] transition-colors hover:bg-[#EFF4FA] hover:text-[#17304F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1D4F87]/25"
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
              <label className="flex items-center gap-2 text-sm text-[#46597A]">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-[#C9D6E4] text-[#166534] focus:ring-[#166534]/25"
                />
                Ingat email saya di perangkat ini
              </label>
            )}

            {isSignup && (
              <div>
                <label htmlFor="inviteCode" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[#46597A]">
                  Kode undangan (opsional)
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="w-full rounded-2xl border border-[#C9D6E4] px-4 py-3 text-[#17304F] outline-none transition-all placeholder:text-[#5C6C86] focus:border-[#1D4F87] focus:ring-4 focus:ring-[#1D4F87]/15"
                  placeholder="Masukkan kode undangan"
                  disabled={loading}
                />
                <p className="mt-1.5 text-xs text-[#5C7191]">
                  Punya kode undangan? Masukkan untuk bergabung ke keluarga yang sudah ada. Tanpa kode, kamu akan membuat keluarga baru.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#166534] py-3.5 font-semibold text-white transition-all hover:bg-[#155C30] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[#E6ECF4] disabled:text-[#46597A]"
            >
              {loading ? "Memproses..." : isSignup ? "Buat akun keluarga" : "Masuk"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[#46597A]">
            {isSignup ? "Sudah punya akun? " : "Belum punya akun? "}
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="font-semibold text-[#1D4F87] hover:text-[#17304F]"
            >
              {isSignup ? "Masuk" : "Buat akun"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage({ initialSignup = false }: { initialSignup?: boolean }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
          <p className="text-[#5C7191]">Memuat...</p>
        </div>
      }
    >
      <AuthForm initialSignup={initialSignup} />
    </Suspense>
  );
}
