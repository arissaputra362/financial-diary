"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Coins, House, PiggyBank, Plus, Receipt, SquaresFour, Target, User, Users, Wallet, type IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import { requestTransactionAddIntent } from "@/lib/transaction-add-intent";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
  matchPrefix?: string;
};

const primaryItems: NavItem[] = [
  { href: "/home", label: "Beranda", icon: House },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/transactions?add=1", label: "Tambah", icon: Plus },
  { href: "/transactions", label: "Aktivitas", icon: Receipt, matchPrefix: "/transactions" },
];

const moreItems: NavItem[] = [
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/gold", label: "Emas", icon: Coins },
  { href: "/family", label: "Keluarga", icon: Users },
  { href: "/goals", label: "Tabungan", icon: Target },
  { href: "/profile", label: "Profil", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreState, setMoreState] = useState<{ pathname: string; open: boolean }>({
    pathname,
    open: false,
  });
  const moreOpen = moreState.pathname === pathname && moreState.open;
  const moreIsActive = moreItems.some((item) => pathname.startsWith(item.href));

  /*
    The menu is scoped to the pathname it was opened on. A route change makes
    `moreOpen` false without an effect, so navigation never leaves a stale sheet
    over the new page.
  */
  const setMoreOpen = (next: boolean | ((open: boolean) => boolean)) => {
    setMoreState((current) => {
      const currentOpen = current.pathname === pathname && current.open;
      const nextOpen = typeof next === "function" ? next(currentOpen) : next;
      return { pathname, open: nextOpen };
    });
  };

  const openAddIntent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/transactions") return;
    event.preventDefault();
    if (requestTransactionAddIntent()) return;
    const params = new URLSearchParams(window.location.search);
    params.set("add", "1");
    router.push(`/transactions?${params.toString()}`);
  };

  return (
    <>
      {moreOpen ? (
        <button
          type="button"
          aria-label="Tutup menu lainnya"
          onClick={() => setMoreOpen(false)}
          className="modal-overlay fixed inset-0 z-30 bg-black/10 md:hidden"
        />
      ) : null}

      <nav
        aria-label="Navigasi utama"
        data-nav="bottom"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 grid grid-cols-5 gap-1 rounded-[22px] border border-white/10 bg-navy p-2 text-white shadow-floating-nav md:hidden"
      >
        {primaryItems.map((item) => {
          const isAdd = item.href.includes("add=1");
          const isActive = !isAdd && (item.matchPrefix
            ? pathname.startsWith(item.matchPrefix)
            : pathname === item.href || pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={isAdd ? openAddIntent : undefined}
              aria-label={isAdd ? "Tambah transaksi" : item.label}
              aria-current={!isAdd && isActive ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors",
                isAdd
                  ? "-mt-6 h-14 w-14 justify-self-center rounded-full bg-brand-green text-white shadow-lg ring-4 ring-navy hover:bg-brand-green-hover"
                  : isActive
                    ? "bg-mint text-green"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon weight="fill" size={isAdd ? 28 : 22} aria-hidden="true" />
              {isAdd ? null : <span>{item.label}</span>}
            </Link>
          );
        })}

        <button
          type="button"
          aria-label="Lainnya"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen((open) => !open)}
          className={cn(
            "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-semibold transition-colors",
            moreIsActive || moreOpen
              ? "bg-mint text-green"
              : "text-white/70 hover:bg-white/10 hover:text-white",
          )}
        >
          <SquaresFour weight="fill" size={22} aria-hidden="true" />
          <span>Lainnya</span>
        </button>

        {moreOpen ? (
          <div
            id="mobile-more-menu"
            aria-label="Menu lainnya"
            className="modal-panel absolute bottom-full right-0 z-50 mb-3 w-52 rounded-2xl border border-white/10 bg-navy p-2 text-white shadow-xl"
          >
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-white/10",
                    isActive && "bg-mint text-green",
                  )}
                >
                  <Icon weight="fill" size={16} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ) : null}
      </nav>
    </>
  );
}
