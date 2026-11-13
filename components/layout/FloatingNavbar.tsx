"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Coins, House, PiggyBank, Plus, Receipt, Target, User, Users, Wallet } from "@phosphor-icons/react";
import { Sprout } from "lucide-react";
import { requestTransactionAddIntent } from "@/lib/transaction-add-intent";
import { cn } from "@/lib/utils";

/*
  Final tablet/desktop navigation (T-005, A-27/A-31; visual refresh T-010): the
  top floating bar shows from 768px up, so tablet and desktop share one nav and
  the mobile bottom bar stays hidden (AC-F2-10). Destinations match the bottom
  bar; "Tambah transaksi" is an action pill that opens the add sheet on
  /transactions. The avatar is the only profile entry, not a text tab.
*/

const navItems = [
  { href: "/home", label: "Beranda", icon: House },
  { href: "/transactions", label: "Aktivitas", icon: Receipt, matchPrefix: "/transactions" },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/gold", label: "Emas", icon: Coins },
  { href: "/family", label: "Keluarga", icon: Users },
  { href: "/goals", label: "Tabungan", icon: Target },
] as const;

export function FloatingNavbar() {
  const pathname = usePathname();
  const router = useRouter();

  /*
    Keep the current month/Trash view when Add is pressed on Activity and hand
    the intent to the mounted sheet synchronously, so a reopen during the close
    transition is never lost (AC-F3-14). Before that listener exists, fall back
    to the existing deep link.
  */
  const openAddIntent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname !== "/transactions") return;
    event.preventDefault();
    if (requestTransactionAddIntent()) return;
    const params = new URLSearchParams(window.location.search);
    params.set("add", "1");
    router.push(`/transactions?${params.toString()}`);
  };

  return (
    <header className="fixed inset-x-0 top-4 z-50 hidden justify-center px-4 md:flex">
      <nav
        aria-label="Navigasi utama"
        data-nav="top"
        className="flex w-full max-w-6xl items-center gap-2 overflow-hidden rounded-2xl border border-white/10 bg-navy px-3 py-2 text-white shadow-floating-nav lg:px-4"
      >
        <Link
          href="/home"
          className="flex shrink-0 items-center gap-2 rounded-xl px-1 py-1 lg:px-2"
          aria-label="Beranda Financial Diary"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-mint text-green"
          >
            <Sprout className="h-[18px] w-[18px]" />
          </span>
          <span className="hidden whitespace-nowrap text-base font-bold tracking-tight xl:inline">
            FinDiary
          </span>
        </Link>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 overflow-hidden lg:gap-1">
          {navItems.map((item) => {
            const isActive =
              "matchPrefix" in item && item.matchPrefix
                ? pathname.startsWith(item.matchPrefix)
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm transition-colors lg:px-3 xl:px-4",
                  isActive
                    ? "bg-mint font-medium text-green"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon weight="fill" size={18} className="shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap max-xl:hidden">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/transactions?add=1"
            onClick={openAddIntent}
            aria-label="Tambah transaksi"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-brand-green px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-green-hover xl:px-4"
          >
            <Plus weight="bold" size={18} className="shrink-0" aria-hidden="true" />
            <span className="hidden xl:inline">Tambah transaksi</span>
          </Link>
          <Link
            href="/profile"
            aria-label="Buka profil kamu"
            className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-mint text-xs font-bold text-green"
          >
            <User weight="fill" size={18} aria-hidden="true" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
