"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/** Global loading fallback: a neutral card grid, no fake numbers. */
export default function Loading() {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setTimedOut(true), 12_000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (timedOut) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 pb-28 pt-6">
        <section className="max-w-md text-center" role="alert">
          <h1 className="text-lg font-semibold text-[#17304F]">Halaman belum merespons</h1>
          <p className="mt-2 text-sm text-[#5D7187]">
            Koneksi ke server terlalu lama. Coba muat ulang halaman.
          </p>
          <button
            type="button"
            className="mt-5 rounded-xl bg-[#17304F] px-4 py-2 text-sm font-semibold text-white"
            onClick={() => window.location.reload()}
          >
            Muat ulang
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:pt-24">
      <span className="sr-only" role="status">
        Sedang memuat halaman
      </span>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Skeleton className="h-56 lg:col-span-7" />
        <Skeleton className="h-56 lg:col-span-5" />
        <Skeleton className="h-40 lg:col-span-12" />
      </div>
    </div>
  );
}
