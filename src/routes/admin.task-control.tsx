import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlarmClock,
  Ban,
  Check,
  ClipboardX,
  LogOut,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { TaskManagersPick } from "@/components/crm/TaskManagersPick";
import { CrmGate } from "@/components/CrmGate";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, stageColorProps, timeAgo } from "@/lib/utils";
import {
  useCrmStages,
  usePipelines,
  useSetStageRule,
  useStageRules,
  useStageTaskViolations,
  type PipelineStageRuleRow,
} from "@/hooks/use-crm-data";

// "Zapret zadacha" in one place: every funnel of the CRM with its stages,
// and for each stage whether a lead may sit there without an open task --
// for everyone or only for chosen managers.

export const Route = createFileRoute("/admin/task-control")({
  head: () => ({
    meta: [
      { title: "Vazifa va izoh nazorati — SalesIQ" },
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
  const noteCount = stages.filter((s) => ruleByStage.get(s.id)?.requires_note).length;

  if (user && !["super_admin", "platform_owner", "rop"].includes(user.role)) {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
          </div>
        </SectionCard>
      </>
    );
  }

  async function save(
    stageId: string,
    patch: {
      requiresTask?: boolean;
      requiresNote?: boolean;
      taskProfiles?: string[];
      noteProfiles?: string[];
    },
  ) {
    const existing = ruleByStage.get(stageId);
    try {
      await setRule.mutateAsync({
        stageId,
        requiresNote: patch.requiresNote ?? existing?.requires_note ?? false,
        requiresTask: patch.requiresTask ?? existing?.requires_task ?? false,
        ...(patch.taskProfiles ? { taskProfiles: patch.taskProfiles } : {}),
        ...(patch.noteProfiles ? { noteProfiles: patch.noteProfiles } : {}),
      });
    } catch (err) {
      toast.error(describeError(err, t("pipelinesSettings.saveFailed")));
    }
  }

  const rulesExplained = [
    { icon: Ban, text: t("taskControl.ruleMove") },
    { icon: LogOut, text: t("taskControl.ruleLeave") },
    { icon: AlarmClock, text: t("taskControl.ruleOverdue") },
    { icon: StickyNote, text: t("taskControl.ruleNote") },
    { icon: Sparkles, text: t("taskControl.ruleAiNote") },
  ];

  return (
    <>
      <PageHeader
        title={t("taskControl.title")}
        icon={AlarmClock}
        tone="emerald"
        description={t("taskControl.desc")}
      />

      <ul className="mb-6 grid gap-x-8 gap-y-3.5 rounded-xl border border-border bg-muted/20 p-5 md:grid-cols-2">
        {rulesExplained.map((r) => (
          <li
            key={r.text}
            className="flex items-start gap-3 text-[13px] leading-relaxed text-muted-foreground"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <r.icon className="h-3.5 w-3.5" />
            </span>
            <span className="pt-1">{r.text}</span>
          </li>
        ))}
      </ul>

      <TaskViolationsCard enabled={enabledCount > 0} />

      <p className="mb-3 text-sm font-medium text-muted-foreground">
        {t("taskControl.enabledCount", { count: enabledCount })} ·{" "}
        {t("taskControl.noteCount", { count: noteCount })}
      </p>

      <div className="space-y-4">
        {funnels.length === 0 && (
          <SectionCard title={t("taskControl.noFunnels")} icon={Workflow} tone="slate">
            <p className="text-sm text-subtle">{t("taskControl.noFunnelsHint")}</p>
          </SectionCard>
        )}
        {funnels.map(([name, list]) => (
          <SectionCard key={name} title={name} icon={Workflow} tone="violet">
            <ul className="divide-y divide-border/60">
              {list.map((s) => {
                const rule = ruleByStage.get(s.id);
                const taskOn = rule?.requires_task ?? false;
                const noteOn = rule?.requires_note ?? false;
                const dot = stageColorProps(s.color);
                return (
                  <li
                    key={s.id}
                    className="grid gap-3 py-3.5 first:pt-0 last:pb-0 md:grid-cols-[minmax(180px,1fr)_220px_220px] md:items-start md:gap-6"
                  >
                    <span className="flex min-w-0 items-center gap-2 pt-1 text-sm font-medium text-foreground">
                      <span
                        className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dot.className)}
                        style={dot.style}
                      />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <div className="flex flex-col items-start gap-1.5">
                      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-foreground">
                        <Switch
                          checked={taskOn}
                          onCheckedChange={(v) => void save(s.id, { requiresTask: v })}
                        />
                        {t("pipelinesSettings.requiresTaskLabel")}
                      </label>
                      {taskOn && (
                        <TaskManagersPick
                          value={rule?.task_profiles ?? []}
                          onChange={(ids) => void save(s.id, { taskProfiles: ids })}
                        />
                      )}
                    </div>
                    <div className="flex flex-col items-start gap-1.5">
                      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-medium text-foreground">
                        <Switch
                          checked={noteOn}
                          onCheckedChange={(v) => void save(s.id, { requiresNote: v })}
                        />
                        {t("pipelinesSettings.requiresNoteLabel")}
                      </label>
                      {noteOn && (
                        <TaskManagersPick
                          value={rule?.note_profiles ?? []}
                          onChange={(ids) => void save(s.id, { noteProfiles: ids })}
                        />
                      )}
                    </div>
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

// Leads that already sit in a task-required stage without an open task:
// moving INTO such a stage is refused by the database, but a lead whose task
// was closed afterwards (or that an automation moved) is only visible here.
function TaskViolationsCard({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const { data, isLoading } = useStageTaskViolations(enabled);
  if (!enabled || isLoading || data === null || data === undefined) return null;
  return (
    <SectionCard
      title={t("taskControl.violationsTitle")}
      description={t("taskControl.violationsDesc")}
      icon={ClipboardX}
      tone={data.length > 0 ? "rose" : "emerald"}
      className="mb-6"
    >
      {data.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-success" /> {t("taskControl.violationsNone")}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {data.map((v) => (
            <li key={v.lead_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <Link
                to="/crm/leads/$leadId"
                params={{ leadId: v.lead_id }}
                className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground hover:text-primary"
              >
                {v.lead_name}
              </Link>
              <span className="text-[13px] text-muted-foreground">
                {v.funnel} · {v.stage_name}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {v.owner_name || t("duplicates.unassigned")}
              </span>
              <span className="w-28 text-right text-[13px] tabular-nums text-subtle">
                {timeAgo(v.since)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
