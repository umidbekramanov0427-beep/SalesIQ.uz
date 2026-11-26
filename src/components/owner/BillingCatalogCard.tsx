// Platforma -> Sozlamalar -> To'lovlar: the Hisob va to'lov price list every
// company's /billing page uses (CRM per seat, each module, the payment fee),
// and a balance correction for one company (a bank transfer by contract).
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Tags, Wallet } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { useOrganizations } from "@/hooks/use-crm-data";
import {
  BILLING_MODULES,
  PER_SEAT_MODULES,
  parseCatalog,
  type BillingCatalog,
} from "@/lib/billing-catalog";

const input =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] tabular-nums outline-none focus:border-primary";

function useCatalog() {
  return useQuery({
    queryKey: ["billing_catalog"],
    queryFn: async (): Promise<BillingCatalog> => {
      const res = await apiFetch("/platform/billing-catalog");
      return parseCatalog(res.ok ? await res.json() : {});
    },
  });
}

async function post(body: unknown) {
  const res = await apiFetch("/platform/billing-catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string; balance?: number };
  if (!res.ok) throw new Error(j.error || "Xatolik");
  return j;
}

export function BillingCatalogCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useCatalog();
  const [c, setC] = useState<BillingCatalog | null>(null);
  useEffect(() => {
    if (data && !c) setC(data);
  }, [data, c]);
  const save = useMutation({
    mutationFn: (catalog: BillingCatalog) => post({ catalog }),
    onSuccess: () => {
      toast.success(t("common.saved"));
      void qc.invalidateQueries({ queryKey: ["billing_catalog"] });
      void qc.invalidateQueries({ queryKey: ["billing_wallet"] });
    },
    onError: (e) => toast.error(describeError(e, t("common.saveFailed"))),
  });

  if (!c)
    return (
      <SectionCard icon={Tags} tone="emerald" title={t("billing.cat.title")}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </SectionCard>
    );

  const n = (v: string) => Math.max(0, Number(v.replace(/\s/g, "")) || 0);
  const setMod = (m: (typeof BILLING_MODULES)[number], k: "monthly" | "setup", v: string) =>
    setC({ ...c, modules: { ...c.modules, [m]: { ...c.modules[m], [k]: n(v) } } });

  return (
    <SectionCard
      icon={Tags}
      tone="emerald"
      title={t("billing.cat.title")}
      description={t("billing.cat.desc")}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["crmSeat", "billing.cat.crmSeat"],
            ["commissionPct", "billing.cat.commission"],
            ["minTopup", "billing.cat.minTopup"],
            ["maxSeats", "billing.cat.maxSeats"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">{t(label)}</span>
            <input
              className={input}
              inputMode="decimal"
              value={String(c[k])}
              onChange={(e) => setC({ ...c, [k]: n(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-surface text-left text-[11.5px] text-muted-foreground">
              <th className="px-3 py-2 font-semibold">{t("billing.cat.module")}</th>
              <th className="px-3 py-2 font-semibold">{t("billing.cat.monthly")}</th>
              <th className="px-3 py-2 font-semibold">{t("billing.cat.setupFee")}</th>
            </tr>
          </thead>
          <tbody>
            {BILLING_MODULES.map((m) => (
              <tr key={m} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <span className="font-medium text-foreground">{t(`billing.mod.${m}`)}</span>
                  {PER_SEAT_MODULES.has(m) && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {t("billing.perSeat")}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <input
                    className={input}
                    inputMode="numeric"
                    value={String(c.modules[m].monthly)}
                    onChange={(e) => setMod(m, "monthly", e.target.value)}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    className={input}
                    inputMode="numeric"
                    value={String(c.modules[m].setup)}
                    onChange={(e) => setMod(m, "setup", e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <Button disabled={save.isPending} onClick={() => save.mutate(c)}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </SectionCard>
  );
}

export function BalanceAdjustCard() {
  const { t } = useI18n();
  const { data: orgs } = useOrganizations();
  const [orgId, setOrgId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const adjust = useMutation({
    mutationFn: () =>
      post({ action: "adjust", orgId, amount: Number(amount.replace(/\s/g, "")), note }),
    onSuccess: (r) => {
      toast.success(t("billing.cat.adjusted", { n: String(r.balance ?? 0) }));
      setAmount("");
      setNote("");
    },
    onError: (e) => toast.error(describeError(e, t("billing.failed"))),
  });
  return (
    <SectionCard
      icon={Wallet}
      tone="sky"
      title={t("billing.cat.adjustTitle")}
      description={t("billing.cat.adjustDesc")}
    >
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_160px_minmax(0,1fr)_auto] sm:items-end">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("billing.cat.company")}
          </span>
          <select className={input} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">—</option>
            {(orgs ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("billing.cat.amount")}
          </span>
          <input
            className={input}
            inputMode="numeric"
            placeholder="+500000 / -100000"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d\s-]/g, ""))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("billing.cat.note")}
          </span>
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <Button
          variant="outline"
          disabled={!orgId || !Number(amount.replace(/\s/g, "")) || adjust.isPending}
          onClick={() => adjust.mutate()}
        >
          {adjust.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("billing.cat.apply")}
        </Button>
      </div>
    </SectionCard>
  );
}
