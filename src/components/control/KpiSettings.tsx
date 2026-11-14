import { Award, CalendarCheck, Calculator } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { KPI_METRICS, kpiScore, type KpiMetric } from "@/lib/control-settings";
import { useI18n } from "@/lib/i18n";
import { NumberField, SaveBar, TagsField, useControlDraft } from "./SettingsKit";

// Nazorat → KPI → Sozlash: which figures the KPI table shows, each one's
// monthly target and weight (together: the «KPI ball»), and the tags that
// mark a meeting.

/** Each figure's name (i18n key). */
export const KPI_LABEL = Object.fromEntries(
  KPI_METRICS.map((m) => [m, `ctl.kpi.m.${m}`]),
) as Record<KpiMetric, string>;

const WEIGHTS = [0, 1, 2, 3, 4, 5];

export function KpiSettings() {
  const { t } = useI18n();
  const { draft, setDraft, dirty, save, reset, saving } = useControlDraft();
  const k = draft.kpi;
  const setK = (patch: Partial<typeof k>) =>
    setDraft((d) => ({ ...d, kpi: { ...d.kpi, ...patch } }));
  // An example: someone at half of every target.
  const example = kpiScore(Object.fromEntries(KPI_METRICS.map((m) => [m, k.targets[m] / 2])), k);

  return (
    <div className="space-y-5">
      <SectionCard
        icon={Award}
        tone="violet"
        title={t("ctl.kpi.metricsTitle")}
        description={t("ctl.kpi.metricsDesc")}
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[12px] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-semibold">{t("ctl.kpi.metric")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ctl.kpi.show")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ctl.kpi.target")}</th>
                <th className="py-2 font-semibold">{t("ctl.kpi.weight")}</th>
              </tr>
            </thead>
            <tbody>
              {KPI_METRICS.map((m) => (
                <tr key={m} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-3 font-semibold text-foreground">{t(KPI_LABEL[m])}</td>
                  <td className="py-2.5 pr-3">
                    <Switch
                      checked={k.metrics[m]}
                      onCheckedChange={(v) => setK({ metrics: { ...k.metrics, [m]: v } })}
                      aria-label={t(KPI_LABEL[m])}
                    />
                  </td>
                  <td className="py-2.5 pr-3">
                    <NumberField
                      value={k.targets[m] || null}
                      placeholder="—"
                      suffix={m === "conversionPct" ? "%" : undefined}
                      onChange={(v) => setK({ targets: { ...k.targets, [m]: v ?? 0 } })}
                    />
                  </td>
                  <td className="py-2.5">
                    <div role="radiogroup" className="ctl-track inline-flex rounded-xl p-1">
                      {WEIGHTS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          role="radio"
                          aria-checked={k.weights[m] === w}
                          aria-selected={k.weights[m] === w}
                          onClick={() => setK({ weights: { ...k.weights, [m]: w } })}
                          className="ctl-tab h-8 w-8 rounded-lg text-[12.5px] font-semibold tabular-nums"
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={Calculator}
          tone="emerald"
          title={t("ctl.kpi.scoreTitle")}
          description={t("ctl.kpi.scoreDesc")}
        >
          <div className="flex items-center gap-4 rounded-xl bg-surface px-4 py-3">
            <span className="font-display text-[34px] font-bold tabular-nums text-foreground">
              {example ?? "—"}
            </span>
            <p className="text-[13px] leading-snug text-muted-foreground">
              {example == null ? t("ctl.kpi.scoreNone") : t("ctl.kpi.scoreExample")}
            </p>
          </div>
        </SectionCard>
        <SectionCard
          icon={CalendarCheck}
          tone="sky"
          title={t("ctl.kpi.meetingsTitle")}
          description={t("ctl.kpi.meetingsDesc")}
        >
          <TagsField
            value={k.meetingTags}
            onChange={(v) => setK({ meetingTags: v })}
            placeholder={t("ctl.kpi.meetingsPh")}
          />
        </SectionCard>
      </div>

      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onReset={reset} />
    </div>
  );
}
