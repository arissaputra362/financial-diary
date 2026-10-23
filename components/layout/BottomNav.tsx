"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, PiggyBank, Plus, ReceiptText, Users } from "lucide-react";
import { requestTransactionAddIntent } from "@/lib/transaction-add-intent";
import { cn } from "@/lib/utils";

/*
  Final mobile navigation (T-005, A-27/A-31; visual refresh T-010): bottom bar
  only below 768px. The center "Tambah" is an action that opens the existing add
  sheet on /transactions, not a page of its own. Tablet and desktop use
  FloatingNavbar, so exactly one navigation system is visible per breakpoint
  (AC-F2-10). Destinations, `matchPrefix`, and the `?add=1` action are unchanged.
*/

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Matches child routes (for example /transactions?add=1). */
  matchPrefix?: string;
};

const items: NavItem[] = [
  { href: "/home", label: "Beranda", icon: LayoutDashboard },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/transactions?add=1", label: "Tambah", icon: Plus },
  { href: "/transactions", label: "Aktivitas", icon: ReceiptText, matchPrefix: "/transactions" },
  { href: "/family", label: "Keluarga", icon: Users },
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  /*
    On the Activity page the Add action delivers the intent synchronously to
    the mounted sheet, so an immediate reopen works even while the close's
    `router.replace` is still pending (AC-F3-14). Before that listener exists
    (hydration) it falls back to the existing deep link, keeping the current
    month/Trash query. Elsewhere the plain deep link is unchanged.
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
    <nav
      aria-label="Navigasi utama"
      data-nav="bottom"
      className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 gap-1 rounded-full border border-white/10 bg-[#14273F]/95 p-2 text-white shadow-floating-nav backdrop-blur-md md:hidden"
    >
      {items.map((item) => {
        const isAdd = item.href.includes("add=1");
        const isActive =
          !isAdd &&
          (item.matchPrefix
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
                ? "mx-auto -mt-5 h-14 w-14 justify-self-center bg-[#166534] text-white shadow-pill hover:bg-[#155C30]"
                : isActive
                  ? "bg-[#DCEBFA] font-medium text-[#14273F]"
                  : "text-white/60 hover:text-white",
            )}
          >
            <Icon className={cn(isAdd ? "h-6 w-6" : "h-4 w-4")} aria-hidden="true" />
            <span>{isAdd ? "Tambah" : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
