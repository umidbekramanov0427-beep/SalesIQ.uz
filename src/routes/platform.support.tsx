import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCheck,
  Clock,
  Headset,
  Inbox,
  Loader2,
  MessageCircleQuestion,
  Send,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Pill, SectionCard, StatCard } from "@/components/layout/Primitives";
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

  return (
    <>
      <PageHeader
        icon={Headset}
        tone="emerald"
        title={t("support.inboxTitle")}
        description={t("support.inboxDesc")}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard
          label={t("support.statWaiting")}
          value={String(stats?.waiting ?? 0)}
          icon={Clock}
          iconTone="rose"
          {...(stats?.waiting ? { tone: "danger" as const } : {})}
        />
        <StatCard
          label={t("support.statAvg")}
          value={stats?.avgResponseMs != null ? responseLabel(stats.avgResponseMs, units) : "—"}
          icon={Timer}
          iconTone="amber"
        />
        <StatCard
          label={t("support.statQuestions")}
          value={String(stats?.questions ?? 0)}
          icon={MessageCircleQuestion}
          iconTone="sky"
        />
        <StatCard
          label={t("support.statAnswered")}
          value={String(stats?.answered ?? 0)}
          icon={CheckCheck}
          iconTone="emerald"
        />
      </div>

      {inbox.data && !inbox.data.ready ? (
        <SectionCard icon={Headset} tone="amber" title={t("support.notReadyTitle")}>
          <p className="text-sm text-muted-foreground">{t("support.notReady")}</p>
        </SectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <SectionCard icon={Inbox} tone="sky" title={t("support.threads")}>
            {inbox.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
              </p>
            ) : !threads.length ? (
              <p className="text-sm text-muted-foreground">{t("support.noThreads")}</p>
            ) : (
              <ul className="-mx-2 space-y-1">
                {threads.map((th) => (
                  <ThreadRow
                    key={th.userId}
                    thread={th}
                    active={th.userId === selected}
                    onClick={() => setSelected(th.userId)}
                  />
                ))}
              </ul>
            )}
          </SectionCard>

          {current ? (
            <ThreadView thread={current} units={units} />
          ) : (
            <SectionCard icon={Headset} tone="emerald" title={t("support.pickThread")}>
              <p className="text-sm text-muted-foreground">{t("support.pickThreadHint")}</p>
            </SectionCard>
          )}
        </div>
      )}
    </>
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
          "flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors",
          active ? "bg-accent" : "hover:bg-accent/60",
        )}
      >
        <span
          className={cn(
            "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
            thread.waitingSince ? "bg-rose-500" : "bg-emerald-500/70",
          )}
          aria-label={thread.waitingSince ? t("support.waiting") : t("support.answered")}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-foreground">{thread.name}</span>
            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
              {timeAgo(thread.lastAt)}
            </span>
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {thread.org?.name ?? "—"}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-foreground/80">
            {thread.lastDirection === "out" ? `${t("support.you")}: ` : ""}
            {thread.lastText}
          </span>
        </span>
      </button>
    </li>
  );
}

function ThreadView({
  thread,
  units,
}: {
  thread: SupportThreadSummary;
  units: { min: string; hour: string; day: string };
}) {
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
    <section className="flex h-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-5 py-3.5">
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
          {thread.avgResponseMs != null && (
            <Pill tone="neutral">
              {t("support.avgShort")}: {responseLabel(thread.avgResponseMs, units)}
            </Pill>
          )}
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
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary/50"
        />
        <button
          type="submit"
          disabled={reply.isPending || !input.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
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
            : "rounded-br-md bg-emerald-600 text-white",
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
