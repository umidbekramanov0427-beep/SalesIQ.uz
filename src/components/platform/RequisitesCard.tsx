import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, StatusChip } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { usePlatformRequisites, useSavePlatformRequisites } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import {
  EMPTY_REQUISITES,
  requisitesReady,
  type Requisites,
} from "@/lib/subscription-billing/documents";
import { describeError } from "@/lib/utils";

type TextKey = Exclude<keyof Requisites, "has_vat" | "vat_rate">;

const FIELDS: { key: TextKey; label: string; wide?: boolean; mono?: boolean }[] = [
  { key: "company_name", label: "inv.nameShort", wide: true },
  { key: "tin", label: "inv.tin", mono: true },
  { key: "vat_reg_code", label: "inv.vatCode", mono: true },
  { key: "account", label: "inv.account", mono: true },
  { key: "bank_mfo", label: "inv.mfo", mono: true },
  { key: "bank_name", label: "bdoc.req.bank" },
  { key: "catalog_code", label: "inv.mxik", mono: true },
  { key: "address", label: "inv.address", wide: true },
  { key: "director", label: "inv.director" },
  { key: "accountant", label: "inv.accountant" },
  { key: "phone", label: "bdoc.req.phone" },
];

// SalesIQ's own legal details: the seller on every subscription invoice,
// act and bill the companies print from Obuna → Hujjatlar.
export function RequisitesCard() {
  const { t } = useI18n();
  const q = usePlatformRequisites();
  const save = useSavePlatformRequisites();
  const [form, setForm] = useState<Requisites>(EMPTY_REQUISITES);
  useEffect(() => {
    if (q.data) setForm(q.data);
  }, [q.data]);

  async function onSave() {
    try {
      await save.mutateAsync(form);
      toast.success(t("bdoc.req.saved"));
    } catch (err) {
      toast.error(
        (err as Error).message === "MIGRATION_PENDING"
          ? t("ref.migrationPending")
          : describeError(err, t("bdoc.req.failed")),
      );
    }
  }

  const ready = q.data ? requisitesReady(q.data) : false;
  return (
    <SectionCard
      icon={Building2}
      tone="slate"
      title={t("bdoc.req.title")}
      description={t("bdoc.req.desc")}
      actions={
        q.data ? (
          <StatusChip state={ready ? "ok" : "warn"}>
            {ready ? t("bdoc.req.ready") : t("bdoc.req.notReady")}
          </StatusChip>
        ) : undefined
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className={f.wide ? "sm:col-span-2 lg:col-span-3" : ""}>
            <span className="text-[13px] font-medium text-muted-foreground">{t(f.label)}</span>
            <input
              value={form[f.key]}
              onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              className={
                "mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-primary/50" +
                (f.mono ? " font-mono tabular-nums" : "")
              }
            />
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2.5 text-sm font-medium text-foreground">
          <Switch
            checked={form.has_vat}
            onCheckedChange={(v) => setForm({ ...form, has_vat: v })}
          />
          {t("bdoc.req.vatPayer")}
        </label>
        {form.has_vat && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            {t("inv.vatRateShort")}
            <input
              type="number"
              min={0}
              max={100}
              value={form.vat_rate}
              onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })}
              className="h-9 w-20 rounded-lg border border-border bg-background px-2 text-sm tabular-nums"
            />
            %
          </label>
        )}
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={save.isPending || !q.data}
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("settings.saveChanges")}
        </button>
      </div>
    </SectionCard>
  );
}
