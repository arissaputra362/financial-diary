import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { GoldPageView } from "@/components/gold/GoldPageView";

export const metadata: Metadata = {
  title: "Tabungan Emas — Financial Diary",
  description:
    "Kelola tabungan logam mulia batangan (Antam, UBS) dan emas perhiasan keluarga. Pantau nilai pasar terkini, laba/rugi, dan catat aset baru secara manual atau lewat pindai foto.",
};

export default function GoldPage() {
  return (
    <AppShell>
      <GoldPageView />
    </AppShell>
  );
}
