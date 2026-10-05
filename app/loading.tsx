import { Skeleton } from "@/components/ui/Skeleton";

/** Global loading fallback: a neutral card grid, no fake numbers. */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 lg:pt-24">
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
