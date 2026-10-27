"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Coins, LayoutDashboard, Menu, PiggyBank, Plus, ReceiptText, User } from "lucide-react";
import { requestTransactionAddIntent } from "@/lib/transaction-add-intent";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  matchPrefix?: string;
};

const primaryItems: NavItem[] = [
  { href: "/home", label: "Beranda", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/transactions?add=1", label: "Tambah", icon: Plus },
  { href: "/transactions", label: "Aktivitas", icon: ReceiptText, matchPrefix: "/transactions" },
];

const moreItems: NavItem[] = [
  { href: "/gold", label: "Emas", icon: Coins },
  { href: "/profile", label: "Profil", icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreIsActive = moreItems.some((item) => pathname.startsWith(item.href));

  useEffect(() => setMoreOpen(false), [pathname]);

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
          className="fixed inset-0 z-30 bg-black/10 md:hidden"
        />
      ) : null}

      <nav
        aria-label="Navigasi utama"
        data-nav="bottom"
        className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-full border border-white/10 bg-navy/95 p-2 text-white shadow-floating-nav backdrop-blur-md md:hidden"
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
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-colors",
                isAdd
                  ? "mx-auto -mt-5 h-14 w-14 justify-self-center bg-brand-green text-white shadow-pill hover:bg-brand-green-hover"
                  : isActive
                    ? "bg-blue-tint font-medium text-ink"
                    : "text-white/60 hover:text-white",
              )}
            >
              <Icon className={cn(isAdd ? "h-6 w-6" : "h-4 w-4")} aria-hidden="true" />
              <span>{item.label}</span>
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
            "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-colors",
            moreIsActive || moreOpen
              ? "bg-blue-tint font-medium text-ink"
              : "text-white/60 hover:text-white",
          )}
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
          <span>Lainnya</span>
        </button>

        {moreOpen ? (
          <div
            id="mobile-more-menu"
            aria-label="Menu lainnya"
            className="absolute bottom-full right-0 z-50 mb-3 w-52 rounded-2xl border border-card-border bg-card p-2 text-ink shadow-xl"
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
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium hover:bg-canvas",
                    isActive && "bg-blue-tint text-blue",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
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
