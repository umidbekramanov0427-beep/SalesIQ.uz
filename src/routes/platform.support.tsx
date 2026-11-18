import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mic,
  Paperclip,
  Video as VideoIcon,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  BarChart3,
  Building2,
  Check,
  CheckCheck,
  ChevronRight,
  ChevronDown,
  MessagesSquare,
  SlidersHorizontal,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizeHandle, useResizableWidth } from "@/components/ui/resize-handle";
import { CompanyMark, HEALTH_DOT, PHASE_CHIP, StageChip } from "@/components/owner/leads/shared";
import { renderMessageContent } from "@/components/ai/MessageContent";
import { useOwnerInbox } from "@/hooks/use-crm-data";
import { FixedPage } from "@/components/layout/FixedPage";
import { QuickReplies } from "@/components/chat/QuickReplies";
import { recentReplies } from "@/lib/quick-replies";
import { PageTools } from "@/components/layout/PageTools";
import { CARD, FEED_BG, QUIET, dayWord, stamp } from "@/components/lead/amo-utils";
import {
  DropOverlay,
  PendingFile,
  SupportFile,
  useAttachments,
  useFileDrop,
} from "@/components/chat/AttachmentKit";
import { VoiceRecorder } from "@/components/lead/VoiceRecorder";
import { VideoRecorder } from "@/components/lead/VideoRecorder";
import { uploadSupportFile } from "@/hooks/crm/support";
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
  // The company's details take the list's place when its name is clicked (CRM Inbox).
  const [infoOpen, setInfoOpen] = useState(false);
  // Phones show the list or the open conversation, one at a time.
  const [phoneChat, setPhoneChat] = useState(!!search.org);
  const [analytics, setAnalytics] = useState(false);
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

  useEffect(() => setInfoOpen(false), [selected]);
  // Under the search only "Javob kutmoqda" / "O'qilmagan"; the rest is in Filtrlar.
  const quickOn = (p: "waiting" | "unread") =>
    JSON.stringify(presetFilter(p)) === JSON.stringify({ ...filter, text: "" });
  const quick = (p: "waiting" | "unread") =>
    setFilter(
      quickOn(p)
        ? { ...EMPTY_OWNER_FILTER, text: filter.text }
        : { ...presetFilter(p), text: filter.text },
    );

  return (
    <FixedPage className="flex-row bg-card">
      {/* The company's details, in the list's place (opened from the conversation's head). */}
      {current && infoOpen && (
        <InfoPane thread={current} width={listSize.width} onClose={() => setInfoOpen(false)} />
      )}
      {/* Conversations */}
      <aside
        style={{ width: listSize.width }}
        className={cn(
          "relative flex shrink-0 flex-col border-r border-border bg-card phone:!w-full phone:border-r-0",
          current && infoOpen && "hidden",
          phoneChat && current && "phone:hidden",
        )}
      >
        <div className="border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <Headset className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="flex items-center gap-2 text-[17px] font-bold leading-tight text-foreground">
                {t("oinbox.title")}
                <PageTools size="sm" title={t("oinbox.title")} />
              </h1>
              <p className="text-[12px] text-muted-foreground">
                {t("oinbox.summary", { all: all.length, waiting, unread })}
              </p>
            </div>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setAnalytics(true)}
              aria-label={t("oinbox.analytics")}
              title={t("oinbox.analytics")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-primary transition-colors hover:bg-accent"
            >
              <BarChart3 className="h-[18px] w-[18px]" />
            </button>
          </div>
          {/* Analytics: a window over the inbox, opened with its button. */}
          <Dialog open={analytics} onOpenChange={setAnalytics}>
            <DialogContent
              className="max-w-[520px] gap-4"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" /> {t("oinbox.analytics")}
                </DialogTitle>
              </DialogHeader>
              {data?.stats ? (
                <div className="grid grid-cols-2 gap-2.5">
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
                    <div key={k} className="rounded-xl border border-border bg-surface px-3.5 py-3">
                      <p className={cn("text-[20px] font-bold leading-tight tabular-nums", cls)}>
                        {v}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {t(`oinbox.stat.${k}`)}
                      </p>
                    </div>
                  ))}
                  <SlaField minutes={data.slaMinutes ?? null} />
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">…</p>
              )}
            </DialogContent>
          </Dialog>
          <div className="mt-3 flex gap-2">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-primary">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={filter.text}
                onChange={(e) => setFilter({ ...filter, text: e.target.value })}
                placeholder={t("oinbox.search")}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
              />
            </label>
            <FilterPopover filter={filter} onChange={setFilter} />
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
            {(["waiting", "unread"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => quick(p)}
                aria-pressed={quickOn(p)}
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] font-semibold transition-colors",
                  quickOn(p)
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`oinbox.preset.${p}`)}
                {(p === "waiting" ? waiting : unread) > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[11px] tabular-nums text-white",
                      p === "waiting" ? "bg-rose-500" : "bg-primary",
                    )}
                  >
                    {p === "waiting" ? waiting : unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {isLoading ? (
            <li className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </li>
          ) : !list.length ? (
            <li className="px-6 py-16 text-center text-[13px] text-muted-foreground">
              {t("oinbox.empty")}
            </li>
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
        </ul>
      </aside>
      {!(current && infoOpen) && <ResizeHandle label={t("amo.resize")} {...listSize.handle} />}

      {/* conversation */}
      {current ? (
        <Conversation
          key={current.key}
          thread={current}
          infoOpen={infoOpen}
          onToggleInfo={() => setInfoOpen(!infoOpen)}
          owners={data?.owners ?? []}
          phoneHidden={!phoneChat}
          onBack={() => setPhoneChat(false)}
          onChanged={() => void qc.invalidateQueries({ queryKey: ["owner_inbox"] })}
        />
      ) : (
        <div className="grid flex-1 place-items-center bg-background p-8 text-center phone:hidden">
          <div>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MessagesSquare className="h-7 w-7" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-foreground">{t("oinbox.pick")}</p>
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
  const unread = x.unread > 0;
  const meta = [
    x.plan ? PLAN_LABELS[normalizePlan(x.plan)] : null,
    x.phase !== "none" ? t(`lead.phase.${x.phase}`) : null,
    x.stage ? t(`lead.st.${x.stage}`) : null,
  ].filter(Boolean);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
          // Waiting for the owner's answer stands out light; answered ones sit darker.
          active
            ? "bg-primary/[0.08] shadow-[inset_3px_0_0_var(--primary)]"
            : x.waitingSince
              ? "bg-card hover:bg-accent/60"
              : "bg-surface/80 hover:bg-accent/60",
        )}
      >
        <span className="relative mt-0.5 shrink-0">
          <CompanyMark name={x.name} size="md" />
          {x.status === "closed" && (
            <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-card text-subtle ring-2 ring-card">
              <Lock className="h-2.5 w-2.5" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[14px] text-foreground",
                unread ? "font-bold" : "font-semibold",
              )}
            >
              {x.name}
            </span>
            <span
              className={cn(
                "shrink-0 text-[11.5px] tabular-nums",
                unread ? "font-bold text-primary" : "text-muted-foreground",
              )}
            >
              {short(x.lastAt)}
            </span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12.5px]",
                unread ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {x.lastAuthor && `${x.lastAuthor}: `}
              {x.lastText}
            </span>
            {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
            {x.waitingSince && (
              <span className="shrink-0 rounded bg-amber-500/15 px-1 text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                {t("oinbox.waiting", { t: waitText(x.waitingSince, t) })}
              </span>
            )}
          </span>
          {meta.length > 0 && (
            <span className="mt-0.5 block truncate text-[11px] text-subtle">
              {meta.join(" · ")}
            </span>
          )}
        </span>
      </button>
    </li>
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
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors data-[state=open]:border-primary/40 data-[state=open]:bg-primary/10 data-[state=open]:text-primary",
            n > 0
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-foreground hover:bg-accent",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {t("oinbox.filters")}
          {n > 0 && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10.5px] font-bold text-primary-foreground">
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
  owners,
}: {
  thread: CompanyThread;
  infoOpen: boolean;
  onToggleInfo: () => void;
  onChanged: () => void;
  owners: { id: string; name: string }[];
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

  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? msgs.filter((m) =>
        `${m.text} ${m.author} ${m.file?.name ?? ""}`.toLowerCase().includes(needle),
      )
    : msgs;
  // One card per day, as the CRM feed draws a conversation.
  const days: { day: string; items: InboxMessage[] }[] = [];
  for (const m of shown) {
    const day = dayWord(new Date(m.created_at), t);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(m);
    else days.push({ day, items: [m] });
  }
  const btn =
    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50";

  return (
    <section
      className={cn(
        "amo-skin flex min-w-0 flex-1 flex-col",
        FEED_BG,
        phoneHidden && "phone:hidden",
      )}
    >
      {/* The conversation's head, as in the CRM Inbox: the company's name opens its details. */}
      <div className="flex h-[52px] shrink-0 items-stretch border-b border-[var(--amo-divider)] bg-card">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("common.back")}
          className="hidden w-11 shrink-0 place-items-center text-muted-foreground hover:bg-accent phone:grid"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onToggleInfo}
          aria-expanded={infoOpen}
          className="flex min-w-0 flex-1 items-center gap-3 px-5 text-left transition-colors hover:bg-accent/50 phone:px-2"
        >
          <CompanyMark name={thread.name} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-primary">{thread.name}</span>
            <span className="block truncate text-[12px] text-muted-foreground">
              {thread.people.map((p) => p.name).join(", ")}
            </span>
          </span>
          <span className="shrink-0 rounded-md border border-border px-2 py-1 text-[12px] font-semibold text-muted-foreground phone:hidden">
            {t(infoOpen ? "oinbox.hideInfo" : "oinbox.showInfo")}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5 pr-4 phone:pr-2">
          {thread.orgId && owners.length > 1 && (
            <select
              value={thread.assignedTo ?? ""}
              onChange={(e) =>
                act.mutate({
                  action: "assign",
                  orgId: thread.orgId,
                  assignedTo: e.target.value || null,
                })
              }
              title={t("oinbox.assignee")}
              className="h-8 max-w-[140px] rounded-md border border-border bg-card px-2 text-[12.5px] font-semibold text-foreground outline-none hover:bg-accent phone:hidden"
            >
              <option value="">{t("oinbox.noAssignee")}</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {thread.orgId && (
            <button
              type="button"
              disabled={act.isPending}
              onClick={() =>
                act.mutate({
                  action: "status",
                  orgId: thread.orgId,
                  status: thread.status === "open" ? "closed" : "open",
                })
              }
              className={cn(
                btn,
                thread.status === "closed"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border text-foreground hover:bg-accent",
              )}
            >
              {thread.status === "open" ? (
                <CheckCheck className="h-3.5 w-3.5" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              {t(thread.status === "open" ? "oinbox.close" : "oinbox.reopen")}
            </button>
          )}
        </div>
      </div>
      {/* Search in the conversation. */}
      <div className="flex h-[48px] shrink-0 items-center gap-2 border-b border-[var(--amo-divider)] bg-[var(--amo-feed)] px-5 phone:px-3">
        <Search className="h-4 w-4 shrink-0 text-subtle" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("oinbox.searchChat")}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-subtle"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="grid h-7 w-7 place-items-center rounded text-subtle hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
          }}
          className="h-full overflow-y-auto px-4 pb-3 pt-2 phone:px-2"
        >
          {days.map((d, di) => (
            <div key={`${d.day}-${di}`}>
              <div className="my-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-[var(--amo-box-line)]" />
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[11.5px] font-medium text-muted-foreground",
                    CARD,
                  )}
                >
                  {d.day}
                </span>
                <span className="h-px flex-1 bg-[var(--amo-box-line)]" />
              </div>
              <div className="my-2">
                <div className="mx-2 h-[5px] rounded-t-xl border border-b-0 border-[var(--amo-box-line)] bg-[var(--amo-box)]" />
                <div className={cn("rounded-xl px-5 pb-3 pt-3 phone:px-3", CARD)}>
                  <p className="flex items-center justify-center gap-1.5 text-[13px] font-semibold text-[var(--amo-soft)]">
                    <Headset className="h-3.5 w-3.5 text-emerald-500" />
                    {t("oinbox.channel")}
                  </p>
                  <div className="mt-3 space-y-3">
                    {d.items.map((m) => (
                      <FeedMessage
                        key={m.id}
                        m={m}
                        onIssue={
                          thread.orgId && m.direction === "in"
                            ? () =>
                                act.mutate(
                                  { action: "issue", orgId: thread.orgId, text: m.text },
                                  { onSuccess: () => toast.success(t("oinbox.issueSaved")) },
                                )
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {!shown.length && (
            <p className="py-16 text-center text-[13px] text-muted-foreground">
              {needle ? t("chats.noneFound") : t("chats.noMessages")}
            </p>
          )}
        </div>
        {!atBottom && (
          <button
            type="button"
            onClick={() =>
              scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" })
            }
            className="absolute bottom-3 right-5 grid h-9 w-9 place-items-center rounded-full border border-[var(--amo-box-line)] bg-card shadow-md"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>
      <Composer thread={thread} onSent={refresh} />
    </section>
  );
}

/** One message in the day's card: the company's person on the left, the team on the right. */
function FeedMessage({ m, onIssue }: { m: InboxMessage; onIssue?: (() => void) | undefined }) {
  const { t } = useI18n();
  const letter = (m.author.match(/\p{L}/u)?.[0] ?? "S").toUpperCase();
  const avatar = (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--amo-avatar)] text-[12px] font-bold text-[var(--amo-avatar-fg)]">
      {letter}
    </span>
  );
  if (m.direction === "out")
    return (
      <div className="flex items-end justify-end gap-2.5">
        <div className="max-w-[70%] rounded-2xl bg-[var(--amo-bubble-out)] px-3 py-2 phone:max-w-[85%]">
          <p className="text-[12px] text-[var(--amo-bubble-out-meta)]">
            {stamp(m.created_at, t)} {m.author} <Check className="inline h-3 w-3" />{" "}
            {t("amo.delivered")}
          </p>
          {m.file && (
            <div className="mt-1.5">
              <SupportFile messageId={m.id} file={m.file} />
            </div>
          )}
          {m.text && (
            <div className="mt-1 whitespace-pre-wrap break-words text-[14px] text-[var(--amo-bubble-out-fg)] [&_a]:font-semibold [&_a]:underline">
              {renderMessageContent(m.text, t("oinbox.open"))}
            </div>
          )}
        </div>
        {avatar}
      </div>
    );
  return (
    <div className="group/msg flex items-start gap-2.5">
      {avatar}
      <div className="max-w-[70%] rounded-2xl bg-[var(--amo-bubble-in)] px-3 py-2 phone:max-w-[85%]">
        <p className="text-[12px] text-[var(--amo-label)]">
          {stamp(m.created_at, t)} {m.author}
          {m.role && ` · ${t(`lead.role.${m.role}`)}`}
        </p>
        {m.file && (
          <div className="mt-1.5">
            <SupportFile messageId={m.id} file={m.file} />
          </div>
        )}
        {m.text && (
          <p className="mt-1 whitespace-pre-wrap break-words text-[14px] text-foreground">
            {m.text}
          </p>
        )}
        {m.page && (
          <p className="mt-1 truncate font-mono text-[11px] text-[var(--amo-label)]">{m.page}</p>
        )}
      </div>
      {onIssue && (
        <button
          type="button"
          title={t("oinbox.asIssue")}
          onClick={onIssue}
          className="mt-1 rounded-lg p-1.5 text-subtle opacity-0 transition-opacity hover:bg-amber-500/10 hover:text-amber-600 group-hover/msg:opacity-100 focus-visible:opacity-100"
        >
          <AlertTriangle className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function Composer({ thread, onSent }: { thread: CompanyThread; onSent: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [to, setTo] = useState<string>(thread.lastAskerId ?? thread.people[0]?.id ?? "");
  const [recorder, setRecorder] = useState<"voice" | "video" | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const att = useAttachments();
  const drop = useFileDrop(att.addFiles);
  const send = useInboxAction(() => undefined);
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
  const { data: recent } = useQuery({
    queryKey: ["owner_inbox_recent"],
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const res = await apiFetch("/platform/inbox-api?recent=1");
      if (!res.ok) return [];
      return ((await res.json()) as { recent: string[] }).recent;
    },
  });
  // Uploads one file into the company's support folder, for the answer.
  const upload = (file: File, as?: string) =>
    uploadSupportFile(
      file,
      (name, size) =>
        apiFetch("/platform/inbox-api", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "sign", orgId: thread.orgId, name, size }),
        }),
      as,
    );
  async function deliver(body: string, files: File[], as?: string) {
    if (!to || (!body && !files.length)) return;
    setBusy(true);
    try {
      if (!files.length)
        await send.mutateAsync({ action: "reply", orgId: thread.orgId, userId: to, text: body });
      for (const [i, f] of files.entries()) {
        const file = await upload(f, as);
        await send.mutateAsync({
          action: "reply",
          orgId: thread.orgId,
          userId: to,
          text: i === 0 ? body : "",
          file,
        });
      }
      setText("");
      att.clear();
      setRecorder(null);
      onSent();
      void qc.invalidateQueries({ queryKey: ["owner_inbox_recent"] });
    } catch {
      /* the toast is shown by useInboxAction */
    } finally {
      setBusy(false);
    }
  }
  const submit = () => void deliver(text.trim(), att.files);
  const person = thread.people.find((p) => p.id === to) ?? null;
  // Opens (taller, with its buttons) on focus or once something is in it, as in the CRM.
  const [focused, setFocused] = useState(false);
  const open = focused || !!text || att.files.length > 0;
  const iconBtn =
    "grid h-9 w-9 place-items-center rounded-lg border border-border bg-background/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40";
  return (
    <div className="shrink-0 px-4 pb-4 pt-1 phone:px-2 phone:pb-2">
      <div
        {...drop.dropProps}
        onClick={() => !open && areaRef.current?.focus()}
        className={cn(
          "relative rounded-xl transition-colors",
          QUIET,
          open && "!border-primary/60",
          !open && "cursor-text",
        )}
      >
        <DropOverlay show={drop.dragging} />
        <div className="flex flex-wrap items-start gap-x-1.5 gap-y-1 px-4 pt-3 text-[13.5px] leading-7">
          <span className="text-primary underline underline-offset-2">{t("oinbox.reply")}</span>
          <span className="text-muted-foreground">{t("amo.for")}</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-primary underline underline-offset-2"
              >
                {person?.name ?? "—"}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="amo-skin w-60 p-1">
              {thread.people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTo(p.id)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                >
                  <span className="min-w-0 truncate">
                    {p.name}
                    {p.role && (
                      <span className="text-muted-foreground"> · {t(`lead.role.${p.role}`)}</span>
                    )}
                  </span>
                  {p.id === to && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground">:</span>
          <textarea
            ref={areaRef}
            value={text}
            onPaste={att.onPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={t("amo.typeHere")}
            className={cn(
              "min-w-[200px] flex-1 resize-none bg-transparent leading-7 text-foreground outline-none placeholder:text-subtle",
              open ? "min-h-[84px]" : "min-h-[48px]",
              recorder && "hidden",
            )}
          />
        </div>
        {att.files.length > 0 && !recorder && (
          <div className="flex flex-wrap gap-2 px-4 pb-1 pt-2">
            {att.files.map((f, i) => (
              <PendingFile
                key={`${f.name}-${i}`}
                file={f}
                onRemove={() => att.remove(i)}
                className="border-[var(--amo-quiet-line)]"
              />
            ))}
          </div>
        )}
        {recorder === "voice" ? (
          <VoiceRecorder
            onSend={(f, as) => deliver("", [f], as)}
            onClose={() => setRecorder(null)}
          />
        ) : recorder === "video" ? (
          <VideoRecorder
            onSend={(f, as) => deliver("", [f], as)}
            onClose={() => setRecorder(null)}
          />
        ) : (
          <div className="flex items-center gap-2 px-4 pb-3 pt-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={submit}
              disabled={busy || (!text.trim() && !att.files.length)}
              className="inline-flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("oinbox.send")}
            </button>
            <button
              type="button"
              title={t("attach.voice")}
              aria-label={t("attach.voice")}
              disabled={busy}
              onClick={() => setRecorder("voice")}
              className={iconBtn}
            >
              <Mic className="h-4 w-4" />
            </button>
            <button
              type="button"
              title={t("attach.video")}
              aria-label={t("attach.video")}
              disabled={busy}
              onClick={() => setRecorder("video")}
              className={iconBtn}
            >
              <VideoIcon className="h-4 w-4" />
            </button>
            {(text || att.files.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  att.clear();
                }}
                className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {t("amo.cancel")}
              </button>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={t("oinbox.templates")}
                    aria-label={t("oinbox.templates")}
                    className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <MessageSquareQuote className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" className="w-[400px] p-2">
                  <QuickReplies
                    pinned={(tpl ?? []).map((text, i) => ({ id: String(i), text }))}
                    recent={recentReplies(recent ?? [], tpl ?? [])}
                    busy={saveTpl.isPending}
                    onPick={(s) => {
                      setText((cur) => (cur ? `${cur}\n${s}` : s));
                      areaRef.current?.focus();
                    }}
                    onPin={(v) =>
                      saveTpl.mutate({ action: "templates", list: [...(tpl ?? []), v] })
                    }
                    onUnpin={(id) =>
                      saveTpl.mutate({
                        action: "templates",
                        list: (tpl ?? []).filter((_, i) => String(i) !== id),
                      })
                    }
                  />
                </PopoverContent>
              </Popover>
              <button
                type="button"
                title={t("attach.file")}
                aria-label={t("attach.file")}
                onClick={() => fileRef.current?.click()}
                className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  att.addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoPane({
  thread,
  width,
  onClose,
}: {
  thread: CompanyThread;
  width: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  // The same query as the open conversation (shared cache).
  const { data } = useQuery({
    queryKey: ["owner_inbox_thread", thread.key],
    queryFn: async (): Promise<ThreadData> => {
      const res = await apiFetch(`/platform/inbox-api?key=${encodeURIComponent(thread.key)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
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
    <aside
      style={{ width }}
      className="flex shrink-0 flex-col overflow-y-auto border-r border-border bg-card phone:!w-full"
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.back")}
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="text-[14px] font-semibold text-foreground">{t("oinbox.showInfo")}</p>
      </div>
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

/** Inbox analytics: how long a company may wait before the owners are told. */
function SlaField({ minutes }: { minutes: number | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [v, setV] = useState(String(minutes ?? 30));
  const save = useInboxAction(() => void qc.invalidateQueries({ queryKey: ["owner_inbox"] }));
  return (
    <label className="col-span-2 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-[12px] text-muted-foreground">
      <span className="min-w-0 flex-1">{t("oinbox.sla")}</span>
      <input
        value={v}
        inputMode="numeric"
        onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 4))}
        onBlur={() => {
          if (Number(v) !== minutes) save.mutate({ action: "sla", minutes: Number(v) || 0 });
        }}
        className="h-7 w-14 rounded-lg border border-border bg-card px-2 text-right text-[12.5px] font-semibold text-foreground outline-none focus:border-primary"
      />
      <span>{t("oinbox.u.min")}</span>
    </label>
  );
}
