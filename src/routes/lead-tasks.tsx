import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import { currency } from "@/lib/mock-data";
import { useCrmLeads, useTasksView } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";

export const Route = createFileRoute("/lead-tasks")({
  head: () => ({
    meta: [
      { title: "Lead Tasks — SalesIQ" },
      {
        name: "description",
        content: "Tasks attached to CRM leads with status, owner and deadlines.",
      },
      { property: "og:title", content: "Lead Tasks — SalesIQ" },
      { property: "og:description", content: "Lead-level tasks with full activity timeline." },
    ],
  }),
  component: LeadTasks,
});

function LeadTasks() {
  const { t } = useI18n();
  const { rows: leads, isLoading: leadsLoading } = useCrmLeads();
  const { rows: tasks, isLoading: tasksLoading } = useTasksView();
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({
    from: null,
    to: null,
    label: t("lb.presetAll"),
  });

  // Tasks with no due date are always kept -- a date filter is meant to
  // scope "what's due when", not to hide undated items entirely.
  const scopedTasks = useMemo(() => {
    if (!dateFilter.from && !dateFilter.to) return tasks;
    return tasks.filter((t) => {
      if (!t.dueRaw) return true;
      const due = new Date(t.dueRaw);
      if (dateFilter.from && due < dateFilter.from) return false;
      if (dateFilter.to && due > dateFilter.to) return false;
      return true;
    });
  }, [tasks, dateFilter]);

  const leadsWithTasks = useMemo(() => {
    const leadIds = new Set(scopedTasks.filter((t) => t.leadId).map((t) => t.leadId));
    return leads.filter((l) => leadIds.has(l.id)).slice(0, 6);
  }, [leads, scopedTasks]);

  const upcoming = useMemo(
    () =>
      scopedTasks
        .filter((t) => t.leadId && t.dueRaw)
        .sort((a, b) => new Date(a.dueRaw!).getTime() - new Date(b.dueRaw!).getTime())
        .slice(0, 8),
    [scopedTasks],
  );

  const isLoading = leadsLoading || tasksLoading;

  return (
    <>
      <PageHeader
        title={t("leadTasks.title")}
        description={t("leadTasks.desc")}
        actions={<DateRangeFilter value={dateFilter} onChange={setDateFilter} />}
      />

      {isLoading && (
        <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {!isLoading && leadsWithTasks.length === 0 && (
            <SectionCard>
              <p className="text-sm text-subtle">{t("leadTasks.empty")}</p>
            </SectionCard>
          )}
          {leadsWithTasks.map((l) => {
            const leadTasks = scopedTasks.filter((t) => t.leadId === l.id);
            return (
              <SectionCard
                key={l.id}
                title={l.company || l.name}
                description={`${l.name} · ${l.owner} · ${currency(l.expectedRevenue)}`}
                actions={<Pill tone={l.stage === "Won" ? "success" : "info"}>{l.stage}</Pill>}
              >
                <ul className="space-y-3">
                  {leadTasks.map((t) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <Link
                          to="/crm/leads/$leadId"
                          params={{ leadId: l.id }}
                          search={{ from: "leadTasks" }}
                          className="text-sm font-medium hover:text-primary"
                        >
                          {t.title}
                        </Link>
                      </div>
                      <span className="text-xs text-subtle">{t.due}</span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            );
          })}
        </div>

        <SectionCard title={t("leadTasks.upcoming")} description={t("leadTasks.upcomingDesc")}>
          {upcoming.length === 0 && (
            <p className="text-sm text-subtle">{t("leadTasks.upcomingEmpty")}</p>
          )}
          <ol className="relative space-y-6 border-l border-border pl-5">
            {upcoming.map((t) => (
              <li key={t.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground">
                  <CalendarClock className="h-3 w-3" />
                </span>
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                <p className="mt-1 text-xs text-subtle">
                  {t.leadName ?? "—"} · {t.due}
                </p>
              </li>
            ))}
          </ol>
        </SectionCard>
      </div>
    </>
  );
}
