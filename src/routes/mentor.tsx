import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/Primitives";
import {
  InternHero,
  MentorChat,
  RoadmapCard,
  TelegramCard,
  type InternInfo,
} from "@/components/mentor/MentorParts";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";
import { internDay } from "@/lib/intern-roadmap";
import { useOrgInterns, type InternRow } from "@/hooks/use-intern-mentor";

export const Route = createFileRoute("/mentor")({
  head: () => ({ meta: [{ title: "AI Mentor — SalesIQ" }] }),
  component: MentorPage,
});

function MentorPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  if (!user) return null;
  const isManager = user.role === "super_admin" || user.role === "rop";
  return (
    <>
      <PageHeader title={t("mentor.title")} description={t("mentor.desc")} />
      {user.isIntern ? (
        <InternView
          intern={{
            id: user.id,
            name: user.name,
            startDate: user.internshipStartDate,
            totalDays: user.internshipDays,
            telegramLinked: user.telegramLinked,
            groupLinked: user.internGroupLinked,
          }}
          self
        />
      ) : isManager ? (
        <ManagerView />
      ) : (
        <p className="text-sm text-muted-foreground">{t("mentor.onlyInterns")}</p>
      )}
    </>
  );
}

function InternView({ intern, self }: { intern: InternInfo; self?: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4">
        <InternHero intern={intern} />
        <MentorChat internId={intern.id} readOnly={!self} />
      </div>
      <div className="min-w-0 space-y-4">
        <RoadmapCard intern={intern} />
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

function ManagerView() {
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
      {selected && <InternView key={selected.id} intern={toInfo(selected)} />}
    </div>
  );
}
