"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthForm({ initialSignup = false }: { initialSignup?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/home";
  const [isSignup, setIsSignup] = useState(initialSignup);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isSignup ? "/api/auth/signup" : "/api/auth/login";
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
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-8 shadow-bento border border-slate-100">
          {/* Brand Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-purple-500 to-indigo-600 mb-4">
              <span className="text-2xl font-bold text-white">✦</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Financial Planner</h1>
            <p className="text-slate-500 mt-1">Keuangan keluarga jadi lebih mudah.</p>
          </div>

          {/* Segmented Control */}
          <div className="bg-slate-100/90 p-1 rounded-full flex mb-6">
            <button
              type="button"
              onClick={() => setIsSignup(false)}
              className={`flex-1 py-1.5 px-4 rounded-full text-sm font-medium transition-all ${
                !isSignup
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => setIsSignup(true)}
              className={`flex-1 py-1.5 px-4 rounded-full text-sm font-medium transition-all ${
                isSignup
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Buat akun
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
                required
                className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all text-slate-900 placeholder-slate-400"
                placeholder="nama@contoh.com"
                disabled={loading}
              />
            </div>

            {isSignup && (
              <div>
                <label htmlFor="displayName" className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
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
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all text-slate-900 placeholder-slate-400"
                  placeholder="Nama Anda"
                  disabled={loading}
                />
              </div>
            )}

            <div className="relative">
              <label htmlFor="password" className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
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
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all text-slate-900 placeholder-slate-400 pr-12"
                  placeholder="Minimal 8 karakter"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {isSignup && (
              <div>
                <label htmlFor="inviteCode" className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-1.5">
                  Kode undangan (opsional)
                </label>
                <input
                  id="inviteCode"
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-purple-500 focus:ring-4 focus:ring-purple-100 outline-none transition-all text-slate-900 placeholder-slate-400"
                  placeholder="Masukkan kode undangan"
                  disabled={loading}
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Punya kode undangan? Masukkan untuk bergabung ke keluarga yang sudah ada. Tanpa kode, kamu akan membuat keluarga baru.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-900 text-white py-3.5 rounded-full font-medium hover:bg-slate-800 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Memproses..." : isSignup ? "Buat akun keluarga" : "Masuk"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {isSignup ? "Sudah punya akun? " : "Belum punya akun? "}
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="text-purple-600 hover:text-purple-700 font-medium"
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
        <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
          <p className="text-slate-500">Memuat...</p>
        </div>
      }
    >
      <AuthForm initialSignup={initialSignup} />
    </Suspense>
  );
}