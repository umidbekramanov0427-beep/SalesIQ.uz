import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Send,
  Timer,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, SettingRow, SettingRows } from "@/components/layout/Primitives";
import { useOrgBot, useOrgBotAction, type OrgBotState } from "@/hooks/use-crm-data";
import { useSalesbots } from "@/hooks/use-automations";
import { useAuth } from "@/lib/auth";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// Integratsiyalar -> Telegram bot: the company connects its own bot from
// @BotFather. Its clients then write to it (t.me/<bot> opens the main
// salesbot), and the shared trial bot -- which takes new clients only for
// the first 14 days -- is no longer needed.

export function OrgBotCard() {
  const { t } = useI18n();
  const { data, isLoading } = useOrgBot();
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  if (!data || !data.ready) {
    return (
      <SectionCard icon={AlertTriangle} tone="amber" title={t("obot.notReady")}>
        <p className="text-sm text-muted-foreground">{t("obot.notReadyDesc")}</p>
      </SectionCard>
    );
  }
  return (
    <div className="space-y-5">
      <SharedBotNotice state={data} />
      {data.bot ? <Connected state={data} /> : <ConnectSteps />}
    </div>
  );
}

/** «The trial bot works N more days / has stopped» -- also on the salesbot page. */
export function SharedBotNotice({
  state,
  withLink = false,
}: {
  state: OrgBotState;
  withLink?: boolean;
}) {
  const { t } = useI18n();
  if (state.bot) return null;
  const days = state.sharedBot.daysLeft;
  if (days == null) return null;
  const over = days <= 0;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3",
        over
          ? "border-rose-500/30 bg-rose-500/[0.07]"
          : days <= 3
            ? "border-amber-500/30 bg-amber-500/[0.08]"
            : "border-sky-500/25 bg-sky-500/[0.06]",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
          over
            ? "bg-rose-500/15 text-rose-600 dark:text-rose-300"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
        )}
      >
        {over ? <AlertTriangle className="h-5 w-5" /> : <Timer className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">
          {over ? t("obot.sharedOver") : t("obot.sharedLeft", { n: days })}
        </p>
        <p className="text-[12.5px] leading-snug text-muted-foreground">
          {over ? t("obot.sharedOverDesc") : t("obot.sharedLeftDesc")}
        </p>
      </div>
      {withLink && (
        <Link
          to="/integrations/$slug"
          params={{ slug: "telegram-bot" }}
          className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold"
        >
          <Bot className="h-4 w-4" />
          {t("obot.connectCta")}
        </Link>
      )}
    </div>
  );
}

const STEPS = ["obot.step1", "obot.step2", "obot.step3", "obot.step4"] as const;

function ConnectSteps() {
  const { t } = useI18n();
  const { user } = useAuth();
  const act = useOrgBotAction();
  const [token, setToken] = useState("");
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";

  async function connect() {
    try {
      const r = await act.mutateAsync({ action: "connect", token: token.trim() });
      setToken("");
      toast.success(t("obot.connected", { name: r.username ?? "" }));
    } catch (err) {
      toast.error(describeError(err, t("obot.connectFailed")));
    }
  }

  return (
    <SectionCard
      icon={Bot}
      tone="sky"
      title={t("obot.stepsTitle")}
      description={t("obot.stepsDesc")}
    >
      <ol className="space-y-3">
        {STEPS.map((k, i) => (
          <li key={k} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-500/12 text-[13px] font-bold text-sky-700 dark:text-sky-300">
              {i + 1}
            </span>
            <p className="pt-1 text-[13.5px] leading-snug text-foreground">{t(k)}</p>
          </li>
        ))}
      </ol>
      <a
        href="https://t.me/BotFather"
        target="_blank"
        rel="noreferrer"
        className="ctl-soft mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold"
      >
        <Send className="h-4 w-4" /> {t("obot.openBotFather")}
      </a>
      <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
        <label className="text-[13px] font-semibold text-foreground" htmlFor="org-bot-token">
          {t("obot.tokenLabel")}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="flex h-11 min-w-[260px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <input
              id="org-bot-token"
              type="password"
              autoComplete="off"
              value={token}
              disabled={!isAdmin}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAH..."
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-[14px] outline-none"
            />
          </span>
          <button
            type="button"
            disabled={!isAdmin || token.trim().length < 20 || act.isPending}
            onClick={() => void connect()}
            className="ctl-lit inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold disabled:opacity-50"
          >
            {act.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bot className="h-4 w-4" />
            )}
            {t("obot.connect")}
          </button>
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {isAdmin ? t("obot.tokenSafe") : t("obot.adminOnly")}
        </p>
      </div>
    </SectionCard>
  );
}

function Connected({ state }: { state: OrgBotState }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const act = useOrgBotAction();
  const { data: salesbots } = useSalesbots();
  const bot = state.bot!;
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const run = (body: Parameters<typeof act.mutate>[0], ok: string) =>
    act.mutate(body, {
      onSuccess: () => toast.success(ok),
      onError: (e) => toast.error(describeError(e, t("obot.connectFailed"))),
    });

  return (
    <SectionCard
      icon={CheckCircle2}
      tone="emerald"
      title={`@${bot.username}`}
      description={t("obot.connectedDesc")}
      actions={
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-semibold",
            bot.webhookOk
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          )}
        >
          {bot.webhookOk ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          {bot.webhookOk ? t("obot.working") : t("obot.webhookIssue")}
        </span>
      }
    >
      <SettingRows>
        <SettingRow title={t("obot.link")} description={t("obot.linkDesc")}>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-surface px-2.5 py-1.5 text-[13px] font-semibold">
              {bot.link.replace("https://", "")}
            </code>
            <button
              type="button"
              aria-label={t("obot.copy")}
              onClick={() => void copyText(bot.link).then(() => toast.success(t("obot.copied")))}
              className="ctl-soft grid h-9 w-9 place-items-center rounded-lg"
            >
              <Copy className="h-4 w-4" />
            </button>
            <a
              href={bot.link}
              target="_blank"
              rel="noreferrer"
              className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold"
            >
              <ExternalLink className="h-4 w-4" /> {t("obot.test")}
            </a>
          </div>
        </SettingRow>
        <SettingRow title={t("obot.main")} description={t("obot.mainDesc")}>
          <select
            value={bot.defaultSalesbotId ?? ""}
            disabled={!isAdmin || act.isPending}
            onChange={(e) =>
              run({ action: "default", salesbotId: e.target.value || null }, t("obot.saved"))
            }
            className="h-10 min-w-[220px] rounded-xl border border-border bg-card px-3 text-[13.5px] text-foreground outline-none focus:border-primary"
          >
            <option value="">{t("obot.noMain")}</option>
            {(salesbots ?? [])
              .filter((s) => s.enabled && (s.channel === "telegram" || s.channel === "auto"))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </SettingRow>
        {bot.webhookError && (
          <SettingRow title={t("obot.lastError")} description={bot.webhookError}>
            <span />
          </SettingRow>
        )}
      </SettingRows>
      {isAdmin && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={act.isPending}
            onClick={() => run({ action: "reconnect" }, t("obot.reconnected"))}
            className="ctl-soft inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold"
          >
            <RefreshCw className="h-4 w-4" /> {t("obot.reconnect")}
          </button>
          <button
            type="button"
            disabled={act.isPending}
            onClick={() => {
              if (window.confirm(t("obot.disconnectConfirm", { name: bot.username })))
                run({ action: "disconnect" }, t("obot.disconnected"));
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-500/30 px-4 text-[13px] font-semibold text-rose-600 hover:bg-rose-500/10"
          >
            <Unplug className="h-4 w-4" /> {t("obot.disconnect")}
          </button>
        </div>
      )}
    </SectionCard>
  );
}
