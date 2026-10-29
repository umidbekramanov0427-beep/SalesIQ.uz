import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Bot,
  ClipboardCheck,
  FileText,
  Headphones,
  Loader2,
  PhoneIncoming,
  StickyNote,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, SettingRow, SettingRows } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { useAmoWriteBack, useSaveAmoWriteBack } from "@/hooks/use-crm-data";
import { buildCallNote } from "@/lib/ai-call-note";
import { DEFAULT_WRITE_BACK, TASK_DUE_CHOICES, type AmoWriteBack } from "@/lib/amocrm/write-back";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// amoCRM workspace -> "AI -> amoCRM": how the platform writes back into
// amoCRM after the AI analyses a call (a task with the next step, a note
// with the client facts and the outcome), the switches for each, and a
// sample of the note as the settings make it. Per-stage automatic messages
// live in the digital pipeline (/admin/automations), linked below.

const FLOW = [
  { icon: PhoneIncoming, key: "amoWriteBack.flow1" },
  { icon: Headphones, key: "amoWriteBack.flow2" },
  { icon: ClipboardCheck, key: "amoWriteBack.flow3" },
  { icon: FileText, key: "amoWriteBack.flow4" },
] as const;

function dueLabel(h: number, t: (k: string, v?: Record<string, string>) => string) {
  return h < 24
    ? t("amoWriteBack.dueHours", { n: String(h) })
    : t("amoWriteBack.dueDays", { n: String(h / 24) });
}

export function AmoWriteBackTab() {
  const { t } = useI18n();
  const { data, isLoading } = useAmoWriteBack();
  const save = useSaveAmoWriteBack();
  const [draft, setDraft] = useState<AmoWriteBack>(DEFAULT_WRITE_BACK);
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  const set = (patch: Partial<AmoWriteBack>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = !!data && JSON.stringify(data) !== JSON.stringify(draft);

  // The note exactly as buildCallNote would write it with these switches.
  const sample = useMemo(() => {
    const client = draft.noteClient;
    const outcome = draft.noteOutcome;
    return buildCallNote({
      analysedAt: new Date(),
      intake: client
        ? [
            { question: t("amoWriteBack.sampleQ1"), answer: t("amoWriteBack.sampleA1") },
            { question: t("amoWriteBack.sampleQ2"), answer: t("amoWriteBack.sampleA2") },
          ]
        : [],
      facts: client
        ? [
            { label: t("amoWriteBack.sampleBudget"), value: t("amoWriteBack.sampleBudgetV") },
            { label: t("amoWriteBack.sampleNeeds"), value: t("amoWriteBack.sampleNeedsV") },
          ]
        : [],
      objections: outcome ? [t("amoWriteBack.sampleObjection")] : [],
      summary: t("amoWriteBack.sampleSummary"),
      agreements: outcome ? [t("amoWriteBack.sampleAgreement")] : [],
      nextStep: null,
    });
  }, [draft.noteClient, draft.noteOutcome, t]);

  return (
    <div className="space-y-6">
      <SectionCard
        icon={Bot}
        tone="violet"
        title={t("amoWriteBack.title")}
        description={t("amoWriteBack.desc")}
      >
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {FLOW.map((f, i) => (
            <li
              key={f.key}
              className="relative flex items-start gap-3 rounded-xl border border-border bg-surface p-3"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-300">
                <f.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("amoWriteBack.step", { n: String(i + 1) })}
                </span>
                <span className="block text-[13px] leading-snug text-foreground">{t(f.key)}</span>
              </span>
              {i < FLOW.length - 1 && (
                <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground xl:block" />
              )}
            </li>
          ))}
        </ol>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SectionCard
          icon={ClipboardCheck}
          tone="primary"
          title={t("amoWriteBack.settingsTitle")}
          description={t("amoWriteBack.settingsDesc")}
          actions={
            <button
              type="button"
              disabled={!dirty || save.isPending}
              onClick={() =>
                save.mutate(draft, {
                  onSuccess: () => toast.success(t("amoWriteBack.saved")),
                  onError: (err) => toast.error(describeError(err, t("common.save"))),
                })
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          }
        >
          {isLoading ? (
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <div className="space-y-4">
              <SettingRows>
                <SettingRow
                  title={t("amoWriteBack.taskTitle")}
                  description={t("amoWriteBack.taskDesc")}
                >
                  <Switch checked={draft.task} onCheckedChange={(v) => set({ task: v })} />
                </SettingRow>
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-2 px-4 py-3",
                    !draft.task && "pointer-events-none opacity-50",
                  )}
                >
                  <span className="text-[13px] font-medium text-foreground">
                    {t("amoWriteBack.taskDue")}
                  </span>
                  {TASK_DUE_CHOICES.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => set({ taskDueHours: h })}
                      aria-pressed={draft.taskDueHours === h}
                      className={cn(
                        "h-8 rounded-lg border px-3 text-[13px] font-semibold transition-colors",
                        draft.taskDueHours === h
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {dueLabel(h, t)}
                    </button>
                  ))}
                </div>
              </SettingRows>

              <SettingRows>
                <SettingRow
                  title={t("amoWriteBack.noteTitle")}
                  description={t("amoWriteBack.noteDesc")}
                >
                  <Switch checked={draft.note} onCheckedChange={(v) => set({ note: v })} />
                </SettingRow>
                <div className={cn(!draft.note && "pointer-events-none opacity-50")}>
                  <SettingRow
                    className="pl-8"
                    title={t("amoWriteBack.noteClient")}
                    description={t("amoWriteBack.noteClientDesc")}
                  >
                    <Switch
                      checked={draft.noteClient}
                      onCheckedChange={(v) => set({ noteClient: v })}
                    />
                  </SettingRow>
                  <SettingRow
                    className="border-t border-border/60 pl-8"
                    title={t("amoWriteBack.noteOutcome")}
                    description={t("amoWriteBack.noteOutcomeDesc")}
                  >
                    <Switch
                      checked={draft.noteOutcome}
                      onCheckedChange={(v) => set({ noteOutcome: v })}
                    />
                  </SettingRow>
                </div>
              </SettingRows>

              <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                <li>• {t("amoWriteBack.rule1")}</li>
                <li>• {t("amoWriteBack.rule2")}</li>
                <li>• {t("amoWriteBack.rule3")}</li>
              </ul>
            </div>
          )}
        </SectionCard>

        <SectionCard
          icon={StickyNote}
          tone="amber"
          title={t("amoWriteBack.sampleTitle")}
          description={t("amoWriteBack.sampleDesc")}
        >
          {draft.note ? (
            <pre className="whitespace-pre-wrap rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3.5 font-sans text-[12.5px] leading-relaxed text-foreground">
              {sample}
            </pre>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-[13px] text-muted-foreground">
              {t("amoWriteBack.noteOff")}
            </p>
          )}
          {draft.task && (
            <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3">
              <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="text-[12.5px] leading-relaxed text-foreground">
                <b>{t("amoWriteBack.sampleTask")}</b> {t("amoWriteBack.sampleAgreement")} ·{" "}
                <span className="text-muted-foreground">
                  {t("amoWriteBack.sampleTaskDue", { due: dueLabel(draft.taskDueHours, t) })}
                </span>
              </span>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        icon={Workflow}
        tone="emerald"
        title={t("amoWriteBack.autoTitle")}
        description={t("amoWriteBack.autoDesc")}
        actions={
          <Link
            to="/admin/automations"
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent"
          >
            <Workflow className="h-4 w-4" /> {t("amoWriteBack.autoOpen")}
          </Link>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("amoWriteBack.autoNote")}
        </p>
      </SectionCard>
    </div>
  );
}
