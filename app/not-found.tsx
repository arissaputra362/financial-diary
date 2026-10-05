import Link from "next/link";
import { Card } from "@/components/ui/Card";

/*
  Friendly 404 for the whole app. Plain Bahasa Indonesia, one clear way back.
  Uses the shared Card primitive so it matches the Bento surface on the canvas.
*/
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
      <Card className="w-full text-center">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl mx-auto"
        >
          🧭
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          Alamat yang kamu buka tidak ada atau sudah dipindahkan. Kembali ke
          Beranda untuk melanjutkan.
        </p>
        <div className="mt-5 flex justify-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.98]"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </Card>
    </div>
  );
}
