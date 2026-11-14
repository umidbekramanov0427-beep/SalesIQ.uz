import { useMemo, useState } from "react";
import { Bot, Coins, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, SettingRow, SettingRows } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import {
  useCreateFineType,
  useDeleteFineType,
  useFineTypes,
  useProfilesRaw,
  useUpdateFineType,
  type FineTypeRow,
} from "@/hooks/use-crm-data";
import { FINE_RULES } from "@/lib/control-settings";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { NumberField, SaveBar, fieldCls, useControlDraft } from "./SettingsKit";

// Nazorat → Jarimalar → Sozlash: the fine types (amount, the automatic rule
// each follows, who it applies to), and how the daily computation runs (on
// or off, a monthly limit per person, telling the person).

const RULE_KEY: Record<(typeof FINE_RULES)[number], string> = {
  "Ishlanmagan yangi lid": "unworked",
  "Bajarilmagan zadacha": "overdue",
  "Noto'g'ri LOST": "lost",
  "Javobsiz kiruvchi aloqa": "unanswered",
};

export function FinesSettings() {
  const { t } = useI18n();
  const { draft, setDraft, dirty, save, reset, saving } = useControlDraft();
  const f = draft.fines;
  const setF = (patch: Partial<typeof f>) =>
    setDraft((d) => ({ ...d, fines: { ...d.fines, ...patch } }));

  return (
    <div className="space-y-5">
      <FineTypesCard autoOn={f.auto} />

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={Bot}
          tone="sky"
          title={t("ctl.fine.autoTitle")}
          description={t("ctl.fine.autoDesc")}
        >
          <SettingRows>
            <SettingRow title={t("ctl.fine.auto")} description={t("ctl.fine.autoHint")}>
              <Switch
                checked={f.auto}
                onCheckedChange={(v) => setF({ auto: v })}
                aria-label={t("ctl.fine.auto")}
              />
            </SettingRow>
            <SettingRow title={t("ctl.fine.cap")} description={t("ctl.fine.capDesc")}>
              <NumberField
                value={f.monthlyCap}
                placeholder={t("ctl.fine.noCap")}
                onChange={(v) => setF({ monthlyCap: v || null })}
              />
            </SettingRow>
            <SettingRow title={t("ctl.fine.notify")} description={t("ctl.fine.notifyDesc")}>
              <Switch
                checked={f.notifyPerson}
                onCheckedChange={(v) => setF({ notifyPerson: v })}
                aria-label={t("ctl.fine.notify")}
              />
            </SettingRow>
          </SettingRows>
        </SectionCard>

        <SectionCard
          icon={ShieldCheck}
          tone="emerald"
          title={t("ctl.fine.rulesTitle")}
          description={t("ctl.fine.rulesDesc")}
        >
          <ul className="space-y-2.5">
            {FINE_RULES.map((r) => (
              <li key={r} className="rounded-xl bg-surface px-3.5 py-2.5">
                <p className="text-[13px] font-semibold text-foreground">
                  {t(`ctl.fine.rule.${RULE_KEY[r]}`)}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
                  {t(`ctl.fine.rule.${RULE_KEY[r]}Desc`)}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />
    </div>
  );
}

function FineTypesCard({ autoOn }: { autoOn: boolean }) {
  const { t } = useI18n();
  const { data: types, isLoading } = useFineTypes();
  const create = useCreateFineType();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [rule, setRule] = useState<string>("");

  async function add() {
    if (name.trim().length < 2) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        default_amount: amount,
        rule_key: rule || null,
        color: "slate",
        position: (types ?? []).length,
      } as never);
      setName("");
      setAmount(null);
      setRule("");
      toast.success(t("ctl.saved"));
    } catch (err) {
      toast.error(describeError(err, t("ctl.saveFailed")));
    }
  }

  return (
    <SectionCard
      icon={Coins}
      tone="rose"
      title={t("ctl.fine.typesTitle")}
      description={t("ctl.fine.typesDesc")}
    >
      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : (
        <div className="space-y-2.5">
          {(types ?? []).map((ft) => (
            <FineTypeRowEditor key={ft.id} ft={ft} autoOn={autoOn} />
          ))}
          {!(types ?? []).length && (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("fines.noTypes")}</p>
          )}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("ctl.fine.newName")}
          className={cn(fieldCls, "min-w-[200px] flex-1")}
        />
        <NumberField value={amount} placeholder={t("ctl.fine.amount")} onChange={setAmount} />
        <RuleSelect value={rule} onChange={setRule} />
        <button
          type="button"
          disabled={name.trim().length < 2 || create.isPending}
          onClick={() => void add()}
          className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {t("ctl.fine.add")}
        </button>
      </div>
    </SectionCard>
  );
}

function RuleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(fieldCls, "min-w-[210px]")}
      aria-label={t("ctl.fine.rule")}
    >
      <option value="">{t("ctl.fine.manual")}</option>
      {FINE_RULES.map((r) => (
        <option key={r} value={r}>
          {t(`ctl.fine.rule.${RULE_KEY[r]}`)}
        </option>
      ))}
    </select>
  );
}

function FineTypeRowEditor({ ft, autoOn }: { ft: FineTypeRow; autoOn: boolean }) {
  const { t } = useI18n();
  const update = useUpdateFineType();
  const remove = useDeleteFineType();
  const { data: profiles } = useProfilesRaw();
  const positions = useMemo(
    () =>
      [...new Set((profiles ?? []).map((p) => p.position).filter((x): x is string => !!x))].sort(),
    [profiles],
  );
  const [amount, setAmount] = useState<number | null>(ft.default_amount);
  const ruleKey = ft.rule_key ?? "";
  const targets = ft.target_positions ?? [];

  const patch = (p: Partial<FineTypeRow>) =>
    update.mutate(
      { id: ft.id, patch: p },
      { onError: (err) => toast.error(describeError(err, t("ctl.saveFailed"))) },
    );

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[160px] flex-1 text-[14px] font-semibold text-foreground">
          {ft.name}
        </span>
        <NumberField value={amount} placeholder={t("ctl.fine.amount")} onChange={setAmount} />
        {amount !== ft.default_amount && (
          <button
            type="button"
            onClick={() => patch({ default_amount: amount })}
            className="ctl-lit h-10 rounded-xl px-3 text-[12.5px] font-semibold"
          >
            {t("common.save")}
          </button>
        )}
        <RuleSelect value={ruleKey} onChange={(v) => patch({ rule_key: v || null })} />
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Switch
            checked={ft.auto && !!ruleKey}
            disabled={!ruleKey || !autoOn}
            onCheckedChange={(v) => patch({ auto: v })}
            aria-label={t("ctl.fine.autoOne")}
          />
          {t("ctl.fine.autoOne")}
        </label>
        <button
          type="button"
          aria-label={t("common.delete")}
          onClick={() => {
            if (window.confirm(t("ctl.fine.deleteConfirm", { name: ft.name })))
              remove.mutate(ft.id, {
                onError: (err) => toast.error(describeError(err, t("ctl.saveFailed"))),
              });
          }}
          className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {positions.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-muted-foreground">{t("ctl.fine.whom")}</span>
          <button
            type="button"
            aria-pressed={!targets.length}
            onClick={() => patch({ target_positions: null })}
            className={cn(
              "h-7 rounded-lg px-2.5 text-[12px] font-semibold",
              !targets.length ? "ctl-lit" : "ctl-soft",
            )}
          >
            {t("ctl.fine.everyone")}
          </button>
          {positions.map((pos) => {
            const on = targets.includes(pos);
            return (
              <button
                key={pos}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? targets.filter((x) => x !== pos) : [...targets, pos];
                  patch({ target_positions: next.length ? next : null });
                }}
                className={cn(
                  "h-7 rounded-lg px-2.5 text-[12px] font-semibold",
                  on ? "ctl-lit" : "ctl-soft",
                )}
              >
                {pos}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
