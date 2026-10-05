"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type MeResponse = {
  user: { id: string; email: string; displayName: string };
  household: { id: string; name: string } | null;
  role: string;
  status: "PENDING" | "APPROVED" | "DECLINED" | "REVOKED";
};

export default function WaitingForApprovalPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<"PENDING" | "DECLINED" | "REVOKED">("PENDING");
  const [displayName, setDisplayName] = useState("");
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const autoChecked = useRef(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/auth/me");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = (await res.json()) as MeResponse;
      setDisplayName(data.user?.displayName ?? "");
      setHouseholdName(data.household?.name ?? null);
      if (data.status === "APPROVED") {
        router.push("/home");
      } else if (data.status === "DECLINED" || data.status === "REVOKED") {
        setStatus(data.status);
      }
    } catch {
      // Keep the last known status; the manual button lets the user retry.
    } finally {
      setChecking(false);
    }
  }, [router]);

  // A-29: exactly one automatic re-check, plus the manual button.
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    void check();
  }, [check]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const renderContent = () => {
    switch (status) {
      case "DECLINED":
        return (
          <>
            <div className="text-4xl mb-6" aria-hidden="true">
              🚫
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4">Permintaanmu belum disetujui</h1>
            <p className="text-slate-600 mb-6">
              Pemilik keluarga belum menyetujui aksesmu. Kamu bisa menghubungi mereka secara langsung.
            </p>
          </>
        );
      case "REVOKED":
        return (
          <>
            <div className="text-4xl mb-6" aria-hidden="true">
              🔒
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4">Aksesmu dihentikan</h1>
            <p className="text-slate-600 mb-6">
              Aksesmu ke keluarga ini sudah dihentikan oleh pemilik.
            </p>
          </>
        );
      default:
        return (
          <>
            <div className="text-4xl mb-6" aria-hidden="true">
              🏡 ⏳ ✨
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-4">
              {displayName ? `Tunggu sebentar, ${displayName}!` : "Tunggu sebentar!"}
            </h1>
            <p className="text-slate-600 mb-6">
              {householdName
                ? `Permintaanmu untuk bergabung dengan "${householdName}" sudah dikirim.`
                : "Permintaanmu untuk bergabung dengan keluarga sudah dikirim."}
            </p>
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-100 text-amber-800 font-medium mb-6"
              role="status"
              aria-live="polite"
            >
              🟡 Menunggu persetujuan pemilik
            </div>
            <p className="text-slate-500 text-sm mb-6">
              Agar keuangan keluarga tetap aman dan private, pemilik keluarga perlu menyetujui aksesmu.
            </p>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-orange-50 via-purple-50 to-white px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl bg-white p-8 shadow-bento border border-slate-100 text-center">
          {renderContent()}

          {status === "PENDING" && (
            <button
              type="button"
              onClick={check}
              disabled={checking}
              className="w-full bg-white border border-slate-200 text-slate-700 py-2.5 rounded-full font-medium hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              {checking ? "Memeriksa..." : "Periksa lagi"}
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 text-slate-500 hover:text-slate-700 text-sm"
          >
            Keluar
          </button>
        </div>
      </div>
    </div>
  );
}
