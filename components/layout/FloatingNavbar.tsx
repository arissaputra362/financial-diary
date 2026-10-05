"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, User } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  Only routes that exist are listed here (R-24). Family and profile pages are
  added in T-004, so they are intentionally absent until those routes ship.
  INTERIM: superseded by T-005 — the final desktop nav (Beranda, Budget,
  Aktivitas, Keluarga + "Tambah transaksi" pill) is owned by T-005.
*/
const navItems = [
  { href: "/", label: "Beranda", icon: Home }, // INTERIM: superseded by T-005
  { href: "/transactions", label: "Aktivitas", icon: Receipt }, // INTERIM: superseded by T-005
] as const;

export function FloatingNavbar() {
  const pathname = usePathname();

  return (
    <header className="fixed inset-x-0 top-4 z-50 hidden justify-center px-4 lg:flex">
      <nav
        aria-label="Navigasi utama"
        className="flex w-full max-w-4xl items-center justify-between rounded-full border border-white/10 bg-nav/90 px-4 py-2.5 text-white shadow-floating-nav backdrop-blur-md"
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full px-2 py-1"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-extrabold text-nav"
          >
            ✦
          </span>
          <span className="text-base font-bold tracking-tight">
            Catatan Keluarga
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-white/15 font-medium text-white"
                    : "text-white/60 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        <Link
          href="/profile"
          aria-label="Buka profil kamu"
          className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/20 bg-violet-600 text-xs font-bold text-white"
        >
          <User className="h-4 w-4" aria-hidden="true" />
        </Link>
      </nav>
    </header>
  );
}
