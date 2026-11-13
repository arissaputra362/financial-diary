"use client";

import { Users, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WalletScope } from "@/types/api";

/** UI vocabulary C-23: PERSONAL renders "Pribadi", SHARING renders "Bersama". */
export function scopeLabel(scope: WalletScope): string {
  return scope === "SHARING" ? "Bersama" : "Pribadi";
}

export function ScopePill({ scope, className }: { scope: WalletScope; className?: string }) {
  const shared = scope === "SHARING";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        shared
          ? "border-success-border bg-mint text-green"
          : "border-card-border bg-surface-subtle text-ink-2",
        className,
      )}
    >
      {shared ? (
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <User className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {scopeLabel(scope)}
    </span>
  );
}

/**
 * Compact ATM-style marker for picker/detail/manage rows (doc 01 §5.6 mini
 * treatment). List rows stay light; only this marker carries the card metaphor.
 * Decorative: the row's text already names the wallet and its scope.
 */
export function WalletMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-9 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-green",
        className,
      )}
    >
      <span className="h-2.5 w-3.5 rounded-sm bg-white/70" />
    </span>
  );
}
