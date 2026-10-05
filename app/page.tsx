import { AppShell } from "@/components/layout/AppShell";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function HomePage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="px-1">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Catatan keuangan keluarga
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Selamat datang
          </h1>
        </div>

        <Card variant="peach">
          <h2 className="text-lg font-semibold text-slate-900">
            Mulai catat keuangan keluarga
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-700">
            Ringkasan saldo, grafik pengeluaran, dan aktivitas terbaru akan
            muncul di sini setelah kamu mencatat transaksi pertama.
          </p>
        </Card>

        <EmptyState
          title="Belum ada transaksi"
          description="Setelah kamu mencatat pemasukan atau pengeluaran, ringkasannya akan tampil di halaman ini."
        />
      </div>
    </AppShell>
  );
}
