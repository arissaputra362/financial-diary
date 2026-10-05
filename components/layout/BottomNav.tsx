"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, User } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Mobile uses one navigation system only: this bottom bar (T-005 acceptance).
  The center "Tambah" action arrives in T-006 together with its modal, so it is
  not rendered here yet (R-26: no dead controls).
  INTERIM: superseded by T-005 — the final 5-item nav (Beranda, Budget, Tambah,
  Aktivitas, Keluarga) is owned by T-005. Only routes that exist today are listed.
*/
const navItems = [
  { href: "/", label: "Beranda", icon: Home }, // INTERIM: superseded by T-005
  { href: "/transactions", label: "Aktivitas", icon: Receipt }, // INTERIM: superseded by T-005
  { href: "/profile", label: "Profil", icon: User }, // INTERIM: superseded by T-005
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-4 bottom-4 z-40 grid grid-cols-3 gap-1 rounded-3xl bg-nav p-2 text-white shadow-floating-nav lg:hidden"
    >
      {navItems.map((item) => {
        const isActive =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition-colors",
              isActive ? "bg-white/15 text-white" : "text-white/60",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
