import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlanGate } from "@/components/PlanGate";
import { Switch } from "@/components/ui/switch";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import {
  ActionEditor,
  DurationInput,
  blankAction,
  inputCls,
  type ActionEditorOptions,
} from "@/components/automations/ActionEditor";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn, describeError, timeAgo } from "@/lib/utils";
import {
  BOT_STEP_TYPES,
  type BotStep,
  type BotStepType,
  type MessageChannel,
} from "@/lib/automation-types";
import { useLeadCustomFieldDefs, usePipelineStagesRaw, useProfilesRaw } from "@/hooks/use-crm-data";
import {
  useDeleteSalesbot,
  useSalesbotRuns,
  useSalesbots,
  useSaveSalesbot,
  type SalesbotInput,
  type SalesbotRow,
} from "@/hooks/use-automations";

// Salesbot builder: a bot is an ordered list of steps; each step continues
// to the next one unless it points somewhere else (button / condition
// branches, "go to step"). Runs server-side (lib/automations/engine.server.ts),
// started by a trigger ("Salesbotni ishga tushirish"), from a lead page, or
// as an external bot connected by URL.

export const Route = createFileRoute("/admin/salesbots")({
  head: () => ({ meta: [{ title: "Salesbotlar — SalesIQ" }] }),
  component: AdminSalesbotsPage,
});

const CHANNELS: MessageChannel[] = ["auto", "telegram", "whatsapp", "sms"];
const NEW = "__new__";

function newStepId() {
  return `s_${Math.random().toString(36).slice(2, 8)}`;
}

function blankStep(type: BotStepType): BotStep {
  const id = newStepId();
  switch (type) {
    case "message":
      return { id, type, text: "" };
    case "wait_reply":
      return { id, type, timeoutMinutes: 60 };
    case "condition":
      return { id, type, source: "reply", operator: "contains", value: "" };
    case "action":
      return { id, type, action: blankAction("add_tag") };
    case "delay":
      return { id, type, minutes: 30 };
    case "handoff":
      return { id, type };
    case "stop":
      return { id, type };
  }
}

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

/* ------------------------------ step editor ------------------------------ */

function StepTarget({
  value,
  onChange,
  steps,
  self,
  label,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  steps: BotStep[];
  self: string;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] text-subtle">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className={inputCls}
      >
        <option value="">{t("sb.nextInList")}</option>
        {steps.map((s, i) =>
          s.id === self ? null : (
            <option key={s.id} value={s.id}>
              {i + 1}. {t(`sb.step.${s.type}`)}
            </option>
          ),
        )}
      </select>
    </label>
  );
}

function StepEditor({
  step,
  index,
  steps,
  onChange,
  onRemove,
  onMove,
  options,
}: {
  step: BotStep;
  index: number;
  steps: BotStep[];
  onChange: (s: BotStep) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  options: ActionEditorOptions;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-bold text-primary">
          {index + 1}
        </span>
        <p className="flex-1 text-sm font-semibold text-foreground">{t(`sb.step.${step.type}`)}</p>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="rounded-md p-1 text-subtle hover:bg-accent disabled:opacity-30"
          aria-label="up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === steps.length - 1}
          className="rounded-md p-1 text-subtle hover:bg-accent disabled:opacity-30"
          aria-label="down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-subtle hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("dp.remove")}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {step.type === "message" && (
        <div className="space-y-2">
          <textarea
            value={step.text}
            onChange={(e) => onChange({ ...step, text: e.target.value })}
            rows={3}
            placeholder={t("dp.messagePlaceholder")}
            className={`${inputCls} h-auto py-2`}
          />
          <p className="text-[11px] text-subtle">{t("sb.messageHint")}</p>
          {(step.buttons ?? []).map((b, i) => (
            <div
              key={i}
              className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
            >
              <label className="block">
                <span className="mb-1 block text-[11px] text-subtle">
                  {t("sb.button")} {i + 1}
                </span>
                <input
                  value={b.label}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      buttons: step.buttons!.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    })
                  }
                  className={inputCls}
                />
              </label>
              <StepTarget
                value={b.next}
                steps={steps}
                self={step.id}
                label={t("sb.goTo")}
                onChange={(v) =>
                  onChange({
                    ...step,
                    buttons: step.buttons!.map((x, j) => {
                      if (j !== i) return x;
                      const { next: _n, ...rest } = x;
                      return v ? { ...rest, next: v } : rest;
                    }),
                  })
                }
              />
              <button
                type="button"
                onClick={() =>
                  onChange({ ...step, buttons: step.buttons!.filter((_, j) => j !== i) })
                }
                className="mb-1 rounded-md p-1.5 text-subtle hover:text-destructive"
                aria-label={t("dp.remove")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...step, buttons: [...(step.buttons ?? []), { label: "" }] })}
            className="text-xs font-semibold text-primary hover:underline"
          >
            + {t("sb.addButton")}
          </button>
          <StepTarget
            value={step.next}
            steps={steps}
            self={step.id}
            label={step.buttons?.length ? t("sb.otherAnswer") : t("sb.then")}
            onChange={(v) => {
              const { next: _n, ...rest } = step;
              onChange(v ? { ...rest, next: v } : rest);
            }}
          />
        </div>
      )}

      {step.type === "wait_reply" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] text-subtle">{t("sb.waitUpTo")}</p>
            <DurationInput
              minutes={step.timeoutMinutes}
              onChange={(m) => onChange({ ...step, timeoutMinutes: Math.max(1, m) })}
            />
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] text-subtle">{t("sb.saveAs")}</span>
            <input
              value={step.saveAs ?? ""}
              onChange={(e) => {
                const { saveAs: _s, ...rest } = step;
                const v = e.target.value.replace(/[^\w]/g, "");
                onChange(v ? { ...rest, saveAs: v } : rest);
              }}
              placeholder="budjet"
              className={inputCls}
            />
          </label>
          <StepTarget
            value={step.next}
            steps={steps}
            self={step.id}
            label={t("sb.onReply")}
            onChange={(v) => {
              const { next: _n, ...rest } = step;
              onChange(v ? { ...rest, next: v } : rest);
            }}
          />
          <StepTarget
            value={step.onTimeout}
            steps={steps}
            self={step.id}
            label={t("sb.onTimeout")}
            onChange={(v) => {
              const { onTimeout: _o, ...rest } = step;
              onChange(v ? { ...rest, onTimeout: v } : rest);
            }}
          />
        </div>
      )}

      {step.type === "condition" && (
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={step.source === "reply" ? "reply" : (step.field ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "reply") {
                const { field: _f, ...rest } = step;
                onChange({ ...rest, source: "reply" });
              } else onChange({ ...step, source: "field", field: v });
            }}
            className={inputCls}
          >
            <option value="reply">{t("sb.lastReply")}</option>
            <option value="tags">{t("sb.fieldTags")}</option>
            <option value="budget">{t("dp.field.budget")}</option>
            <option value="source">{t("dp.field.source")}</option>
            <option value="priority">{t("dp.field.priority")}</option>
            <option value="temperature">{t("dp.field.temperature")}</option>
            {options.customFields.map((f) => (
              <option key={f.key} value={`custom:${f.key}`}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            value={step.operator}
            onChange={(e) =>
              onChange({ ...step, operator: e.target.value as typeof step.operator })
            }
            className={inputCls}
          >
            {(["contains", "eq", "neq", "gt", "lt", "any"] as const).map((o) => (
              <option key={o} value={o}>
                {t(`sb.op.${o}`)}
              </option>
            ))}
          </select>
          {step.operator !== "any" && (
            <input
              value={step.value}
              onChange={(e) => onChange({ ...step, value: e.target.value })}
              placeholder={t("sb.conditionValue")}
              className={inputCls}
            />
          )}
          <StepTarget
            value={step.then}
            steps={steps}
            self={step.id}
            label={t("sb.ifYes")}
            onChange={(v) => {
              const { then: _t, ...rest } = step;
              onChange(v ? { ...rest, then: v } : rest);
            }}
          />
          <StepTarget
            value={step.else}
            steps={steps}
            self={step.id}
            label={t("sb.ifNo")}
            onChange={(v) => {
              const { else: _e, ...rest } = step;
              onChange(v ? { ...rest, else: v } : rest);
            }}
          />
        </div>
      )}

      {step.type === "action" && (
        <div className="space-y-2">
          <select
            value={step.action.type}
            onChange={(e) => onChange({ ...step, action: blankAction(e.target.value as never) })}
            className={inputCls}
          >
            {(
              [
                "add_tag",
                "remove_tag",
                "move_stage",
                "create_task",
                "assign_owner",
                "set_field",
                "add_note",
                "close_won",
                "close_lost",
                "webhook",
              ] as const
            ).map((a) => (
              <option key={a} value={a}>
                {t(`dp.action.${a}`)}
              </option>
            ))}
          </select>
          <ActionEditor
            action={step.action}
            options={options}
            onChange={(action) => onChange({ ...step, action })}
          />
          <StepTarget
            value={step.next}
            steps={steps}
            self={step.id}
            label={t("sb.then")}
            onChange={(v) => {
              const { next: _n, ...rest } = step;
              onChange(v ? { ...rest, next: v } : rest);
            }}
          />
        </div>
      )}

      {step.type === "delay" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] text-subtle">{t("sb.pauseFor")}</p>
            <DurationInput
              minutes={step.minutes}
              onChange={(m) => onChange({ ...step, minutes: Math.max(1, m) })}
            />
          </div>
          <StepTarget
            value={step.next}
            steps={steps}
            self={step.id}
            label={t("sb.then")}
            onChange={(v) => {
              const { next: _n, ...rest } = step;
              onChange(v ? { ...rest, next: v } : rest);
            }}
          />
        </div>
      )}

      {step.type === "handoff" && (
        <div className="space-y-1">
          <input
            value={step.text ?? ""}
            onChange={(e) => {
              const { text: _x, ...rest } = step;
              onChange(e.target.value ? { ...rest, text: e.target.value } : rest);
            }}
            placeholder={t("sb.handoffNote")}
            className={inputCls}
          />
          <p className="text-[11px] text-subtle">{t("sb.handoffHint")}</p>
        </div>
      )}

      {step.type === "stop" && <p className="text-xs text-subtle">{t("sb.stopHint")}</p>}
    </div>
  );
}

/* ------------------------------ runs ------------------------------ */

function BotRuns({ botId }: { botId: string }) {
  const { t } = useI18n();
  const { data: runs, isLoading, refetch } = useSalesbotRuns(botId);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <SectionCard
      title={t("sb.runs")}
      actions={
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-md p-1.5 text-subtle hover:bg-accent"
          aria-label="refresh"
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

/* ------------------------------ page ------------------------------ */

function BotEditor({ bot, onSaved }: { bot: SalesbotRow | null; onSaved: (id: string) => void }) {
  const { t } = useI18n();
  const save = useSaveSalesbot();
  const remove = useDeleteSalesbot();
  const { data: profiles } = useProfilesRaw();
  const { data: stages } = usePipelineStagesRaw();
  const { data: bots } = useSalesbots();
  const { data: customDefs } = useLeadCustomFieldDefs();
  const [draft, setDraft] = useState<SalesbotInput>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(
      bot
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
        : { ...EMPTY, steps: [blankStep("message")] },
    );
  }, [bot]);

  const options: ActionEditorOptions = useMemo(
    () => ({
      profiles: (profiles ?? []).map((p) => ({ id: p.id, full_name: p.full_name || p.email })),
      stages: (stages ?? []).map((s) => ({
        id: s.id,
        name: `${s.pipeline_name || "Direct Sales"} · ${s.name}`,
      })),
      bots: (bots ?? []).map((b) => ({ id: b.id, name: b.name })),
      customFields: (customDefs ?? []).map((d) => ({ key: d.key, label: d.label })),
    }),
    [profiles, stages, bots, customDefs],
  );

  const set = (patch: Partial<SalesbotInput>) => setDraft({ ...draft, ...patch });
  const steps = draft.steps;
  const setSteps = (next: BotStep[]) => set({ steps: next });
  const valid =
    !!draft.name.trim() &&
    (draft.kind === "external"
      ? /^https:\/\//.test(draft.external_url ?? "") && !!draft.external_secret
      : steps.length > 0);

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
    <div className="space-y-4">
      <SectionCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder={t("sb.name")}
            className={`${inputCls} h-10 sm:col-span-2`}
          />
          <div className="flex gap-1 rounded-xl border border-border p-1">
            {(["builtin", "external"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() =>
                  set({
                    kind: k,
                    ...(k === "external" && !draft.external_secret
                      ? { external_secret: randomSecret() }
                      : {}),
                  })
                }
                className={cn(
                  "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold",
                  draft.kind === k ? "bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {t(`sb.kind.${k}`)}
              </button>
            ))}
          </div>
          <select
            value={draft.channel}
            onChange={(e) => set({ channel: e.target.value as MessageChannel })}
            className={inputCls}
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t(`dp.channel.${c}`)}
              </option>
            ))}
          </select>
          <label className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm sm:col-span-2">
            {t("sb.enabled")}
            <Switch checked={draft.enabled ?? true} onCheckedChange={(v) => set({ enabled: v })} />
          </label>
        </div>
      </SectionCard>

      {draft.kind === "builtin" ? (
        <>
          {steps.map((s, i) => (
            <StepEditor
              key={s.id}
              step={s}
              index={i}
              steps={steps}
              options={options}
              onChange={(next) => setSteps(steps.map((x) => (x.id === s.id ? next : x)))}
              onRemove={() => setSteps(steps.filter((x) => x.id !== s.id))}
              onMove={(dir) => {
                const j = i + dir;
                if (j < 0 || j >= steps.length) return;
                const copy = [...steps];
                [copy[i], copy[j]] = [copy[j]!, copy[i]!];
                setSteps(copy);
              }}
            />
          ))}
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setSteps([...steps, blankStep(e.target.value as BotStepType)]);
            }}
            className={`${inputCls} h-10 border-dashed text-muted-foreground`}
          >
            <option value="">+ {t("sb.addStep")}</option>
            {BOT_STEP_TYPES.map((st) => (
              <option key={st} value={st}>
                {t(`sb.step.${st}`)}
              </option>
            ))}
          </select>
        </>
      ) : (
        <SectionCard title={t("sb.externalTitle")} description={t("sb.externalDesc")}>
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
                className={`${inputCls} font-mono text-xs`}
              />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(draft.external_secret ?? "");
                  toast.success(t("sb.copied"));
                }}
                className="rounded-lg border border-border px-2.5 text-subtle hover:text-foreground"
                aria-label="copy"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => set({ external_secret: randomSecret() })}
                className="rounded-lg border border-border px-2.5 text-subtle hover:text-foreground"
                aria-label="regenerate"
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
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!valid || save.isPending}
          onClick={() => void submit()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("dp.save")}
        </button>
        {bot && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" /> {t("dp.remove")}
          </button>
        )}
      </div>

      {bot && <BotRuns botId={bot.id} />}

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

function SalesbotsPage() {
  const { t } = useI18n();
  const { data: bots, isLoading } = useSalesbots();
  const [selected, setSelected] = useState<string>(NEW);

  useEffect(() => {
    if (selected === NEW && bots?.length) setSelected(bots[0]!.id);
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bots?.length]);

  const bot = (bots ?? []).find((b) => b.id === selected) ?? null;

  return (
    <>
      <AdminBackLink />
      <PageHeader
        title={t("sb.title")}
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
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setSelected(NEW)}
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
          {(bots ?? []).map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelected(b.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm",
                selected === b.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40",
              )}
            >
              <Bot className={cn("h-4 w-4 shrink-0", b.enabled ? "text-primary" : "text-subtle")} />
              <span className="min-w-0 flex-1 truncate text-foreground">{b.name}</span>
              <span className="shrink-0 text-[11px] text-subtle">{t(`sb.kind.${b.kind}`)}</span>
            </button>
          ))}
        </div>
        <BotEditor key={bot?.id ?? NEW} bot={bot} onSaved={setSelected} />
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
        <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
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
