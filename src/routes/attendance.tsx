import { RemindersBoard } from "@/components/reminders/RemindersBoard";
import { StaffTasksBoard } from "@/components/control/StaffTasksBoard";
import { CollapsibleTable } from "@/components/layout/CollapsibleTable";
import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Award,
  Bell,
  BellRing,
  CheckCircle2,
  Clock,
  Coins,
  Gauge,
  ListTodo,
  Loader2,
  Megaphone,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard, Pill } from "@/components/layout/Primitives";
import { CardBoard, CardPlaceholder, type CardBoardItem } from "@/components/dashboard/HomeBoard";
import { SalesPlanBoard } from "@/components/plan/SalesPlanBoard";
import { PaneSwitch, type PaneMode } from "@/components/control/SettingsKit";
import { NormativSettings } from "@/components/control/NormativSettings";
import { FinesSettings } from "@/components/control/FinesSettings";
import { KpiSettings, KPI_LABEL } from "@/components/control/KpiSettings";
import { PlanSettings } from "@/components/control/PlanSettings";
import { KPI_METRICS, type KpiMetric } from "@/lib/control-settings";
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
import {
  useAiAssistantChat,
  useCreateFine,
  useCreateFineType,
  useCreateNotification,
  useDeleteFineType,
  useFinesMatrix,
  useKpiView,
  useNormativesView,
  useControlSettings,
  usePublishFines,
  type FineTypeRow,
  type NormativeRow,
} from "@/hooks/use-crm-data";

const TAB_KEYS = ["vazifalar", "normativ", "jarimalar", "kpi", "reja", "eslatmalar"] as const;

export const Route = createFileRoute("/attendance")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: AttTab | undefined; pane?: "settings" | undefined } => ({
    tab: TAB_KEYS.includes(search["tab"] as AttTab) ? (search["tab"] as AttTab) : undefined,
    pane: search["pane"] === "settings" ? "settings" : undefined,
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

const statusTone: Record<NormativeRow["status"], "success" | "warning" | "danger"> = {
  onTrack: "success",
  atRisk: "warning",
  behind: "danger",
};

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
  // Revenue, or the number of sales (Nazorat → Normativ → Sozlash).
  const byDeals = useControlSettings().normativ.basis === "deals";
  const fmt = (v: number) => (byDeals ? `${v} ${t("ctl.norm.unitDeals")}` : format(v));

  const onTrack = rows.filter((r) => r.status === "onTrack").length;
  const atRisk = rows.filter((r) => r.status === "atRisk").length;
  const behind = rows.filter((r) => r.status === "behind").length;

  // Normativlar as a board (CardBoard): the three status counts and the
  // roster are cards each person arranges.
  const items: CardBoardItem[] = [
    {
      id: "onTrack",
      title: t("normatives.onTrack"),
      icon: CheckCircle2,
      tone: "emerald",
      span: 4,
      node: isLoading ? (
        <CardPlaceholder stat />
      ) : (
        <StatCard
          icon={CheckCircle2}
          iconTone="emerald"
          label={t("normatives.onTrack")}
          tipKey="normatives.onTrack"
          value={String(onTrack)}
          info={t("normatives.onTrackInfo")}
          tone="mint"
        />
      ),
    },
    {
      id: "atRisk",
      title: t("normatives.atRisk"),
      icon: AlertTriangle,
      tone: "amber",
      span: 4,
      node: isLoading ? (
        <CardPlaceholder stat />
      ) : (
        <StatCard
          icon={AlertTriangle}
          iconTone="amber"
          label={t("normatives.atRisk")}
          tipKey="normatives.atRisk"
          value={String(atRisk)}
          info={t("normatives.atRiskInfo")}
        />
      ),
    },
    {
      id: "behind",
      title: t("normatives.behind"),
      icon: TrendingDown,
      tone: "rose",
      span: 4,
      node: isLoading ? (
        <CardPlaceholder stat />
      ) : (
        <StatCard
          icon={TrendingDown}
          iconTone="rose"
          label={t("normatives.behind")}
          tipKey="normatives.behind"
          value={String(behind)}
          info={t("normatives.behindInfo")}
        />
      ),
    },
    {
      id: "roster",
      title: t("normatives.roster"),
      icon: Target,
      tone: "violet",
      span: 12,
      sizes: [8, 12],
      node: (
        <SectionCard
          icon={Target}
          tone="violet"
          title={t("normatives.roster")}
          description={t("normatives.rosterDesc")}
        >
          <CollapsibleTable minWidth={1000} className="text-sm -m-4">
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
                    {fmt(r.revenueToday)} /{" "}
                    {r.dailyTarget != null ? fmt(r.dailyTarget) : t("widget.noTarget")}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {fmt(r.revenueMonth)} /{" "}
                    {r.monthlyTarget != null ? fmt(r.monthlyTarget) : t("widget.noTarget")}
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
          </CollapsibleTable>
          {!isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("normatives.noEmployees")}
            </p>
          )}
        </SectionCard>
      ),
    },
  ];
  return <CardBoard boardKey="attendance.normativ" items={items} />;
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
        <>
          <CollapsibleTable minWidth={900} className="text-sm -m-4">
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
          </CollapsibleTable>
          {!isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("normatives.noEmployees")}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function KpiSection() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const kpi = useControlSettings().kpi;
  const [range, setRange] = useState<DateFilterValue>(() => ({
    ...todayRange(),
    label: t("lb.presetToday"),
  }));
  const { rows, isLoading } = useKpiView(range);
  const shown = KPI_METRICS.filter((m) => kpi.metrics[m]);
  const hasScore = rows.some((r) => r.score != null);
  const cell = (m: KpiMetric, v: number) =>
    m === "revenue"
      ? format(v)
      : m === "conversionPct"
        ? `${v}%`
        : m === "totalCallMinutes"
          ? `${v} ${t("attendance.minutesShort")}`
          : String(v);

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
        <>
          <CollapsibleTable minWidth={1000} className="text-sm -m-4">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-6 py-3 font-medium">{t("fines.colEmployee")}</th>
                {hasScore && (
                  <th className="px-4 py-3 text-center font-medium">{t("ctl.kpi.scoreCol")}</th>
                )}
                {shown.map((m) => (
                  <th key={m} className="px-4 py-3 text-center font-medium">
                    {t(KPI_LABEL[m])}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.revenue - a.revenue)
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
                    {hasScore && (
                      <td className="px-4 py-4 text-center">
                        <span
                          className={cn(
                            "inline-flex min-w-[52px] justify-center rounded-lg px-2 py-1 text-[13px] font-bold tabular-nums",
                            r.score == null
                              ? "bg-muted text-muted-foreground"
                              : r.score >= 100
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : r.score >= 70
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                  : "bg-rose-500/12 text-rose-700 dark:text-rose-300",
                          )}
                        >
                          {r.score ?? "—"}
                        </span>
                      </td>
                    )}
                    {shown.map((m) => {
                      const target = kpi.targets[m];
                      const pct = target > 0 ? Math.round((r[m] / target) * 100) : null;
                      return (
                        <td key={m} className="px-4 py-4 text-center tabular-nums">
                          <span className="font-semibold text-foreground">{cell(m, r[m])}</span>
                          {pct != null && (
                            <span className="mx-auto mt-1.5 block h-1 w-16 overflow-hidden rounded-full bg-muted">
                              <span
                                className={cn(
                                  "block h-full rounded-full",
                                  pct >= 100
                                    ? "bg-emerald-500"
                                    : pct >= 70
                                      ? "bg-amber-500"
                                      : "bg-rose-500",
                                )}
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          </CollapsibleTable>
          {!isLoading && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("normatives.noEmployees")}
            </p>
          )}
        </>
      </SectionCard>
    </section>
  );
}

type AttTab = (typeof TAB_KEYS)[number];

const ATT_TABS: { key: AttTab; icon: typeof Gauge; labelKey: string }[] = [
  { key: "vazifalar", icon: ListTodo, labelKey: "stask.tab" },
  { key: "normativ", icon: Target, labelKey: "attendance.tabNormativ" },
  { key: "jarimalar", icon: Coins, labelKey: "attendance.tabJarimalar" },
  { key: "kpi", icon: Award, labelKey: "attendance.tabKpi" },
  { key: "reja", icon: TrendingUp, labelKey: "attendance.tabReja" },
  { key: "eslatmalar", icon: BellRing, labelKey: "rem.title" },
];

function AttendanceAndNormativesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: AttTab = search.tab ?? "vazifalar";
  const canManage =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  // Normativ, Jarimalar, KPI and Reja va fakt each have «Sozlash» (heads only).
  const hasSettings = tab !== "eslatmalar" && tab !== "vazifalar";
  const pane: PaneMode =
    canManage && hasSettings && search.pane === "settings" ? "settings" : "view";
  const setTab = (next: AttTab) =>
    void navigate({ search: { tab: next === "vazifalar" ? undefined : next }, replace: true });
  const setPane = (next: PaneMode) =>
    void navigate({
      search: (s) => ({ ...s, pane: next === "settings" ? "settings" : undefined }),
      replace: true,
    });
  return (
    <>
      <PageHeader
        icon={Gauge}
        tone="sky"
        title={t("nav./attendance")}
        description={t("attendance.pageDesc")}
      />
      <Segmented
        sticky
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={ATT_TABS.map((tb) => ({ value: tb.key, label: t(tb.labelKey), icon: tb.icon }))}
      />
      {hasSettings && <PaneSwitch mode={pane} onChange={setPane} canManage={canManage} />}

      {tab === "vazifalar" && <StaffTasksBoard />}
      {tab === "normativ" && (pane === "settings" ? <NormativSettings /> : <NormativesSection />)}
      {tab === "jarimalar" && (pane === "settings" ? <FinesSettings /> : <JarimalarSection />)}
      {tab === "kpi" && (pane === "settings" ? <KpiSettings /> : <KpiSection />)}
      {tab === "reja" && (pane === "settings" ? <PlanSettings /> : <SalesPlanBoard />)}
      {tab === "eslatmalar" && <RemindersBoard />}
    </>
  );
}
