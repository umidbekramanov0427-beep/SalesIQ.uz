import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  Bot,
  Code2,
  Eye,
  FileJson,
  FlaskConical,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
  Workflow,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Pill, SectionCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { inputCls, type ActionEditorOptions } from "@/components/automations/ActionEditor";
import { normalizeSteps } from "@/components/automations/BotCanvas";
import { SalesbotBuilder, blankStep } from "@/components/automations/SalesbotBuilder";
import { SimpleBotEditor } from "@/components/automations/SimpleBotEditor";
import {
  BotSharePanel,
  CodeBotPanel,
  CodeBotSetup,
} from "@/components/automations/BotConnectPanels";
import {
  BotJsonDialog,
  BotPreviewDialog,
  TriggerPicker,
  parseBotJson,
} from "@/components/automations/BotEditorTools";
import { botTemplate, TEMPLATE_KEYS } from "@/lib/salesbots/templates";
import { convertAmoSalesbot } from "@/lib/amocrm-salesbot-import";
import {
  buildSimpleSteps,
  parseSimpleBot,
  registrationBot,
  simpleBotProblem,
} from "@/lib/salesbots/simple-bot";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import type { BotStep, MessageChannel } from "@/lib/automation-types";
import {
  useLeadCustomFieldDefs,
  useCrmStages,
  useOrgBot,
  useProfilesRaw,
} from "@/hooks/use-crm-data";
import {
  useDeleteSalesbot,
  useSalesbotRuns,
  useSalesbots,
  useSaveSalesbot,
  type SalesbotInput,
  type SalesbotRow,
  type SalesbotTrigger,
} from "@/hooks/use-automations";
import { SharedBotNotice } from "@/components/integrations/OrgBotCard";

// Salesbots. A bot is an ordered list of steps run server-side
// (lib/automations/engine.server.ts), started by a trigger, from a lead page,
// or by a client opening the bot's Telegram link. Three ways to make one:
// - "Simple setup": the ready-made registration bot as a form (greeting,
//   questions, final message, CRM actions) -- lib/salesbots/simple-bot.ts;
// - "Flow": the canvas, for branching bots;
// - "Your own bot": a bot the company coded registers clients through the
//   lead API, and can optionally hand the conversation to SalesIQ by URL.

const CHANNELS: MessageChannel[] = ["auto", "telegram", "sms"];
const NEW = "__new__";

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const EMPTY: SalesbotInput = {
  name: "",
  description: "",
  kind: "builtin",
  channel: "auto",
  steps: [],
  external_url: "",
  external_secret: "",
  enabled: true,
  test_mode: false,
  trigger: "manual",
  trigger_stage_id: null,
  trigger_time: null,
};

/* ------------------------------ runs ------------------------------ */

function BotRuns({ botId }: { botId: string }) {
  const { t } = useI18n();
  const { data: runs, isLoading, refetch } = useSalesbotRuns(botId);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <SectionCard
      title={t("sb.runs")}
      icon={Activity}
      tone="slate"
      actions={
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-md p-1.5 text-subtle hover:bg-accent"
          aria-label={t("common.refresh")}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      }
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-subtle" />
      ) : (runs ?? []).length === 0 ? (
        <p className="text-sm text-subtle">{t("sb.noRuns")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {(runs ?? []).map((r) => {
            const log = (r.log as { at: string; note: string }[] | null) ?? [];
            return (
              <li key={r.id} className="py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                      r.status === "done"
                        ? "bg-success/12 text-success"
                        : r.status === "failed"
                          ? "bg-destructive/12 text-destructive"
                          : "bg-primary/10 text-primary",
                    )}
                  >
                    {t(`sb.status.${r.status}`)}
                  </span>
                  <Link
                    to="/crm/leads/$leadId"
                    params={{ leadId: r.lead_id }}
                    onClick={(e) => e.stopPropagation()}
                    className="truncate text-foreground hover:underline"
                  >
                    {t("sb.lead")}
                  </Link>
                  <span className="ml-auto shrink-0 text-xs text-subtle">
                    {timeAgo(r.started_at)}
                  </span>
                </button>
                {open === r.id && (
                  <div className="mt-2 space-y-1 rounded-lg bg-surface p-2 text-xs text-muted-foreground">
                    {r.error && <p className="text-destructive">{r.error}</p>}
                    {log.map((l, i) => (
                      <p key={i} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                        <span className="text-subtle">{timeAgo(l.at)} · </span>
                        {l.note}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

/* ------------------------------ editor ------------------------------ */

type Mode = "simple" | "canvas" | "code";
const MODES: Mode[] = ["simple", "canvas", "code"];
const MODE_META = {
  simple: { icon: ListChecks, tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  canvas: { icon: Workflow, tile: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  code: { icon: Code2, tile: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
} as const;
const EDITOR_TABS = ["setup", "share", "history"] as const;
type EditorTab = (typeof EDITOR_TABS)[number];

function modeOf(bot: Pick<SalesbotInput, "kind" | "steps">): Mode {
  if (bot.kind === "external") return "code";
  return parseSimpleBot(bot.steps) ? "simple" : "canvas";
}

function ModeTile({ mode, size = "md" }: { mode: Mode; size?: "md" | "lg" }) {
  const { icon: Icon, tile } = MODE_META[mode];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        size === "lg" ? "h-11 w-11" : "h-10 w-10",
        tile,
      )}
    >
      <Icon className={size === "lg" ? "h-5 w-5" : "h-[18px] w-[18px]"} />
    </span>
  );
}

function BotStatus({ enabled, test }: { enabled: boolean; test: boolean }) {
  const { t } = useI18n();
  if (test) return <Pill tone="warning">{t("sb.test")}</Pill>;
  return <Pill tone={enabled ? "success" : "neutral"}>{t(enabled ? "sb.on" : "sb.off")}</Pill>;
}

function BotEditor({
  bot,
  initial,
  warnings,
  onSaved,
  onBack,
}: {
  bot: SalesbotRow | null;
  initial?: SalesbotInput | undefined;
  warnings?: string[] | undefined;
  onSaved: (id: string) => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const save = useSaveSalesbot();
  const remove = useDeleteSalesbot();
  const { data: profiles } = useProfilesRaw();
  const { data: stages } = useCrmStages();
  const { data: bots } = useSalesbots();
  const { data: customDefs } = useLeadCustomFieldDefs();
  const [draft, setDraft] = useState<SalesbotInput>(EMPTY);
  const [baseline, setBaseline] = useState("");
  const [mode, setMode] = useState<Mode>("simple");
  const [tab, setTab] = useState<EditorTab>("setup");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingMode, setPendingMode] = useState<Mode | null>(null);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    const base: SalesbotInput = bot
      ? {
          name: bot.name,
          description: bot.description ?? "",
          kind: bot.kind,
          channel: bot.channel,
          steps: bot.steps,
          external_url: bot.external_url ?? "",
          external_secret: bot.external_secret ?? "",
          enabled: bot.enabled,
          test_mode: bot.test_mode ?? false,
          trigger: (bot.trigger as SalesbotTrigger | undefined) ?? "manual",
          trigger_stage_id: bot.trigger_stage_id ?? null,
          trigger_time: bot.trigger_time ?? null,
        }
      : (initial ?? { ...EMPTY, steps: [blankStep("message")] });
    const m = modeOf(base);
    // The canvas makes every link explicit so what it shows is what the bot
    // does; a simple bot's steps already are.
    const next = m === "canvas" ? { ...base, steps: normalizeSteps(base.steps) } : base;
    setDraft(next);
    setBaseline(bot ? JSON.stringify(next) : "");
    setMode(m);
  }, [bot, initial]);

  const stageOptions = useMemo(
    () =>
      (stages ?? []).map((s) => ({
        id: s.id,
        name: `${s.pipeline_name || "Direct Sales"} · ${s.name}`,
      })),
    [stages],
  );
  const options: ActionEditorOptions = useMemo(
    () => ({
      profiles: (profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name || p.email })),
      stages: stageOptions,
      bots: (bots ?? []).map((b) => ({ id: b.id, name: b.name })),
      customFields: (customDefs ?? []).map((d) => ({ key: d.key, label: d.label })),
      funnels: [...new Set((stages ?? []).map((s) => s.pipeline_name || "Direct Sales"))],
    }),
    [profiles, stageOptions, bots, customDefs, stages],
  );

  const set = (patch: Partial<SalesbotInput>) => setDraft((d) => ({ ...d, ...patch }));
  const steps = draft.steps;
  const simple = mode === "simple" ? parseSimpleBot(steps) : null;
  const dirty = !!bot && JSON.stringify(draft) !== baseline;

  /** Changes the bot's type (after the confirmation). */
  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "code") {
      set({
        kind: "external",
        ...(!draft.external_secret ? { external_secret: randomSecret() } : {}),
      });
    } else if (next === "simple") {
      // Steps from the canvas (or none yet) don't fit the form: start from the template.
      if (!parseSimpleBot(steps))
        set({ kind: "builtin", steps: buildSimpleSteps(registrationBot(t)) });
      else set({ kind: "builtin" });
    } else {
      set({
        kind: "builtin",
        steps: normalizeSteps(steps.length ? steps : [blankStep("message")]),
      });
    }
    setSelectedStep(null);
    setMode(next);
  }

  const simpleProblem = simple ? simpleBotProblem(simple) : null;
  const invalidReason = !draft.name.trim()
    ? t("sb.needName")
    : draft.kind === "external"
      ? /^https:\/\//.test(draft.external_url ?? "") && draft.external_secret
        ? null
        : t("sb.needUrl")
      : simpleProblem
        ? t(`sb.simple.problem.${simpleProblem}`)
        : steps.length === 0
          ? t("sb.needSteps")
          : null;
  const triggerProblem =
    draft.trigger === "stage_enter" && !draft.trigger_stage_id ? t("sb.trigger.needStage") : null;
  const valid = !invalidReason && !triggerProblem;

  /** «Bekor qilish»: back to the last saved version. */
  function revert() {
    if (bot && baseline) setDraft(JSON.parse(baseline) as SalesbotInput);
  }

  /** «Boshqa CRM'dan import»: our JSON, a bare step list, or an amoCRM salesbot export. */
  function importJson(text: string): string | null {
    const own = parseBotJson(text);
    if (own) {
      set({
        kind: "builtin",
        steps: normalizeSteps(own.steps),
        ...(own.name && !draft.name.trim() ? { name: own.name } : {}),
      });
      setMode("canvas");
      toast.success(t("sb.imported", { count: own.steps.length }));
      return null;
    }
    try {
      const stageMap = new Map<number, string>();
      for (const st of stages ?? []) {
        if (st.amocrm_status_id != null) stageMap.set(st.amocrm_status_id, st.id);
      }
      const result = convertAmoSalesbot(JSON.parse(text) as unknown, stageMap);
      set({
        kind: "builtin",
        steps: normalizeSteps(result.steps),
        ...(!draft.name.trim() ? { name: result.name } : {}),
      });
      setMode("canvas");
      toast.success(t("sb.imported", { count: result.steps.length }));
      return null;
    } catch {
      return t("sb.json.bad");
    }
  }

  async function submit() {
    try {
      const id = await save.mutateAsync({
        ...(bot ? { id: bot.id } : {}),
        input: { ...draft, name: draft.name.trim() },
      });
      toast.success(t("dp.saved"));
      onSaved(id);
    } catch (err) {
      toast.error(describeError(err, t("dp.saveFailed")));
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      {/* One header for every type: who, state, save. */}
      <header className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("sb.backToList")}
            title={t("sb.backToList")}
            className="ctl-soft grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <ModeTile mode={mode} />
          <div className="min-w-[220px] flex-1">
            <input
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder={t("sb.name")}
              className="w-full bg-transparent text-[18px] leading-tight font-bold text-foreground outline-none placeholder:text-subtle"
            />
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t(`sb.mode.${mode}`)}</span>
              <BotStatus enabled={draft.enabled ?? true} test={draft.test_mode ?? false} />
              {!valid ? (
                <span className="text-warning">{invalidReason ?? triggerProblem}</span>
              ) : dirty ? (
                <span>{t("sb.unsaved")}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {draft.kind === "builtin" && (
              <label
                title={t("sb.testHint")}
                className="flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-foreground"
              >
                <FlaskConical className="h-3.5 w-3.5 text-warning" />
                {t("sb.test")}
                <Switch
                  checked={draft.test_mode ?? false}
                  onCheckedChange={(v) => set({ test_mode: v })}
                />
              </label>
            )}
            <label className="flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-foreground">
              {t("sb.on")}
              <Switch
                checked={draft.enabled ?? true}
                onCheckedChange={(v) => set({ enabled: v })}
              />
            </label>
            <button
              type="button"
              disabled={!valid || save.isPending}
              onClick={() => void submit()}
              className="ctl-lit inline-flex h-9 items-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-50"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("dp.save")}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t("sb.more")}
                  className="ctl-soft grid h-9 w-9 place-items-center rounded-xl"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {draft.kind === "builtin" && (
                  <DropdownMenuItem onSelect={() => setPreviewOpen(true)}>
                    <Eye className="h-4 w-4" /> {t("sb.botView")}
                  </DropdownMenuItem>
                )}
                {mode === "canvas" && (
                  <DropdownMenuItem onSelect={() => setJsonOpen(true)}>
                    <FileJson className="h-4 w-4" /> {t("sb.json.title")}
                  </DropdownMenuItem>
                )}
                {bot && (
                  <DropdownMenuItem disabled={!dirty} onSelect={revert}>
                    <RotateCcw className="h-4 w-4" /> {t("sb.cancel")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
                  {t("sb.switchType")}
                </DropdownMenuLabel>
                {MODES.filter((m) => m !== mode).map((m) => {
                  const Icon = MODE_META[m].icon;
                  return (
                    <DropdownMenuItem key={m} onSelect={() => setPendingMode(m)}>
                      <Icon className="h-4 w-4" /> {t(`sb.mode.${m}`)}
                    </DropdownMenuItem>
                  );
                })}
                {bot && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => setConfirmDelete(true)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" /> {t("dp.remove")}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* When the bot runs and where it writes. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> {t("sb.when")}
          </span>
          {draft.kind === "builtin" && (
            <TriggerPicker
              trigger={draft.trigger ?? "manual"}
              stageId={draft.trigger_stage_id ?? null}
              time={draft.trigger_time ?? null}
              stages={stageOptions}
              onChange={(p) => set(p)}
            />
          )}
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            {t("sb.channel")}
            <select
              value={draft.channel}
              onChange={(e) => set({ channel: e.target.value as MessageChannel })}
              className={cn(inputCls, "h-9 w-auto")}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(`dp.channel.${c}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {draft.test_mode && (
        <div className="flex items-start gap-2 rounded-xl border border-warning/40 bg-card px-3 py-2 text-xs text-foreground">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>{t("sb.testBanner")}</span>
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-card p-3 text-xs text-foreground">
          <p className="mb-1 font-semibold">{t("sb.importWarnings")}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div role="tablist" className="ctl-track inline-flex gap-1 rounded-xl p-1">
        {EDITOR_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            data-state={tab === k ? "active" : "inactive"}
            onClick={() => setTab(k)}
            className="ctl-tab rounded-lg px-4 py-1.5 text-[13px] font-semibold"
          >
            {t(`sb.tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === "share" ? (
        <div className="max-w-[720px]">
          <BotSharePanel
            botId={bot?.id ?? null}
            dirty={dirty}
            enabled={draft.enabled ?? true}
            channel={draft.channel}
          />
        </div>
      ) : tab === "history" ? (
        bot ? (
          <BotRuns botId={bot.id} />
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("sb.historySaveFirst")}
          </p>
        )
      ) : mode === "simple" && simple ? (
        <SimpleBotEditor
          value={simple}
          onChange={(next) => set({ steps: buildSimpleSteps(next) })}
          stages={stageOptions}
        />
      ) : mode === "code" ? (
        <div className="min-w-0 space-y-3">
          <CodeBotSetup
            url={draft.external_url ?? ""}
            secret={draft.external_secret ?? ""}
            onUrl={(v) => set({ external_url: v })}
            onRegenerate={() => set({ external_secret: randomSecret() })}
          />
          <CodeBotPanel />
        </div>
      ) : (
        <SalesbotBuilder
          steps={steps}
          onChange={(next: BotStep[]) => set({ steps: next })}
          selectedId={selectedStep}
          onSelect={setSelectedStep}
          options={options}
        />
      )}

      <BotJsonDialog
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        value={{
          name: draft.name,
          channel: draft.channel,
          trigger: draft.trigger ?? "manual",
          steps,
        }}
        onImport={importJson}
      />
      <BotPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        steps={steps}
        name={draft.name}
      />

      <ConfirmDialog
        open={!!pendingMode}
        onOpenChange={(o) => !o && setPendingMode(null)}
        title={t("sb.switchTitle", { type: pendingMode ? t(`sb.mode.${pendingMode}`) : "" })}
        description={
          pendingMode === "simple" && !parseSimpleBot(steps) && steps.length > 0
            ? t("sb.toSimpleDesc")
            : t("sb.switchDesc")
        }
        confirmLabel={t("sb.switchConfirm")}
        onConfirm={() => {
          if (pendingMode) switchMode(pendingMode);
          setPendingMode(null);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("sb.deleteTitle")}
        description={bot?.name}
        onConfirm={() =>
          bot &&
          remove.mutate(bot.id, {
            onSuccess: () => onBack(),
            onError: (err) => toast.error(describeError(err, t("dp.saveFailed"))),
          })
        }
      />
    </div>
  );
}

/* ------------------------------ new bot ------------------------------ */

/** A small drawing of each editor, so the choice is seen, not read. */
function ModeSketch({ mode }: { mode: Mode }) {
  if (mode === "simple")
    return (
      <div className="flex h-full flex-col justify-center gap-1.5 px-4">
        <span className="h-3 w-[62%] rounded-full rounded-bl-sm bg-border" />
        <span className="ml-auto h-3 w-[34%] rounded-full rounded-br-sm bg-emerald-500/60" />
        <span className="h-3 w-[54%] rounded-full rounded-bl-sm bg-border" />
        <span className="ml-auto h-3 w-[28%] rounded-full rounded-br-sm bg-emerald-500/60" />
      </div>
    );
  if (mode === "canvas")
    return (
      <svg viewBox="0 0 200 96" className="h-full w-full" aria-hidden="true">
        <g
          className="text-violet-500"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          opacity="0.7"
        >
          <path d="M58 48 C78 48 78 26 98 26" />
          <path d="M58 48 C78 48 78 70 98 70" />
          <path d="M146 26 C160 26 160 48 172 48" />
        </g>
        <g className="fill-border">
          <rect x="14" y="38" width="44" height="20" rx="6" />
          <rect x="98" y="16" width="48" height="20" rx="6" />
          <rect x="98" y="60" width="48" height="20" rx="6" />
          <rect x="172" y="38" width="20" height="20" rx="6" />
        </g>
      </svg>
    );
  return (
    <div className="flex h-full flex-col justify-center gap-1 px-4 font-mono text-[10.5px] leading-tight">
      <span className="text-sky-600 dark:text-sky-400">POST /salesiq</span>
      <span className="text-muted-foreground">{'{ "event": "start",'}</span>
      <span className="pl-3 text-muted-foreground">{'"lead": { … } }'}</span>
      <span className="text-emerald-600 dark:text-emerald-400">→ 200 ok</span>
    </div>
  );
}

const BLANK_SIMPLE = {
  greeting: "",
  questions: [{ text: "", saveTo: "note" as const, options: [] }],
  finish: "",
  stageId: "",
  tag: "",
  task: null,
};

function NewBotChooser({
  onPick,
  onBack,
}: {
  onPick: (draft: SalesbotInput) => void;
  /** Back to the bots list (absent when there are no bots yet). */
  onBack?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<"simple" | "canvas" | null>(null);

  if (!type)
    return (
      <div className="min-w-0 space-y-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> {t("sb.backToList")}
          </button>
        )}
        <div>
          <h2 className="text-[18px] font-bold text-foreground">{t("sb.pick.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("sb.pick.desc")}</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() =>
                m === "code"
                  ? onPick({
                      ...EMPTY,
                      name: t("sb.code.botName"),
                      kind: "external",
                      external_secret: randomSecret(),
                    })
                  : setType(m)
              }
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:border-primary/60"
            >
              <div className="h-[104px] border-b border-border bg-surface">
                <ModeSketch mode={m} />
              </div>
              <div className="flex flex-1 flex-col gap-2 p-5">
                <div className="flex items-center gap-3">
                  <ModeTile mode={m} />
                  <span className="text-[16px] font-bold text-foreground">{t(`sb.mode.${m}`)}</span>
                </div>
                <span className="text-[13px] leading-relaxed text-muted-foreground">
                  {t(`sb.pick.${m}Desc`)}
                </span>
                <span className="text-[12px] text-subtle">{t(`sb.pick.${m}Who`)}</span>
                <span className="mt-auto pt-2 text-sm font-semibold text-primary group-hover:underline">
                  {t("sb.pick.choose")} →
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );

  return (
    <div className="min-w-0 space-y-4">
      <button
        type="button"
        onClick={() => setType(null)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("sb.pick.changeType")}
      </button>
      <div className="flex items-center gap-3">
        <ModeTile mode={type} size="lg" />
        <div>
          <h2 className="text-[18px] font-bold text-foreground">{t(`sb.pick.start.${type}`)}</h2>
          <p className="text-sm text-muted-foreground">{t("sb.pick.startDesc")}</p>
        </div>
      </div>
      {type === "simple" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <StartCard
            icon={UserPlus}
            title={t("sb.choose.template")}
            desc={t("sb.choose.templateDesc")}
            meta={t("sb.choose.recommended")}
            onClick={() =>
              onPick({
                ...EMPTY,
                name: t("sb.tpl.name"),
                steps: buildSimpleSteps(registrationBot(t)),
              })
            }
          />
          <StartCard
            icon={Plus}
            title={t("sb.pick.blankSimple")}
            desc={t("sb.pick.blankSimpleDesc")}
            onClick={() => onPick({ ...EMPTY, steps: buildSimpleSteps(BLANK_SIMPLE) })}
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StartCard
            icon={Plus}
            title={t("sb.choose.canvas")}
            desc={t("sb.choose.canvasDesc")}
            onClick={() => onPick({ ...EMPTY, steps: [blankStep("message")] })}
          />
          {TEMPLATE_KEYS.map((k) => {
            const tpl = botTemplate(k, t);
            return (
              <StartCard
                key={k}
                icon={Bot}
                title={t(`sb.t6.${k}.name`)}
                desc={t(`sb.t6.${k}.desc`)}
                meta={`${t("sb.t6.steps", { n: tpl.steps.length })} · ${t(`sb.trigger.${tpl.trigger}`)}`}
                onClick={() =>
                  onPick({
                    ...EMPTY,
                    name: t(`sb.t6.${k}.name`),
                    steps: tpl.steps,
                    enabled: false,
                    test_mode: true,
                    trigger: tpl.trigger,
                  })
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function StartCard({
  icon: Icon,
  title,
  desc,
  meta,
  onClick,
}: {
  icon: typeof Bot;
  title: string;
  desc: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/60"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{desc}</span>
        {meta && <span className="mt-1.5 block text-[11px] font-medium text-subtle">{meta}</span>}
      </span>
    </button>
  );
}

/* ------------------------------ page ------------------------------ */

/** «The trial bot stops taking new clients in N days -- connect your own». */
function SharedBotBanner() {
  const { data } = useOrgBot();
  if (!data?.ready) return null;
  return (
    <div className="mb-4">
      <SharedBotNotice state={data} withLink />
    </div>
  );
}

function BotCard({ bot, onOpen }: { bot: SalesbotRow; onOpen: () => void }) {
  const { t } = useI18n();
  const mode = modeOf(bot);
  const trigger = (bot.trigger as SalesbotTrigger | undefined) ?? "manual";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/60"
    >
      <div className="flex items-start gap-3">
        <ModeTile mode={mode} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{bot.name}</p>
          <p className="text-xs text-muted-foreground">{t(`sb.mode.${mode}`)}</p>
        </div>
        <BotStatus enabled={bot.enabled} test={bot.test_mode ?? false} />
      </div>
      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-[12.5px] text-muted-foreground">
        <p className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="truncate">
            {mode === "code" ? t("sb.card.code") : t(`sb.trigger.${trigger}`)}
          </span>
        </p>
        <p className="flex items-center gap-2">
          <Send className="h-3.5 w-3.5 shrink-0 text-sky-500" />
          <span className="truncate">{t(`dp.channel.${bot.channel}`)}</span>
        </p>
      </div>
      <span className="mt-3 text-sm font-semibold text-primary group-hover:underline">
        {t("sb.openBot")} →
      </span>
    </button>
  );
}

function SalesbotsPage({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { data: bots, isLoading } = useSalesbots();
  const { data: stages } = useCrmStages();
  // null = the list, NEW = a new bot (chooser or an imported draft), else a bot's id.
  const [selected, setSelected] = useState<string | null>(null);
  const [imported, setImported] = useState<{
    key: number;
    draft: SalesbotInput;
    warnings: string[];
  } | null>(null);

  async function importAmo(file: File) {
    try {
      const json = JSON.parse(await file.text()) as unknown;
      const stageMap = new Map<number, string>();
      for (const st of stages ?? []) {
        if (st.amocrm_status_id != null) stageMap.set(st.amocrm_status_id, st.id);
      }
      const result = convertAmoSalesbot(json, stageMap);
      setImported({
        key: Date.now(),
        draft: { ...EMPTY, name: result.name, steps: result.steps },
        warnings: result.warnings,
      });
      setSelected(NEW);
      toast.success(t("sb.imported", { count: result.steps.length }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("sb.importFailed"));
    }
  }

  useEffect(() => {
    // ?bot=<id> opens that bot, ?bot=new the «Yangi bot» chooser (links
    // from a trigger's «Salesbotni ishga tushirish»).
    const wanted =
      typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("bot");
    if (wanted === "new") return setSelected(NEW);
    if (wanted && bots?.some((b) => b.id === wanted)) setSelected(wanted);
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bots?.length]);

  const toList = () => {
    setImported(null);
    setSelected(null);
  };
  const bot = (bots ?? []).find((b) => b.id === selected) ?? null;
  const list = bots ?? [];

  let body: React.ReactNode;
  if (bot || (selected === NEW && imported)) {
    body = (
      <BotEditor
        key={bot?.id ?? `${NEW}-${imported?.key ?? 0}`}
        bot={bot}
        initial={bot ? undefined : imported?.draft}
        warnings={bot ? undefined : imported?.warnings}
        onBack={toList}
        onSaved={(id) => {
          setImported(null);
          setSelected(id);
        }}
      />
    );
  } else if (selected === NEW || (!isLoading && list.length === 0)) {
    body = (
      <NewBotChooser
        onBack={list.length > 0 ? toList : undefined}
        onPick={(draft) => {
          setImported({ key: Date.now(), draft, warnings: [] });
          setSelected(NEW);
        }}
      />
    );
  } else {
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-foreground">
              {t("sb.list.title")}{" "}
              <span className="text-muted-foreground tabular-nums">{list.length}</span>
            </h2>
            <p className="text-sm text-muted-foreground">{t("sb.list.desc")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="ctl-soft inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold">
              <Upload className="h-4 w-4" /> {t("sb.importAmo")}
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importAmo(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setImported(null);
                setSelected(NEW);
              }}
              className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" /> {t("sb.new")}
            </button>
          </div>
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-subtle" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((b) => (
              <BotCard key={b.id} bot={b} onOpen={() => setSelected(b.id)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {!embedded && (
        <PageHeader title={t("sb.title")} icon={Bot} tone="rose" description={t("sb.desc")} />
      )}
      <SharedBotBanner />
      {body}
    </>
  );
}

export function SalesbotsTab({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const { t } = useI18n();
  if (
    user &&
    user.role !== "super_admin" &&
    user.role !== "rop" &&
    user.role !== "platform_owner"
  ) {
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
  return (
    <PlanGate feature="automation">
      <SalesbotsPage embedded={embedded} />
    </PlanGate>
  );
}
