import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Financial Diary",
    short_name: "Financial Diary",
    description: "Catat pemasukan, pengeluaran, dan tujuan menabung keluarga.",
    start_url: "/transactions",
    display: "standalone",
    // Native PWA splash screens use one manifest color. Match the light canvas;
    // browser chrome follows the media-aware theme-color metadata in layout.tsx.
    background_color: "#F1F5FA",
    theme_color: "#F1F5FA",
    lang: "id",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/logo.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
