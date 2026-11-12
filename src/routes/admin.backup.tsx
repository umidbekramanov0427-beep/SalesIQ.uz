import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, DatabaseBackup, Loader2, Send, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { TIME_RE, type CompanyBackupRules } from "@/lib/telegram-backup";
import type { Json } from "@/integrations/supabase/types";
import {
  useCompanyBackupRules,
  useLinkTelegramGroup,
  useTelegramBoundChats,
  useUpdateOrgGeneralSettings,
} from "@/hooks/use-crm-data";

// Admin -> Zaxira: the company's own copy of its data, every day at the
// chosen time, as one compressed JSON file in the company's Telegram group
// or channel (bound with /bind). Separate from the platform's own backups.

export const Route = createFileRoute("/admin/backup")({
  head: () => ({ meta: [{ title: "Zaxira — SalesIQ" }] }),
  component: AdminBackupPage,
});

function AdminBackupPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const saved = useCompanyBackupRules();
  const savedKey = JSON.stringify(saved);
  const [d, setD] = useState<CompanyBackupRules>(saved);
  useEffect(() => setD(JSON.parse(savedKey) as CompanyBackupRules), [savedKey]);
  const update = useUpdateOrgGeneralSettings();
  const { data: chats = [], refetch } = useTelegramBoundChats();
  const link = useLinkTelegramGroup();
  const [code, setCode] = useState<{ code: string; bot: string | null } | null>(null);
  const [running, setRunning] = useState(false);
  const dirty = JSON.stringify(d) !== savedKey;

  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => void refetch(), 4000);
    return () => clearInterval(id);
  }, [code, refetch]);

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
          <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
        </SectionCard>
      </>
    );
  }

  async function save() {
    try {
      await update.mutateAsync({
        backup_rules: { ...d, enabled: d.enabled && d.chatId != null } as unknown as Json,
      });
      toast.success(t("common.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && /backup_rules/.test(err.message)
          ? t("cbk.migrationPending")
          : describeError(err, t("common.saveFailed")),
      );
    }
  }

  async function runNow() {
    setRunning(true);
    try {
      const res = await apiFetch("/admin/company-backup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "run" }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error === "NO_CHAT" ? t("cbk.noChat") : (j.error ?? ""));
      toast.success(t("cbk.sent"));
    } catch (err) {
      toast.error(describeError(err, t("cbk.sendFailed")));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={DatabaseBackup}
        tone="emerald"
        title={t("cbk.title")}
        description={t("cbk.desc")}
      />

      <SectionCard
        icon={Send}
        tone="sky"
        title={t("cbk.whereTitle")}
        description={t("cbk.whereDesc")}
      >
        <div className="space-y-2">
          {chats.length === 0 && (
            <p className="text-[13px] text-muted-foreground">{t("cbk.noChats")}</p>
          )}
          <ul className="grid gap-2 md:grid-cols-2">
            {chats.map((c) => {
              const on = d.chatId === c.chat_id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setD((x) => ({ ...x, chatId: on ? null : c.chat_id }))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      on
                        ? "border-primary/50 bg-primary/8"
                        : "border-border hover:border-primary/30",
                    )}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/12 text-sky-700 dark:text-sky-300">
                      <Send className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                      {c.title || String(c.chat_id)}
                    </span>
                    {on && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
          {code ? (
            <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-[12.5px] text-foreground">
              <p>{t("cbk.bindSteps", { bot: code.bot ? `@${code.bot}` : "bot" })}</p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(`/bind ${code.code}`);
                  toast.success(t("bk.copied"));
                }}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-card px-3 py-1.5 font-mono text-[14px] font-bold"
              >
                /bind {code.code} <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={link.isPending}
              onClick={() =>
                void link
                  .mutateAsync()
                  .then((r) => setCode({ code: r.code, bot: r.botUsername }))
                  .catch((e) => toast.error(describeError(e, t("cbk.sendFailed"))))
              }
            >
              {link.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("cbk.newChat")}
            </Button>
          )}
        </div>
      </SectionCard>

      <SectionCard
        icon={DatabaseBackup}
        tone="emerald"
        title={t("cbk.whenTitle")}
        description={t("cbk.whenDesc")}
      >
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-[13.5px] font-semibold text-foreground">
            {t("bk.time")}
            <input
              type="time"
              value={d.time}
              onChange={(e) =>
                TIME_RE.test(e.target.value) && setD((x) => ({ ...x, time: e.target.value }))
              }
              className="h-9 rounded-lg border border-border bg-input px-2.5 font-mono text-[14px] tabular-nums outline-none focus:border-primary"
            />
            <span className="text-[12px] font-normal text-muted-foreground">{t("bk.tz")}</span>
          </label>
          <label className="ml-auto flex items-center gap-2.5 text-[13.5px] font-semibold text-foreground">
            {t("bk.enabled")}
            <Switch
              checked={d.enabled}
              disabled={d.chatId == null}
              onCheckedChange={(v) => setD((x) => ({ ...x, enabled: v }))}
            />
          </label>
        </div>
        <ul className="mt-4 grid gap-2 text-[12.5px] text-muted-foreground md:grid-cols-3">
          <li className="rounded-lg border border-border px-3 py-2">{t("cbk.what1")}</li>
          <li className="rounded-lg border border-border px-3 py-2">{t("cbk.what2")}</li>
          <li className="rounded-lg border border-amber-500/40 px-3 py-2 text-amber-800 dark:text-amber-200">
            {t("cbk.what3")}
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={!dirty || update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void runNow()}
            disabled={running || saved.chatId == null || dirty}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {t("bk.runNow")}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
