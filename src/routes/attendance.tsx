import { RemindersBoard } from "@/components/reminders/RemindersBoard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  Award,
  Bell,
  CheckCircle2,
  Clock,
  Coins,
  Loader2,
  Megaphone,
  Phone,
  PhoneOff,
  PlayCircle,
  Plus,
  Sparkles,
  StopCircle,
  Target,
  Trash2,
  UserCheck,
  UserX,
  MapPin,
  Send,
  Settings2,
  Globe,
  Wallet,
  PhoneCall,
  ClipboardList,
  Users,
  TrendingUp,
  BellRing,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard, Pill } from "@/components/layout/Primitives";
import { SalesPlanBoard } from "@/components/plan/SalesPlanBoard";
import { PayrollBoard } from "@/components/payroll/PayrollBoard";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { SectionSettingsButton } from "@/components/layout/SectionSettings";
import {
  useAiAssistantChat,
  useAttendanceRules,
  useAttendanceView,
  useClockIn,
  useClockOut,
  useCreateFine,
  useCreateFineType,
  useCreateNotification,
  useDeleteFineType,
  useFinesMatrix,
  useKpiView,
  useLogCall,
  useMyOpenSession,
  useNormativesView,
  usePublishFines,
  type AttendanceRow,
  type FineTypeRow,
  type NormativeRow,
} from "@/hooks/use-crm-data";
import { hoursText } from "@/lib/attendance-rules";

const TAB_KEYS = [
  "davomat",
  "normativ",
  "jarimalar",
  "kpi",
  "oylik",
  "reja",
  "eslatmalar",
] as const;

export const Route = createFileRoute("/attendance")({
  validateSearch: (search: Record<string, unknown>): { tab?: AttTab | undefined } => ({
    tab: TAB_KEYS.includes(search["tab"] as AttTab) ? (search["tab"] as AttTab) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Attendance & Quotas — SalesIQ" },
      {
        name: "description",
        content:
          "Clock in/out and call activity, plus quota pacing, underperformer alerts and pipeline bottleneck diagnostics.",
      },
    ],
  }),
  component: AttendanceAndNormativesPage,
});

const FINE_COLORS = [
  "slate",
  "blue",
  "purple",
  "pink",
  "orange",
  "teal",
  "indigo",
  "cyan",
  "amber",
  "rose",
] as const;
type FineColorName = (typeof FINE_COLORS)[number];

function isFineColorName(value: string): value is FineColorName {
  return (FINE_COLORS as readonly string[]).includes(value);
}

const FINE_COLOR_BADGE: Record<FineColorName, string> = {
  slate: "border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-400",
  blue: "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  purple: "border-purple-500/20 bg-purple-500/10 text-purple-600 dark:text-purple-400",
  pink: "border-pink-500/20 bg-pink-500/10 text-pink-600 dark:text-pink-400",
  orange: "border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  teal: "border-teal-500/20 bg-teal-500/10 text-teal-600 dark:text-teal-400",
  indigo: "border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  amber: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  rose: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const FINE_COLOR_HEADER: Record<FineColorName, string> = {
  slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  purple: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  pink: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  cyan: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function fineBadgeClass(color: string): string {
  return FINE_COLOR_BADGE[isFineColorName(color) ? color : "slate"];
}
function fineHeaderClass(color: string): string {
  return FINE_COLOR_HEADER[isFineColorName(color) ? color : "slate"];
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const statusTone: Record<NormativeRow["status"], "success" | "warning" | "danger"> = {
  onTrack: "success",
  atRisk: "warning",
  behind: "danger",
};

function MyStatusCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { session, isLoading } = useMyOpenSession();
  const { rows: attRows } = useAttendanceView();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const attRules = useAttendanceRules();
  const webOff = !attRules.methods.web;

  // The platform detects "started work" itself the moment a rep's first
  // call of the day comes in -- AmoCRM-synced or placed through this
  // platform's own telephony (OnlinePBX/Sipuni/MoiZvonki) -- same signal
  // useAttendanceView's roster already uses, so this card doesn't wait for
  // anyone to press "Ishni boshlash". The manual button stays only as a
  // fallback for a day with zero calls yet.
  const autoClockIn = !session
    ? (attRows.find((r) => r.profileId === user?.id)?.clockIn ?? null)
    : null;
  const started = !!session || !!autoClockIn;
  const displayClockIn = session?.clock_in ?? autoClockIn;

  async function onClockIn() {
    try {
      await clockIn.mutateAsync();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("attendance.clockInFailed"));
    }
  }

  async function onClockOut() {
    if (!session) return;
    try {
      await clockOut.mutateAsync(session.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("attendance.clockOutFailed"));
    }
  }

  const busy = clockIn.isPending || clockOut.isPending || isLoading;

  return (
    <SectionCard
      icon={UserCheck}
      tone="emerald"
      title={t("attendance.myStatus")}
      info={t("attendance.myStatusInfo")}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl",
              started ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
            )}
          >
            {started ? <CheckCircle2 className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {started ? t("attendance.sessionActive") : t("attendance.notStartedYet")}
            </p>
            {started && displayClockIn && (
              <p className="text-xs text-subtle">
                {t("attendance.clockIn")}: {formatTime(displayClockIn)}
                {!session && (
                  <span className="ml-1.5 text-primary">· {t("attendance.autoDetected")}</span>
                )}
              </p>
            )}
          </div>
        </div>
        {session ? (
          <button
            onClick={onClockOut}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {clockOut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <StopCircle className="h-4 w-4" />
            )}
            {t("attendance.clockOutAction")}
          </button>
        ) : autoClockIn ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t("attendance.autoTracked")}
          </span>
        ) : webOff ? (
          <span className="inline-flex max-w-[320px] items-center gap-2 rounded-xl bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-800 dark:text-sky-200">
            <Send className="h-3.5 w-3.5 shrink-0" />
            {t("attendance.useTelegram")}
          </span>
        ) : (
          <button
            onClick={onClockIn}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {clockIn.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            {t("attendance.clockInAction")}
          </button>
        )}
      </div>
    </SectionCard>
  );
}

function LogCallCard() {
  const { t } = useI18n();
  const logCall = useLogCall();
  const [phone, setPhone] = useState("");
  const [minutes, setMinutes] = useState("2");
  const [connected, setConnected] = useState(true);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await logCall.mutateAsync({
        phone: phone.trim(),
        connected,
        durationSeconds: Math.max(0, Math.round(Number(minutes) * 60)) || 0,
      });
      toast.success(t("attendance.callLogged"));
      setPhone("");
      setMinutes("2");
      setConnected(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("attendance.callLogFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard icon={PhoneCall} tone="sky" title={t("attendance.logCall")}>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_120px_auto_auto]">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("attendance.phoneOptional")}
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
        />
        <input
          type="number"
          min={0}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="h-10 rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary/40"
        />
        <button
          type="button"
          onClick={() => setConnected((c) => !c)}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors",
            connected
              ? "border-success/30 bg-success/10 text-success"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {connected ? <Phone className="h-4 w-4" /> : <PhoneOff className="h-4 w-4" />}
          {connected ? t("attendance.callConnected") : t("attendance.callNotConnected")}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("attendance.logButton")}
        </button>
      </form>
    </SectionCard>
  );
}

function AttendanceSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const { rows, isLoading } = useAttendanceView();

  const visible =
    user?.role === "super_admin" || user?.role === "platform_owner"
      ? rows
      : user?.role === "rop"
        ? rows.filter((r) => r.managerId === user.id)
        : rows.filter((r) => r.profileId === user?.id);
  const phoneSystem = useHasPhoneSystem();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";

  return (
    <section className="surface-card p-6 sm:p-8">
      <div className={cn("grid gap-5", !phoneSystem && "xl:grid-cols-2")}>
        <MyStatusCard />
        {/* Calls arrive on their own once telephony is connected; logging
            them by hand is only for a company without it. */}
        {!phoneSystem && <LogCallCard />}
      </div>

      <div className="mt-6">
        <SectionCard
          icon={ClipboardList}
          tone="amber"
          title={t("attendance.roster")}
          description={t("attendance.rosterDesc")}
          actions={
            isAdmin ? (
              <Link
                to="/admin/attendance"
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Settings2 className="h-4 w-4" />
                {t("attendance.rulesLink")}
              </Link>
            ) : undefined
          }
        >
          <RosterSummary rows={visible} />
          {isLoading && (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          <div className="-m-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-6 py-3 font-medium">{t("attendance.colEmployee")}</th>
                  <th className="px-6 py-3 font-medium">{t("attendance.colClockIn")}</th>
                  <th className="px-4 py-3 font-medium">{t("attendance.colMethod")}</th>
                  <th className="px-6 py-3 font-medium">{t("attendance.colClockOut")}</th>
                  <th className="px-6 py-3 font-medium">{t("attendance.colSession")}</th>
                  <th className="px-6 py-3 font-medium">{t("attendance.colCalls")}</th>
                  <th className="px-6 py-3 font-medium">{t("attendance.colConnected")}</th>
                  <th className="px-6 py-3 font-medium">{t("attendance.colCallTime")}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr
                    key={r.profileId}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint text-xs font-semibold text-mint-foreground">
                          {r.initials}
                        </span>
                        <div>
                          <p className="font-medium text-foreground">{r.name}</p>
                          <p className="text-xs text-subtle">{r.position}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {r.absent ? (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-red-500/10 px-2 py-0.5 text-[12px] font-semibold text-red-700 dark:text-red-300">
                          <UserX className="h-3.5 w-3.5" />
                          {t("attendance.absent")}
                        </span>
                      ) : (
                        <span className="flex flex-col">
                          <span className="tabular-nums text-foreground">
                            {formatTime(r.clockIn)}
                          </span>
                          {r.lateMin > 0 && (
                            <span className="whitespace-nowrap text-[11.5px] font-semibold text-amber-700 dark:text-amber-300">
                              {t("attendance.lateBy", { min: r.lateMin })}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <MethodChip method={r.method} distanceM={r.distanceM} />
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{formatTime(r.clockOut)}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted-foreground">
                      {hoursText(r.sessionMinutes)}
                      <span className="block text-[11px] text-subtle">{r.shiftName}</span>
                    </td>
                    <td className="px-6 py-4 font-medium">{r.callsMade}</td>
                    <td className="px-6 py-4 font-medium">{r.callsConnected}</td>
                    <td className="px-6 py-4 font-medium">
                      {r.totalCallMinutes} {t("attendance.minutesShort")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && visible.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("attendance.noSession")}
            </p>
          )}
        </SectionCard>
      </div>
    </section>
  );
}

const METHOD_STYLE = {
  telegram: {
    icon: MapPin,
    cls: "bg-sky-500/10 text-sky-800 dark:text-sky-200",
    key: "attendance.methodTelegram",
  },
  web: {
    icon: Globe,
    cls: "bg-violet-500/10 text-violet-800 dark:text-violet-200",
    key: "attendance.methodWeb",
  },
  calls: {
    icon: PhoneCall,
    cls: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    key: "attendance.methodCalls",
  },
  messages: {
    icon: MessageSquare,
    cls: "bg-amber-500/10 text-amber-800 dark:text-amber-200",
    key: "attendance.methodMessages",
  },
} as const;

function MethodChip({
  method,
  distanceM,
}: {
  method: AttendanceRow["method"];
  distanceM: number | null;
}) {
  const { t } = useI18n();
  if (!method) return <span className="text-subtle">—</span>;
  const m = METHOD_STYLE[method];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[12px] font-semibold",
        m.cls,
      )}
      title={distanceM != null ? t("attendance.distance", { m: distanceM }) : undefined}
    >
      <m.icon className="h-3.5 w-3.5" />
      {t(m.key)}
      {method === "telegram" && distanceM != null && (
        <span className="font-mono font-medium opacity-75">· {distanceM} m</span>
      )}
    </span>
  );
}

// Who is in, who was late, who hasn't come, at a glance above the roster.
function RosterSummary({ rows }: { rows: AttendanceRow[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;
  const came = rows.filter((r) => r.clockIn).length;
  const late = rows.filter((r) => r.lateMin > 0).length;
  const absent = rows.filter((r) => r.absent).length;
  const viaTg = rows.filter((r) => r.method === "telegram").length;
  const cells = [
    {
      label: t("attendance.sumCame"),
      value: `${came}/${rows.length}`,
      cls: "text-emerald-700 dark:text-emerald-300",
      icon: UserCheck,
    },
    {
      label: t("attendance.sumLate"),
      value: late,
      cls: "text-amber-700 dark:text-amber-300",
      icon: Clock,
    },
    {
      label: t("attendance.sumAbsent"),
      value: absent,
      cls: "text-red-700 dark:text-red-300",
      icon: UserX,
    },
    {
      label: t("attendance.sumTelegram"),
      value: viaTg,
      cls: "text-sky-700 dark:text-sky-300",
      icon: MapPin,
    },
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="flex items-center gap-3 bg-card px-4 py-3">
          <c.icon className={cn("h-5 w-5 shrink-0", c.cls)} />
          <div>
            <p className={cn("font-mono text-[20px] font-bold leading-none tabular-nums", c.cls)}>
              {c.value}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">{c.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function CoachButton({ row }: { row: NormativeRow }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const chat = useAiAssistantChat();
  const [tip, setTip] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function onClick() {
    setOpen(true);
    if (tip) return;
    try {
      const reply = await chat.mutateAsync({
        messages: [
          {
            role: "user",
            content: `Employee ${row.name} (${row.department}) is at ${row.monthlyPct}% of their monthly sales target (${format(row.revenueMonth)} of ${row.monthlyTarget != null ? format(row.monthlyTarget) : "no target set"}), pacing at ${row.pacePct}% of where they should be by today. Give one short, specific, actionable coaching tip (2-3 sentences) to help them hit target this month.`,
          },
        ],
      });
      setTip(reply);
    } catch (err) {
      setTip(err instanceof Error ? err.message : t("normatives.coachFailed"));
    }
  }

  return (
    <div>
      <button
        onClick={onClick}
        disabled={chat.isPending}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
      >
        {chat.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {t("normatives.aiCoach")}
      </button>
      {open && tip && (
        <p className="mt-2 max-w-xs rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-foreground">
          {tip}
        </p>
      )}
    </div>
  );
}

function NotifyButton({ row }: { row: NormativeRow }) {
  const { t } = useI18n();
  const createNotification = useCreateNotification();
  const [sent, setSent] = useState(false);

  async function onClick() {
    try {
      await createNotification.mutateAsync({
        user_id: row.profileId,
        type: "Normative",
        title: t("normatives.notifyTitle"),
        body: t("normatives.notifyBody", { pct: row.monthlyPct }),
      });
      setSent(true);
      toast.success(t("normatives.notifySent"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("normatives.notifyFailed"));
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={createNotification.isPending || sent}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
    >
      {createNotification.isPending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Bell className="h-3.5 w-3.5" />
      )}
      {sent ? t("normatives.notifySent") : t("normatives.notify")}
    </button>
  );
}

function NormativesSection() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { user } = useAuth();
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const { rows, isLoading } = useNormativesView();

  const onTrack = rows.filter((r) => r.status === "onTrack").length;
  const atRisk = rows.filter((r) => r.status === "atRisk").length;
  const behind = rows.filter((r) => r.status === "behind").length;

  return (
    <section className="surface-card p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
          <Target className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-foreground">{t("normatives.title")}</h2>
        </div>
      </div>

      {isLoading && (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <StatCard
          label={t("normatives.onTrack")}
          value={String(onTrack)}
          info={t("normatives.onTrackInfo")}
          tone="mint"
        />
        <StatCard
          label={t("normatives.atRisk")}
          value={String(atRisk)}
          info={t("normatives.atRiskInfo")}
        />
        <StatCard
          label={t("normatives.behind")}
          value={String(behind)}
          info={t("normatives.behindInfo")}
        />
      </div>

      <div className="mt-6">
        <SectionCard
          icon={Target}
          tone="violet"
          title={t("normatives.roster")}
          description={t("normatives.rosterDesc")}
        >
          <div className="-m-4 overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-6 py-3 font-medium">{t("normatives.colEmployee")}</th>
                  <th className="px-6 py-3 font-medium">{t("normatives.colToday")}</th>
                  <th className="px-6 py-3 font-medium">{t("normatives.colMonth")}</th>
                  <th className="px-6 py-3 font-medium">{t("normatives.colProgress")}</th>
                  <th className="px-6 py-3 font-medium">{t("normatives.colStatus")}</th>
                  {canManage && (
                    <th className="px-6 py-3 font-medium">{t("normatives.colActions")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.profileId}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors hover:bg-surface",
                      r.status === "behind" && "bg-destructive/5",
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint text-xs font-semibold text-mint-foreground">
                          {r.initials}
                        </span>
                        <div>
                          <p className="font-medium text-foreground">{r.name}</p>
                          <p className="text-xs text-subtle">{r.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {format(r.revenueToday)} /{" "}
                      {r.dailyTarget != null ? format(r.dailyTarget) : t("widget.noTarget")}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {format(r.revenueMonth)} /{" "}
                      {r.monthlyTarget != null ? format(r.monthlyTarget) : t("widget.noTarget")}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              r.status === "behind"
                                ? "bg-destructive"
                                : r.status === "atRisk"
                                  ? "bg-warning"
                                  : "bg-success",
                            )}
                            style={{ width: `${Math.min(100, r.monthlyPct)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold">{r.monthlyPct}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Pill tone={statusTone[r.status]}>{t(`normatives.status.${r.status}`)}</Pill>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <CoachButton row={r} />
                          {r.status !== "onTrack" && <NotifyButton row={r} />}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("normatives.noEmployees")}
            </p>
          )}
        </SectionCard>
      </div>
    </section>
  );
}

function NewFineTypeDialog({ position }: { position: number }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const createType = useCreateFineType();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultAmount, setDefaultAmount] = useState("");
  const [color, setColor] = useState<FineColorName>("slate");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createType.mutateAsync({
        organization_id: user!.organizationId!,
        name: name.trim(),
        description: description.trim() || null,
        default_amount: defaultAmount ? Number(defaultAmount) : null,
        color,
        position,
      });
      setOpen(false);
      setName("");
      setDescription("");
      setDefaultAmount("");
      setColor("slate");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("fines.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent"
        >
          <Plus className="h-4 w-4" /> {t("fines.newType")}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fines.newType")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("fines.fieldName")}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("fines.fieldDescription")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("fines.fieldDescriptionPlaceholder")}
              className="mt-1.5 w-full resize-none rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("fines.fieldDefaultAmount")}
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={defaultAmount}
              onChange={(e) => setDefaultAmount(e.target.value)}
              placeholder={t("fines.fieldDefaultAmountPlaceholder")}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("fines.fieldColor")}
            </label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FINE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-7 w-7 rounded-full transition-transform hover:scale-110",
                    fineBadgeClass(c),
                    color === c && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                  )}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={createType.isPending || !name.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {createType.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddFineDialog({
  fineTypes,
  roster,
}: {
  fineTypes: FineTypeRow[];
  roster: { profileId: string; name: string }[];
}) {
  const { t } = useI18n();
  const createFine = useCreateFine();
  const [open, setOpen] = useState(false);
  const [profileId, setProfileId] = useState("");
  const [fineTypeId, setFineTypeId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!profileId || !fineTypeId || !amt || amt <= 0) return;
    try {
      await createFine.mutateAsync({
        profileId,
        fineTypeId,
        amount: amt,
        occurredOn,
        reason: reason.trim() || undefined,
      });
      toast.success(t("fines.added"));
      setOpen(false);
      setAmount("");
      setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("fines.saveFailed"));
    }
  }

  if (fineTypes.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> {t("fines.addFine")}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fines.addFine")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("fines.fieldEmployee")}
            </label>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value)}
              required
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="" disabled>
                —
              </option>
              {roster.map((r) => (
                <option key={r.profileId} value={r.profileId}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("fines.fieldType")}
            </label>
            <select
              value={fineTypeId}
              onChange={(e) => setFineTypeId(e.target.value)}
              required
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="" disabled>
                —
              </option>
              {fineTypes.map((ft) => (
                <option key={ft.id} value={ft.id}>
                  {ft.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("fines.fieldAmount")}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t("fines.fieldDate")}
              </label>
              <input
                type="date"
                value={occurredOn}
                onChange={(e) => setOccurredOn(e.target.value)}
                required
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              {t("fines.fieldReason")}
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={createFine.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {createFine.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function todayRange(): DateFilterValue {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from, to, label: "" };
}

function JarimalarSection() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { user } = useAuth();
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const [range, setRange] = useState<DateFilterValue>(() => ({
    ...todayRange(),
    label: t("lb.presetToday"),
  }));
  const { rows, fineTypes, isLoading } = useFinesMatrix(range);
  const deleteType = useDeleteFineType();
  const publish = usePublishFines();

  async function onDeleteType(id: string) {
    try {
      await deleteType.mutateAsync(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("fines.saveFailed"));
    }
  }

  async function onPublish() {
    try {
      await publish.mutateAsync({
        from: range.from ? range.from.toISOString() : null,
        to: range.to ? range.to.toISOString() : null,
        label: range.label,
      });
      toast.success(t("fines.published"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("fines.publishFailed"));
    }
  }

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <section className="surface-card p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600">
            <Coins className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("fines.title")}</h2>
            <p className="text-xs text-subtle">{t("fines.desc")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter value={range} onChange={setRange} />
          {canManage && <NewFineTypeDialog position={fineTypes.length} />}
          {canManage && <AddFineDialog fineTypes={fineTypes} roster={rows} />}
          {canManage && (
            <button
              type="button"
              onClick={() => void onPublish()}
              disabled={publish.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {publish.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Megaphone className="h-4 w-4" />
              )}
              {t("fines.publish")}
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      {!isLoading && fineTypes.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("fines.noTypes")}</p>
      ) : (
        <div className="-m-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-6 py-3 font-medium">{t("fines.colEmployee")}</th>
                {fineTypes.map((ft) => (
                  <th key={ft.id} className="px-4 py-3 text-center font-medium">
                    <div
                      className={cn(
                        "group relative mx-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1",
                        fineHeaderClass(ft.color),
                      )}
                    >
                      {ft.name}
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => void onDeleteType(ft.id)}
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                          title={t("common.delete")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                <th className="px-6 py-3 text-right font-medium">{t("fines.colTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.profileId}
                  className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint text-xs font-semibold text-mint-foreground">
                        {r.initials}
                      </span>
                      <p className="font-medium text-foreground">{r.name}</p>
                    </div>
                  </td>
                  {fineTypes.map((ft) => {
                    const amt = r.amountsByType[ft.id] ?? 0;
                    return (
                      <td key={ft.id} className="px-4 py-4 text-center">
                        {amt > 0 ? (
                          <span
                            className={cn(
                              "inline-flex rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums",
                              fineBadgeClass(ft.color),
                            )}
                          >
                            {format(amt)}
                          </span>
                        ) : (
                          <span className="text-subtle">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 text-right font-bold tabular-nums text-foreground">
                    {format(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="px-6 py-3 text-sm font-bold text-foreground">
                    {t("fines.colGrandTotal")}
                  </td>
                  <td colSpan={fineTypes.length} />
                  <td className="px-6 py-3 text-right text-sm font-bold tabular-nums text-foreground">
                    {format(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {!isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("normatives.noEmployees")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function KpiSection() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [range, setRange] = useState<DateFilterValue>(() => ({
    ...todayRange(),
    label: t("lb.presetToday"),
  }));
  const { rows, isLoading } = useKpiView(range);

  return (
    <section className="surface-card p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600">
            <Award className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("kpi.title")}</h2>
            <p className="text-xs text-subtle">{t("kpi.desc")}</p>
          </div>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {isLoading && (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      <SectionCard
        icon={Users}
        tone="sky"
        title={t("kpi.roster")}
        description={t("kpi.rosterDesc")}
      >
        <div className="-m-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-6 py-3 font-medium">{t("fines.colEmployee")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("kpi.colConversion")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("kpi.colSales")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("kpi.colRevenue")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("kpi.colCalls")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("kpi.colCallTime")}</th>
                <th className="px-4 py-3 text-center font-medium">{t("kpi.colMeetings")}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => b.revenue - a.revenue)
                .map((r) => (
                  <tr
                    key={r.profileId}
                    className="border-b border-border last:border-0 transition-colors hover:bg-surface"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-mint text-xs font-semibold text-mint-foreground">
                          {r.initials}
                        </span>
                        <p className="font-medium text-foreground">{r.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-semibold tabular-nums">
                      {r.conversionPct}%
                    </td>
                    <td className="px-4 py-4 text-center font-semibold tabular-nums">
                      {r.salesCount}
                    </td>
                    <td className="px-4 py-4 text-center tabular-nums text-muted-foreground">
                      {format(r.revenue)}
                    </td>
                    <td className="px-4 py-4 text-center tabular-nums text-muted-foreground">
                      {r.callsMade} ({r.callsConnected})
                    </td>
                    <td className="px-4 py-4 text-center tabular-nums text-muted-foreground">
                      {r.totalCallMinutes} {t("attendance.minutesShort")}
                    </td>
                    <td className="px-4 py-4 text-center font-semibold tabular-nums">
                      {r.meetingsCount}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("normatives.noEmployees")}
            </p>
          )}
        </div>
      </SectionCard>
    </section>
  );
}

type AttTab = (typeof TAB_KEYS)[number];

const ATT_TABS: { key: AttTab; icon: typeof Clock; labelKey: string }[] = [
  { key: "davomat", icon: Clock, labelKey: "attendance.tabDavomat" },
  { key: "normativ", icon: Target, labelKey: "attendance.tabNormativ" },
  { key: "jarimalar", icon: Coins, labelKey: "attendance.tabJarimalar" },
  { key: "kpi", icon: Award, labelKey: "attendance.tabKpi" },
  { key: "oylik", icon: Wallet, labelKey: "attendance.tabOylik" },
  { key: "reja", icon: TrendingUp, labelKey: "attendance.tabReja" },
  { key: "eslatmalar", icon: BellRing, labelKey: "rem.title" },
];

// Whether the company's calls come in automatically: telephony is
// connected, or call events have already arrived from it.
function useHasPhoneSystem(): boolean {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["pbx_calls", "any", user?.organizationId],
    enabled: !!user?.organizationId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("pbx_calls")
        .select("id", { count: "exact", head: true })
        .limit(1);
      return (count ?? 0) > 0;
    },
  });
  return data === true;
}

function AttendanceAndNormativesPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: AttTab = search.tab ?? "davomat";
  const setTab = (next: AttTab) =>
    void navigate({ search: { tab: next === "davomat" ? undefined : next }, replace: true });
  return (
    <>
      <PageHeader
        icon={Clock}
        tone="sky"
        title={t("nav./attendance")}
        description={t("attendance.pageDesc")}
        actions={<SectionSettingsButton section="control" />}
      />
      <Segmented
        sticky
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={ATT_TABS.map((tb) => ({ value: tb.key, label: t(tb.labelKey), icon: tb.icon }))}
      />

      {tab === "davomat" && <AttendanceSection />}
      {tab === "normativ" && <NormativesSection />}
      {tab === "jarimalar" && <JarimalarSection />}
      {tab === "kpi" && <KpiSection />}
      {tab === "oylik" && <PayrollBoard />}
      {tab === "reja" && <SalesPlanBoard />}
      {tab === "eslatmalar" && <RemindersBoard />}
    </>
  );
}
