import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, StatCard, Pill } from "@/components/layout/Primitives";
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
import {
  useAiAssistantChat,
  useAttendanceView,
  useClockIn,
  useClockOut,
  useCreateFine,
  useCreateFineType,
  useCreateNotification,
  useDeleteFine,
  useDeleteFineType,
  useFinesMatrix,
  useFineTypes,
  useKpiView,
  useLogCall,
  useMyOpenSession,
  useNormativesView,
  usePublishFines,
  type FineTypeRow,
  type NormativeRow,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/attendance")({
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

  // The platform detects "started work" itself the moment a rep's first
  // AmoCRM call of the day comes in -- same signal useAttendanceView's
  // roster already uses -- so this card doesn't wait for anyone to press
  // "Ishni boshlash". The manual button stays only as a fallback for a day
  // with zero AmoCRM calls yet.
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
    <SectionCard title={t("attendance.myStatus")}>
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
    <SectionCard title={t("attendance.logCall")}>
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
  const totalCalls = visible.reduce((s, r) => s + r.callsMade, 0);
  const totalConnected = visible.reduce((s, r) => s + r.callsConnected, 0);
  const totalCallMinutes = visible.reduce((s, r) => s + r.totalCallMinutes, 0);

  return (
    <section className="surface-card p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("nav./attendance")}</h2>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <MyStatusCard />
        <LogCallCard />
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <StatCard
          label={t("attendance.colCalls")}
          value={String(totalCalls)}
          info={t("attendance.colCallsInfo")}
          tone="mint"
        />
        <StatCard
          label={t("attendance.colConnected")}
          value={String(totalConnected)}
          info={t("attendance.colConnectedInfo")}
        />
        <StatCard
          label={t("attendance.colCallTime")}
          value={`${totalCallMinutes} ${t("attendance.minutesShort")}`}
          info={t("attendance.colCallTimeInfo")}
        />
      </div>

      <div className="mt-6">
        <SectionCard title={t("attendance.roster")} description={t("attendance.rosterDesc")}>
          {isLoading && (
            <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}
          <div className="-m-6 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                  <th className="px-6 py-3 font-medium">{t("attendance.colEmployee")}</th>
                  <th className="px-6 py-3 font-medium">{t("attendance.colClockIn")}</th>
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
                    <td className="px-6 py-4 text-muted-foreground">{formatTime(r.clockIn)}</td>
                    <td className="px-6 py-4 text-muted-foreground">{formatTime(r.clockOut)}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {r.sessionMinutes} {t("attendance.minutesShort")}
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
        <SectionCard title={t("normatives.roster")} description={t("normatives.rosterDesc")}>
          <div className="-m-6 overflow-x-auto">
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
        <div className="-m-6 overflow-x-auto">
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

  const best = useMemo(() => {
    const pick = <T,>(key: (r: (typeof rows)[number]) => number): string | null => {
      if (rows.length === 0) return null;
      const top = [...rows].sort((a, b) => key(b) - key(a))[0];
      return top && key(top) > 0 ? top.name : null;
    };
    return {
      conversion: pick((r) => r.conversionPct),
      sales: pick((r) => r.salesCount),
      calls: pick((r) => r.callsMade),
      meetings: pick((r) => r.meetingsCount),
    };
  }, [rows]);

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

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label={t("kpi.bestConversion")} value={best.conversion ?? "—"} tone="mint" />
        <StatCard label={t("kpi.bestSales")} value={best.sales ?? "—"} />
        <StatCard label={t("kpi.bestCalls")} value={best.calls ?? "—"} />
        <StatCard label={t("kpi.bestMeetings")} value={best.meetings ?? "—"} />
      </div>

      <SectionCard title={t("kpi.roster")} description={t("kpi.rosterDesc")}>
        <div className="-m-6 overflow-x-auto">
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

type AttTab = "davomat" | "normativ" | "jarimalar" | "kpi";

const ATT_TABS: { key: AttTab; icon: typeof Clock; labelKey: string }[] = [
  { key: "davomat", icon: Clock, labelKey: "attendance.tabDavomat" },
  { key: "normativ", icon: Target, labelKey: "attendance.tabNormativ" },
  { key: "jarimalar", icon: Coins, labelKey: "attendance.tabJarimalar" },
  { key: "kpi", icon: Award, labelKey: "attendance.tabKpi" },
];

function AttendanceAndNormativesPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<AttTab>("davomat");
  return (
    <>
      <div className="mb-6 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
        {ATT_TABS.map((tb) => (
          <button
            key={tb.key}
            type="button"
            onClick={() => setTab(tb.key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-sm font-semibold ring-1 ring-transparent transition-colors",
              tab === tb.key
                ? "bg-primary/10 text-primary ring-primary/50"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <tb.icon className="h-4 w-4" />
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {tab === "davomat" && <AttendanceSection />}
      {tab === "normativ" && <NormativesSection />}
      {tab === "jarimalar" && <JarimalarSection />}
      {tab === "kpi" && <KpiSection />}
    </>
  );
}
