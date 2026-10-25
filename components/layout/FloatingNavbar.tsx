"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Coins, LayoutDashboard, PiggyBank, Plus, ReceiptText, User, Users, Wallet } from "lucide-react";
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
  { href: "/home", label: "Beranda", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/gold", label: "Emas", icon: Coins },
  { href: "/transactions", label: "Aktivitas", icon: ReceiptText, matchPrefix: "/transactions" },
  { href: "/family", label: "Keluarga", icon: Users },
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
        className="flex w-full max-w-4xl items-center justify-between gap-2 rounded-full border border-white/10 bg-[#14273F]/95 px-3 py-2 text-white shadow-floating-nav backdrop-blur-md lg:px-4"
      >
        <Link
          href="/home"
          className="flex shrink-0 items-center gap-2 rounded-full px-1 py-1 lg:px-2"
          aria-label="Beranda Catatan Keluarga"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DCEBFA] text-[#14273F]"
          >
            <Wallet className="h-4 w-4" />
          </span>
          <span className="hidden whitespace-nowrap text-base font-bold tracking-tight lg:inline">
            Catatan Keluarga
          </span>
        </Link>

        <div className="flex items-center gap-0.5 lg:gap-1">
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
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-sm transition-colors lg:px-4",
                  isActive
                    ? "bg-[#DCEBFA] font-medium text-[#14273F]"
                    : "text-white/60 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/transactions?add=1"
            onClick={openAddIntent}
            aria-label="Tambah transaksi"
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#166534] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#155C30]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">Tambah transaksi</span>
            <span className="lg:hidden">Tambah</span>
          </Link>
          <Link
            href="/profile"
            aria-label="Buka profil kamu"
            className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/20 bg-[#1D4F87] text-xs font-bold text-white"
          >
            <User className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
