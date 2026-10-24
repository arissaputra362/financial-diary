import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { BootSignal } from "@/components/layout/BootSignal";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Catatan Keuangan Keluarga",
  description:
    "Catat pemasukan, pengeluaran, dan tujuan menabung keluarga dalam satu tempat.",
  applicationName: "Catatan Keuangan Keluarga",
  icons: {
    icon: "/logo.svg",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Keuangan Keluarga",
  },
};

/*
  Runs as a plain classic script, so it still works when the React bundle never
  boots. It reveals a reload prompt instead of leaving the splash text forever.
*/
const BOOT_WATCHDOG = `(function () {
  var graceMs = 12000;
  var startedAt = Date.now();
  var timer = setInterval(function () {
    var fallback = document.getElementById("boot-fallback");
    if (!fallback) return;
    if (document.documentElement.dataset.appReady === "true") {
      fallback.hidden = true;
      clearInterval(timer);
      return;
    }
    if (!fallback.hidden || Date.now() - startedAt < graceMs) return;
    var button = fallback.querySelector("button");
    if (button) button.addEventListener("click", function () { window.location.reload(); });
    fallback.hidden = false;
  }, 1000);
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-[#17304F]">
        {children}
        <BootSignal />
        <div
          id="boot-fallback"
          hidden
          role="alert"
          className="fixed inset-x-4 bottom-6 z-50 rounded-2xl border border-[#F3C2C2] bg-[#FDECEC] p-4 text-sm text-[#B91C1C] shadow-bento"
        >
          <p className="font-semibold">Aplikasi belum selesai dimuat.</p>
          <p className="mt-1 text-[#B91C1C]">
            Periksa koneksi, lalu muat ulang halaman.
          </p>
          <button
            type="button"
            className="mt-2 inline-block font-semibold underline"
          >
            Muat ulang halaman
          </button>
        </div>
        <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
      </body>
    </html>
  );
}
