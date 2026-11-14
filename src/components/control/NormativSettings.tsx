import { useMemo, useState } from "react";
import { Filter, Gauge, Loader2, Target, Users } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, SettingRow, SettingRows } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import {
  useOrgWorkSchedule,
  usePipelines,
  useProfilesRaw,
  useUpdateProfile,
} from "@/hooks/use-crm-data";
import { workDaysInMonth } from "@/lib/control-settings";
import { monthKey } from "@/lib/sales-plan";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { Choice, NumberField, SaveBar, useControlDraft } from "./SettingsKit";

// Nazorat → Normativ → Sozlash: each person's daily and monthly norm, the
// limits between «Rejada», «Xavf ostida» and «Ortda», and what counts.

export function NormativSettings() {
  const { t } = useI18n();
  const { draft, setDraft, dirty, save, reset, saving } = useControlDraft();
  const n = draft.normativ;
  const setN = (patch: Partial<typeof n>) =>
    setDraft((d) => ({ ...d, normativ: { ...d.normativ, ...patch } }));
  const { data: pipelines } = usePipelines();
  const funnels = (pipelines ?? []).filter((p) => !p.archived_at);

  return (
    <div className="space-y-5">
      <NormsCard deals={n.basis === "deals"} />

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={Gauge}
          tone="amber"
          title={t("ctl.norm.limitsTitle")}
          description={t("ctl.norm.limitsDesc")}
        >
          <div className="mb-4 overflow-hidden rounded-xl border border-border">
            <div className="flex h-9 text-[12px] font-semibold">
              <span
                className="grid place-items-center bg-rose-500/15 text-rose-700 dark:text-rose-300"
                style={{ width: `${Math.min(100, n.atRisk) / 1.5}%` }}
              >
                {t("normatives.status.behind")}
              </span>
              <span
                className="grid place-items-center bg-amber-500/15 text-amber-700 dark:text-amber-300"
                style={{ width: `${Math.max(0, Math.min(150, n.onTrack) - n.atRisk) / 1.5}%` }}
              >
                {t("normatives.status.atRisk")}
              </span>
              <span className="grid flex-1 place-items-center bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                {t("normatives.status.onTrack")}
              </span>
            </div>
          </div>
          <SettingRows>
            <SettingRow title={t("ctl.norm.onTrack")} description={t("ctl.norm.onTrackDesc")}>
              <NumberField
                value={n.onTrack}
                min={1}
                max={200}
                suffix="%"
                onChange={(v) => setN({ onTrack: v ?? 90, atRisk: Math.min(n.atRisk, v ?? 90) })}
              />
            </SettingRow>
            <SettingRow title={t("ctl.norm.atRisk")} description={t("ctl.norm.atRiskDesc")}>
              <NumberField
                value={n.atRisk}
                min={0}
                max={n.onTrack}
                suffix="%"
                onChange={(v) => setN({ atRisk: v ?? 60 })}
              />
            </SettingRow>
          </SettingRows>
        </SectionCard>

        <SectionCard
          icon={Filter}
          tone="sky"
          title={t("ctl.norm.countTitle")}
          description={t("ctl.norm.countDesc")}
        >
          <SettingRows>
            <SettingRow title={t("ctl.norm.basis")} description={t("ctl.norm.basisDesc")}>
              <Choice
                value={n.basis}
                onChange={(v) => setN({ basis: v })}
                options={[
                  { value: "revenue", label: t("ctl.norm.basisRevenue") },
                  { value: "deals", label: t("ctl.norm.basisDeals") },
                ]}
              />
            </SettingRow>
            <SettingRow title={t("ctl.norm.funnels")} description={t("ctl.norm.funnelsDesc")}>
              <div className="flex max-w-[420px] flex-wrap justify-end gap-1.5">
                <button
                  type="button"
                  aria-pressed={!n.pipelineIds.length}
                  onClick={() => setN({ pipelineIds: [] })}
                  className={cn(
                    "h-8 rounded-lg px-3 text-[12.5px] font-semibold",
                    !n.pipelineIds.length ? "ctl-lit" : "ctl-soft",
                  )}
                >
                  {t("ctl.allFunnels")}
                </button>
                {funnels.map((p) => {
                  const on = n.pipelineIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setN({
                          pipelineIds: on
                            ? n.pipelineIds.filter((x) => x !== p.id)
                            : [...n.pipelineIds, p.id],
                        })
                      }
                      className={cn(
                        "h-8 rounded-lg px-3 text-[12.5px] font-semibold",
                        on ? "ctl-lit" : "ctl-soft",
                      )}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </SettingRow>
            <SettingRow title={t("ctl.norm.interns")} description={t("ctl.norm.internsDesc")}>
              <Switch
                checked={n.excludeInterns}
                onCheckedChange={(v) => setN({ excludeInterns: v })}
                aria-label={t("ctl.norm.interns")}
              />
            </SettingRow>
          </SettingRows>
        </SectionCard>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />
    </div>
  );
}

/** Everyone's norms in one table; «Hammaga» fills the same norm for all. */
function NormsCard({ deals }: { deals: boolean }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { data: profiles } = useProfilesRaw();
  const update = useUpdateProfile();
  const team = useMemo(
    () =>
      (profiles ?? [])
        .filter((p) => p.role === "sotuv_menejeri" || p.role === "rop")
        .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "")),
    [profiles],
  );
  const [edits, setEdits] = useState<Record<string, { d: number | null; m: number | null }>>({});
  const [all, setAll] = useState<{ d: number | null; m: number | null }>({ d: null, m: null });
  const [busy, setBusy] = useState(false);
  const unit = deals ? t("ctl.norm.unitDeals") : undefined;
  const { data: schedule } = useOrgWorkSchedule();
  const workDays = Math.max(
    1,
    workDaysInMonth(monthKey(new Date()), schedule?.work_days ?? [1, 2, 3, 4, 5]),
  );

  async function saveRows(
    ids: string[],
    values: (id: string) => { d: number | null; m: number | null },
  ) {
    setBusy(true);
    try {
      for (const id of ids) {
        const v = values(id);
        await update.mutateAsync({
          id,
          patch: { daily_target: v.d, monthly_target: v.m },
        });
      }
      setEdits({});
      toast.success(t("ctl.saved"));
    } catch (err) {
      toast.error(describeError(err, t("ctl.saveFailed")));
    } finally {
      setBusy(false);
    }
  }

  const changed = Object.keys(edits);
  return (
    <SectionCard
      icon={Target}
      tone="violet"
      title={t("ctl.norm.peopleTitle")}
      description={t("ctl.norm.peopleDesc")}
      actions={
        changed.length > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveRows(changed, (id) => edits[id]!)}
            className="ctl-lit inline-flex h-9 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("ctl.norm.saveRows", { n: changed.length })}
          </button>
        ) : undefined
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface px-4 py-3">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-[13px] font-semibold">{t("ctl.norm.forAll")}</span>
        <NumberField
          value={all.d}
          placeholder={t("ctl.norm.daily")}
          suffix={unit}
          onChange={(v) => setAll((a) => ({ ...a, d: v }))}
        />
        <NumberField
          value={all.m}
          placeholder={t("ctl.norm.monthly")}
          suffix={unit}
          onChange={(v) => setAll((a) => ({ ...a, m: v }))}
        />
        <button
          type="button"
          disabled={busy || (all.d == null && all.m == null) || !team.length}
          onClick={() =>
            void saveRows(
              team.map((p) => p.id),
              (id) => {
                const p = team.find((x) => x.id === id)!;
                return { d: all.d ?? p.daily_target, m: all.m ?? p.monthly_target };
              },
            )
          }
          className="ctl-soft inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {t("ctl.norm.applyAll")}
        </button>
      </div>
      {!team.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("normatives.noEmployees")}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-semibold">{t("normatives.colEmployee")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ctl.norm.daily")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ctl.norm.monthly")}</th>
                <th className="py-2 font-semibold">{t("ctl.norm.perDayHint", { n: workDays })}</th>
              </tr>
            </thead>
            <tbody>
              {team.map((p) => {
                const e = edits[p.id];
                const d = e ? e.d : p.daily_target;
                const m = e ? e.m : p.monthly_target;
                const set = (patch: Partial<{ d: number | null; m: number | null }>) =>
                  setEdits((x) => ({ ...x, [p.id]: { d, m, ...patch } }));
                return (
                  <tr
                    key={p.id}
                    className={cn("border-b border-border last:border-0", e && "bg-primary/5")}
                  >
                    <td className="py-2.5 pr-3 font-semibold text-foreground">
                      {p.full_name || p.email}
                      {p.is_intern && (
                        <span className="ml-2 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                          {t("ctl.norm.intern")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <NumberField value={d} suffix={unit} onChange={(v) => set({ d: v })} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <NumberField value={m} suffix={unit} onChange={(v) => set({ m: v })} />
                    </td>
                    <td className="py-2.5 text-[12.5px] tabular-nums text-muted-foreground">
                      {m
                        ? deals
                          ? `≈ ${Math.ceil(m / workDays)}`
                          : `≈ ${format(Math.round(m / workDays))}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
