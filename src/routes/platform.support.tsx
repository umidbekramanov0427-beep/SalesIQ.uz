import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  Building2,
  CheckCheck,
  Clock,
  Headset,
  Inbox,
  Loader2,
  MessageCircleQuestion,
  Send,
  Search,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { Pill, SectionCard } from "@/components/layout/Primitives";
import {
  OwnerEmpty,
  OwnerHeader,
  OwnerPanel,
  OwnerSegment,
  OwnerStat,
} from "@/components/owner/OwnerPage";
import {
  usePlatformSupportThread,
  usePlatformSupportThreads,
  useReplySupport,
  type SupportThreadSummary,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { PLAN_LABELS, type Plan } from "@/lib/plan-gating";
import { useI18n } from "@/lib/i18n";
import { responseLabel, type SupportMessage } from "@/lib/support";
import { cn, roleTone, timeAgo } from "@/lib/utils";

const ROLE_KEY: Record<string, string> = {
  super_admin: "admin.roleAdmin",
  platform_owner: "admin.roleAdmin",
  rop: "admin.roleRop",
  sotuv_menejeri: "admin.roleRep",
};

export const Route = createFileRoute("/platform/support")({
  head: () => ({ meta: [{ title: "Yordam so'rovlari — SalesIQ" }] }),
  component: PlatformSupportPage,
});

// The platform owner's live-support inbox: every person's thread from the
// assistant's Operator tab (last 30 days), unanswered ones first, with how
// fast the team answers. Owners can also answer from Telegram by replying
// to the question there (src/lib/support.server.ts).
function PlatformSupportPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const inbox = usePlatformSupportThreads();
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"waiting" | "all">("all");
  const [query, setQuery] = useState("");
  const [showStats, setShowStats] = useState(false);
  const threads = inbox.data?.threads ?? [];
  const current = threads.find((x) => x.userId === selected) ?? null;

  // Open the first waiting thread (or the latest) once the list arrives.
  const firstId = threads[0]?.userId;
  useEffect(() => {
    if (!selected && firstId) setSelected(firstId);
  }, [selected, firstId]);

  if (user && user.role !== "platform_owner") {
    return (
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
    );
  }

  const units = {
    min: t("support.unitMin"),
    hour: t("support.unitHour"),
    day: t("support.unitDay"),
  };
  const stats = inbox.data?.stats;
  const q = query.trim().toLowerCase();
  const shown = threads.filter(
    (th) =>
      (view === "all" || !!th.waitingSince) &&
      (!q ||
        [th.name, th.email, th.org?.name, th.lastText].some((v) => v?.toLowerCase().includes(q))),
  );

  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <OwnerHeader
        icon={Headset}
        title={t("support.inboxTitle")}
        desc={t("support.inboxDesc")}
        actions={
          <>
            {stats && (
              <span className="hidden items-center gap-3 text-[12.5px] text-muted-foreground md:flex">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      stats.waiting ? "bg-rose-500" : "bg-emerald-500",
                    )}
                  />
                  {t("support.waitingN", { n: String(stats.waiting) })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  {stats.avgResponseMs != null ? responseLabel(stats.avgResponseMs, units) : "—"}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowStats((v) => !v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors",
                showStats
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <BarChart3 className="h-3.5 w-3.5" /> {t("support.analytics")}
            </button>
          </>
        }
      />

      {showStats && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OwnerStat
            icon={Clock}
            tone="rose"
            label={t("support.statWaiting")}
            tipKey="support.statWaiting"
            value={stats?.waiting ?? 0}
          />
          <OwnerStat
            icon={Timer}
            tone="amber"
            label={t("support.statAvg")}
            tipKey="support.statAvg"
            value={stats?.avgResponseMs != null ? responseLabel(stats.avgResponseMs, units) : "—"}
          />
          <OwnerStat
            icon={MessageCircleQuestion}
            tone="blue"
            label={t("support.statQuestions")}
            tipKey="support.statQuestions"
            value={stats?.questions ?? 0}
          />
          <OwnerStat
            icon={CheckCheck}
            tone="green"
            label={t("support.statAnswered")}
            tipKey="support.statAnswered"
            value={stats?.answered ?? 0}
          />
        </div>
      )}

      {inbox.data && !inbox.data.ready ? (
        <OwnerPanel>
          <OwnerEmpty
            icon={Headset}
            title={t("support.notReadyTitle")}
            hint={t("support.notReady")}
          />
        </OwnerPanel>
      ) : (
        <div className="grid min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_260px]">
          {/* Conversations */}
          <div className="flex min-h-0 flex-col border-r border-border">
            <div className="space-y-2 border-b border-border p-3">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("support.search")}
                  className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-2.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-primary"
                />
              </label>
              <OwnerSegment
                value={view}
                options={[
                  {
                    value: "waiting",
                    label: `${t("support.fWaiting")} ${stats?.waiting ?? 0}`,
                  },
                  { value: "all", label: `${t("support.fAll")} ${threads.length}` },
                ]}
                onChange={(v) => setView(v as "waiting" | "all")}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {inbox.isLoading ? (
                <div className="grid place-items-center p-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !shown.length ? (
                <OwnerEmpty
                  icon={Inbox}
                  title={view === "waiting" ? t("support.allAnswered") : t("support.noThreads")}
                />
              ) : (
                <ul className="divide-y divide-border/70">
                  {shown.map((th) => (
                    <ThreadRow
                      key={th.userId}
                      thread={th}
                      active={th.userId === selected}
                      onClick={() => setSelected(th.userId)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Conversation */}
          {current ? (
            <ThreadView thread={current} />
          ) : (
            <div className="grid place-items-center">
              <OwnerEmpty
                icon={Headset}
                title={t("support.pickThread")}
                hint={t("support.pickThreadHint")}
              />
            </div>
          )}

          {/* Who is asking */}
          {current && <PersonPane thread={current} units={units} />}
        </div>
      )}
    </div>
  );
}

function PersonPane({
  thread,
  units,
}: {
  thread: SupportThreadSummary;
  units: { min: string; hour: string; day: string };
}) {
  const { t } = useI18n();
  const rows: [string, ReactNode][] = [
    [t("support.company"), thread.org?.name ?? "—"],
    [t("support.role"), thread.role ? t(ROLE_KEY[thread.role] ?? "admin.roleRep") : "—"],
    [
      t("support.plan"),
      thread.org?.plan
        ? `${PLAN_LABELS[thread.org.plan as Plan] ?? thread.org.plan}${thread.org.trial ? ` · ${t("support.trial")}` : ""}`
        : "—",
    ],
    ["Email", thread.email ?? "—"],
    [t("support.messages"), String(thread.count)],
    [
      t("support.avgShort"),
      thread.avgResponseMs != null ? responseLabel(thread.avgResponseMs, units) : "—",
    ],
  ];
  return (
    <aside className="hidden min-h-0 overflow-y-auto border-l border-border xl:block">
      <div className="flex flex-col items-center border-b border-border px-4 py-5 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/12 text-[15px] font-bold text-primary">
          {initials(thread.name)}
        </span>
        <p className="mt-2 max-w-full truncate text-[14px] font-semibold text-foreground">
          {thread.name}
        </p>
        <p className="max-w-full truncate text-[12px] text-muted-foreground">
          {thread.org?.name ?? "—"}
        </p>
      </div>
      <dl className="divide-y divide-border/70 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="shrink-0 text-subtle">{k}</dt>
            <dd className="min-w-0 truncate text-right font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
      {thread.org && (
        <div className="p-4">
          <Link
            to="/platform/organizations/$orgId"
            params={{ orgId: thread.org.id }}
            className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-[12.5px] font-semibold text-foreground hover:border-primary"
          >
            <Building2 className="h-3.5 w-3.5" /> {t("support.openCompany")}
          </Link>
        </div>
      )}
    </aside>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

function ThreadRow({
  thread,
  active,
  onClick,
}: {
  thread: SupportThreadSummary;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors",
          active ? "bg-primary/8 shadow-[inset_2px_0_0_var(--primary)]" : "hover:bg-muted/50",
        )}
      >
        <span
          className={cn(
            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
            thread.waitingSince ? "bg-rose-500" : "bg-transparent",
          )}
          aria-label={thread.waitingSince ? t("support.waiting") : t("support.answered")}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "truncate text-[13px] text-foreground",
                thread.waitingSince ? "font-bold" : "font-semibold",
              )}
            >
              {thread.name}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {timeAgo(thread.lastAt)}
            </span>
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {thread.org?.name ?? "—"}
          </span>
          <span
            className={cn(
              "mt-0.5 block truncate text-[12.5px]",
              thread.waitingSince ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {thread.lastDirection === "out" ? `${t("support.you")}: ` : ""}
            {thread.lastText}
          </span>
        </span>
      </button>
    </li>
  );
}

function ThreadView({ thread }: { thread: SupportThreadSummary }) {
  const { t } = useI18n();
  const messages = usePlatformSupportThread(thread.userId);
  const reply = useReplySupport();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const list = messages.data ?? [];

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [list.length, thread.userId]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || reply.isPending) return;
    try {
      await reply.mutateAsync({ userId: thread.userId, text });
      setInput("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("support.sendFailed"));
    }
  }

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold text-foreground">{thread.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[thread.email, thread.org?.name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {thread.role && (
            <Pill tone={roleTone(thread.role)}>{t(ROLE_KEY[thread.role] ?? "admin.roleRep")}</Pill>
          )}
          {thread.org?.plan && (
            <Pill tone="info">{PLAN_LABELS[thread.org.plan as Plan] ?? thread.org.plan}</Pill>
          )}
          {thread.org?.trial && <Pill tone="warning">{t("support.trial")}</Pill>}
        </div>
      </header>

      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto bg-surface px-5 py-4">
        {messages.isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </p>
        )}
        {list.map((m) => (
          <OwnerBubble key={m.id} msg={m} />
        ))}
      </div>

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={t("support.replyPlaceholder")}
          maxLength={4000}
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50"
        />
        <button
          type="submit"
          disabled={reply.isPending || !input.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {reply.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {t("support.reply")}
        </button>
      </form>
    </section>
  );
}

function OwnerBubble({ msg }: { msg: SupportMessage & { page?: string | null } }) {
  const { t } = useI18n();
  const fromUser = msg.direction === "in";
  const d = new Date(msg.created_at);
  return (
    <div className={cn("flex flex-col", fromUser ? "items-start" : "items-end")}>
      <div
        className={cn(
          "max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
          fromUser
            ? "rounded-bl-md border border-border bg-card text-foreground"
            : "rounded-br-md bg-primary text-primary-foreground",
        )}
      >
        {msg.text}
      </div>
      <span className="mx-1 mt-0.5 text-[10.5px] tabular-nums text-muted-foreground">
        {d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}{" "}
        {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
        {fromUser && msg.page ? ` · ${t("support.page")}: ${msg.page}` : ""}
      </span>
    </div>
  );
}
