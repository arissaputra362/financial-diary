"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Clock, Home as HomeIcon, Lock, RefreshCw } from "lucide-react";

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
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#FDECEC] text-[#B91C1C]">
              <Ban className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mb-4 text-2xl font-bold text-[#17304F]">Permintaanmu belum disetujui</h1>
            <p className="mb-6 text-[#46597A]">
              Pemilik keluarga belum menyetujui aksesmu. Kamu bisa menghubungi mereka secara langsung.
            </p>
          </>
        );
      case "REVOKED":
        return (
          <>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#FDECEC] text-[#B91C1C]">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mb-4 text-2xl font-bold text-[#17304F]">Aksesmu dihentikan</h1>
            <p className="mb-6 text-[#46597A]">
              Aksesmu ke keluarga ini sudah dihentikan oleh pemilik.
            </p>
          </>
        );
      default:
        return (
          <>
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#DCEBFA] text-[#1D4F87]">
              <HomeIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <h1 className="mb-4 text-2xl font-bold text-[#17304F]">
              {displayName ? `Tunggu sebentar, ${displayName}!` : "Tunggu sebentar!"}
            </h1>
            <p className="mb-6 text-[#46597A]">
              {householdName
                ? `Permintaanmu untuk bergabung dengan "${householdName}" sudah dikirim.`
                : "Permintaanmu untuk bergabung dengan keluarga sudah dikirim."}
            </p>
            <div
              className="mb-6 inline-flex items-center gap-2 rounded-full bg-[#FDF3D7] px-4 py-1.5 font-medium text-[#8A5A00]"
              role="status"
              aria-live="polite"
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              Menunggu persetujuan pemilik
            </div>
            <p className="mb-6 text-sm text-[#5C7191]">
              Agar keuangan keluarga tetap aman dan private, pemilik keluarga perlu menyetujui aksesmu.
            </p>
          </>
        );
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-[#D8E2EE] bg-white p-8 text-center shadow-bento">
          {renderContent()}

          {status === "PENDING" && (
            <button
              type="button"
              onClick={check}
              disabled={checking}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#BFD3E8] bg-white py-2.5 font-semibold text-[#1D4F87] transition-all hover:bg-[#EFF4FA] disabled:cursor-not-allowed disabled:bg-[#E6ECF4] disabled:text-[#46597A]"
            >
              <RefreshCw className={checking ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
              {checking ? "Memeriksa..." : "Periksa lagi"}
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="mt-4 min-h-11 text-sm font-medium text-[#46597A] hover:text-[#17304F]"
          >
            Keluar
          </button>
        </div>
      </div>
    </div>
  );
}
