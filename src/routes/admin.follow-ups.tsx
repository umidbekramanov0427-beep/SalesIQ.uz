import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BellRing,
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircleReply,
  Send,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { CrmGate } from "@/components/CrmGate";
import { PageHeader, SectionCard, StatCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import {
  useFollowupSettings,
  useFollowupStats,
  useSaveFollowupSettings,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { renderFollowup } from "@/lib/followups";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, timeAgo } from "@/lib/utils";

export const Route = createFileRoute("/admin/follow-ups")({
  head: () => ({ meta: [{ title: "Avtomatik eslatma — SalesIQ" }] }),
  component: () => (
    <CrmGate>
      <AdminFollowupsPage />
    </CrmGate>
  ),
});

function AdminFollowupsPage() {
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
  return <FollowupSettings />;
}

const HOURS = [1, 2, 4, 8, 12, 24, 48, 72];
const DEFAULT_MESSAGE = "Assalomu alaykum, {ism}! Savolingiz qoldimi? Yordam berishga tayyormiz.";
const DEFAULT_SECOND = "{ism}, sizga qulay vaqtda qo'ng'iroq qilaylikmi? Javobingizni kutamiz.";

// When the company wrote last and the client went quiet, the bot reminds
// them after the chosen hours -- with the company's own words, inside
// working hours, at most N times. Shows how many reminders went out and
// how many clients answered after one.
function FollowupSettings() {
  const { t } = useI18n();
  const { data: cfg, isLoading } = useFollowupSettings();
  const stats = useFollowupStats();
  const save = useSaveFollowupSettings();
  const [form, setForm] = useState({
    enabled: false,
    after_hours: 24,
    max_attempts: 2,
    message: DEFAULT_MESSAGE,
    second_message: DEFAULT_SECOND as string | null,
    work_start: 9,
    work_end: 20,
  });
  const s = cfg?.settings;
  useEffect(() => {
    if (!s) return;
    setForm({
      enabled: s.enabled,
      after_hours: s.after_hours,
      max_attempts: s.max_attempts,
      message: s.message,
      second_message: s.second_message,
      work_start: s.work_start,
      work_end: s.work_end,
    });
  }, [s]);

  async function onSave(next = form) {
    try {
      await save.mutateAsync(next);
      toast.success(t("fu.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "MIGRATION_PENDING"
          ? t("fu.migrationPending")
          : describeError(err, t("fu.saveFailed")),
      );
    }
  }

  const select =
    "h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50";
  const area =
    "min-h-[84px] w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary/50";

  return (
    <>
      <PageHeader icon={BellRing} tone="rose" title={t("fu.title")} description={t("fu.desc")} />

      {cfg && !cfg.ready ? (
        <SectionCard icon={BellRing} tone="amber" title={t("fu.notReadyTitle")}>
          <p className="text-sm text-muted-foreground">{t("fu.migrationPending")}</p>
        </SectionCard>
      ) : isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label={t("fu.statSent")}
              value={String(stats.data?.sent ?? 0)}
              icon={Send}
              iconTone="sky"
            />
            <StatCard
              label={t("fu.statReplied")}
              value={String(stats.data?.replied ?? 0)}
              icon={MessageCircleReply}
              iconTone="emerald"
            />
            <StatCard
              label={t("fu.statRate")}
              value={stats.data?.rate != null ? `${stats.data.rate}%` : "—"}
              icon={CheckCircle2}
              iconTone="violet"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <SectionCard
              icon={BellRing}
              tone="rose"
              title={t("fu.settingsTitle")}
              actions={
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(enabled) => {
                      const next = { ...form, enabled };
                      setForm(next);
                      void onSave(next);
                    }}
                  />
                  {form.enabled ? t("fu.on") : t("fu.off")}
                </label>
              }
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <label>
                    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                      {t("fu.after")}
                    </span>
                    <select
                      className={select}
                      value={form.after_hours}
                      onChange={(e) => setForm({ ...form, after_hours: Number(e.target.value) })}
                    >
                      {HOURS.map((h) => (
                        <option key={h} value={h}>
                          {h < 24 ? t("fu.hours", { n: h }) : t("fu.days", { n: h / 24 })}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                      {t("fu.attempts")}
                    </span>
                    <select
                      className={select}
                      value={form.max_attempts}
                      onChange={(e) => setForm({ ...form, max_attempts: Number(e.target.value) })}
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                      {t("fu.workHours")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <select
                        className={select}
                        value={form.work_start}
                        onChange={(e) => setForm({ ...form, work_start: Number(e.target.value) })}
                      >
                        {Array.from({ length: 24 }, (_, h) => (
                          <option key={h} value={h}>
                            {String(h).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                      —
                      <select
                        className={select}
                        value={form.work_end}
                        onChange={(e) => setForm({ ...form, work_end: Number(e.target.value) })}
                      >
                        {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => (
                          <option key={h} value={h}>
                            {String(h % 24).padStart(2, "0")}:00
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                </div>

                <label className="block">
                  <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                    {t("fu.message")}
                  </span>
                  <textarea
                    className={area}
                    maxLength={1000}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                  />
                </label>
                {form.max_attempts > 1 && (
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                      {t("fu.secondMessage")}
                    </span>
                    <textarea
                      className={area}
                      maxLength={1000}
                      value={form.second_message ?? ""}
                      onChange={(e) => setForm({ ...form, second_message: e.target.value })}
                    />
                  </label>
                )}
                <p className="text-[12.5px] text-muted-foreground">{t("fu.vars")}</p>
                <p className="rounded-lg bg-surface px-3 py-2 text-[12.5px] text-muted-foreground">
                  {t("fu.rules")}
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => void onSave()}
                    disabled={save.isPending || !form.message.trim()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t("common.save")}
                  </button>
                </div>
              </div>
            </SectionCard>

            <div className="space-y-4">
              {/* What the client sees, as a Telegram chat. */}
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="mb-3 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("fu.preview")}
                </p>
                <div className="space-y-2 rounded-xl bg-[#e7ebf0] p-3 dark:bg-[#0e1621]">
                  <Bubble out text={t("fu.previewOurs")} time="10:15" />
                  <p className="py-1 text-center text-[11px] text-neutral-500">
                    {form.after_hours < 24
                      ? t("fu.hoursLater", { n: form.after_hours })
                      : t("fu.daysLater", { n: form.after_hours / 24 })}
                  </p>
                  <Bubble
                    out
                    text={renderFollowup(form.message, "Dilnoza Karimova")}
                    time="10:15"
                    bot
                  />
                </div>
              </div>

              <SectionCard icon={Clock} tone="sky" title={t("fu.recent")}>
                {!stats.data?.recent.length ? (
                  <p className="text-sm text-muted-foreground">{t("fu.none")}</p>
                ) : (
                  <ul className="space-y-2.5">
                    {stats.data.recent.map((r) => (
                      <li key={r.id} className="text-[13px]">
                        <div className="flex items-center gap-2">
                          <Link
                            to="/crm/leads/$leadId"
                            params={{ leadId: r.lead_id }}
                            className="truncate font-semibold text-primary hover:underline"
                          >
                            {r.leads?.name ?? "—"}
                          </Link>
                          <span className="ml-auto shrink-0 text-[11.5px] text-muted-foreground">
                            {timeAgo(r.sent_at)}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "text-[12px]",
                            r.replied_at
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {r.message.startsWith("[yuborilmadi]")
                            ? t("fu.notDelivered")
                            : r.replied_at
                              ? t("fu.repliedAfter")
                              : t("fu.waiting", { n: r.attempt })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({
  text,
  time,
  out,
  bot,
}: {
  text: string;
  time: string;
  out?: boolean;
  bot?: boolean;
}) {
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] shadow-sm",
          out
            ? "rounded-br-sm bg-[#effdde] text-neutral-900 dark:bg-[#2b5278] dark:text-white"
            : "rounded-bl-sm bg-white text-neutral-900",
        )}
      >
        {bot && <span className="block text-[11px] font-semibold text-sky-600">🤖</span>}
        <span className="whitespace-pre-wrap">{text}</span>
        <span className="ml-2 align-bottom text-[10.5px] text-neutral-500 dark:text-neutral-300">
          {time}
        </span>
      </div>
    </div>
  );
}
