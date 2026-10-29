import { useEffect, useMemo, useState } from "react";
import { Copy, CreditCard, Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, StatusChip } from "@/components/layout/Primitives";
import {
  usePaymentMerchant,
  usePipelineStagesRaw,
  useSavePaymentMerchant,
  type PaymentMerchantPatch,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";

// /integrations/payments: the company's own Payme / Click cashbox for
// payments from its clients (payment links from the lead card), and the
// stage a lead moves to once paid. Keys are write-only: the page only
// knows whether one is saved.

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">
          {value}
        </code>
        <button
          type="button"
          aria-label={t("tma.copy")}
          onClick={() => {
            void copyText(value).then(
              () => toast.success(t("tma.copied")),
              () => toast.error(t("common.copyFailed")),
            );
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  secret,
  saved,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secret?: boolean;
  saved?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <input
        type={secret ? "password" : "text"}
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={secret && saved ? t("lpay.keySaved") : ""}
        className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
      />
    </label>
  );
}

export function PaymentsCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const { data, isLoading } = usePaymentMerchant();
  const { data: stages = [] } = usePipelineStagesRaw();
  const save = useSavePaymentMerchant();

  const [payme, setPayme] = useState({ id: "", key: "" });
  const [click, setClick] = useState({ service: "", merchant: "", key: "" });
  const [paidStages, setPaidStages] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data) return;
    setPayme({ id: data.paymeMerchantId, key: "" });
    setClick({ service: data.clickServiceId, merchant: data.clickMerchantId, key: "" });
    setPaidStages(data.paidStages);
  }, [data]);

  // The company's own funnels (amoCRM / Bitrix24 ones are analytics-only).
  const funnels = useMemo(() => {
    const own = stages.filter((s) => !s.amocrm_pipeline_id && !s.bitrix24_category_id);
    const map = new Map<string, typeof own>();
    for (const s of own) {
      const k = s.pipeline_name ?? "";
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return [...map.entries()].map(([name, list]) => ({
      name,
      stages: [...list].sort((a, b) => a.position - b.position),
    }));
  }, [stages]);

  async function submit() {
    const patch: PaymentMerchantPatch = {
      paymeMerchantId: payme.id,
      clickServiceId: click.service,
      clickMerchantId: click.merchant,
      paidStages,
    };
    if (payme.key) patch.paymeKey = payme.key;
    if (click.key) patch.clickKey = click.key;
    try {
      await save.mutateAsync(patch);
      toast.success(t("lpay.saved"));
    } catch (err) {
      toast.error(describeError(err, t("lpay.createFailed")));
    }
  }

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard
        icon={CreditCard}
        tone="emerald"
        title="Payme"
        description={t("lpay.paymeDesc")}
        actions={
          <StatusChip state={data.paymeReady ? "ok" : "off"}>
            {data.paymeReady ? t("ig.statusOn") : t("ig.statusOff")}
          </StatusChip>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label={t("lpay.paymeId")}
            value={payme.id}
            disabled={!isAdmin}
            onChange={(v) => setPayme((p) => ({ ...p, id: v }))}
          />
          <Field
            label={t("lpay.paymeKey")}
            value={payme.key}
            secret
            saved={data.paymeKeySet}
            disabled={!isAdmin}
            onChange={(v) => setPayme((p) => ({ ...p, key: v }))}
          />
        </div>
        <div className="mt-3 space-y-2">
          <CopyRow label={t("lpay.paymeEndpoint")} value={data.paymeEndpoint} />
          <p className="text-xs text-muted-foreground">{t("lpay.paymeAccount")}</p>
        </div>
      </SectionCard>

      <SectionCard
        icon={CreditCard}
        tone="sky"
        title="Click"
        description={t("lpay.clickDesc")}
        actions={
          <StatusChip state={data.clickReady ? "ok" : "off"}>
            {data.clickReady ? t("ig.statusOn") : t("ig.statusOff")}
          </StatusChip>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Service ID"
            value={click.service}
            disabled={!isAdmin}
            onChange={(v) => setClick((p) => ({ ...p, service: v }))}
          />
          <Field
            label="Merchant ID"
            value={click.merchant}
            disabled={!isAdmin}
            onChange={(v) => setClick((p) => ({ ...p, merchant: v }))}
          />
          <Field
            label="Secret key"
            value={click.key}
            secret
            saved={data.clickKeySet}
            disabled={!isAdmin}
            onChange={(v) => setClick((p) => ({ ...p, key: v }))}
          />
        </div>
        <div className="mt-3">
          <CopyRow label={t("lpay.clickEndpoint")} value={data.clickEndpoint} />
        </div>
      </SectionCard>

      <SectionCard
        icon={Workflow}
        tone="violet"
        title={t("lpay.stageTitle")}
        description={t("lpay.stageDesc")}
      >
        <div className="space-y-2.5">
          {funnels.map((f) => (
            <div
              key={f.name}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5"
            >
              <span className="min-w-[160px] flex-1 text-sm font-semibold text-foreground">
                {f.name || "—"}
              </span>
              <select
                value={paidStages[f.name] ?? ""}
                disabled={!isAdmin}
                onChange={(e) =>
                  setPaidStages((prev) => {
                    const next = { ...prev };
                    if (e.target.value) next[f.name] = e.target.value;
                    else delete next[f.name];
                    return next;
                  })
                }
                className="h-10 min-w-[220px] rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="">
                  {t("lpay.stageAuto", {
                    stage: f.stages.find((s) => s.is_won && !s.is_lost)?.name ?? "—",
                  })}
                </option>
                {f.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </SectionCard>

      {isAdmin ? (
        <button
          type="button"
          onClick={() => void submit()}
          disabled={save.isPending}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("lpay.save")}
        </button>
      ) : (
        <p className="text-sm text-muted-foreground">{t("lpay.adminOnly")}</p>
      )}
    </div>
  );
}
