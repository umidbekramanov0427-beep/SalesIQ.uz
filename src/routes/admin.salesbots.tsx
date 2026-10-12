import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  Bot,
  Code2,
  Copy,
  Download,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { inputCls, type ActionEditorOptions } from "@/components/automations/ActionEditor";
import { normalizeSteps } from "@/components/automations/BotCanvas";
import { SalesbotBuilder, blankStep } from "@/components/automations/SalesbotBuilder";
import { ChatPreview, SimpleBotEditor } from "@/components/automations/SimpleBotEditor";
import { BotSharePanel, CodeBotPanel } from "@/components/automations/BotConnectPanels";
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
import { useLeadCustomFieldDefs, useCrmStages, useProfilesRaw } from "@/hooks/use-crm-data";
import {
  useDeleteSalesbot,
  useSalesbotRuns,
  useSalesbots,
  useSaveSalesbot,
  type SalesbotInput,
  type SalesbotRow,
} from "@/hooks/use-automations";
import { CrmGate } from "@/components/CrmGate";

// Salesbots. A bot is an ordered list of steps run server-side
// (lib/automations/engine.server.ts), started by a trigger, from a lead page,
// or by a client opening the bot's Telegram link. Three ways to make one:
// - "Simple setup": the ready-made registration bot as a form (greeting,
//   questions, final message, CRM actions) -- lib/salesbots/simple-bot.ts;
// - "Flow": the canvas, for branching bots;
// - "Your own bot": a bot the company coded registers clients through the
//   lead API, and can optionally hand the conversation to SalesIQ by URL.

export const Route = createFileRoute("/admin/salesbots")({
  head: () => ({ meta: [{ title: "Salesbotlar — SalesIQ" }] }),
  component: () => (
    <CrmGate>
      <AdminSalesbotsPage />
    </CrmGate>
  ),
});

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
const MODE_ICON = { simple: ListChecks, canvas: Workflow, code: Code2 } as const;

function modeOf(bot: Pick<SalesbotInput, "kind" | "steps">): Mode {
  if (bot.kind === "external") return "code";
  return parseSimpleBot(bot.steps) ? "simple" : "canvas";
}

function BotEditor({
  bot,
  initial,
  warnings,
  onSaved,
}: {
  bot: SalesbotRow | null;
  initial?: SalesbotInput | undefined;
  warnings?: string[] | undefined;
  onSaved: (id: string) => void;
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSimple, setConfirmSimple] = useState(false);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);

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
    }),
    [profiles, stageOptions, bots, customDefs],
  );

  const set = (patch: Partial<SalesbotInput>) => setDraft((d) => ({ ...d, ...patch }));
  const steps = draft.steps;
  const simple = mode === "simple" ? parseSimpleBot(steps) : null;
  const dirty = !!bot && JSON.stringify(draft) !== baseline;

  function switchMode(next: Mode) {
    if (next === mode) return;
    if (next === "code") {
      set({
        kind: "external",
        ...(!draft.external_secret ? { external_secret: randomSecret() } : {}),
      });
    } else if (next === "simple") {
      if (!parseSimpleBot(steps)) {
        // Steps from the canvas (or none yet) don't fit the form.
        if (steps.length > 0 && draft.kind === "builtin") return setConfirmSimple(true);
        set({ kind: "builtin", steps: buildSimpleSteps(registrationBot(t)) });
      } else set({ kind: "builtin" });
    } else {
      set({
        kind: "builtin",
        steps: normalizeSteps(steps.length ? steps : [blankStep("message")]),
      });
    }
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
  const valid = !invalidReason;

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

  const share = (row: boolean) => (
    <BotSharePanel
      botId={bot?.id ?? null}
      dirty={dirty}
      enabled={draft.enabled ?? true}
      channel={draft.channel}
      row={row}
    />
  );

  return (
    <div className="min-w-0 space-y-3">
      <div className="surface-card flex flex-wrap items-center gap-2 p-2.5">
        <input
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder={t("sb.name")}
          className={cn(inputCls, "h-10 min-w-[200px] flex-1 text-sm font-semibold")}
        />
        <select
          value={draft.channel}
          onChange={(e) => set({ channel: e.target.value as MessageChannel })}
          title={t("sb.channel")}
          className={cn(inputCls, "h-10 w-auto")}
        >
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {t(`dp.channel.${c}`)}
            </option>
          ))}
        </select>
        <label className="flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-xs font-medium text-foreground">
          {t("sb.enabled")}
          <Switch checked={draft.enabled ?? true} onCheckedChange={(v) => set({ enabled: v })} />
        </label>
        <div className="ml-auto flex items-center gap-2">
          {!valid ? (
            <span className="text-xs text-warning">{invalidReason}</span>
          ) : dirty ? (
            <span className="text-xs text-muted-foreground">{t("sb.unsaved")}</span>
          ) : null}
          <button
            type="button"
            disabled={!valid || save.isPending}
            onClick={() => void submit()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("dp.save")}
          </button>
        </div>
      </div>

      <SegmentedControl
        stretch
        value={mode}
        options={MODES}
        onChange={switchMode}
        render={(m) => {
          const Icon = MODE_ICON[m];
          return (
            <span className="inline-flex items-center gap-2">
              <Icon className="h-4 w-4" /> {t(`sb.mode.${m}`)}
            </span>
          );
        }}
      />

      {warnings && warnings.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-foreground">
          <p className="mb-1 font-semibold">{t("sb.importWarnings")}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {mode === "simple" && simple ? (
        <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <SimpleBotEditor
            value={simple}
            onChange={(next) => set({ steps: buildSimpleSteps(next) })}
            stages={stageOptions}
          />
          <div className="space-y-3 xl:sticky xl:top-4">
            {share(false)}
            <ChatPreview value={simple} />
          </div>
        </div>
      ) : mode === "code" ? (
        <div className="min-w-0 space-y-3">
          <CodeBotPanel />
          <SectionCard
            title={t("sb.code.dialogTitle")}
            icon={Download}
            tone="sky"
            description={t("sb.code.dialogDesc")}
          >
            <div className="space-y-3">
              <input
                value={draft.external_url ?? ""}
                onChange={(e) => set({ external_url: e.target.value })}
                placeholder="https://your-bot.example.com/salesiq"
                className={inputCls}
              />
              <div className="flex gap-2">
                <input
                  readOnly
                  value={draft.external_secret ?? ""}
                  className={cn(inputCls, "font-mono text-xs")}
                />
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(draft.external_secret ?? "");
                    toast.success(t("sb.copied"));
                  }}
                  className="rounded-lg border border-border px-2.5 text-subtle hover:text-foreground"
                  aria-label={t("pc.copy")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => set({ external_secret: randomSecret() })}
                  className="rounded-lg border border-border px-2.5 text-subtle hover:text-foreground"
                  aria-label={t("misc.regenerate")}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="overflow-x-auto rounded-xl bg-surface p-3 text-[11px] leading-relaxed text-muted-foreground">
                {`→ POST ${draft.external_url || "<URL>"}
  { "event": "start" | "message", "run_id", "lead": {...}, "text"?, "reply_url" }
  header x-salesiq-signature = HMAC_SHA256(secret, body)

← POST https://salesiq.uz/salesbots/external-reply
  { "run_id", "text"?, "actions"?: [{ "type": "add_tag", "tag": "..." }], "finish"?: true }
  header x-salesiq-signature = HMAC_SHA256(secret, body)`}
              </pre>
            </div>
          </SectionCard>
        </div>
      ) : (
        <>
          {share(true)}
          <SalesbotBuilder
            steps={steps}
            onChange={(next: BotStep[]) => set({ steps: next })}
            selectedId={selectedStep}
            onSelect={setSelectedStep}
            options={options}
          />
        </>
      )}

      {bot && <BotRuns botId={bot.id} />}

      {bot && (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" /> {t("dp.remove")}
        </button>
      )}

      <ConfirmDialog
        open={confirmSimple}
        onOpenChange={setConfirmSimple}
        title={t("sb.toSimpleTitle")}
        description={t("sb.toSimpleDesc")}
        confirmLabel={t("sb.toSimpleConfirm")}
        destructive
        onConfirm={() => {
          setConfirmSimple(false);
          set({ kind: "builtin", steps: buildSimpleSteps(registrationBot(t)) });
          setMode("simple");
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
            onSuccess: () => onSaved(NEW),
            onError: (err) => toast.error(describeError(err, t("dp.saveFailed"))),
          })
        }
      />
    </div>
  );
}

/* ------------------------------ new bot ------------------------------ */

function NewBotChooser({ onPick }: { onPick: (draft: SalesbotInput) => void }) {
  const { t } = useI18n();
  const choices = [
    {
      key: "template",
      icon: UserPlus,
      tile: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
      draft: (): SalesbotInput => ({
        ...EMPTY,
        name: t("sb.tpl.name"),
        steps: buildSimpleSteps(registrationBot(t)),
      }),
    },
    {
      key: "canvas",
      icon: Workflow,
      tile: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
      draft: (): SalesbotInput => ({ ...EMPTY, steps: [blankStep("message")] }),
    },
    {
      key: "code",
      icon: Code2,
      tile: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
      draft: (): SalesbotInput => ({
        ...EMPTY,
        name: t("sb.code.botName"),
        kind: "external",
        external_secret: randomSecret(),
      }),
    },
  ] as const;

  return (
    <div className="min-w-0 space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">{t("sb.choose.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("sb.choose.desc")}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {choices.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onPick(c.draft())}
            className={cn(
              "group relative flex flex-col items-start gap-3 rounded-2xl border bg-card p-5 text-left transition-colors hover:border-primary/50",
              c.key === "template" ? "border-emerald-500/40" : "border-border",
            )}
          >
            {c.key === "template" && (
              <span className="absolute top-4 right-4 inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <Sparkles className="h-3 w-3" /> {t("sb.choose.recommended")}
              </span>
            )}
            <span className={cn("grid h-11 w-11 place-items-center rounded-xl", c.tile)}>
              <c.icon className="h-5 w-5" />
            </span>
            <span className="text-[15px] font-semibold text-foreground">
              {t(`sb.choose.${c.key}`)}
            </span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              {t(`sb.choose.${c.key}Desc`)}
            </span>
            <span className="mt-auto pt-1 text-sm font-semibold text-primary group-hover:underline">
              {t(`sb.choose.${c.key}Cta`)} →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ page ------------------------------ */

function SalesbotsPage() {
  const { t } = useI18n();
  const { data: bots, isLoading } = useSalesbots();
  const { data: stages } = useCrmStages();
  const [selected, setSelected] = useState<string>(NEW);
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
    if (selected === NEW && bots?.length) setSelected(bots[0]!.id);
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bots?.length]);

  const bot = (bots ?? []).find((b) => b.id === selected) ?? null;

  return (
    <>
      <PageHeader
        title={t("sb.title")}
        icon={Bot}
        tone="rose"
        description={t("sb.desc")}
        actions={
          <Link
            to="/admin/automations"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:border-primary/40"
          >
            <Workflow className="h-4 w-4 text-primary" /> {t("dp.title")}
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => {
              setImported(null);
              setSelected(NEW);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold",
              selected === NEW
                ? "border-primary bg-primary/5 text-primary"
                : "border-dashed border-border text-muted-foreground hover:border-primary/40",
            )}
          >
            <Plus className="h-4 w-4" /> {t("sb.new")}
          </button>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-subtle" />}
          {(bots ?? []).map((b) => {
            const Icon = MODE_ICON[modeOf(b)];
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelected(b.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm",
                  selected === b.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                <Icon
                  className={cn("h-4 w-4 shrink-0", b.enabled ? "text-primary" : "text-subtle")}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{b.name}</span>
                  <span className="block text-[11px] text-subtle">
                    {t(`sb.mode.${modeOf(b)}`)}
                    {!b.enabled && ` · ${t("sb.offShort")}`}
                  </span>
                </span>
              </button>
            );
          })}
          <label className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold text-subtle hover:text-foreground">
            <Upload className="h-3.5 w-3.5" /> {t("sb.importAmo")}
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
        </div>
        {!bot && !imported ? (
          <NewBotChooser
            onPick={(draft) => setImported({ key: Date.now(), draft, warnings: [] })}
          />
        ) : (
          <BotEditor
            key={bot?.id ?? `${NEW}-${imported?.key ?? 0}`}
            bot={bot}
            initial={bot ? undefined : imported?.draft}
            warnings={bot ? undefined : imported?.warnings}
            onSaved={(id) => {
              setImported(null);
              setSelected(id);
            }}
          />
        )}
      </div>
    </>
  );
}

function AdminSalesbotsPage() {
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
      <SalesbotsPage />
    </PlanGate>
  );
}
