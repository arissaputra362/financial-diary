import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Financial Diary",
    short_name: "Financial Diary",
    description: "Catat pemasukan, pengeluaran, dan tujuan menabung keluarga.",
    start_url: "/transactions",
    display: "standalone",
    background_color: "#F6F9FC",
    theme_color: "#17304F",
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
