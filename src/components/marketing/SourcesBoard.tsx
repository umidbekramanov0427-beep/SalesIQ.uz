import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  KeyRound,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  useChannels,
  useMetaAccount,
  useMetaActions,
  useTgAccount,
  useTgAccountActions,
} from "@/hooks/use-crm-data";

// Sozlash -> Manbalar: where the panel's numbers come from, each as one
// card with its logo, status and the one thing to do --
//   Telegram kanallar  the platform's bot reads subscribers hourly;
//   Telegram akkaunt   the company's own account (phone -> code -> 2FA)
//                      reads live-stream viewers and takes the pictures;
//   Meta reklama       Facebook/Instagram ad accounts, spend per campaign
//                      per day, synced hourly.

function SourceCard({
  logo,
  title,
  desc,
  status,
  children,
}: {
  logo: string;
  title: string;
  desc: string;
  status: { tone: "ok" | "off" | "warn"; label: string };
  children: ReactNode;
}) {
  const Icon =
    status.tone === "ok" ? CheckCircle2 : status.tone === "warn" ? TriangleAlert : CircleDashed;
  return (
    <article className="surface-card flex flex-col p-5">
      <header className="flex items-start gap-3.5">
        <img
          src={logo}
          alt=""
          className="h-12 w-12 shrink-0 rounded-2xl bg-white object-contain p-1.5 shadow-sm ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold",
            status.tone === "ok" && "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
            status.tone === "warn" && "bg-amber-500/14 text-amber-800 dark:text-amber-200",
            status.tone === "off" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {status.label}
        </span>
      </header>
      <div className="mt-4 flex-1 border-t border-border pt-4">{children}</div>
    </article>
  );
}

export function SourcesBoard() {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <ChannelsSource />
      <TelegramAccountSource />
      <MetaSource />
    </div>
  );
}

function ChannelsSource() {
  const { t } = useI18n();
  const { data } = useChannels();
  const rows = (data?.rows ?? []).filter((c) => !c.archived_at);
  const broken = rows.filter((c) => c.last_error).length;
  return (
    <SourceCard
      logo="/brand/telegram.svg"
      title={t("mkt.src.channels")}
      desc={t("mkt.src.channelsDesc")}
      status={
        rows.length === 0
          ? { tone: "off", label: t("mkt.src.notConnected") }
          : broken
            ? { tone: "warn", label: t("mkt.src.someErrors", { n: broken }) }
            : { tone: "ok", label: t("mkt.src.channelsN", { n: rows.length }) }
      }
    >
      <ul className="mb-4 space-y-1.5">
        {rows.slice(0, 4).map((c) => (
          <li key={c.id} className="flex items-center gap-2 text-[13px]">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                c.last_error ? "bg-amber-400" : "bg-emerald-500",
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.title}</span>
            <span className="tabular-nums text-muted-foreground">
              {c.members != null ? c.members.toLocaleString("ru-RU") : "—"}
            </span>
          </li>
        ))}
        {rows.length > 4 && (
          <li className="text-[12px] text-muted-foreground">
            {t("online.more", { n: rows.length - 4 })}
          </li>
        )}
      </ul>
      <div className="flex gap-2">
        <Button asChild className="flex-1">
          <Link to="/marketing/channels" search={{ add: true }}>
            <Plus className="h-4 w-4" />
            {t("mkt.ch.addButton")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/marketing/channels">
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </SourceCard>
  );
}

function TelegramAccountSource() {
  const { t } = useI18n();
  const { data, isLoading } = useTgAccount();
  const a = useTgAccountActions();
  const [phone, setPhone] = useState("+998");
  const [loginId, setLoginId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needPassword, setNeedPassword] = useState(false);
  const acc = data?.account ?? null;

  async function start() {
    try {
      const r = await a.start.mutateAsync(phone.trim());
      setLoginId(r.loginId);
      toast.success(t("mkt.tg.codeSent"));
    } catch (err) {
      toast.error(describeError(err, t("mkt.tg.failed")));
    }
  }
  async function confirm() {
    if (!loginId) return;
    try {
      const r = await a.code.mutateAsync({
        loginId,
        code: code.trim(),
        ...(needPassword ? { password } : {}),
      });
      if (r.needPassword) {
        setNeedPassword(true);
        return;
      }
      toast.success(t("mkt.tg.connected"));
      setLoginId(null);
      setCode("");
      setPassword("");
      setNeedPassword(false);
    } catch (err) {
      toast.error(describeError(err, t("mkt.tg.failed")));
    }
  }

  return (
    <SourceCard
      logo="/brand/telegram.svg"
      title={t("mkt.tg.title")}
      desc={t("mkt.tg.desc")}
      status={
        !data?.configured
          ? { tone: "off", label: t("mkt.src.serverOff") }
          : acc
            ? acc.status === "ok"
              ? { tone: "ok", label: t("mkt.src.connected") }
              : { tone: "warn", label: t("mkt.src.error") }
            : { tone: "off", label: t("mkt.src.notConnected") }
      }
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : !data?.configured ? (
        <p className="rounded-xl bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {t("mkt.tg.serverOff")}
        </p>
      ) : acc ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-500/15 text-sky-700 dark:text-sky-300">
              <Smartphone className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold text-foreground">
                {acc.user ?? "—"}
              </p>
              <p className="text-[12px] tabular-nums text-muted-foreground">{acc.phone}</p>
            </div>
          </div>
          {acc.lastError && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
              {acc.lastError}
            </p>
          )}
          <p className="flex items-start gap-1.5 text-[12px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            {t("mkt.tg.howItWorks")}
          </p>
          <Button
            variant="outline"
            onClick={() =>
              window.confirm(t("mkt.tg.disconnectConfirm")) &&
              void a.disconnect
                .mutateAsync()
                .catch((e) => toast.error(describeError(e, t("mkt.tg.failed"))))
            }
          >
            <LogOut className="h-4 w-4" />
            {t("mkt.tg.disconnect")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {!loginId ? (
            <>
              <label className="block text-[12.5px] font-semibold text-muted-foreground">
                {t("mkt.tg.phone")}
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-[15px] font-semibold tabular-nums text-foreground outline-none focus:border-primary"
                />
              </label>
              <Button
                className="w-full"
                onClick={() => void start()}
                disabled={a.start.isPending || phone.replace(/\D/g, "").length < 9}
              >
                {a.start.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("mkt.tg.sendCode")}
              </Button>
            </>
          ) : (
            <>
              <label className="block text-[12.5px] font-semibold text-muted-foreground">
                {t("mkt.tg.code")}
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoFocus
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-center font-mono text-[18px] font-bold tracking-[0.3em] text-foreground outline-none focus:border-primary"
                />
              </label>
              {needPassword && (
                <label className="block text-[12.5px] font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <KeyRound className="h-3.5 w-3.5" />
                    {t("mkt.tg.password")}
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground outline-none focus:border-primary"
                  />
                </label>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setLoginId(null)}>
                  {t("common.cancel")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => void confirm()}
                  disabled={a.code.isPending || !code.trim()}
                >
                  {a.code.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("mkt.tg.confirm")}
                </Button>
              </div>
            </>
          )}
          <p className="text-[11.5px] leading-relaxed text-subtle">{t("mkt.tg.privacy")}</p>
        </div>
      )}
    </SourceCard>
  );
}

function MetaSource() {
  const { t } = useI18n();
  const { data, isLoading } = useMetaAccount();
  const a = useMetaActions();
  const acc = data?.account ?? null;
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked(acc?.selected ?? []), [acc?.selected]);
  // Back from Facebook: ?meta=ok / ?meta=error in the address.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("meta");
    if (p === "ok") toast.success(t("mkt.meta.connected"));
    if (p === "error") toast.error(t("mkt.meta.failed"));
  }, [t]);

  async function connect() {
    try {
      const r = await a.start.mutateAsync();
      window.location.assign(r.url);
    } catch (err) {
      toast.error(describeError(err, t("mkt.meta.failed")));
    }
  }

  return (
    <SourceCard
      logo="https://www.google.com/s2/favicons?domain=facebook.com&sz=128"
      title={t("mkt.meta.title")}
      desc={t("mkt.meta.desc")}
      status={
        !data?.configured
          ? { tone: "off", label: t("mkt.src.serverOff") }
          : acc
            ? acc.lastError
              ? { tone: "warn", label: t("mkt.src.error") }
              : { tone: "ok", label: t("mkt.src.connected") }
            : { tone: "off", label: t("mkt.src.notConnected") }
      }
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : !data?.configured ? (
        <p className="rounded-xl bg-surface px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {t("mkt.meta.serverOff")}
        </p>
      ) : !acc ? (
        <div className="space-y-2.5">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t("mkt.meta.connectHint")}
          </p>
          <Button className="w-full" onClick={() => void connect()} disabled={a.start.isPending}>
            {a.start.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("mkt.meta.connect")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12.5px] text-muted-foreground">
            {acc.user} ·{" "}
            {acc.lastSyncAt
              ? t("mkt.meta.synced", { time: new Date(acc.lastSyncAt).toLocaleString("ru-RU") })
              : t("mkt.meta.notSynced")}
          </p>
          {acc.lastError && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
              {acc.lastError}
            </p>
          )}
          <p className="console-caption">{t("mkt.meta.accounts")}</p>
          <ul className="max-h-[180px] space-y-1 overflow-y-auto">
            {acc.adAccounts.map((x) => (
              <li key={x.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-foreground">
                    {x.name}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">
                    {x.id} · {x.currency}
                  </span>
                </span>
                <Switch
                  checked={picked.includes(x.id)}
                  onCheckedChange={(on) =>
                    setPicked((p) => (on ? [...p, x.id] : p.filter((y) => y !== x.id)))
                  }
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                void a.select
                  .mutateAsync(picked)
                  .then(() => toast.success(t("mkt.meta.saved")))
                  .catch((e) => toast.error(describeError(e, t("mkt.meta.failed"))))
              }
              disabled={a.select.isPending}
            >
              {t("common.save")}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void a.sync
                  .mutateAsync()
                  .then((r) => toast.success(t("mkt.meta.syncDone", { n: r.rows })))
                  .catch((e) => toast.error(describeError(e, t("mkt.meta.failed"))))
              }
              disabled={a.sync.isPending || !acc.selected.length}
            >
              <RefreshCw className={cn("h-4 w-4", a.sync.isPending && "animate-spin")} />
              {t("mkt.meta.syncNow")}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                window.confirm(t("mkt.meta.disconnectConfirm")) &&
                void a.disconnect
                  .mutateAsync()
                  .catch((e) => toast.error(describeError(e, t("mkt.meta.failed"))))
              }
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </SourceCard>
  );
}
