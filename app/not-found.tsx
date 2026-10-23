import Link from "next/link";
import { FileQuestion } from "lucide-react";
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
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#DCEBFA] text-[#1D4F87]"
        >
          <FileQuestion className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[#17304F]">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[#46597A]">
          Alamat yang kamu buka tidak ada atau sudah dipindahkan. Kembali ke
          Beranda untuk melanjutkan.
        </p>
        <div className="mt-5 flex justify-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#166534] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#155C30] active:scale-[0.98]"
          >
            Kembali ke Beranda
          </Link>
        </div>
      </Card>
    </div>
  );
}
