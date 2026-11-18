import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  Filter,
  Headset,
  Inbox,
  Loader2,
  Lock,
  MessageSquareQuote,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizeHandle, useResizableWidth } from "@/components/ui/resize-handle";
import { CompanyMark, HEALTH_DOT, PHASE_CHIP, StageChip } from "@/components/owner/leads/shared";
import { renderMessageContent } from "@/components/ai/MessageContent";
import { useOwnerInbox } from "@/hooks/use-crm-data";
import { FixedPage } from "@/components/layout/FixedPage";
import { responseLabel } from "@/lib/support";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  activeFilterCount,
  EMPTY_OWNER_FILTER,
  matchesOwnerInbox,
  OWNER_INBOX_PRESETS,
  presetFilter,
  type CompanyThread,
  type InboxMessage,
  type InboxPhase,
  type OwnerInboxFilter,
} from "@/lib/owner-inbox";
import { callDay, PIPELINE_STAGES } from "@/lib/company-leads";
import { PLANS, PLAN_LABELS, normalizePlan } from "@/lib/plan-gating";
import { cn } from "@/lib/utils";

// The platform owner's inbox: support conversations grouped by company (the
// assistant's Operator tab and Telegram replies), laid out like the CRM
// Inbox -- the list with company filters, the conversation, and the
// company's passport (plan, people, payments, lead stage) beside it.
export const Route = createFileRoute("/platform/support")({
  validateSearch: (s: Record<string, unknown>): { org?: string | undefined } => ({
    org: typeof s["org"] === "string" ? s["org"] : undefined,
  }),
  head: () => ({ meta: [{ title: "Yordam — SalesIQ Owner" }] }),
  component: OwnerInboxPage,
});

type Facts = {
  org: {
    plan: string | null;
    trialEndsAt: string | null;
    subdomain: string | null;
    isTrial: boolean;
  };
  people: { total: number; active7d: number; seatLimit: number | null; lastSeenAt: string | null };
  payments: { status: string; amount: number; paidAt: string | null; createdAt: string }[];
  daysLeft: number | null;
  errors: { resolved: boolean }[];
  health: { level: "good" | "watch" | "risk"; reasons: string[] };
};
type ThreadData = {
  messages: InboxMessage[];
  lead: { id: string; status: string; openTasks: number; openIssues: number } | null;
  facts: Facts | null;
};

const PHASES: InboxPhase[] = ["trial", "paid", "expired", "frozen"];
const SAVED_KEY = "owner.inbox.saved";

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
function short(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return hm(iso);
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
function waitText(iso: string, t: (k: string, v?: Record<string, string | number>) => string) {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 60
    ? t("lead.agoMin", { n: m })
    : m < 1440
      ? t("lead.agoHour", { n: Math.round(m / 60) })
      : t("lead.agoDay", { n: Math.round(m / 1440) });
}

function useSaved() {
  const [saved, setSaved] = useState<{ name: string; f: OwnerInboxFilter }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const write = (v: typeof saved) => {
    setSaved(v);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(v));
    } catch {
      /* private window */
    }
  };
  return { saved, write };
}

function OwnerInboxPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<OwnerInboxFilter>(EMPTY_OWNER_FILTER);
  const [selected, setSelected] = useState<string | null>(search.org ?? null);
  const [infoOpen, setInfoOpen] = useState(true);
  // Phones show the list or the open conversation, one at a time.
  const [phoneChat, setPhoneChat] = useState(!!search.org);
  const [analytics, setAnalytics] = useState<boolean>(() => {
    try {
      return localStorage.getItem("owner.inbox.analytics") === "1";
    } catch {
      return false;
    }
  });
  const toggleAnalytics = () =>
    setAnalytics((v) => {
      try {
        localStorage.setItem("owner.inbox.analytics", v ? "0" : "1");
      } catch {
        /* private window */
      }
      return !v;
    });
  const listSize = useResizableWidth("owner-inbox-list", 360, 290, 520);
  const { data, isLoading } = useOwnerInbox();
  const all = useMemo(() => data?.threads ?? [], [data]);
  const list = useMemo(() => all.filter((x) => matchesOwnerInbox(x, filter)), [all, filter]);
  const current = all.find((x) => x.key === selected) ?? null;
  const waiting = all.filter((x) => x.waitingSince).length;
  const unread = all.filter((x) => x.unread > 0).length;

  useEffect(() => {
    if (!selected && list[0]) setSelected(list[0].key);
  }, [list, selected]);

  const presetOn = (p: (typeof OWNER_INBOX_PRESETS)[number]) =>
    JSON.stringify(presetFilter(p)) === JSON.stringify({ ...filter, text: "" });

  return (
    <FixedPage className="flex-row bg-card">
      {/* list */}
      <aside
        style={{ width: listSize.width }}
        className={cn(
          "relative flex shrink-0 flex-col border-r border-border phone:!w-full phone:border-r-0",
          current && infoOpen && "lg:max-xl:hidden",
          phoneChat && current && "phone:hidden",
        )}
      >
        <div className="border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
              <Headset className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-[16px] font-bold tracking-tight text-foreground">
                {t("oinbox.title")}
              </h1>
              <p className="text-[11.5px] text-muted-foreground">
                {t("oinbox.summary", { all: all.length, waiting, unread })}
              </p>
            </div>
            <button
              type="button"
              aria-pressed={analytics}
              onClick={toggleAnalytics}
              title={t("oinbox.analytics")}
              className={cn(
                "inline-flex h-8 items-center gap-1 rounded-lg border px-2 text-[12px] font-semibold transition-colors",
                analytics
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <BarChart3 className="h-4 w-4" />
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", analytics && "rotate-180")}
              />
            </button>
          </div>
          {analytics && data?.stats && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(
                [
                  ["waiting", data.stats.waiting, "text-rose-600"],
                  [
                    "avg",
                    data.stats.avgResponseMs == null
                      ? "—"
                      : responseLabel(data.stats.avgResponseMs, {
                          min: t("oinbox.u.min"),
                          hour: t("oinbox.u.hour"),
                          day: t("oinbox.u.day"),
                        }),
                    "text-foreground",
                  ],
                  ["today", data.stats.answeredToday, "text-emerald-600"],
                  ["questions", data.stats.questions, "text-foreground"],
                ] as const
              ).map(([k, v, cls]) => (
                <div key={k} className="rounded-xl border border-border bg-surface px-3 py-2">
                  <p className={cn("text-[16px] font-bold leading-tight tabular-nums", cls)}>{v}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t(`oinbox.stat.${k}`)}
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface px-2.5 focus-within:border-primary">
              <Search className="h-4 w-4 text-subtle" />
              <input
                value={filter.text}
                onChange={(e) => setFilter({ ...filter, text: e.target.value })}
                placeholder={t("oinbox.search")}
                className="h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
              />
            </label>
            <FilterPopover filter={filter} onChange={setFilter} />
          </div>
          <div className="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            {OWNER_INBOX_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() =>
                  setFilter(
                    presetOn(p)
                      ? { ...EMPTY_OWNER_FILTER, text: filter.text }
                      : { ...presetFilter(p), text: filter.text },
                  )
                }
                className={cn(
                  "h-7 shrink-0 rounded-full border px-2.5 text-[11.5px] font-semibold transition-colors",
                  presetOn(p)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`oinbox.preset.${p}`)}
                {p === "waiting" && waiting > 0 && (
                  <span className="ml-1 text-rose-600">{waiting}</span>
                )}
                {p === "unread" && unread > 0 && (
                  <span className="ml-1 text-primary">{unread}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </p>
          ) : !list.length ? (
            <div className="px-6 py-12 text-center">
              <Inbox className="mx-auto h-8 w-8 text-subtle" />
              <p className="mt-2 text-[13px] text-muted-foreground">{t("oinbox.empty")}</p>
            </div>
          ) : (
            list.map((x) => (
              <ThreadRow
                key={x.key}
                x={x}
                active={x.key === selected}
                onClick={() => {
                  setSelected(x.key);
                  setPhoneChat(true);
                }}
              />
            ))
          )}
        </div>
      </aside>
      <ResizeHandle label={t("amo.resize")} {...listSize.handle} />

      {/* conversation */}
      {current ? (
        <Conversation
          key={current.key}
          thread={current}
          infoOpen={infoOpen}
          onToggleInfo={() => setInfoOpen(!infoOpen)}
          phoneHidden={!phoneChat}
          onBack={() => setPhoneChat(false)}
          onChanged={() => void qc.invalidateQueries({ queryKey: ["owner_inbox"] })}
        />
      ) : (
        <div className="grid flex-1 place-items-center text-center phone:hidden">
          <div>
            <MessageSquareQuote className="mx-auto h-9 w-9 text-subtle" />
            <p className="mt-2 text-[13.5px] text-muted-foreground">{t("oinbox.pick")}</p>
          </div>
        </div>
      )}
    </FixedPage>
  );
}

function ThreadRow({
  x,
  active,
  onClick,
}: {
  x: CompanyThread;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const bold = x.unread > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full gap-3 border-b border-border/60 px-4 py-3 text-left transition-colors",
        active ? "bg-primary/[0.07]" : "hover:bg-muted/50",
      )}
    >
      <span className="relative">
        <CompanyMark name={x.name} size="md" />
        {x.status === "closed" && (
          <span className="absolute -bottom-1 -right-1 grid h-4.5 w-4.5 place-items-center rounded-full border-2 border-card bg-muted text-subtle">
            <Lock className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13.5px] text-foreground",
              bold ? "font-bold" : "font-semibold",
            )}
          >
            {x.name}
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              bold ? "font-semibold text-primary" : "text-subtle",
            )}
          >
            {short(x.lastAt)}
          </span>
        </span>
        <span
          className={cn(
            "mt-0.5 line-clamp-2 text-[12.5px] leading-snug",
            bold ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {x.lastAuthor && <span className="font-medium">{x.lastAuthor}: </span>}
          {x.lastText}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {x.phase !== "none" && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold",
                PHASE_CHIP[x.phase],
              )}
            >
              {t(`lead.phase.${x.phase}`)}
            </span>
          )}
          {x.plan && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
              {PLAN_LABELS[normalizePlan(x.plan)]}
            </span>
          )}
          {x.waitingSince && (
            <span className="rounded-md bg-rose-500/12 px-1.5 py-0.5 text-[10.5px] font-semibold text-rose-600">
              {t("oinbox.waiting", { t: waitText(x.waitingSince, t) })}
            </span>
          )}
          {x.unread > 0 && (
            <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[10.5px] font-bold text-primary-foreground">
              {x.unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-lg border px-2.5 text-[12px] font-semibold",
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterPopover({
  filter,
  onChange,
}: {
  filter: OwnerInboxFilter;
  onChange: (f: OwnerInboxFilter) => void;
}) {
  const { t } = useI18n();
  const { saved, write } = useSaved();
  const [name, setName] = useState("");
  const n = activeFilterCount(filter);
  const toggle = <K extends "plans" | "phases" | "stages">(
    k: K,
    v: OwnerInboxFilter[K][number],
  ) => {
    const cur = filter[k] as string[];
    onChange({ ...filter, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative grid h-9 w-9 place-items-center rounded-xl border",
            n
              ? "border-primary text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
          aria-label={t("oinbox.filters")}
        >
          <Filter className="h-4 w-4" />
          {n > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {n}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[520px] p-0">
        <div className="grid grid-cols-[170px_1fr]">
          <div className="border-r border-border p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
              {t("oinbox.saved")}
            </p>
            {saved.map((s, i) => (
              <div key={s.name + i} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => onChange({ ...s.f, text: filter.text })}
                  className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-muted"
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  onClick={() => write(saved.filter((_, j) => j !== i))}
                  className="invisible p-1 text-subtle hover:text-rose-600 group-hover:visible"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {!saved.length && <p className="px-2 text-[12px] text-subtle">{t("oinbox.noSaved")}</p>}
            <div className="mt-3 flex gap-1">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("oinbox.saveAs")}
                className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-[12px] outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={!name.trim() || !n}
                onClick={() => {
                  write([...saved, { name: name.trim(), f: { ...filter, text: "" } }].slice(-8));
                  setName("");
                }}
                className="grid h-8 w-8 place-items-center rounded-lg border border-border disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <Group label={t("oinbox.f.state")}>
              {(["all", "waiting", "open", "closed"] as const).map((s) => (
                <Chip
                  key={s}
                  on={filter.state === s}
                  onClick={() => onChange({ ...filter, state: s })}
                >
                  {t(`oinbox.state.${s}`)}
                </Chip>
              ))}
              <Chip
                on={filter.unread}
                onClick={() => onChange({ ...filter, unread: !filter.unread })}
              >
                {t("oinbox.preset.unread")}
              </Chip>
            </Group>
            <Group label={t("oinbox.f.phase")}>
              {PHASES.map((p) => (
                <Chip key={p} on={filter.phases.includes(p)} onClick={() => toggle("phases", p)}>
                  {t(`lead.phase.${p}`)}
                </Chip>
              ))}
            </Group>
            <Group label={t("oinbox.f.plan")}>
              {PLANS.map((p) => (
                <Chip key={p} on={filter.plans.includes(p)} onClick={() => toggle("plans", p)}>
                  {PLAN_LABELS[p]}
                </Chip>
              ))}
            </Group>
            <Group label={t("oinbox.f.stage")}>
              {[...PIPELINE_STAGES, "lost"].map((s) => (
                <Chip key={s} on={filter.stages.includes(s)} onClick={() => toggle("stages", s)}>
                  {t(`lead.st.${s}`)}
                </Chip>
              ))}
            </Group>
            {n > 0 && (
              <button
                type="button"
                onClick={() => onChange({ ...EMPTY_OWNER_FILTER, text: filter.text })}
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" /> {t("oinbox.reset")}
              </button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">
        {label}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function useInboxAction(onDone: () => void) {
  const { t } = useI18n();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await apiFetch("/platform/inbox-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      return j;
    },
    onSuccess: onDone,
    onError: (e: Error) => toast.error(e.message === "NO_LEAD" ? t("oinbox.noLead") : e.message),
  });
}

function Conversation({
  thread,
  infoOpen,
  onToggleInfo,
  onChanged,
  phoneHidden,
  onBack,
}: {
  thread: CompanyThread;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onChanged: () => void;
  phoneHidden: boolean;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["owner_inbox_thread", thread.key],
    refetchInterval: 6000,
    queryFn: async (): Promise<ThreadData> => {
      const res = await apiFetch(`/platform/inbox-api?key=${encodeURIComponent(thread.key)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["owner_inbox_thread", thread.key] });
    onChanged();
  };
  const act = useInboxAction(refresh);
  // Opening the conversation reads it.
  const readOnce = useRef(false);
  useEffect(() => {
    if (thread.orgId && thread.unread > 0 && !readOnce.current) {
      readOnce.current = true;
      act.mutate({ action: "read", orgId: thread.orgId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.orgId, thread.unread]);

  const msgs = data?.messages ?? [];
  const scroller = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  useEffect(() => {
    const el = scroller.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [msgs.length, atBottom]);

  return (
    <>
      <section className={cn("flex min-w-0 flex-1 flex-col", phoneHidden && "phone:hidden")}>
        <header className="flex items-center gap-3 border-b border-border px-5 py-3 phone:px-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("common.back")}
            className="hidden h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted phone:grid"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onToggleInfo}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <CompanyMark name={thread.name} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-[14.5px] font-bold text-foreground">
                {thread.name}
              </span>
              <span className="flex items-center gap-1 truncate text-[12px] text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                {thread.people.map((p) => p.name).join(", ")}
              </span>
            </span>
          </button>
          {thread.stage && <StageChip stage={thread.stage} />}
          {thread.orgId &&
            (thread.status === "open" ? (
              <button
                type="button"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({ action: "status", orgId: thread.orgId, status: "closed" })
                }
                className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold"
              >
                <CheckCheck className="h-4 w-4" /> {t("oinbox.close")}
              </button>
            ) : (
              <button
                type="button"
                disabled={act.isPending}
                onClick={() =>
                  act.mutate({ action: "status", orgId: thread.orgId, status: "open" })
                }
                className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold"
              >
                <RotateCcw className="h-4 w-4" /> {t("oinbox.reopen")}
              </button>
            ))}
        </header>
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
          }}
          className="relative flex-1 space-y-2.5 overflow-y-auto bg-surface/50 px-5 py-4"
        >
          {msgs.map((m, i) => {
            const day = new Date(m.created_at).toDateString();
            const newDay = i === 0 || new Date(msgs[i - 1]!.created_at).toDateString() !== day;
            const mine = m.direction === "out";
            return (
              <div key={m.id}>
                {newDay && (
                  <p className="my-3 text-center text-[11px] font-semibold text-subtle">
                    {callDay(m.created_at, lang)}
                  </p>
                )}
                <div className={cn("group flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[72%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm",
                      mine
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md border border-border bg-card text-foreground",
                    )}
                  >
                    <p
                      className={cn(
                        "mb-0.5 text-[11px] font-semibold",
                        mine ? "text-primary-foreground/80" : "text-primary",
                      )}
                    >
                      {m.author}
                      {m.role && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {t(`lead.role.${m.role}`)}
                        </span>
                      )}
                    </p>
                    <div className="whitespace-pre-wrap break-words [&_a]:font-semibold [&_a]:underline [&_a]:!text-current">
                      {mine ? renderMessageContent(m.text, t("oinbox.open")) : m.text}
                    </div>
                    <p
                      className={cn(
                        "mt-1 flex items-center gap-2 text-[10.5px]",
                        mine ? "text-primary-foreground/70" : "text-subtle",
                      )}
                    >
                      {m.page && !mine && <span className="truncate font-mono">{m.page}</span>}
                      <span className="ml-auto">{hm(m.created_at)}</span>
                    </p>
                  </div>
                  {!mine && thread.orgId && (
                    <button
                      type="button"
                      title={t("oinbox.asIssue")}
                      onClick={() =>
                        act.mutate(
                          { action: "issue", orgId: thread.orgId, text: m.text },
                          { onSuccess: () => toast.success(t("oinbox.issueSaved")) },
                        )
                      }
                      className="invisible ml-1.5 self-center rounded-lg p-1.5 text-subtle hover:bg-amber-500/10 hover:text-amber-600 group-hover:visible"
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!atBottom && (
            <button
              type="button"
              onClick={() =>
                scroller.current?.scrollTo({
                  top: scroller.current.scrollHeight,
                  behavior: "smooth",
                })
              }
              className="sticky bottom-0 ml-auto grid h-9 w-9 place-items-center rounded-full border border-border bg-card shadow-md"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          )}
        </div>
        <Composer thread={thread} onSent={refresh} />
      </section>
      {infoOpen && <InfoPane thread={thread} data={data} />}
    </>
  );
}

function Composer({ thread, onSent }: { thread: CompanyThread; onSent: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [to, setTo] = useState<string>(thread.lastAskerId ?? thread.people[0]?.id ?? "");
  const send = useInboxAction(() => {
    setText("");
    onSent();
  });
  const { data: tpl } = useQuery({
    queryKey: ["owner_inbox_templates"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const res = await apiFetch("/platform/inbox-api?templates=1");
      if (!res.ok) return [];
      return ((await res.json()) as { templates: string[] }).templates;
    },
  });
  const saveTpl = useInboxAction(
    () => void qc.invalidateQueries({ queryKey: ["owner_inbox_templates"] }),
  );
  const submit = () => {
    if (!text.trim() || !to) return;
    send.mutate({ action: "reply", orgId: thread.orgId, userId: to, text: text.trim() });
  };
  return (
    <div className="border-t border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
        <span>{t("oinbox.to")}</span>
        <select
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-7 rounded-lg border border-border bg-card px-2 text-[12px] font-semibold text-foreground outline-none"
        >
          {thread.people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.role ? ` · ${t(`lead.role.${p.role}`)}` : ""}
            </option>
          ))}
        </select>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="ml-auto inline-flex h-7 items-center gap-1 rounded-lg px-2 font-semibold hover:bg-muted"
            >
              <MessageSquareQuote className="h-3.5 w-3.5" /> {t("oinbox.templates")}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[380px] p-2">
            <TemplateList
              list={tpl ?? []}
              onPick={(s) => setText((cur) => (cur ? `${cur}\n${s}` : s))}
              onSave={(list) => saveTpl.mutate({ action: "templates", list })}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface px-3 py-2 focus-within:border-primary">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder={t("oinbox.ph")}
          className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
        />
        <button
          type="button"
          disabled={!text.trim() || send.isPending}
          onClick={submit}
          className="ctl-lit grid h-10 w-10 shrink-0 place-items-center rounded-xl disabled:opacity-40"
          aria-label={t("oinbox.send")}
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-subtle">{t("oinbox.hint")}</p>
    </div>
  );
}

function TemplateList({
  list,
  onPick,
  onSave,
}: {
  list: string[];
  onPick: (s: string) => void;
  onSave: (list: string[]) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  return (
    <div>
      <ul className="max-h-64 overflow-y-auto">
        {list.map((s, i) => (
          <li key={i} className="group flex items-start gap-1">
            <button
              type="button"
              onClick={() => onPick(s)}
              className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-foreground hover:bg-muted"
            >
              <span className="line-clamp-2">{s}</span>
            </button>
            <button
              type="button"
              onClick={() => onSave(list.filter((_, j) => j !== i))}
              className="invisible p-1.5 text-subtle hover:text-rose-600 group-hover:visible"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {!list.length && (
          <li className="px-2 py-2 text-[12px] text-subtle">{t("oinbox.noTemplates")}</li>
        )}
      </ul>
      <div className="mt-2 flex gap-1.5 border-t border-border pt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("oinbox.newTemplate")}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-card px-2.5 text-[12.5px] outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={() => {
            onSave([...list, draft.trim()]);
            setDraft("");
          }}
          className="grid h-8 w-8 place-items-center rounded-lg border border-border disabled:opacity-40"
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function InfoPane({ thread, data }: { thread: CompanyThread; data: ThreadData | undefined }) {
  const { t } = useI18n();
  const f = data?.facts;
  const lead = data?.lead;
  const lastPaid = f?.payments.find((p) => p.status === "paid");
  const row = (label: string, value: ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-medium text-foreground">{value}</span>
    </div>
  );
  return (
    <aside className="hidden w-[290px] shrink-0 flex-col overflow-y-auto border-l border-border lg:flex">
      <div className="border-b border-border p-4 text-center">
        <span className="mx-auto block w-fit">
          <CompanyMark name={thread.name} size="lg" />
        </span>
        <p className="mt-2 text-[15px] font-bold text-foreground">{thread.name}</p>
        <div className="mt-1.5 flex flex-wrap justify-center gap-1">
          {thread.phase !== "none" && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                PHASE_CHIP[thread.phase],
              )}
            >
              {t(`lead.phase.${thread.phase}`)}
            </span>
          )}
          {f && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
              <span className={cn("h-1.5 w-1.5 rounded-full", HEALTH_DOT[f.health.level])} />
              {t(`lead.health.${f.health.level}`)}
            </span>
          )}
        </div>
      </div>
      {f ? (
        <div className="border-b border-border px-4 py-3">
          {row(t("lead.col.plan"), PLAN_LABELS[normalizePlan(f.org.plan)])}
          {row(
            f.org.isTrial ? t("lead.trialEnds") : t("lead.paidUntil"),
            f.org.trialEndsAt
              ? `${f.org.trialEndsAt.slice(0, 10)}${f.daysLeft != null ? ` · ${t("lead.daysLeft", { n: f.daysLeft })}` : ""}`
              : "—",
          )}
          {row(t("lead.activePeople"), `${f.people.active7d} / ${f.people.total}`)}
          {row(
            t("lead.payments"),
            lastPaid ? (lastPaid.paidAt ?? lastPaid.createdAt).slice(0, 10) : t("lead.noPayments"),
          )}
          {row(t("lead.tl.errors"), f.errors.filter((e) => !e.resolved).length)}
        </div>
      ) : (
        thread.orgId === null && (
          <p className="px-4 py-3 text-[12.5px] text-subtle">{t("oinbox.noCompany")}</p>
        )
      )}
      <div className="space-y-1 p-3">
        {lead ? (
          <Link
            to="/platform/applications/$appId"
            params={{ appId: lead.id }}
            className="flex items-center gap-2.5 rounded-xl border border-border px-3 py-2.5 hover:bg-muted/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-foreground">
                {t("oinbox.lead")}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <StageChip stage={lead.status} />
                {lead.openTasks > 0 && <span>{t("lead.tasksN", { n: lead.openTasks })}</span>}
                {lead.openIssues > 0 && (
                  <span className="text-amber-600">
                    {t("lead.issuesN", { n: lead.openIssues })}
                  </span>
                )}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-subtle" />
          </Link>
        ) : (
          thread.orgId && <p className="px-1 text-[12px] text-subtle">{t("oinbox.noLead")}</p>
        )}
        {thread.orgId && (
          <Link
            to="/platform/organizations/$orgId"
            params={{ orgId: thread.orgId }}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-medium text-foreground hover:bg-muted/50"
          >
            <Building2 className="h-4 w-4 text-muted-foreground" /> {t("lead.openCompany")}
          </Link>
        )}
      </div>
    </aside>
  );
}
