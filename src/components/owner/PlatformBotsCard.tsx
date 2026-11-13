import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OwnerPanel } from "@/components/owner/OwnerPage";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// Platforma -> Botlar: the platform's three Telegram bots side by side --
// who each one talks to, what it carries, whether it is connected and its
// webhook works, and (for the staff and monitoring bots) a place to paste
// the token from @BotFather. The client bot's token lives on the server.

type Kind = "client" | "staff" | "ops";
type BotState = {
  username: string | null;
  source: "env" | "panel" | null;
  webhook: string | null;
  webhookError: string | null;
};
type Data = { ready: boolean; bots: Record<Kind, BotState>; staffChats: number };

const META: Record<Kind, { icon: LucideIcon; tile: string; roles: string[] }> = {
  client: {
    icon: Users,
    tile: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
    roles: ["leads", "salesbot", "payments", "receipts"],
  },
  staff: {
    icon: Briefcase,
    tile: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    roles: ["attendance", "tasks", "reports", "codes"],
  },
  ops: {
    icon: ShieldCheck,
    tile: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    roles: ["health", "errors", "security", "backup"],
  },
};

export function PlatformBotsCard() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["owner-bots"],
    queryFn: async () => {
      const res = await apiFetch("/platform/bots-api");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Data;
    },
  });
  return (
    <OwnerPanel title={t("pbots.title")} info={t("pbots.info")}>
      {isLoading || !data ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : (
        <div className="space-y-3">
          {!data.ready && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
              {t("pbots.notReady")}
            </p>
          )}
          <div className="grid gap-3 xl:grid-cols-3">
            {(["client", "staff", "ops"] as const).map((k) => (
              <BotCard
                key={k}
                kind={k}
                bot={data.bots[k]}
                staffChats={data.staffChats}
                canEdit={data.ready}
              />
            ))}
          </div>
        </div>
      )}
    </OwnerPanel>
  );
}

function BotCard({
  kind,
  bot,
  staffChats,
  canEdit,
}: {
  kind: Kind;
  bot: BotState;
  staffChats: number;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [editing, setEditing] = useState(false);
  const meta = META[kind];
  const Icon = meta.icon;
  const connected = !!bot.username;
  // Where Telegram must send this bot's messages for it to answer.
  const hookPath = kind === "ops" ? "/telegram/ops-webhook" : "/telegram/webhook";
  const hookOk = connected && !!bot.webhook && bot.webhook.endsWith(hookPath) && !bot.webhookError;
  const save = useMutation({
    mutationFn: async (value: string | null) => {
      const res = await apiFetch("/platform/bots-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, token: value }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        username?: string;
        webhookError?: string | null;
      };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      return d;
    },
    onSuccess: (d, value) => {
      if (value && d.webhookError) toast.error(t("pbots.hookFailed", { e: d.webhookError }));
      else
        toast.success(
          value
            ? t("pbots.saved", { bot: d.username ? `@${d.username}` : "" })
            : t("pbots.removed"),
        );
      setToken("");
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["owner-bots"] });
      void qc.invalidateQueries({ queryKey: ["platform_ops"] });
    },
    onError: (e) => toast.error(describeError(e, t("common.saveFailed"))),
  });

  const reconnect = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/platform/bots-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, action: "reconnect" }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        webhookError?: string | null;
      };
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (d.webhookError) throw new Error(d.webhookError);
    },
    onSuccess: () => {
      toast.success(t("pbots.hookOkToast"));
      void qc.invalidateQueries({ queryKey: ["owner-bots"] });
    },
    onError: (e) => {
      toast.error(t("pbots.hookFailed", { e: describeError(e, "") }));
      void qc.invalidateQueries({ queryKey: ["owner-bots"] });
    },
  });
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", meta.tile)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-foreground">{t(`pbots.${kind}.title`)}</p>
          <p className="text-[12.5px] text-muted-foreground">{t(`pbots.${kind}.who`)}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            connected ? (hookOk ? "bg-emerald-500" : "bg-amber-500") : "bg-slate-400",
          )}
        />
        {connected ? (
          <a
            href={`https://t.me/${bot.username}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 truncate text-[13.5px] font-semibold text-foreground hover:text-primary"
          >
            @{bot.username} <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="text-[13px] text-muted-foreground">
            {kind === "client" ? t("pbots.clientMissing") : t("pbots.notConnected")}
          </span>
        )}
        {bot.source && (
          <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {bot.source === "env" ? t("pbots.srcEnv") : t("pbots.srcPanel")}
          </span>
        )}
      </div>
      {connected && (
        <div
          className={cn(
            "mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]",
            hookOk
              ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-500/10 text-rose-800 dark:text-rose-200",
          )}
        >
          {hookOk ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {hookOk
              ? t("pbots.hookOk")
              : bot.webhookError
                ? t("pbots.hookError", { e: bot.webhookError })
                : t("pbots.hookMissing")}
          </span>
          {kind !== "client" && bot.source === "panel" && (
            <button
              type="button"
              disabled={reconnect.isPending}
              onClick={() => reconnect.mutate()}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold underline-offset-2 hover:underline disabled:opacity-60"
            >
              {reconnect.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {t("pbots.reconnect")}
            </button>
          )}
        </div>
      )}

      <ul className="mt-3 space-y-1.5">
        {meta.roles.map((r) => (
          <li key={r} className="flex items-center gap-2 text-[12.5px] text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            {t(`pbots.role.${r}`)}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-4">
        {kind === "client" ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {t("pbots.clientNote")}
          </p>
        ) : bot.source === "env" ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">{t("pbots.envNote")}</p>
        ) : editing || !connected ? (
          <div className="space-y-2">
            {!connected && (
              <ol className="list-decimal space-y-0.5 pl-4 text-[12px] text-muted-foreground">
                <li>{t("pbots.step1")}</li>
                <li>{t("pbots.step2")}</li>
                <li>{t("pbots.step3")}</li>
              </ol>
            )}
            <label className="flex items-center gap-2 rounded-lg border border-border bg-input px-2.5 focus-within:border-primary">
              <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AA..."
                className="h-9 w-full bg-transparent font-mono text-[13px] outline-none"
              />
            </label>
            <div className="flex gap-2">
              {connected && (
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                  {t("common.cancel")}
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1"
                disabled={!canEdit || !token.trim() || save.isPending}
                onClick={() => save.mutate(token.trim())}
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("pbots.connect")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {kind === "staff" && (
              <p className="text-[12px] text-muted-foreground">
                {t("pbots.staffChats", { n: staffChats })}
              </p>
            )}
            {kind === "ops" && (
              <p className="text-[12px] text-muted-foreground">{t("pbots.opsStart")}</p>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setEditing(true)}
              >
                <KeyRound className="h-4 w-4" />
                {t("pbots.change")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={save.isPending}
                onClick={() => window.confirm(t("pbots.removeConfirm")) && save.mutate(null)}
                aria-label={t("pbots.remove")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
