import { PageHeader } from "@/components/layout/PageHeader";
import { GoalsSection } from "./GoalsSection";

/** Dedicated savings-goal page: list, create, progress, detail, and trash. */
export function GoalsPageView() {
  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Target tabungan"
        description="Pelacak target menabung, terpisah dari saldo dompet."
      />
      <GoalsSection />
    </div>
  );
}
