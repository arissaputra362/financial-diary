"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep the real error in the console for debugging, show friendly copy.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
      <Card className="w-full text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[#17304F]">
          Ada yang tidak berjalan lancar
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#46597A]">
          Halaman ini gagal dimuat. Coba muat ulang, kalau masih gagal tunggu
          beberapa saat lalu coba lagi.
        </p>
        <div className="mt-5 flex justify-center">
          <Button onClick={reset}>Coba lagi</Button>
        </div>
      </Card>
    </div>
  );
}
