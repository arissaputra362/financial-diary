import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { BootSignal } from "@/components/layout/BootSignal";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Financial Diary",
  description:
    "Catat pemasukan, pengeluaran, dan tujuan menabung keluarga dalam satu tempat.",
  applicationName: "Financial Diary",
  icons: {
    icon: "/logo.svg",
    apple: "/icon-192.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Financial Diary",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1F5FA" },
    { media: "(prefers-color-scheme: dark)", color: "#111B26" },
  ],
};

const THEME_BOOTSTRAP = `(function () {
  var storageKey = "financial-diary-theme";
  var eventName = "financial-diary:theme-change";
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  var preference = "system";

  function readPreference() {
    try {
      var value = window.localStorage.getItem(storageKey);
      return value === "light" || value === "dark" ? value : "system";
    } catch {
      return "system";
    }
  }

  function applyTheme(event) {
    var requested = event && event.detail;
    preference = requested === "system" || requested === "light" || requested === "dark"
      ? requested
      : readPreference();
    var resolved = preference === "system"
      ? (media.matches ? "dark" : "light")
      : preference;
    root.dataset.theme = preference;
    root.dataset.colorScheme = resolved;
    var themeColor = resolved === "dark" ? "#111B26" : "#F1F5FA";
    var themeColorTags = document.querySelectorAll('meta[name="theme-color"]');
    for (var index = 0; index < themeColorTags.length; index += 1) {
      themeColorTags[index].setAttribute("content", themeColor);
    }
  }

  applyTheme();
  window.addEventListener(eventName, applyTheme);
  window.addEventListener("storage", function (event) {
    if (event.key === storageKey || event.key === null) applyTheme();
  });
  if (media.addEventListener) {
    media.addEventListener("change", function () {
      if (preference === "system") applyTheme();
    });
  } else if (media.addListener) {
    media.addListener(function () {
      if (preference === "system") applyTheme();
    });
  }
})();`;

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
    <html
      lang="id"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
        <BootSignal />
        <div
          id="boot-fallback"
          hidden
          role="alert"
          className="fixed inset-x-4 bottom-6 z-50 rounded-2xl border border-danger-border bg-danger-bg p-4 text-sm text-danger shadow-bento"
        >
          <p className="font-semibold">Aplikasi belum selesai dimuat.</p>
          <p className="mt-1 text-danger">
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
