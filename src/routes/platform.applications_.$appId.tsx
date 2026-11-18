import { useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Headphones,
  Link2,
  ListChecks,
  Loader2,
  LogIn,
  Mail,
  MessageSquareText,
  Paperclip,
  Phone,
  PhoneCall,
  Receipt,
  RotateCcw,
  Send,
  Trash2,
  Users,
  XCircle,
  Bug,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  CompanyMark,
  errText,
  HEALTH_DOT,
  LEADS_KEY,
  LostDialog,
  money,
  PHASE_CHIP,
  useLeadAction,
} from "@/components/owner/leads/shared";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { stageOf } from "@/lib/applications";
import {
  callDay,
  PIPELINE_STAGES,
  STAGE_TONE,
  tashkentTime,
  type Health,
  type HealthReason,
} from "@/lib/company-leads";
import { normalizePlan, PLAN_LABELS } from "@/lib/plan-gating";
import { requestCompanyEntry } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner -> Arizalar -> one company lead: who they are and what they answered
// at sign-up, their company's real life on the platform (people active,
// payments, errors, support), the timeline, tasks for the owner and/or the
// company (sent by Telegram and inside the platform), and problems with how
// they were solved.
export const Route = createFileRoute("/platform/applications_/$appId")({
  head: () => ({ meta: [{ title: "Lid — SalesIQ Owner" }] }),
  component: LeadPage,
});

type Note = {
  id: string;
  kind: string;
  body: string;
  amount: number | null;
  file_name: string | null;
  url: string | null;
  author: string | null;
  created_at: string;
  resolved_at?: string | null;
  resolution?: string | null;
};
type Task = {
  id: string;
  title: string;
  body: string;
  due_at: string | null;
  audience: "owner" | "company" | "both";
  done_at: string | null;
  notified_at: string | null;
  author: string | null;
  created_at: string;
};
type Facts = {
  org: {
    id: string;
    name: string;
    plan: string | null;
    subdomain: string | null;
    createdAt: string;
    trialEndsAt: string | null;
    isTrial: boolean;
    active: boolean;
    frozen: boolean;
  };
  people: { total: number; active7d: number; seatLimit: number | null; lastSeenAt: string | null };
  people_list: {
    id: string;
    name: string;
    role: string;
    email: string | null;
    lastSeenAt: string | null;
  }[];
  payments: {
    id: string;
    amount: number;
    status: string;
    provider: string;
    plan: string | null;
    createdAt: string;
    paidAt: string | null;
  }[];
  daysLeft: number | null;
  errors: {
    id: string;
    message: string;
    route: string | null;
    resolved: boolean;
    createdAt: string;
  }[];
  support: {
    id: string;
    direction: string;
    text: string;
    author: string | null;
    createdAt: string;
  }[];
  health: { level: Health; reasons: HealthReason[] };
};
type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  team_size: string | null;
  message: string;
  source: string;
  status: string;
  amount: number | null;
  created_at: string;
  organization_id: string | null;
  plan?: string | null;
  business?: string | null;
  sales_reps?: string | null;
  current_tool?: string | null;
  meeting_at?: string | null;
  meeting_note?: string | null;
  lost_reason?: string | null;
  utm?: Record<string, string>;
};
type Detail = {
  app: Lead;
  notes: Note[];
  tasks: Task[];
  tasksReady: boolean;
  facts: Facts | null;
  matches: { id: string; name: string }[];
};

const dt = (iso: string) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

function LeadPage() {
  const { appId } = Route.useParams();
  const { t } = useI18n();
  const qc = useQueryClient();
  const act = useLeadAction();
  const [lostOpen, setLostOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["owner-application", appId],
    queryFn: async (): Promise<Detail> => {
      const res = await apiFetch(`/platform/applications-api?id=${appId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["owner-application", appId] });
    void qc.invalidateQueries({ queryKey: LEADS_KEY });
  };

  if (isLoading || !data) {
    return (
      <p className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
      </p>
    );
  }
  const app = data.app;
  const stage = stageOf(app.status);
  const title = app.company || app.name;

  return (
    <div className="w-full">
      <Link
        to="/platform/applications"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("lead.title")}
      </Link>

      {/* Hero: who, stage relay, health */}
      <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-4 px-5 pb-4 pt-5">
          <CompanyMark name={title} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              {app.company && <span>{app.name}</span>}
              <CopyValue icon={Phone} value={app.phone} href={`tel:${app.phone}`} />
              {app.email && (
                <CopyValue icon={Mail} value={app.email} href={`mailto:${app.email}`} />
              )}
              <span className="text-subtle">
                {t(`lead.src.${app.source}`) === `lead.src.${app.source}`
                  ? app.source
                  : t(`lead.src.${app.source}`)}{" "}
                · {dt(app.created_at)}
              </span>
            </p>
          </div>
          {data.facts && <HealthBadge health={data.facts.health} />}
          {stage !== "lost" ? (
            <button
              type="button"
              onClick={() => setLostOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/30 px-3 text-[12.5px] font-semibold text-rose-600 hover:bg-rose-500/10"
            >
              <XCircle className="h-4 w-4" /> {t("lead.markLost")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                act.mutate(
                  { method: "PATCH", body: { id: app.id, status: "taken" } },
                  { onSuccess: refresh },
                )
              }
              className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold"
            >
              <RotateCcw className="h-4 w-4" /> {t("lead.reopen")}
            </button>
          )}
        </div>
        <div className="flex border-t border-border">
          {PIPELINE_STAGES.map((s, i) => {
            const idx = PIPELINE_STAGES.indexOf(stage as (typeof PIPELINE_STAGES)[number]);
            const done = stage !== "lost" && i <= idx;
            const current = s === stage;
            return (
              <button
                key={s}
                type="button"
                disabled={act.isPending}
                onClick={() =>
                  s !== stage &&
                  act.mutate(
                    { method: "PATCH", body: { id: app.id, status: s } },
                    { onSuccess: refresh },
                  )
                }
                className={cn(
                  "group relative flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-3 text-[12.5px] font-semibold transition-colors",
                  i > 0 && "border-l border-border",
                  current
                    ? "text-white"
                    : done
                      ? "text-foreground hover:bg-muted/50"
                      : "text-subtle hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {current && (
                  <span
                    className={cn("absolute inset-0 bg-gradient-to-r", STAGE_TONE[s].bar)}
                    aria-hidden
                  />
                )}
                {done && !current && (
                  <span
                    className={cn("absolute inset-x-0 bottom-0 h-0.5", STAGE_TONE[s].dot)}
                    aria-hidden
                  />
                )}
                <span className="relative flex items-center gap-1.5 truncate">
                  {done && !current && <Check className="h-3.5 w-3.5" />}
                  {t(`lead.st.${s}`)}
                </span>
              </button>
            );
          })}
        </div>
        {stage === "lost" && app.lost_reason && (
          <p className="border-t border-border bg-rose-500/[0.06] px-5 py-2.5 text-[13px] text-rose-700 dark:text-rose-300">
            {t("lead.lostBecause")}: {app.lost_reason}
          </p>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_300px] lg:grid-cols-[280px_minmax(0,1fr)]">
        <Passport data={data} refresh={refresh} />
        <Timeline data={data} refresh={refresh} />
        <div className="space-y-4 lg:col-span-2 xl:col-span-1">
          <CallCard app={app} refresh={refresh} />
          <TasksCard data={data} refresh={refresh} />
          <IssuesCard notes={data.notes} refresh={refresh} />
          <QuickActions data={data} />
        </div>
      </div>

      <LostDialog
        open={lostOpen}
        busy={act.isPending}
        onClose={() => setLostOpen(false)}
        onConfirm={(reason) =>
          act.mutate(
            { method: "PATCH", body: { id: app.id, status: "lost", lostReason: reason } },
            {
              onSuccess: () => {
                setLostOpen(false);
                refresh();
              },
            },
          )
        }
      />
    </div>
  );
}

function CopyValue({ icon: Icon, value, href }: { icon: LucideIcon; value: string; href: string }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="h-3.5 w-3.5" />
      <a href={href} className="hover:text-primary">
        {value}
      </a>
      <button
        type="button"
        aria-label={t("apps.copy")}
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.success(t("apps.copied"));
        }}
        className="text-subtle hover:text-foreground"
      >
        <Copy className="h-3 w-3" />
      </button>
    </span>
  );
}

function HealthBadge({ health }: { health: Facts["health"] }) {
  const { t } = useI18n();
  return (
    <span
      title={health.reasons.map((r) => t(`lead.why.${r}`)).join("\n")}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[12.5px] font-semibold",
        health.level === "good" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        health.level === "watch" &&
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        health.level === "risk" &&
          "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", HEALTH_DOT[health.level])} />
      {t(`lead.health.${health.level}`)}
      {health.reasons[0] && (
        <span className="font-normal opacity-80">· {t(`lead.why.${health.reasons[0]}`)}</span>
      )}
    </span>
  );
}

function Card({
  title,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  icon: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card", className)}>
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="flex-1 text-[13.5px] font-semibold text-foreground">{title}</h2>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[13px]">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

function Passport({ data, refresh }: { data: Detail; refresh: () => void }) {
  const { t } = useI18n();
  const act = useLeadAction();
  const app = data.app;
  const f = data.facts;
  const phase = f
    ? f.org.frozen
      ? "frozen"
      : !f.org.active || (f.daysLeft != null && f.daysLeft < 0)
        ? "expired"
        : f.org.isTrial
          ? "trial"
          : "paid"
    : null;
  const paid = f?.payments.filter((p) => p.status === "paid") ?? [];
  const lastPaid = paid[0];
  return (
    <div className="space-y-4">
      <Card title={t("lead.answers")} icon={MessageSquareText}>
        <Row label={t("lead.col.plan")}>
          {app.plan ? PLAN_LABELS[normalizePlan(app.plan)] : "—"}
        </Row>
        <Row label={t("wiz.q1")}>{app.business || "—"}</Row>
        <Row label={t("wiz.q2")}>{app.sales_reps || app.team_size || "—"}</Row>
        <Row label={t("wiz.q3")}>{app.current_tool ? t(`wiz.tool.${app.current_tool}`) : "—"}</Row>
        {app.message && (
          <p className="mt-2 whitespace-pre-line rounded-lg bg-muted/50 px-3 py-2 text-[12.5px] text-foreground">
            {app.message}
          </p>
        )}
        {Object.keys(app.utm ?? {}).length > 0 && (
          <p className="mt-2 break-all font-mono text-[10.5px] text-subtle">
            {Object.entries(app.utm ?? {})
              .map(([k, v]) => `${k}=${v}`)
              .join("  ")}
          </p>
        )}
      </Card>

      {f ? (
        <Card
          title={t("lead.company")}
          icon={Building2}
          actions={
            phase && (
              <span
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                  PHASE_CHIP[phase],
                )}
              >
                {t(`lead.phase.${phase}`)}
              </span>
            )
          }
        >
          <Row label={t("lead.col.plan")}>{PLAN_LABELS[normalizePlan(f.org.plan)]}</Row>
          <Row label={f.org.isTrial ? t("lead.trialEnds") : t("lead.paidUntil")}>
            {f.org.trialEndsAt
              ? `${f.org.trialEndsAt.slice(0, 10)}${f.daysLeft != null ? ` (${t("lead.daysLeft", { n: f.daysLeft })})` : ""}`
              : "—"}
          </Row>
          {f.org.subdomain && <Row label={t("lead.subdomain")}>{f.org.subdomain}.salesiq.uz</Row>}
          <Row label={t("lead.lastSeen")}>
            {f.people.lastSeenAt ? dt(f.people.lastSeenAt) : t("lead.never")}
          </Row>
          <div className="mt-3 rounded-xl bg-muted/40 p-3">
            <div className="flex items-baseline justify-between">
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
                <Users className="h-4 w-4" /> {t("lead.activePeople")}
              </span>
              <span className="text-[15px] font-bold tabular-nums text-foreground">
                {f.people.active7d}
                <span className="text-[12px] font-medium text-subtle">
                  {" "}
                  / {f.people.total}
                  {f.people.seatLimit != null
                    ? ` · ${t("lead.limit", { n: f.people.seatLimit })}`
                    : ""}
                </span>
              </span>
            </div>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                style={{
                  width: `${f.people.total ? (f.people.active7d / f.people.total) * 100 : 0}%`,
                }}
              />
            </span>
            <ul className="mt-2.5 space-y-1">
              {f.people_list.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-[12px]">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      p.lastSeenAt && Date.now() - new Date(p.lastSeenAt).getTime() < 7 * 86_400_000
                        ? "bg-emerald-500"
                        : "bg-muted-foreground/30",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                  <span className="text-subtle">{t(`lead.role.${p.role}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
              <CreditCard className="h-4 w-4" /> {t("lead.payments")}
              {lastPaid && (
                <span className="ml-auto text-[11.5px] font-normal text-subtle">
                  {t("lead.lastPayment", {
                    date: (lastPaid.paidAt ?? lastPaid.createdAt).slice(0, 10),
                  })}
                </span>
              )}
            </p>
            {f.payments.length ? (
              <ul className="divide-y divide-border/60 rounded-xl border border-border/70">
                {f.payments.slice(0, 6).map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        p.status === "paid"
                          ? "bg-emerald-500"
                          : p.status === "pending"
                            ? "bg-amber-500"
                            : "bg-muted-foreground/40",
                      )}
                    />
                    <span className="flex-1 tabular-nums text-foreground">{money(p.amount)}</span>
                    <span className="text-subtle">{(p.paidAt ?? p.createdAt).slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-subtle">{t("lead.noPayments")}</p>
            )}
          </div>
        </Card>
      ) : (
        <Card title={t("lead.company")} icon={Building2}>
          <p className="text-[12.5px] text-muted-foreground">{t("lead.notLinked")}</p>
          {data.matches.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={act.isPending}
              onClick={() =>
                act.mutate(
                  { body: { action: "link", id: app.id, orgId: m.id } },
                  { onSuccess: refresh },
                )
              }
              className="ctl-soft mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-semibold"
            >
              <Link2 className="h-4 w-4" /> {t("lead.linkTo", { name: m.name })}
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}

const COMPOSE = ["note", "call", "issue", "receipt", "document"] as const;
type Compose = (typeof COMPOSE)[number];
const NOTE_ICON: Record<string, LucideIcon> = {
  note: MessageSquareText,
  call: PhoneCall,
  meeting: CalendarClock,
  issue: AlertTriangle,
  receipt: Receipt,
  document: FileText,
  file: Paperclip,
  status: ChevronRight,
  support: Headphones,
  error: Bug,
  task: ListChecks,
};
const FILTERS = ["all", "notes", "issues", "support", "errors"] as const;

type Entry = {
  id: string;
  kind: string;
  at: string;
  body: string;
  who: string | null;
  note?: Note;
};

function Timeline({ data, refresh }: { data: Detail; refresh: () => void }) {
  const { t } = useI18n();
  const act = useLeadAction();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const entries = useMemo(() => {
    const list: Entry[] = data.notes.map((n) => ({
      id: n.id,
      kind: n.kind,
      at: n.created_at,
      body: n.body,
      who: n.author,
      note: n,
    }));
    for (const s of data.facts?.support ?? [])
      list.push({ id: `s${s.id}`, kind: "support", at: s.createdAt, body: s.text, who: s.author });
    for (const e of data.facts?.errors ?? [])
      list.push({
        id: `e${e.id}`,
        kind: "error",
        at: e.createdAt,
        body: `${e.message}${e.route ? `\n${e.route}` : ""}`,
        who: null,
      });
    for (const tk of data.tasks)
      list.push({
        id: `t${tk.id}`,
        kind: "task",
        at: tk.created_at,
        body: tk.title,
        who: tk.author,
      });
    list.sort((a, b) => b.at.localeCompare(a.at));
    return list.filter((e) =>
      filter === "all"
        ? true
        : filter === "notes"
          ? !["support", "error", "issue"].includes(e.kind)
          : filter === "issues"
            ? e.kind === "issue"
            : filter === "support"
              ? e.kind === "support"
              : e.kind === "error",
    );
  }, [data, filter]);

  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card">
      <Composer appId={data.app.id} onDone={refresh} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/70 px-4 py-2.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "h-7 rounded-lg px-2.5 text-[12px] font-semibold",
              filter === f
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t(`lead.tl.${f}`)}
          </button>
        ))}
      </div>
      <ol className="relative px-4 py-3">
        <span className="absolute bottom-4 left-[31px] top-4 w-px bg-border" aria-hidden />
        {entries.map((e) => {
          const Icon = NOTE_ICON[e.kind] ?? MessageSquareText;
          const [from, to] = e.kind === "status" ? e.body.split("·")[0]!.trim().split("→") : [];
          return (
            <li key={e.id} className="group relative flex gap-3 py-2.5">
              <span
                className={cn(
                  "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-border bg-card",
                  e.kind === "issue" && "border-amber-500/40 text-amber-600",
                  e.kind === "error" && "border-rose-500/40 text-rose-600",
                  e.kind === "support" && "border-sky-500/40 text-sky-600",
                  e.kind === "receipt" && "border-emerald-500/40 text-emerald-600",
                  !["issue", "error", "support", "receipt"].includes(e.kind) &&
                    "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11.5px] text-subtle">
                  {t(`lead.k.${e.kind}`)}
                  {e.who ? ` · ${e.who}` : ""} · {dt(e.at)}
                </p>
                {e.kind === "status" ? (
                  <p className="mt-0.5 text-[13px] text-foreground">
                    {t(`lead.st.${stageOf(from ?? "")}`)} →{" "}
                    <b>{t(`lead.st.${stageOf(to ?? "")}`)}</b>
                    {e.body.includes("·") && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {e.body.split("·").slice(1).join("·").trim()}
                      </span>
                    )}
                  </p>
                ) : e.kind === "meeting" ? (
                  <p className="mt-0.5 text-[13px] text-foreground">
                    {(() => {
                      const [at, ...rest] = e.body.split(" · ");
                      const ok = at && !Number.isNaN(new Date(at).getTime());
                      return ok
                        ? `${callDay(at, "uz")}, ${tashkentTime(at)}${rest.length ? ` · ${rest.join(" · ")}` : ""}`
                        : e.body;
                    })()}
                  </p>
                ) : (
                  e.body && (
                    <p
                      className={cn(
                        "mt-0.5 whitespace-pre-line text-[13px] text-foreground",
                        e.kind === "error" &&
                          "font-mono text-[12px] text-rose-700 dark:text-rose-300",
                      )}
                    >
                      {e.body}
                    </p>
                  )
                )}
                {e.note?.kind === "receipt" && e.note.amount != null && (
                  <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{money(e.note.amount)}
                  </p>
                )}
                {e.note?.kind === "issue" && e.note.resolved_at && (
                  <p className="mt-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[12.5px] text-emerald-700 dark:text-emerald-300">
                    ✓ {t("lead.resolved")}
                    {e.note.resolution ? `: ${e.note.resolution}` : ""}
                  </p>
                )}
                {e.note?.url && (
                  <a
                    href={e.note.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-muted"
                  >
                    <Paperclip className="h-3.5 w-3.5" /> {e.note.file_name ?? "file"}
                  </a>
                )}
              </div>
              {e.note && e.note.kind !== "status" && (
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={async () => {
                    if (!window.confirm(t("lead.deleteNote"))) return;
                    const res = await apiFetch(`/platform/applications-api?note=${e.note!.id}`, {
                      method: "DELETE",
                    });
                    if (res.ok) refresh();
                  }}
                  className="invisible self-start rounded-md p-1 text-subtle hover:text-rose-600 group-hover:visible"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
        {!entries.length && (
          <li className="py-8 text-center text-[13px] text-subtle">{t("lead.tlEmpty")}</li>
        )}
      </ol>
      {act.isPending && null}
    </section>
  );
}

function Composer({ appId, onDone }: { appId: string; onDone: () => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Compose>("note");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function save() {
    if (!body.trim() && !file) return;
    if (file && file.size > 15 * 1024 * 1024) {
      toast.error(t("apps.tooBig"));
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set("id", appId);
    form.set("kind", file && kind === "note" ? "file" : kind);
    form.set("body", body);
    if (kind === "receipt") form.set("amount", amount);
    if (file) form.set("file", file);
    const res = await apiFetch("/platform/applications-api", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      toast.error(errText(t, j.error ?? `HTTP ${res.status}`));
      return;
    }
    setBody("");
    setAmount("");
    setFile(null);
    onDone();
  }
  return (
    <div className="border-b border-border p-4">
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {COMPOSE.map((k) => {
          const Icon = NOTE_ICON[k]!;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors",
                kind === k ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {t(`lead.k.${k}`)}
            </button>
          );
        })}
      </div>
      <div className="rounded-xl border border-border bg-surface focus-within:border-primary">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
          }}
          placeholder={t(`lead.ph.${kind}`)}
          rows={2}
          className="block w-full resize-none bg-transparent px-3 py-2.5 text-[13.5px] outline-none placeholder:text-subtle"
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-2 py-1.5">
          {kind === "receipt" && (
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder={t("apps.sumPh")}
              className="h-8 w-40 rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-primary"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            hidden
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-muted-foreground hover:bg-muted"
          >
            <Paperclip className="h-4 w-4" /> {file ? file.name.slice(0, 28) : t("apps.attach")}
          </button>
          <button
            type="button"
            disabled={busy || (!body.trim() && !file)}
            onClick={() => void save()}
            className="ctl-lit ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[12.5px] font-semibold disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {t("apps.add")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** "2027-01-10T14:30" for <input type=datetime-local>, in Tashkent time. */
function localValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 5 * 3_600_000).toISOString().slice(0, 16);
}
function fromLocal(v: string): string | null {
  if (!v) return null;
  return new Date(`${v}:00+05:00`).toISOString();
}

function CallCard({ app, refresh }: { app: Lead; refresh: () => void }) {
  const { t, lang } = useI18n();
  const act = useLeadAction();
  const [editing, setEditing] = useState(false);
  const [at, setAt] = useState(localValue(app.meeting_at));
  const [note, setNote] = useState(app.meeting_note ?? "");
  const future = app.meeting_at && new Date(app.meeting_at).getTime() > Date.now() - 3_600_000;
  return (
    <Card
      title={t("lead.call")}
      icon={CalendarClock}
      actions={
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="text-[12px] font-semibold text-primary hover:underline"
        >
          {app.meeting_at ? t("lead.change") : t("lead.book")}
        </button>
      }
    >
      {app.meeting_at && !editing && (
        <div
          className={cn(
            "rounded-xl px-3.5 py-3",
            future
              ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
              : "bg-muted/50 text-muted-foreground",
          )}
        >
          <p className="text-[18px] font-bold tabular-nums">
            {tashkentTime(app.meeting_at)}{" "}
            <span className="text-[13px] font-semibold">{callDay(app.meeting_at, lang)}</span>
          </p>
          {app.meeting_note && <p className="mt-0.5 text-[12.5px]">{app.meeting_note}</p>}
          {!future && <p className="mt-0.5 text-[12px]">{t("lead.callPast")}</p>}
        </div>
      )}
      {!app.meeting_at && !editing && (
        <p className="text-[12.5px] text-subtle">{t("lead.noCall")}</p>
      )}
      {editing && (
        <div className="space-y-2">
          <input
            type="datetime-local"
            value={at}
            onChange={(e) => setAt(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-card px-3 text-[13.5px] outline-none focus:border-primary"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("lead.callNotePh")}
            className="h-10 w-full rounded-xl border border-border bg-card px-3 text-[13.5px] outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={act.isPending}
              onClick={() =>
                act.mutate(
                  { body: { action: "meeting", id: app.id, at: fromLocal(at), note } },
                  {
                    onSuccess: () => {
                      setEditing(false);
                      refresh();
                    },
                  },
                )
              }
              className="ctl-lit h-9 flex-1 rounded-lg text-[12.5px] font-semibold"
            >
              {t("apps.save")}
            </button>
            {app.meeting_at && (
              <button
                type="button"
                onClick={() =>
                  act.mutate(
                    { body: { action: "meeting", id: app.id, at: null, note: "" } },
                    {
                      onSuccess: () => {
                        setAt("");
                        setEditing(false);
                        refresh();
                      },
                    },
                  )
                }
                className="h-9 rounded-lg border border-border px-3 text-[12.5px] text-muted-foreground hover:text-rose-600"
              >
                {t("lead.cancelCall")}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

const AUDIENCES = ["owner", "company", "both"] as const;

function TasksCard({ data, refresh }: { data: Detail; refresh: () => void }) {
  const { t, lang } = useI18n();
  const act = useLeadAction();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>("owner");
  const linked = !!data.app.organization_id;
  const open = data.tasks.filter((x) => !x.done_at);
  const done = data.tasks.filter((x) => x.done_at);
  return (
    <Card
      title={t("lead.tasks")}
      icon={ListChecks}
      actions={<span className="text-[12px] text-subtle">{open.length}</span>}
    >
      {!data.tasksReady && <p className="mb-2 text-[12px] text-amber-600">{t("lead.notReady")}</p>}
      <div className="space-y-2 rounded-xl border border-border bg-surface p-2.5">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("lead.taskPh")}
          className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-primary"
        />
        <div className="flex gap-1">
          {AUDIENCES.map((a) => (
            <button
              key={a}
              type="button"
              disabled={a !== "owner" && !linked}
              onClick={() => setAudience(a)}
              title={a !== "owner" && !linked ? t("lead.notLinked") : undefined}
              className={cn(
                "h-7 flex-1 rounded-md text-[11.5px] font-semibold disabled:opacity-40",
                audience === a
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t(`lead.aud.${a}`)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={!title.trim() || act.isPending}
            onClick={() =>
              act.mutate(
                {
                  body: { action: "task", id: data.app.id, title, audience, dueAt: fromLocal(due) },
                },
                {
                  onSuccess: () => {
                    setTitle("");
                    setDue("");
                    refresh();
                  },
                },
              )
            }
            className="ctl-lit h-9 rounded-lg px-3 text-[12.5px] font-semibold disabled:opacity-40"
          >
            {t("apps.add")}
          </button>
        </div>
      </div>
      <ul className="mt-2.5 space-y-1">
        {[...open, ...done].map((x) => {
          const late = !x.done_at && x.due_at && new Date(x.due_at).getTime() < Date.now();
          return (
            <li
              key={x.id}
              className="group flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-muted/40"
            >
              <button
                type="button"
                aria-label={t("lead.done")}
                onClick={() =>
                  act.mutate(
                    { body: { action: "taskDone", taskId: x.id, done: !x.done_at } },
                    { onSuccess: refresh },
                  )
                }
                className={cn(
                  "mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-md border",
                  x.done_at
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border hover:border-primary",
                )}
              >
                {x.done_at && <Check className="h-3 w-3" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-[13px] text-foreground",
                    x.done_at && "text-subtle line-through",
                  )}
                >
                  {x.title}
                </p>
                <p className="flex flex-wrap gap-x-2 text-[11px] text-subtle">
                  <span
                    className={cn(
                      x.audience !== "owner" &&
                        "font-semibold text-violet-600 dark:text-violet-300",
                    )}
                  >
                    {t(`lead.aud.${x.audience}`)}
                  </span>
                  {x.due_at && (
                    <span className={cn(late && "font-semibold text-rose-600")}>
                      {callDay(x.due_at, lang)}, {tashkentTime(x.due_at)}
                    </span>
                  )}
                  {x.notified_at && <span>· {t("lead.sent")}</span>}
                </p>
              </div>
              <button
                type="button"
                aria-label={t("common.delete")}
                onClick={() =>
                  act.mutate(
                    { body: { action: "taskDelete", taskId: x.id } },
                    { onSuccess: refresh },
                  )
                }
                className="invisible rounded p-0.5 text-subtle hover:text-rose-600 group-hover:visible"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
        {!data.tasks.length && (
          <li className="py-2 text-center text-[12px] text-subtle">{t("lead.noTasks")}</li>
        )}
      </ul>
    </Card>
  );
}

function IssuesCard({ notes, refresh }: { notes: Note[]; refresh: () => void }) {
  const { t } = useI18n();
  const act = useLeadAction();
  const [solving, setSolving] = useState<string | null>(null);
  const [text, setText] = useState("");
  const issues = notes.filter((n) => n.kind === "issue");
  const open = issues.filter((n) => !n.resolved_at);
  return (
    <Card
      title={t("lead.issues")}
      icon={AlertTriangle}
      actions={
        <span className="text-[12px] text-subtle">
          {t("lead.issuesOpen", { open: open.length, all: issues.length })}
        </span>
      }
    >
      {!issues.length && <p className="text-[12.5px] text-subtle">{t("lead.noIssues")}</p>}
      <ul className="space-y-2">
        {[...open, ...issues.filter((n) => n.resolved_at)].map((n) => (
          <li
            key={n.id}
            className={cn(
              "rounded-xl border px-3 py-2.5",
              n.resolved_at
                ? "border-border bg-muted/30"
                : "border-amber-500/30 bg-amber-500/[0.06]",
            )}
          >
            <p className="flex items-start gap-2 text-[13px] text-foreground">
              {n.resolved_at ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              )}
              <span className="min-w-0 flex-1 whitespace-pre-line">{n.body}</span>
            </p>
            <p className="ml-6 mt-0.5 text-[11px] text-subtle">{dt(n.created_at)}</p>
            {n.resolved_at ? (
              <div className="ml-6 mt-1 text-[12px] text-emerald-700 dark:text-emerald-300">
                {n.resolution || t("lead.resolved")} · {dt(n.resolved_at)}
                <button
                  type="button"
                  onClick={() =>
                    act.mutate(
                      { body: { action: "resolve", noteId: n.id, reopen: true } },
                      { onSuccess: refresh },
                    )
                  }
                  className="ml-2 text-subtle underline hover:text-foreground"
                >
                  {t("lead.reopen")}
                </button>
              </div>
            ) : solving === n.id ? (
              <div className="ml-6 mt-2 flex gap-1.5">
                <input
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("lead.howSolved")}
                  className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 text-[12.5px] outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() =>
                    act.mutate(
                      { body: { action: "resolve", noteId: n.id, resolution: text } },
                      {
                        onSuccess: () => {
                          setSolving(null);
                          setText("");
                          refresh();
                        },
                      },
                    )
                  }
                  className="h-8 rounded-lg bg-emerald-600 px-2.5 text-[12px] font-semibold text-white"
                >
                  {t("lead.solve")}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSolving(n.id)}
                className="ml-6 mt-1.5 text-[12px] font-semibold text-emerald-700 hover:underline dark:text-emerald-300"
              >
                {t("lead.markSolved")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function QuickActions({ data }: { data: Detail }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { signInWithTokenHash } = useAuth();
  const [busy, setBusy] = useState(false);
  const orgId = data.app.organization_id;
  if (!orgId) return null;
  async function enter() {
    setBusy(true);
    try {
      const { tokenHash } = await requestCompanyEntry(orgId!);
      const r = await signInWithTokenHash(tokenHash);
      if (!r.ok) throw new Error(r.error);
      void navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  const linkCls =
    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted";
  return (
    <Card title={t("lead.actions")} icon={ExternalLink}>
      <div className="-m-1.5 space-y-0.5">
        <Link to="/platform/organizations/$orgId" params={{ orgId }} className={linkCls}>
          <Building2 className="h-4 w-4 text-muted-foreground" /> {t("lead.openCompany")}
        </Link>
        <Link to="/platform/support" search={{ org: orgId } as never} className={linkCls}>
          <Headphones className="h-4 w-4 text-muted-foreground" /> {t("lead.openInbox")}
        </Link>
        <Link to="/platform/usage/$orgId" params={{ orgId }} className={linkCls}>
          <Users className="h-4 w-4 text-muted-foreground" /> {t("lead.openUsage")}
        </Link>
        <button
          type="button"
          disabled={busy}
          onClick={() => void enter()}
          className={cn(linkCls, "w-full")}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4 text-muted-foreground" />
          )}
          {t("lead.enter")}
        </button>
      </div>
    </Card>
  );
}
