import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlarmClock, Ban, LogOut, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { TaskManagersPick } from "@/components/crm/TaskManagersPick";
import { CrmGate } from "@/components/CrmGate";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, stageColorProps } from "@/lib/utils";
import {
  useCrmStages,
  usePipelines,
  useSetStageRule,
  useStageRules,
  type PipelineStageRuleRow,
} from "@/hooks/use-crm-data";

// "Zapret zadacha" in one place: every funnel of the CRM with its stages,
// and for each stage whether a lead may sit there without an open task --
// for everyone or only for chosen managers.

export const Route = createFileRoute("/admin/task-control")({
  head: () => ({
    meta: [
      { title: "Vazifa nazorati — SalesIQ" },
      {
        name: "description",
        content: "Qaysi bosqichlarda vazifa qo'yish majburiyligini sozlang.",
      },
    ],
  }),
  component: () => (
    <CrmGate>
      <TaskControlPage />
    </CrmGate>
  ),
});

function TaskControlPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: stages = [] } = useCrmStages();
  const { data: pipelines = [] } = usePipelines();
  const { data: rules = [] } = useStageRules();
  const setRule = useSetStageRule();

  const ruleByStage = useMemo(
    () => new Map<string, PipelineStageRuleRow>(rules.map((r) => [r.stage_id, r])),
    [rules],
  );
  const funnels = useMemo(() => {
    const order = new Map(pipelines.map((p, i) => [p.name, i]));
    const map = new Map<string, typeof stages>();
    for (const s of stages) {
      const key = s.pipeline_name || "Direct Sales";
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map]
      .map(([name, list]) => [name, [...list].sort((a, b) => a.position - b.position)] as const)
      .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999));
  }, [stages, pipelines]);
  const enabledCount = stages.filter((s) => ruleByStage.get(s.id)?.requires_task).length;

  if (user && !["super_admin", "platform_owner", "rop"].includes(user.role)) {
    return (
      <>
        <AdminBackLink />
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  async function save(stageId: string, requiresTask: boolean, taskProfiles?: string[]) {
    const existing = ruleByStage.get(stageId);
    try {
      await setRule.mutateAsync({
        stageId,
        requiresNote: existing?.requires_note ?? false,
        requiresTask,
        ...(taskProfiles ? { taskProfiles } : {}),
      });
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    }
  }

  const rulesExplained = [
    { icon: Ban, text: t("taskControl.ruleMove") },
    { icon: LogOut, text: t("taskControl.ruleLeave") },
    { icon: AlarmClock, text: t("taskControl.ruleOverdue") },
  ];

  return (
    <>
      <AdminBackLink />
      <PageHeader title={t("taskControl.title")} description={t("taskControl.desc")} />

      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        {rulesExplained.map((r) => (
          <div
            key={r.text}
            className="flex items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-[13px] leading-snug text-muted-foreground"
          >
            <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {r.text}
          </div>
        ))}
      </div>

      <p className="mb-3 text-sm text-muted-foreground">
        {t("taskControl.enabledCount", { count: enabledCount })}
      </p>

      <div className="space-y-4">
        {funnels.length === 0 && (
          <SectionCard title={t("taskControl.noFunnels")}>
            <p className="text-sm text-subtle">{t("taskControl.noFunnelsHint")}</p>
          </SectionCard>
        )}
        {funnels.map(([name, list]) => (
          <SectionCard key={name} title={name}>
            <ul className="divide-y divide-border">
              {list.map((s) => {
                const rule = ruleByStage.get(s.id);
                const on = rule?.requires_task ?? false;
                const dot = stageColorProps(s.color);
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="flex min-w-[180px] flex-1 items-center gap-2 text-sm font-medium text-foreground">
                      <span
                        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot.className)}
                        style={dot.style}
                      />
                      <span className="truncate">{s.name}</span>
                    </span>
                    {on && (
                      <TaskManagersPick
                        value={rule?.task_profiles ?? []}
                        onChange={(ids) => void save(s.id, true, ids)}
                      />
                    )}
                    <label className="flex items-center gap-2 text-xs font-medium text-foreground">
                      <Switch checked={on} onCheckedChange={(v) => void save(s.id, v)} />
                      {t("pipelinesSettings.requiresTaskLabel")}
                    </label>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        ))}
      </div>
    </>
  );
}
