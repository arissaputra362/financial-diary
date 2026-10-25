"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { apiRequest, idempotencyHeaders } from "@/lib/api-client";
import { Skeleton } from "@/components/ui/Skeleton";
import { currentMonthKey, formatDateLabel, monthKeyRange, toJakartaDateOnly } from "@/lib/dates";
import type { AdvisorInsightResponseDTO } from "@/types/api";

/*
  Finny advisor drawer (design 05, AC-F4-5..AC-F4-8). Full-screen sheet on
  mobile, right slide-over on desktop. The footer with source period and
  limitations is pinned visible at 390px, never behind a scroll. The model
  name is never rendered (A-30); error states stay honest with no invented
  advice (AC-F4-7).
 */

type InsightBody = { insight: AdvisorInsightResponseDTO["insight"]; delivery: AdvisorInsightResponseDTO["delivery"] } | null;

type ErrorState = { code: string; message: string } | null;

function daysBetween(start: string, end: string): number {
  const first = new Date(`${start}T00:00:00Z`).getTime();
  const last = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(first) || Number.isNaN(last)) return Number.NaN;
  return Math.round((last - first) / 86_400_000) + 1;
}

const PRESETS = [
  { key: "week", label: "Minggu ini" },
  { key: "month", label: "Bulan ini" },
  { key: "last30", label: "30 hari terakhir" },
] as const;

function presetRange(key: (typeof PRESETS)[number]["key"]): { start: string; end: string } {
  const today = toJakartaDateOnly();
  if (key === "month") {
    const { from, to } = monthKeyRange(currentMonthKey());
    return { start: from, end: to > today ? today : to };
  }
  const days = key === "week" ? 7 : 30;
  const span = 1 - days;
  return { start: toJakartaDateOnly(new Date(Date.now() + span * 86_400_000)), end: today };
}

export function AdvisorPanel() {
  const router = useRouter();
  const initialRange = presetRange("month");
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<string>("month");
  const [customStart, setCustomStart] = useState(initialRange.start);
  const [customEnd, setCustomEnd] = useState(initialRange.end);
  const [period, setPeriod] = useState<{ start: string; end: string }>(initialRange);
  const [insight, setInsight] = useState<InsightBody>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorState>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const applyPreset = (key: string) => {
    setPreset(key);
    setRangeError(null);
    setError(null);
    setInsight(null);
    const range = presetRange(key as (typeof PRESETS)[number]["key"]);
    setCustomStart(range.start);
    setCustomEnd(range.end);
    setPeriod(range);
  };

  const applyCustom = () => {
    setRangeError(null);
    if (!customStart || !customEnd) {
      setRangeError("Isi tanggal mulai dan tanggal akhir.");
      return;
    }
    const count = daysBetween(customStart, customEnd);
    if (!Number.isFinite(count)) {
      setRangeError("Rentang tanggal tidak valid.");
      return;
    }
    if (count < 1) {
      setRangeError("Tanggal mulai harus sebelum atau sama dengan tanggal akhir.");
      return;
    }
    if (count > 90) {
      setRangeError("Rentang maksimal 90 hari.");
      return;
    }
    setPreset("custom");
    setError(null);
    setInsight(null);
    setPeriod({ start: customStart, end: customEnd });
  };

  const request = async () => {
    setLoading(true);
    setError(null);
    const response = await apiRequest<AdvisorInsightResponseDTO>("/api/advisor/insights", {
      method: "POST",
      headers: { "content-type": "application/json", ...idempotencyHeaders() },
      body: JSON.stringify({ period }),
    });
    setLoading(false);
    if (response.status === 401) {
      router.push("/login");
      return;
    }
    if (response.ok && response.data && "insight" in response.data) {
      setInsight({ insight: response.data.insight, delivery: response.data.delivery });
      return;
    }
    const code = response.data?.error?.code ?? "UNKNOWN";
    const messages: Record<string, string> = {
      ADVISOR_RATE_LIMITED: "Finny lagi sibuk. Coba lagi sebentar.",
      ADVISOR_UNAVAILABLE: "Finny belum bisa menganalisis sekarang. Coba lagi nanti.",
      ADVISOR_INVALID_OUTPUT: "Analisis belum bisa dibuat dari datamu. Coba lagi.",
    };
    setError({
      code,
      message:
        messages[code] ??
        response.data?.error?.fieldErrors?.period?.[0] ??
        "Analisis belum bisa dibuat sekarang. Coba lagi.",
    });
  };

  const followAction = (type: string) => {
    setOpen(false);
    if (type === "VIEW_GOAL") {
      window.setTimeout(() => {
        document.getElementById("goals")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
      return;
    }
    if (type === "REVIEW_SPENDING") {
      window.setTimeout(() => {
        document.getElementById("budget-summary")?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  };

  const footerPeriod =
    insight ? `Periode sumber: ${formatDateLabel(insight.insight.sourcePeriod.start)} sampai ${formatDateLabel(insight.insight.sourcePeriod.end)}` : null;

  return (
    <>
      <section
        aria-labelledby="finny-title"
        className="rounded-3xl border border-white/10 bg-[#14273F] p-6 text-white shadow-bento"
      >
        <h2 id="finny-title" className="flex items-center gap-2 text-lg font-semibold text-white">
          <Sparkles className="h-5 w-5 text-[#DCEBFA]" aria-hidden="true" />
          Finny, asisten keuangan
        </h2>
        <p className="mt-3 text-sm text-[#D9E6F5]">
          Lihat saran untuk pengeluaran keluargamu bulan ini.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            if (!insight) void request();
          }}
          data-testid="advisor-open"
          className="mt-4 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[#14273F] hover:bg-[#DCEBFA]"
        >
          Lihat saran
        </button>
      </section>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" data-testid="advisor-drawer">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawer-title"
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-[#EAEEF4] px-5 py-4">
              <h3 id="drawer-title" className="flex items-center gap-2 text-sm font-bold text-[#17304F]">
                <Sparkles className="h-4 w-4 text-[#1D4F87]" aria-hidden="true" />
                Finny, Asisten keuangan
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-[#46597A] hover:bg-[#EFF4FA]"
                data-testid="advisor-close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Tutup
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm text-[#46597A]">
                Pilih periode, Finny merangkum pengeluaran keluarga lalu memberi aksi ringan.
              </p>

              <div className="mt-4 flex flex-wrap gap-2" data-testid="advisor-presets">
                {PRESETS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => applyPreset(option.key)}
                    aria-pressed={preset === option.key}
                    className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
                      preset === option.key
                        ? "bg-[#1D4F87] text-white"
                        : "border border-[#BFD3E8] bg-white text-[#1D4F87] hover:bg-[#EFF4FA]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-3 rounded-2xl bg-[#EFF4FA] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#46597A]">Pilih rentang sendiri</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-[#46597A]" htmlFor="advisor-start">
                    Mulai
                    <input
                      id="advisor-start"
                      type="date"
                      value={customStart}
                      max={customEnd || undefined}
                      aria-invalid={rangeError ? true : undefined}
                      onChange={(event) => {
                        setCustomStart(event.target.value);
                        setRangeError(null);
                      }}
                      className="mt-1 min-h-11 w-full rounded-2xl border border-[#C9D6E4] bg-white px-3 text-sm text-[#17304F] accent-[#1D4F87] focus:border-[#1D4F87] focus:outline-none focus:ring-4 focus:ring-[#1D4F87]/15"
                    />
                  </label>
                  <label className="text-xs font-semibold text-[#46597A]" htmlFor="advisor-end">
                    Akhir
                    <input
                      id="advisor-end"
                      type="date"
                      value={customEnd}
                      min={customStart || undefined}
                      aria-invalid={rangeError ? true : undefined}
                      onChange={(event) => {
                        setCustomEnd(event.target.value);
                        setRangeError(null);
                      }}
                      className="mt-1 min-h-11 w-full rounded-2xl border border-[#C9D6E4] bg-white px-3 text-sm text-[#17304F] accent-[#1D4F87] focus:border-[#1D4F87] focus:outline-none focus:ring-4 focus:ring-[#1D4F87]/15"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={applyCustom}
                    className="inline-flex min-h-11 rounded-full border border-[#BFD3E8] bg-white px-4 text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA]"
                  >
                    Setel rentang
                  </button>
                </div>
                {rangeError ? (
                  <p role="alert" className="mt-2 text-xs text-[#B91C1C]">
                    {rangeError}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[#46597A]">Maksimal 90 hari. Rentang bisa satu hari.</p>
                )}
              </div>

              <div className="mt-5" data-testid="advisor-result">
                {loading ? (
                  <div>
                    <p className="text-sm font-semibold text-[#46597A]">Finny sedang membaca catatan keluarga...</p>
                    <Skeleton className="mt-3 h-28 w-full" />
                  </div>
                ) : error ? (
                  <div role="alert" data-testid="advisor-error" className="rounded-2xl border border-[#FDF3D7] bg-[#FDF3D7] p-4">
                    <p className="text-sm font-semibold text-[#8A5A00]">{error.message}</p>
                    <button
                      type="button"
                      onClick={() => void request()}
                      className="mt-3 inline-flex min-h-11 items-center rounded-full border border-[#8A5A00]/30 bg-white px-4 text-sm font-semibold text-[#8A5A00] hover:bg-[#FDF3D7]"
                      data-testid="advisor-retry"
                    >
                      Coba lagi
                    </button>
                  </div>
                ) : insight ? (
                  <article className="rounded-2xl border border-[#BCD6EF] bg-[#EFF4FA] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Sparkles className="h-5 w-5 text-[#1D4F87]" aria-hidden="true" />
                      {insight.delivery === "CACHE" ? (
                        <span
                          data-testid="advisor-cache-label"
                          className="rounded-full bg-[#E6ECF4] px-3 py-1 text-[11px] font-semibold text-[#46597A]"
                        >
                          Menggunakan analisis sebelumnya
                        </span>
                      ) : (
                        <span
                          data-testid="advisor-fresh-label"
                          className="rounded-full bg-[#DCFCE7] px-3 py-1 text-[11px] font-semibold text-[#166534]"
                        >
                          Analisis baru
                        </span>
                      )}
                    </div>
                    <h4 className="mt-2 text-base font-bold text-[#17304F]" data-testid="advisor-headline">
                      {insight.insight.headline}
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-[#46597A]" data-testid="advisor-summary">
                      {insight.insight.summary}
                    </p>
                    {insight.insight.actions.filter((action) => action.type !== "NONE").length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2" data-testid="advisor-actions">
                        {insight.insight.actions
                          .filter((action) => action.type !== "NONE")
                          .map((action) => (
                            <button
                              key={`${action.type}-${action.label}`}
                              type="button"
                              onClick={() => followAction(action.type)}
                              className="min-h-11 rounded-full bg-[#1D4F87] px-4 text-sm font-semibold text-white hover:bg-[#173F6C]"
                            >
                              {action.label}
                            </button>
                          ))}
                      </div>
                    ) : null}
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => void request()}
                        className="inline-flex min-h-11 rounded-full border border-[#BFD3E8] bg-white px-4 text-sm font-semibold text-[#1D4F87] hover:bg-[#EFF4FA]"
                      >
                        Minta insight baru
                      </button>
                    </div>
                  </article>
                ) : null}
              </div>
            </div>

            <footer
              className="shrink-0 border-t border-[#EAEEF4] bg-white px-5 py-3"
              data-testid="advisor-footer"
            >
              {footerPeriod ? (
                <p className="text-xs font-semibold text-[#17304F]" data-testid="advisor-source-period">
                  {footerPeriod}
                </p>
              ) : (
                <p className="text-xs font-semibold text-[#46597A]" data-testid="advisor-source-period">
                  Periode: {formatDateLabel(period.start)} sampai {formatDateLabel(period.end)}
                </p>
              )}
              <p className="mt-1 text-[11px] leading-relaxed text-[#5C7191]" data-testid="advisor-limitations">
                {insight?.insight.limitations ??
                  "Finny bukan nasihat keuangan profesional. Sarannya dihitung dari catatan keluargamu sendiri dan bisa meleset."}
              </p>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
