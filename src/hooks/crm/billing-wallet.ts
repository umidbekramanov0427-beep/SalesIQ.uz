// Hisob va to'lov: the company's balance, price list and history
// (/billing/wallet), and its actions (top up, buy, auto-renew, legal entity).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { BillingCatalog, Cart } from "@/lib/billing-catalog";

export type WalletTxRow = {
  id: string;
  amount: number;
  balanceAfter: number;
  kind: "topup" | "purchase" | "renewal" | "adjust" | "refund";
  provider: string | null;
  note: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
};

export type WalletData = {
  ready: boolean;
  catalog: BillingCatalog;
  wallet: {
    ready: boolean;
    balance: number;
    autoRenew: boolean;
    cart: Cart | null;
    legal: Record<string, string>;
  };
  history: WalletTxRow[];
  staff: number;
  providers: { payme: boolean; click: boolean; paynet: boolean };
};

export function useWallet() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["billing_wallet", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 15_000,
    queryFn: async (): Promise<WalletData | null> => {
      const res = await apiFetch("/billing/wallet");
      if (!res.ok) return null;
      return (await res.json()) as WalletData;
    },
  });
}

export type WalletAction =
  | { action: "topup"; provider: "payme" | "click"; credit: number }
  | { action: "purchase"; cart: Cart }
  | { action: "autoRenew"; on: boolean }
  | { action: "legal"; legal: Record<string, string> };

export function useWalletAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: WalletAction) => {
      const res = await apiFetch("/billing/wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        payUrl?: string;
        amount?: number;
        until?: string;
        total?: number;
      };
      if (!res.ok) throw new Error(j.error || "Xatolik");
      return j;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["billing_wallet"] });
      void qc.invalidateQueries({ queryKey: ["org_modules"] });
    },
  });
}
