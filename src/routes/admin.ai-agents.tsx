import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Gauge,
  Loader2,
  MessageSquare,
  Phone,
  Plug,
  Plus,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";
import { InfoTip, PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useAiAgents, useUpdateAiAgent, type AiAgentRow } from "@/hooks/use-crm-data";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/ai-agents")({
  head: () => ({
    meta: [
      { title: "AI-agentlar va botlar — SalesIQ" },
      { name: "description", content: "Admin-only AI agent configuration for chats and calls." },
    ],
  }),
  component: AiAgentsPage,
});

// Both agents always run on the platform's own Gemini-backed pipeline
// (src/routes/ai-assistant.chat.ts, src/routes/audio-analytics.analyze.ts) --
// there was never a real per-agent model choice, so the old DeepSeek picker
// here just showed a value that had zero effect on what actually ran.
const ACTIVE_MODEL_LABEL = "Gemini";

const CHANNELS = ["telegram_bot", "telegram", "instagram"] as const;
const CHANNEL_LABEL: Record<(typeof CHANNELS)[number], string> = {
  telegram_bot: "Telegram Bot",
  telegram: "Telegram",
  instagram: "Instagram",
};

type Kind = "chat" | "call";

const DEFAULTS: Record<Kind, { icon: typeof MessageSquare; promptKey: string }> = {
  chat: { icon: MessageSquare, promptKey: "admin.ai.chatDefaultPrompt" },
  call: { icon: Phone, promptKey: "admin.ai.callDefaultPrompt" },
};

// Supabase's PostgrestError is a real Error subclass, but a save can also
// fail before the network call (e.g. a stale RLS policy rejecting the
// write) with other error shapes -- read .message off anything that has
// one instead of only trusting `instanceof Error`, so a real reason shows
// up in the toast instead of always falling back to the generic text.
function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

function ConfigDialog({
  kind,
  agent,
  open,
  onOpenChange,
}: {
  kind: Kind;
  agent: AiAgentRow | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const updateAgent = useUpdateAiAgent();
  const [systemPrompt, setSystemPrompt] = useState("");
  const [channels, setChannels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSystemPrompt(agent?.system_prompt ?? t(DEFAULTS[kind].promptKey));
    setChannels(agent?.channels ?? []);
  }, [open, agent, kind, t]);

  function toggleChannel(c: string) {
    setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateAgent.mutateAsync({
        kind,
        model: "gemini",
        system_prompt: systemPrompt.trim(),
        channels: kind === "chat" ? channels : [],
        active: agent?.active ?? true,
      });
      toast.success(t("admin.ai.saved"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("admin.ai.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            {kind === "chat" ? t("admin.ai.chatTitle") : t("admin.ai.callTitle")}
          </DialogTitle>
          <DialogDescription>{t("admin.ai.formDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            {t("admin.ai.model")}:{" "}
            <span className="font-medium text-foreground">{ACTIVE_MODEL_LABEL}</span>
          </p>

          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("admin.ai.systemPrompt")}
            </span>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          {kind === "chat" && (
            <div>
              <span className="text-[13px] font-medium text-muted-foreground">
                {t("admin.ar.channels")}
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => toggleChannel(c)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      channels.includes(c)
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {CHANNEL_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AgentCard({ kind, agent }: { kind: Kind; agent: AiAgentRow | undefined }) {
  const { t } = useI18n();
  const updateAgent = useUpdateAiAgent();
  const [open, setOpen] = useState(false);
  const Icon = DEFAULTS[kind].icon;

  async function toggleActive() {
    try {
      await updateAgent.mutateAsync({
        kind,
        active: !(agent?.active ?? false),
        model: agent?.model ?? undefined,
        system_prompt: agent?.system_prompt ?? undefined,
        channels: agent?.channels,
      });
    } catch (err) {
      toast.error(errorMessage(err, t("admin.ai.saveFailed")));
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <Switch
          checked={agent?.active ?? false}
          onCheckedChange={() => void toggleActive()}
          aria-label={kind === "chat" ? t("admin.ai.chatTitle") : t("admin.ai.callTitle")}
        />
      </div>

      <h3 className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {kind === "chat" ? t("admin.ai.chatTitle") : t("admin.ai.callTitle")}
        <InfoTip text={kind === "chat" ? t("admin.ai.chatDesc") : t("admin.ai.callDesc")} />
      </h3>
      <p className="mt-1.5 text-xs text-subtle">
        {kind === "chat" ? t("admin.ai.chatDesc") : t("admin.ai.callDesc")}
      </p>

      {agent && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("admin.ai.model")}:{" "}
          <span className="font-medium text-foreground">{ACTIVE_MODEL_LABEL}</span>
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-xl border border-border bg-background text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
      >
        {t("admin.ai.configure")}
      </button>

      <ConfigDialog kind={kind} agent={agent} open={open} onOpenChange={setOpen} />
    </div>
  );
}

function AiAgentsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: agents, isLoading } = useAiAgents();
  const overview = useAiOverview();

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
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

  const chatAgent = agents?.find((a) => a.kind === "chat");
  const callAgent = agents?.find((a) => a.kind === "call");

  return (
    <>
      <PageHeader
        title={t("aib.title")}
        description={t("aib.desc")}
        icon={Sparkles}
        tone="violet"
      />

      <div className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <GroupLabel>{t("aib.inside")}</GroupLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <AgentCard kind="chat" agent={chatAgent} />
                <AgentCard kind="call" agent={callAgent} />
              </div>
            </div>
            <div>
              <GroupLabel>{t("aib.external")}</GroupLabel>
              <ExternalAgents bots={overview.data?.bots ?? []} />
            </div>
          </div>
        )}

        <UsageCard usage={overview.data?.usage} loading={overview.isLoading} />
        <BotsTable bots={overview.data?.bots ?? []} loading={overview.isLoading} />
      </div>
    </>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </p>
  );
}

type Usage = { calls: number; minutes: number; questions: number; scored: number };
type BotRow = {
  id: string;
  name: string;
  kind: string;
  channel: string;
  enabled: boolean;
  triggers: { type: string; stage: string | null; on: boolean }[];
  runs: number;
  done: number;
};
type Overview = { usage: { thisMonth: Usage; lastMonth: Usage }; bots: BotRow[] };

function useAiOverview() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["ai-overview", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async (): Promise<Overview> => {
      const res = await apiFetch("/admin/ai-overview");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Overview;
    },
  });
}

const BOTS_LINK = { to: "/funnels/settings", search: { tab: "salesbots" } } as const;

// Bots whose brain lives outside SalesIQ (connected by URL), amoCRM's
// "Внешние агенты".
function ExternalAgents({ bots }: { bots: BotRow[] }) {
  const { t } = useI18n();
  const ext = bots.filter((b) => b.kind === "external");
  return (
    <div className="flex h-[calc(100%-2rem)] flex-col rounded-2xl border border-border bg-surface p-5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-300">
        <Plug className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{t("aib.extTitle")}</h3>
      <p className="mt-1.5 text-xs text-subtle">{t("aib.extDesc")}</p>
      {ext.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {ext.map((b) => (
            <li key={b.id} className="flex items-center gap-2 text-[13px] text-foreground">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  b.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
              <span className="truncate">{b.name}</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        {...BOTS_LINK}
        className="mt-auto inline-flex h-9 w-full items-center justify-center rounded-xl border border-border bg-background pt-0 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent [margin-top:max(1rem,auto)]"
      >
        {ext.length ? t("aib.extManage") : t("aib.extConnect")}
      </Link>
    </div>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  const { t } = useI18n();
  if (!before && !now) return <span className="text-[12px] text-subtle">—</span>;
  if (!before) return <span className="text-[12px] text-subtle">{t("aib.newThisMonth")}</span>;
  const pct = Math.round(((now - before) / before) * 100);
  return (
    <span
      className={cn(
        "text-[12px] font-semibold tabular-nums",
        pct > 0
          ? "text-emerald-600 dark:text-emerald-400"
          : pct < 0
            ? "text-rose-600 dark:text-rose-400"
            : "text-subtle",
      )}
    >
      {pct > 0 ? "+" : ""}
      {pct}% {t("aib.vsLast")}
    </span>
  );
}

// amoCRM's "Расходование токенов", with real numbers: what the AI did this
// month for the company, against last month.
function UsageCard({ usage, loading }: { usage: Overview["usage"] | undefined; loading: boolean }) {
  const { t } = useI18n();
  const cur = usage?.thisMonth;
  const prev = usage?.lastMonth;
  const tiles: { key: keyof Usage; icon: LucideIcon; tone: string; sub?: string | undefined }[] = [
    {
      key: "calls",
      icon: Phone,
      tone: "bg-rose-500/12 text-rose-600 dark:text-rose-300",
      sub: cur ? t("aib.minutes", { n: cur.minutes.toLocaleString("ru-RU") }) : undefined,
    },
    {
      key: "questions",
      icon: MessageSquare,
      tone: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
    },
    { key: "scored", icon: Gauge, tone: "bg-amber-500/12 text-amber-600 dark:text-amber-300" },
  ];
  return (
    <SectionCard
      icon={Activity}
      tone="violet"
      title={t("aib.usageTitle")}
      description={t("aib.usageDesc")}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map(({ key, icon: Icon, tone, sub }) => (
          <div key={key} className="rounded-xl border border-border bg-surface px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className={cn("grid h-8 w-8 place-items-center rounded-lg", tone)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[12.5px] font-semibold text-muted-foreground">
                {t(`aib.u.${key}`)}
              </span>
            </div>
            <p className="mt-2.5 text-[26px] font-bold leading-none tabular-nums text-foreground">
              {loading || !cur ? "…" : cur[key].toLocaleString("ru-RU")}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {sub && <span className="text-[12px] text-muted-foreground">{sub}</span>}
              {cur && prev && <Delta now={cur[key]} before={prev[key]} />}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function BotsTable({ bots, loading }: { bots: BotRow[]; loading: boolean }) {
  const { t } = useI18n();
  return (
    <SectionCard
      icon={Bot}
      tone="sky"
      title={t("aib.botsTitle")}
      description={t("aib.botsDesc")}
      actions={
        <Link
          {...BOTS_LINK}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> {t("aib.newBot")}
        </Link>
      }
    >
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-border bg-surface text-[11px] font-bold uppercase tracking-[0.06em] text-subtle">
              <th className="px-4 py-2.5">{t("aib.col.name")}</th>
              <th className="px-4 py-2.5">{t("aib.col.triggers")}</th>
              <th className="px-4 py-2.5 text-right">{t("aib.col.conversion")}</th>
              <th className="px-4 py-2.5 text-right">{t("aib.col.runs")}</th>
              <th className="px-4 py-2.5 text-right">{t("aib.col.done")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </td>
              </tr>
            ) : bots.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("aib.noBots")}{" "}
                  <Link
                    {...BOTS_LINK}
                    className="font-semibold text-primary underline-offset-2 hover:underline"
                  >
                    {t("aib.createFirst")}
                  </Link>
                </td>
              </tr>
            ) : (
              bots.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-border last:border-b-0 hover:bg-accent/40"
                >
                  <td className="px-4 py-3">
                    <Link {...BOTS_LINK} className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          b.enabled ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                        title={t(b.enabled ? "aib.on" : "aib.off")}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-semibold text-foreground">
                          {b.name}
                        </span>
                        <span className="block text-[11.5px] text-muted-foreground">
                          {t(b.kind === "external" ? "aib.kindExternal" : "aib.kindBuiltin")}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {b.triggers.length === 0 ? (
                      <span className="text-[12.5px] text-subtle">{t("aib.noTriggers")}</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {b.triggers.slice(0, 3).map((tr, i) => (
                          <span
                            key={i}
                            className={cn(
                              "rounded-md border border-border bg-background px-2 py-0.5 text-[11.5px] text-foreground",
                              !tr.on && "opacity-50",
                            )}
                          >
                            {t(`dp.trigger.${tr.type}`)}
                            {tr.stage ? ` · ${tr.stage}` : ""}
                          </span>
                        ))}
                        {b.triggers.length > 3 && (
                          <span className="text-[11.5px] text-subtle">
                            +{b.triggers.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-[13.5px] font-semibold tabular-nums text-foreground">
                    {b.runs ? `${Math.round((b.done / b.runs) * 100)}%` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-[13.5px] tabular-nums text-foreground">
                    {b.runs.toLocaleString("ru-RU")}
                  </td>
                  <td className="px-4 py-3 text-right text-[13.5px] tabular-nums text-foreground">
                    {b.done.toLocaleString("ru-RU")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-muted-foreground">{t("aib.otherBots")}</span>
        {(
          [
            ["autoreplies", "aib.other.autoreplies"],
            ["followups", "aib.other.followups"],
            ["automations", "aib.other.automations"],
          ] as const
        ).map(([tab, key]) => (
          <Link
            key={tab}
            to="/funnels/settings"
            search={{ tab }}
            className="rounded-full border border-border px-3 py-1 text-[12.5px] font-semibold text-foreground hover:border-primary/50 hover:bg-primary/10"
          >
            {t(key)}
          </Link>
        ))}
        <Link
          to="/daily-report-settings"
          className="rounded-full border border-border px-3 py-1 text-[12.5px] font-semibold text-foreground hover:border-primary/50 hover:bg-primary/10"
        >
          {t("aib.other.telegram")}
        </Link>
      </div>
    </SectionCard>
  );
}
