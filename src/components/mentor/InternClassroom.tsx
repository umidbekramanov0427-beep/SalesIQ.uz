import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { GraduationCap, Loader2 } from "lucide-react";
import {
  InternHero,
  MentorChat,
  RoadmapCard,
  TelegramCard,
  type InternInfo,
} from "@/components/mentor/MentorParts";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { internDay } from "@/lib/intern-roadmap";
import { useOrgInterns, type InternRow } from "@/hooks/use-intern-mentor";

// The AI mentor lives inside Sinfxona (content-library.tsx), the intern's
// main section: interns get a "Mening rejam" tab, ROP/admins an
// "Amaliyotchilar" tab with every intern's progress.

/** One intern's plan inside Sinfxona: day/progress, mentor chat, today's lessons, Telegram. */
export function InternPlanPanel({
  intern,
  self,
  onOpenLesson,
}: {
  intern: InternInfo;
  self?: boolean;
  onOpenLesson: (lessonId: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <InternHero intern={intern} />
        <MentorChat internId={intern.id} readOnly={!self} />
      </div>
      <div className="min-w-0 space-y-4">
        <RoadmapCard intern={intern} onOpenLesson={onOpenLesson} />
        <TelegramCard intern={intern} self={!!self} />
      </div>
    </div>
  );
}

function toInfo(row: InternRow): InternInfo {
  return {
    id: row.id,
    name: row.full_name || row.email,
    startDate: row.internship_start_date,
    totalDays: row.internship_days,
    telegramLinked: row.telegram_chat_id != null,
    groupLinked: row.intern_group_chat_id != null,
  };
}

/** Sinfxona -> "Amaliyotchilar" (ROP/admin): every intern's progress and mentor conversation. */
export function InternsOverview({ onOpenLesson }: { onOpenLesson: (lessonId: string) => void }) {
  const { t } = useI18n();
  const { data: interns, isLoading } = useOrgInterns(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => (interns ?? []).find((i) => i.id === selectedId) ?? interns?.[0] ?? null,
    [interns, selectedId],
  );

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-subtle" />;
  if (!interns || interns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
        <GraduationCap className="mx-auto h-8 w-8 text-primary" />
        <p className="mt-3 text-sm font-semibold text-foreground">{t("mentor.noInterns")}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t("mentor.noInternsHint")}
        </p>
        <Link
          to="/admin"
          className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {t("mentor.openAdmin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {interns.map((row) => {
          const day = internDay(row.internship_start_date);
          const status = (row.onboarding_status ?? {}) as {
            completed_lessons?: number;
            total_lessons?: number;
          };
          const active = selected?.id === row.id;
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={cn(
                "min-w-[200px] rounded-xl border bg-card px-3.5 py-2.5 text-left transition-colors",
                active ? "border-primary" : "border-border hover:border-primary/40",
              )}
            >
              <p className="truncate text-sm font-semibold text-foreground">
                {row.full_name || row.email}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {day == null
                  ? t("mentor.notStarted")
                  : t("mentor.dayOf", {
                      day: Math.min(day, row.internship_days),
                      total: row.internship_days,
                    })}
                {status.total_lessons
                  ? ` · ${status.completed_lessons ?? 0}/${status.total_lessons}`
                  : ""}
              </p>
              <p className="mt-0.5 text-[11px] text-subtle">
                {row.mentor_last_checkin_at
                  ? t("mentor.lastCheckin", { when: timeAgo(row.mentor_last_checkin_at) })
                  : t("mentor.noCheckinYet")}
              </p>
            </button>
          );
        })}
      </div>
      {selected && (
        <InternPlanPanel key={selected.id} intern={toInfo(selected)} onOpenLesson={onOpenLesson} />
      )}
    </div>
  );
}
