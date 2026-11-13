"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Target } from "lucide-react";
import { apiRequest } from "@/lib/api-client";
import { formatIDR } from "@/lib/format";
import type { GoalDTO, GoalListDTO } from "@/types/api";

/**
 * Compact savings-goal summary for the Budget page. The full list and detail
 * live at /goals; this card keeps the feature discoverable without making the
 * Budget page long.
 */
export function GoalsSummaryCard() {
  const [goals, setGoals] = useState<GoalDTO[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<GoalListDTO>("/api/goals")
      .then((response) => {
        if (!active) return;
        if (!response.ok || !response.data) {
          setError(true);
          return;
        }
        setGoals(response.data.rows);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const top = (goals ?? []).slice(0, 2);

  return (
    <section
      aria-labelledby="goals-summary-title"
      className="rounded-feature border border-card-border bg-card p-5 shadow-bento sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="goals-summary-title" className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Target className="h-5 w-5 text-green" aria-hidden="true" />
          Target tabungan
        </h2>
        <Link
          href="/goals"
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-green hover:bg-mint"
        >
          Lihat semua
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-2">
        Pelacak target menabung, terpisah dari saldo dompet.
      </p>

      {error ? (
        <p className="mt-4 rounded-2xl bg-surface-subtle px-4 py-3 text-sm text-ink-2">
          Target tabungan belum bisa dimuat.
        </p>
      ) : goals === null ? (
        <div
          className="mt-4 h-16 animate-pulse rounded-2xl bg-bar-track motion-reduce:animate-none"
          aria-busy="true"
          aria-label="Memuat target tabungan"
        />
      ) : goals.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-surface-subtle px-4 py-4">
          <p className="text-sm font-semibold text-ink">Belum ada target tabungan</p>
          <Link
            href="/goals"
            className="mt-2 inline-flex min-h-11 items-center rounded-full bg-brand-green px-4 text-sm font-semibold text-white hover:bg-brand-green-hover"
          >
            Buat target pertama
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {top.map((goal) => (
            <li key={goal.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-ink">{goal.name}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-green">
                  {goal.progressPercent}%
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-bar-track"
                role="img"
                aria-label={`${goal.name} ${goal.progressPercent} persen`}
              >
                <div className="h-full rounded-full bg-green" style={{ width: `${goal.progressPercent}%` }} />
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {formatIDR(goal.savedAmountMinor)} dari {formatIDR(goal.targetAmountMinor)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
