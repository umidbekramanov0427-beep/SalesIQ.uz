import { useEffect, useState } from "react";
import {
  Bell,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Unplug,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  useMarketingBot,
  useMarketingBotAction,
  type MarketingBotSettings as Settings,
} from "@/hooks/use-crm-data";

// Marketing -> Sozlash -> Bot: the company's own marketing bot. Connected
// with a token from @BotFather; marketing people tie their Telegram to it
// (alerts, reports, the live console); added as an admin of a channel it
// counts joins and leaves, join requests and reactions, and makes invite
// links per campaign so joins are counted by link. The audience does not
// talk to it.

const field =
  "h-10 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground outline-none focus:border-primary";

export function MarketingBotSettings() {
  const { t } = useI18n();
  const q = useMarketingBot();
  const act = useMarketingBotAction();
  const s = q.data;

  if (q.isLoading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (s && !s.ready)
    return (
      <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
        {t("mkt.bot.migration")}
      </p>
    );

  const run = (body: Record<string, unknown>, ok?: string) =>
    act.mutateAsync(body).then(
      (r) => {
        if (ok) toast.success(ok);
        return r;
      },
      (e) => {
        toast.error(describeError(e, t("mkt.wb.saveFailed")));
        return null;
      },
    );

  return (
    <div className="space-y-5">
      <ConnectCard s={s ?? null} run={run} busy={act.isPending} />
      {s?.bot && (
        <>
          <StaffCard s={s} run={run} />
          <AlertsCard settings={s.bot.settings} run={run} busy={act.isPending} />
          <ChannelsCard s={s} run={run} />
        </>
      )}
    </div>
  );
}

type Run = (body: Record<string, unknown>, ok?: string) => Promise<Record<string, unknown> | null>;
type Status = NonNullable<ReturnType<typeof useMarketingBot>["data"]>;

function ConnectCard({ s, run, busy }: { s: Status | null; run: Run; busy: boolean }) {
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const bot = s?.bot;
  return (
    <SectionCard
      icon={Bot}
      tone="violet"
      title={t("mkt.bot.title")}
      description={t("mkt.bot.desc")}
    >
      {bot ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-300">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <a
              href={bot.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[15px] font-bold text-foreground hover:text-primary"
            >
              @{bot.username} <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1.5 text-[12.5px]",
                bot.webhookOk
                  ? "text-emerald-600 dark:text-emerald-300"
                  : "text-amber-700 dark:text-amber-300",
              )}
            >
              {bot.webhookOk ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
              {bot.webhookOk ? t("mkt.bot.ok") : (bot.webhookError ?? t("mkt.bot.hookOff"))}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void run({ action: "reconnect" }, t("mkt.bot.reconnected"))}
          >
            <RefreshCw className="h-4 w-4" /> {t("mkt.bot.reconnect")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (window.confirm(t("mkt.bot.disconnectAsk"))) void run({ action: "disconnect" });
            }}
          >
            <Unplug className="h-4 w-4" /> {t("mkt.bot.disconnect")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <ol className="space-y-2.5">
            {[1, 2, 3].map((n) => (
              <li key={n} className="flex gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/12 text-[12px] font-bold text-primary">
                  {n}
                </span>
                <span className="text-[13.5px] text-foreground">{t(`mkt.bot.step${n}`)}</span>
              </li>
            ))}
          </ol>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (token.trim())
                void run({ action: "connect", token }, t("mkt.bot.connected")).then(
                  (r) => r && setToken(""),
                );
            }}
          >
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AA..."
              autoComplete="off"
              className={cn(field, "font-mono")}
            />
            <Button type="submit" disabled={!token.trim() || busy} className="w-full">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("mkt.bot.connect")}
            </Button>
          </form>
        </div>
      )}
    </SectionCard>
  );
}

function StaffCard({ s, run }: { s: Status; run: Run }) {
  const { t } = useI18n();
  return (
    <SectionCard
      icon={Users}
      tone="sky"
      title={t("mkt.bot.staffTitle")}
      description={t("mkt.bot.staffDesc")}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {s.me.linked ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/12 px-2.5 py-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> {t("mkt.bot.meLinked")}
          </span>
        ) : (
          <Button
            onClick={() =>
              void run({ action: "link" }).then((r) => {
                const url = r?.["url"];
                if (typeof url === "string") window.open(url, "_blank", "noopener");
              })
            }
          >
            <Send className="h-4 w-4" /> {t("mkt.bot.linkMe")}
          </Button>
        )}
        <span className="text-[12.5px] text-muted-foreground">{t("mkt.bot.commands")}</span>
      </div>
      {s.staff.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("mkt.bot.noStaff")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {s.staff.map((p) => (
            <li key={p.profileId} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                {p.name}
                {p.tgUsername && (
                  <span className="ml-1.5 font-normal text-muted-foreground">@{p.tgUsername}</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => void run({ action: "unlink", profileId: p.profileId })}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={t("common.delete")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function AlertsCard({ settings, run, busy }: { settings: Settings; run: Run; busy: boolean }) {
  const { t } = useI18n();
  const [d, setD] = useState(settings);
  useEffect(() => setD(settings), [settings]);
  const dirty = JSON.stringify(d) !== JSON.stringify(settings);
  const row = (key: keyof Settings["alerts"] & ("start" | "tgStop" | "peak" | "report")) => (
    <label key={key} className="flex items-center justify-between gap-3 py-2.5">
      <span>
        <span className="block text-[13.5px] font-semibold text-foreground">
          {t(`mkt.bot.a.${key}`)}
        </span>
        <span className="block text-[12px] text-muted-foreground">{t(`mkt.bot.a.${key}Hint`)}</span>
      </span>
      <Switch
        checked={d.alerts[key]}
        onCheckedChange={(v) => setD({ ...d, alerts: { ...d.alerts, [key]: v } })}
      />
    </label>
  );
  return (
    <SectionCard
      icon={Bell}
      tone="amber"
      title={t("mkt.bot.alertsTitle")}
      description={t("mkt.bot.alertsDesc")}
    >
      <div className="divide-y divide-border">
        {row("start")}
        {row("tgStop")}
        <label className="flex items-center justify-between gap-3 py-2.5">
          <span>
            <span className="block text-[13.5px] font-semibold text-foreground">
              {t("mkt.bot.a.drop")}
            </span>
            <span className="block text-[12px] text-muted-foreground">
              {t("mkt.bot.a.dropHint")}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <input
              inputMode="numeric"
              value={d.alerts.dropPct}
              onChange={(e) =>
                setD({
                  ...d,
                  alerts: {
                    ...d.alerts,
                    dropPct: Math.min(90, Number(e.target.value.replace(/\D/g, "")) || 0),
                  },
                })
              }
              className="h-9 w-16 rounded-lg border border-border bg-input px-2 text-right tabular-nums"
            />
            <span className="text-[13px] text-muted-foreground">%</span>
          </span>
        </label>
        {row("peak")}
        {row("report")}
        <label className="flex items-center justify-between gap-3 py-2.5">
          <span>
            <span className="block text-[13.5px] font-semibold text-foreground">
              {t("mkt.bot.autoApprove")}
            </span>
            <span className="block text-[12px] text-muted-foreground">
              {t("mkt.bot.autoApproveHint")}
            </span>
          </span>
          <Switch checked={d.autoApprove} onCheckedChange={(v) => setD({ ...d, autoApprove: v })} />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          disabled={!dirty || busy}
          onClick={() => void run({ action: "settings", settings: d }, t("mkt.bot.saved"))}
        >
          {t("common.save")}
        </Button>
      </div>
    </SectionCard>
  );
}

function ChannelsCard({ s, run }: { s: Status; run: Run }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Record<string, { name: string; req: boolean }>>({});
  return (
    <SectionCard
      icon={Megaphone}
      tone="emerald"
      title={t("mkt.bot.chTitle")}
      description={t("mkt.bot.chDesc")}
    >
      {s.channels.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("mkt.bot.noChannels")}</p>
      ) : (
        <div className="space-y-4">
          {s.channels.map((c) => {
            const dr = draft[c.id] ?? { name: "", req: false };
            return (
              <div key={c.id} className="rounded-xl border border-border">
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                  <p className="min-w-0 flex-1 truncate text-[14px] font-bold text-foreground">
                    {c.title}
                  </p>
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
                      c.botAdmin
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                        : "bg-amber-500/12 text-amber-800 dark:text-amber-200",
                    )}
                  >
                    {c.botAdmin ? t("mkt.bot.isAdmin") : t("mkt.bot.notAdmin")}
                  </span>
                </div>
                <div className="space-y-2 px-4 py-3">
                  {c.invites.length > 0 && (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                          <th className="py-1 font-semibold">{t("mkt.bot.invName")}</th>
                          <th className="py-1 text-right font-semibold">{t("mkt.bot.joins")}</th>
                          <th className="py-1 text-right font-semibold">{t("mkt.bot.leaves")}</th>
                          <th className="py-1 text-right font-semibold">{t("mkt.bot.stayed")}</th>
                          <th className="w-16" />
                        </tr>
                      </thead>
                      <tbody>
                        {c.invites.map((i) => (
                          <tr key={i.id} className="border-t border-border/60">
                            <td className="py-1.5">
                              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                                {i.name}
                              </span>
                            </td>
                            <td className="py-1.5 text-right tabular-nums">{i.joins}</td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                              {i.leaves}
                            </td>
                            <td className="py-1.5 text-right font-semibold tabular-nums">
                              {i.joins
                                ? `${Math.round(((i.joins - i.leaves) / i.joins) * 100)}%`
                                : "—"}
                            </td>
                            <td className="py-1.5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  void navigator.clipboard
                                    .writeText(i.link)
                                    .then(() => toast.success(t("mkt.bot.copied")))
                                }
                                className="inline-grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                                aria-label={t("mkt.bot.copy")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(t("mkt.bot.revokeAsk")))
                                    void run({ action: "revoke", inviteId: i.id });
                                }}
                                className="inline-grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label={t("common.delete")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {c.botAdmin ? (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!dr.name.trim()) return;
                        void run(
                          { action: "invite", channelId: c.id, name: dr.name, joinRequest: dr.req },
                          t("mkt.bot.invCreated"),
                        ).then(
                          (r) => r && setDraft({ ...draft, [c.id]: { name: "", req: false } }),
                        );
                      }}
                    >
                      <input
                        value={dr.name}
                        onChange={(e) =>
                          setDraft({ ...draft, [c.id]: { ...dr, name: e.target.value } })
                        }
                        maxLength={32}
                        placeholder={t("mkt.bot.invPh")}
                        className="h-9 min-w-[200px] flex-1 rounded-lg border border-border bg-input px-3 text-[13px] outline-none focus:border-primary"
                      />
                      <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                        <Switch
                          checked={dr.req}
                          onCheckedChange={(v) => setDraft({ ...draft, [c.id]: { ...dr, req: v } })}
                        />
                        {t("mkt.bot.invRequest")}
                      </label>
                      <Button type="submit" size="sm" disabled={!dr.name.trim()}>
                        <Plus className="h-4 w-4" /> {t("mkt.bot.invCreate")}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground">{t("mkt.bot.makeAdmin")}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
