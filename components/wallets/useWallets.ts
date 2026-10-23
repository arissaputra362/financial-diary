"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import type { WalletDTO } from "@/types/api";

export type WalletView = "active" | "archived" | "all";

/**
 * Loads wallets for a view (`GET /api/wallets?view=`), exposing the loading /
 * error / empty states the wallet UI renders (AC-F6-12). Balances are
 * server-computed; the hook never derives them (AC-F6-7).
 */
export function useWallets(view: WalletView = "active") {
  const [wallets, setWallets] = useState<WalletDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<{ wallets: WalletDTO[] }>(`/api/wallets?view=${view}`)
      .then((response) => {
        if (!active) return;
        if (response.status === 401) {
          setError("Sesi berakhir. Masuk lagi untuk melihat dompet.");
          return;
        }
        if (!response.ok) {
          setError(response.data?.error?.message ?? "Dompet belum bisa dimuat.");
          return;
        }
        setWallets(response.data?.wallets ?? []);
        setError(null);
      })
      .catch(() => {
        if (active) setError("Dompet belum bisa dimuat. Periksa koneksimu lalu coba lagi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [view, reloadToken]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  return { wallets, setWallets, loading, error, reload };
}
