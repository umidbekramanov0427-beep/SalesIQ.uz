import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Copy,
  GraduationCap,
  Loader2,
  PlayCircle,
  Send,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { buildRoadmap, internDay } from "@/lib/intern-roadmap";
import { useLessonSections, useLessons, type LessonRow } from "@/hooks/use-crm-data";
import {
  useMentorGroupCode,
  useMentorMessages,
  useSendMentorMessage,
  useUserLessonProgress,
  type MentorMessageRow,
} from "@/hooks/use-intern-mentor";
import { copyText } from "@/lib/clipboard";

export type InternInfo = {
  id: string;
  name: string;
  startDate: string | null;
  totalDays: number;
  telegramLinked: boolean;
  groupLinked: boolean;
};

/** Day N of M, plus each day's lessons with this intern's progress. */
export function useInternPlan(intern: InternInfo) {
  const { data: lessons } = useLessons();
  const { data: sections } = useLessonSections();
  const { data: progress } = useUserLessonProgress(intern.id);
  return useMemo(() => {
    const day = internDay(intern.startDate);
    const plan = buildRoadmap<LessonRow>(lessons ?? [], sections ?? [], intern.totalDays);
    const done = (id: string) => !!progress?.[id]?.completed;
    const started = (id: string) => (progress?.[id]?.last_position_seconds ?? 0) > 0;
    const today = day ? (plan[Math.min(day, plan.length) - 1] ?? []) : [];
    const total = (lessons ?? []).length;
    const completed = (lessons ?? []).filter((l) => done(l.id)).length;
    return { day, plan, today, done, started, total, completed };
  }, [lessons, sections, progress, intern.startDate, intern.totalDays]);
}

export function InternHero({ intern }: { intern: InternInfo }) {
  const { t } = useI18n();
  const { day, today, done, total, completed } = useInternPlan(intern);
  const todayDone = today.filter((l) => done(l.id)).length;
  const finished = day != null && day > intern.totalDays;
  const shownDay = day == null ? 0 : Math.min(day, intern.totalDays);
  return (
    <div className="surface-card relative overflow-hidden rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
          <GraduationCap className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-subtle">
            {t("mentor.probation")}
          </p>
          <h2 className="mt-0.5 text-xl font-semibold text-foreground">
            {day == null
              ? t("mentor.notStarted")
              : finished
                ? t("mentor.finished")
                : t("mentor.dayOf", { day: shownDay, total: intern.totalDays })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("mentor.lessonsProgress", { done: completed, total })}
            {day != null && !finished && today.length > 0 && (
              <> · {t("mentor.todayProgress", { done: todayDone, total: today.length })}</>
            )}
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-1" aria-hidden>
        {Array.from({ length: intern.totalDays }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              day != null && i + 1 < shownDay
                ? "bg-primary"
                : i + 1 === shownDay
                  ? "bg-primary/60"
                  : "bg-muted",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function LessonLine({
  lesson,
  done,
  started,
  onOpen,
}: {
  lesson: LessonRow;
  done: boolean;
  started: boolean;
  onOpen: (lessonId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => onOpen(lesson.id)}
      className="group flex w-full items-center gap-3 rounded-xl border border-border bg-surface/60 px-3 py-2.5 text-left transition-colors hover:border-primary/40"
    >
      {done ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      ) : started ? (
        <PlayCircle className="h-4 w-4 shrink-0 text-warning" />
      ) : (
        <CircleDashed className="h-4 w-4 shrink-0 text-subtle" />
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {lesson.title}
      </span>
      <span className="shrink-0 text-xs text-subtle group-hover:text-primary">
        {done
          ? t("mentor.lessonDone")
          : started
            ? t("mentor.lessonContinue")
            : t("mentor.lessonOpen")}
      </span>
    </button>
  );
}

export function RoadmapCard({
  intern,
  onOpenLesson,
}: {
  intern: InternInfo;
  onOpenLesson: (lessonId: string) => void;
}) {
  const { t } = useI18n();
  const { day, plan, today, done, started } = useInternPlan(intern);
  const [showAll, setShowAll] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">{t("mentor.todayPlan")}</p>
      <div className="mt-3 space-y-2">
        {today.length === 0 ? (
          <p className="text-sm text-subtle">{t("mentor.noLessonsToday")}</p>
        ) : (
          today.map((l) => (
            <LessonLine
              key={l.id}
              lesson={l}
              done={done(l.id)}
              started={started(l.id)}
              onOpen={onOpenLesson}
            />
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
        {t("mentor.fullPlan")}
      </button>
      {showAll && (
        <ol className="mt-2 space-y-1.5">
          {plan.map((lessons, i) => {
            const n = i + 1;
            const doneCount = lessons.filter((l) => done(l.id)).length;
            return (
              <li
                key={n}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                  n === day ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                <span className="min-w-0 truncate">
                  {t("mentor.dayN", { day: n })}
                  {lessons.length > 0 && ` · ${lessons.map((l) => l.title).join(", ")}`}
                </span>
                <span className="shrink-0 tabular-nums">
                  {doneCount}/{lessons.length}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function TelegramCard({ intern, self }: { intern: InternInfo; self: boolean }) {
  const { t } = useI18n();
  const groupCode = useMentorGroupCode();
  const command = groupCode.data ? `/mentor ${groupCode.data.code}` : null;
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">{t("mentor.telegramTitle")}</p>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{t("mentor.telegramPersonal")}</span>
          <span className={intern.telegramLinked ? "text-success" : "text-subtle"}>
            {intern.telegramLinked ? t("mentor.linked") : t("mentor.notLinked")}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">{t("mentor.telegramGroup")}</span>
          <span className={intern.groupLinked ? "text-success" : "text-subtle"}>
            {intern.groupLinked ? t("mentor.linked") : t("mentor.notLinked")}
          </span>
        </li>
      </ul>
      {!intern.telegramLinked && self && (
        <Link
          to="/settings"
          className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline"
        >
          {t("mentor.linkPersonal")}
        </Link>
      )}
      <div className="mt-3 border-t border-border pt-3">
        {command ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              {t("mentor.groupSteps", {
                bot: groupCode.data?.botUsername ? `@${groupCode.data.botUsername}` : "bot",
              })}
            </p>
            <button
              type="button"
              onClick={() => {
                void copyText(command).then(
                  () => toast.success(t("mentor.copied")),
                  () => undefined,
                );
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground hover:border-primary/40"
            >
              {command}
              <Copy className="h-3.5 w-3.5 text-subtle" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={groupCode.isPending}
            onClick={() =>
              groupCode.mutate(intern.id, {
                onError: (err) => toast.error(err instanceof Error ? err.message : String(err)),
              })
            }
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:border-primary/40 disabled:opacity-60"
          >
            {groupCode.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Users className="h-3.5 w-3.5" />
            )}
            {intern.groupLinked ? t("mentor.relinkGroup") : t("mentor.linkGroup")}
          </button>
        )}
      </div>
    </div>
  );
}

function Bubble({ m }: { m: MentorMessageRow }) {
  const { t } = useI18n();
  const mine = m.sender === "intern";
  return (
    <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
      {!mine && (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Bot className="h-3.5 w-3.5" />
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm",
          mine
            ? "rounded-br-sm bg-primary text-primary-foreground"
            : "rounded-bl-sm border border-border bg-surface text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</p>
        <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-subtle")}>
          {m.channel === "telegram" ? "Telegram · " : ""}
          {m.kind === "greeting" ? `${t("mentor.kindGreeting")} · ` : ""}
          {m.kind === "checkin" ? `${t("mentor.kindCheckin")} · ` : ""}
          {timeAgo(m.created_at)}
        </p>
      </div>
    </div>
  );
}

export function MentorChat({ internId, readOnly }: { internId: string; readOnly?: boolean }) {
  const { t } = useI18n();
  const { data: messages, isLoading } = useMentorMessages(internId);
  const send = useSendMentorMessage();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length, pending]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || send.isPending) return;
    setPending(value);
    setText("");
    send.mutate(value, {
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : String(err));
        setText(value);
      },
      onSettled: () => setPending(null),
    });
  }

  return (
    <div className="flex min-h-[420px] flex-col rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Bot className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{t("mentor.chatTitle")}</p>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4" style={{ maxHeight: 560 }}>
        {isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />}
        {!isLoading && (messages ?? []).length === 0 && !pending && (
          <p className="py-10 text-center text-sm text-subtle">{t("mentor.emptyChat")}</p>
        )}
        {(messages ?? []).map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {pending && (
          <>
            <div className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary/70 px-3.5 py-2.5 text-sm text-primary-foreground">
                {pending}
              </p>
            </div>
            <p className="flex items-center gap-2 text-xs text-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("mentor.typing")}
            </p>
          </>
        )}
        <div ref={endRef} />
      </div>
      {!readOnly && (
        <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-border p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e);
              }
            }}
            rows={2}
            placeholder={t("mentor.placeholder")}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
          />
          <button
            type="submit"
            disabled={!text.trim() || send.isPending}
            aria-label={t("mentor.send")}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  );
}
