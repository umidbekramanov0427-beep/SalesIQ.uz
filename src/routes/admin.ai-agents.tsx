import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bot, Loader2, MessageSquare, Phone, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
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
      { title: "AI agentlar — SalesIQ" },
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

const CHANNELS = ["telegram_bot", "telegram", "whatsapp", "instagram"] as const;
const CHANNEL_LABEL: Record<(typeof CHANNELS)[number], string> = {
  telegram_bot: "Telegram Bot",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
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

      <h3 className="mt-4 text-sm font-semibold text-foreground">
        {kind === "chat" ? t("admin.ai.chatTitle") : t("admin.ai.callTitle")}
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
      <AdminBackLink />
      <PageHeader
        title={t("admin.aiAgents")}
        description={t("admin.aiAgentsDesc")}
        icon={Sparkles}
        tone="violet"
      />

      <p className="mb-6 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm leading-relaxed text-warning-foreground">
        {t("admin.ai.notice")}
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <AgentCard kind="chat" agent={chatAgent} />
          <AgentCard kind="call" agent={callAgent} />
        </div>
      )}
    </>
  );
}
