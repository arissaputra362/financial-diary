import { AppShell } from "@/components/layout/AppShell";
import { WalletManagementView } from "@/components/wallets/WalletManagementView";

export default function WalletPage() {
  return (
    <AppShell>
      <WalletManagementView />
    </AppShell>
  );
}
