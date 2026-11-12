import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Copy,
  DatabaseBackup,
  Loader2,
  Lock,
  LockOpen,
  Send,
  Unlink,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { OwnerPanel } from "@/components/owner/OwnerPage";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner → Sozlamalar → Zaxira: the daily backup of every company's data to
// a Telegram channel or group. Bind the channel with a one-time code, pick
// the time (Tashkent), switch it on; "Hozir yuborish" sends one at once.

type State = {
  ready: boolean;
  enabled: boolean;
  time: string;
  chat: { id: number; title: string | null } | null;
  lastAt: string | null;
  lastStatus: string | null;
  encrypted: boolean;
  running: boolean;
  botUsername: string | null;
};

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await apiFetch("/platform/backup-settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
  return d;
}

export function BackupCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [code, setCode] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["owner-backup"],
    refetchInterval: code ? 4000 : 30_000,
    queryFn: async () => {
      const res = await apiFetch("/platform/backup-settings");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as State;
    },
  });
  const [time, setTime] = useState("03:00");
  useEffect(() => {
    if (data?.time) setTime(data.time);
  }, [data?.time]);
  // The channel got bound while the code was shown.
  useEffect(() => {
    if (code && data?.chat) {
      setCode(null);
      toast.success(t("bk.bound"));
    }
  }, [code, data?.chat, t]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["owner-backup"] });
  const save = useMutation({
    mutationFn: (b: { enabled: boolean; time: string }) => post({ action: "save", ...b }),
    onSuccess: () => {
      toast.success(t("common.saved"));
      refresh();
    },
    onError: () => toast.error(t("common.saveFailed")),
  });
  const getCode = useMutation({
    mutationFn: () => post<{ code: string }>({ action: "code" }),
    onSuccess: (r) => setCode(r.code),
    onError: () => toast.error(t("common.saveFailed")),
  });
  const unbind = useMutation({
    mutationFn: () => post({ action: "unbind" }),
    onSuccess: refresh,
  });
  const run = useMutation({
    mutationFn: () => post({ action: "run" }),
    onSuccess: () => {
      toast.success(t("bk.started"));
      refresh();
    },
    onError: (e) =>
      toast.error(
        e instanceof Error && e.message === "RUNNING" ? t("bk.running") : t("bk.runFailed"),
      ),
  });

  if (data && !data.ready) {
    return (
      <OwnerPanel title={t("bk.title")} info={t("bk.info")}>
        <p className="text-[13px] text-amber-700 dark:text-amber-300">{t("bk.notReady")}</p>
      </OwnerPanel>
    );
  }

  const ok = data?.lastStatus?.startsWith("ok");
  const bad = data?.lastStatus?.startsWith("error");
  const cmd = code ? `/zaxira ${code}` : "";

  return (
    <div className="space-y-4">
      <OwnerPanel title={t("bk.title")} info={t("bk.info")}>
        <div className="space-y-4">
          {/* Where */}
          <div className="rounded-xl border border-border bg-surface p-3.5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("bk.where")}
            </p>
            {data?.chat ? (
              <div className="mt-2 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-500/12 text-sky-700 dark:text-sky-300">
                  <Send className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-foreground">
                    {data.chat.title || String(data.chat.id)}
                  </p>
                  <p className="text-[12px] tabular-nums text-muted-foreground">
                    ID {data.chat.id}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unbind.isPending}
                  onClick={() => window.confirm(t("bk.unbindConfirm")) && unbind.mutate()}
                >
                  <Unlink className="h-4 w-4" />
                  {t("bk.unbind")}
                </Button>
              </div>
            ) : code ? (
              <div className="mt-2 space-y-2 text-[13px]">
                <ol className="list-decimal space-y-1 pl-5 text-foreground">
                  <li>
                    {t("bk.step1", { bot: data?.botUsername ? `@${data.botUsername}` : "bot" })}
                  </li>
                  <li>{t("bk.step2")}</li>
                </ol>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(cmd);
                    toast.success(t("bk.copied"));
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 font-mono text-[15px] font-bold text-foreground"
                >
                  {cmd}
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("bk.waiting")}
                </p>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[13px] text-muted-foreground">{t("bk.noChat")}</p>
                <Button size="sm" onClick={() => getCode.mutate()} disabled={getCode.isPending}>
                  {getCode.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("bk.bind")}
                </Button>
              </div>
            )}
          </div>

          {/* When */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t("bk.time")}
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="h-9 rounded-lg border border-border bg-input px-2.5 font-mono text-[14px] tabular-nums outline-none focus:border-primary"
              />
            </label>
            <span className="text-[12px] text-muted-foreground">{t("bk.tz")}</span>
            <label className="ml-auto flex items-center gap-2.5 text-[13px] font-semibold text-foreground">
              {t("bk.enabled")}
              <Switch
                checked={!!data?.enabled}
                disabled={!data?.chat || save.isPending}
                onCheckedChange={(v) => save.mutate({ enabled: v, time })}
              />
            </label>
          </div>
          {data && time !== data.time && (
            <Button size="sm" onClick={() => save.mutate({ enabled: data.enabled, time })}>
              {t("common.save")}
            </Button>
          )}

          {/* What */}
          <ul className="grid gap-2 text-[12.5px] text-muted-foreground sm:grid-cols-2">
            <li className="rounded-lg border border-border px-3 py-2">{t("bk.what1")}</li>
            <li className="rounded-lg border border-border px-3 py-2">{t("bk.what2")}</li>
            <li className="rounded-lg border border-border px-3 py-2">{t("bk.what3")}</li>
            <li
              className={cn(
                "flex items-start gap-2 rounded-lg border px-3 py-2",
                data?.encrypted
                  ? "border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                  : "border-amber-500/40 text-amber-800 dark:text-amber-200",
              )}
            >
              {data?.encrypted ? (
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <LockOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              {data?.encrypted ? t("bk.encOn") : t("bk.encOff")}
            </li>
          </ul>
        </div>
      </OwnerPanel>

      <OwnerPanel title={t("bk.lastTitle")}>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl",
              ok
                ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                : bad
                  ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {ok ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : bad ? (
              <XCircle className="h-5 w-5" />
            ) : (
              <DatabaseBackup className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-semibold text-foreground">
              {data?.running
                ? t("bk.runningNow")
                : data?.lastAt
                  ? new Date(data.lastAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : t("bk.never")}
            </p>
            {data?.lastStatus && !data.running && (
              <p className="truncate text-muted-foreground">{statusText(data.lastStatus, t)}</p>
            )}
          </div>
          <Button
            variant="outline"
            disabled={!data?.chat || run.isPending || data?.running}
            onClick={() => run.mutate()}
          >
            {run.isPending || data?.running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("bk.runNow")}
          </Button>
        </div>
      </OwnerPanel>
    </div>
  );
}

function statusText(s: string, t: (k: string, v?: Record<string, string | number>) => string) {
  if (s.startsWith("ok:")) return t("bk.stOk", { n: s.slice(3) });
  if (s.startsWith("partial:")) return t("bk.stPartial", { n: s.slice(8) });
  return t("bk.stError", { e: s.replace(/^error:/, "") });
}
