import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarClock, Clock3, Moon, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { PageHeader, SectionCard, SettingRow, SettingRows } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { useOrgWorkSchedule, useUpdateOrgWorkSchedule } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// Admin → Ish vaqti: the company's working days and hours
// (org_work_schedule). Ish vaqtidan tashqari avto-javob and the reports use
// them.

export const Route = createFileRoute("/admin/work-hours")({
  head: () => ({ meta: [{ title: "Ish vaqti — SalesIQ" }] }),
  component: WorkHoursPage,
});

const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const inputCls =
  "h-10 w-[120px] rounded-xl border border-border bg-input px-3 text-[14px] tabular-nums text-foreground outline-none transition-colors focus:border-primary";

type Draft = { start: string; end: string; days: number[] };

function WorkHoursPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: saved, isLoading } = useOrgWorkSchedule();
  const update = useUpdateOrgWorkSchedule();
  const initial: Draft = {
    start: (saved?.start_time ?? "09:00").slice(0, 5),
    end: (saved?.end_time ?? "18:00").slice(0, 5),
    days: [...(saved?.work_days ?? [1, 2, 3, 4, 5])].sort(),
  };
  const key = JSON.stringify(initial);
  const [draft, setDraft] = useState<Draft>(initial);
  useEffect(() => setDraft(JSON.parse(key) as Draft), [key]);
  const dirty = JSON.stringify({ ...draft, days: [...draft.days].sort() }) !== key;

  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
        </SectionCard>
      </>
    );
  }

  async function save() {
    if (!draft.days.length) {
      toast.error(t("workHours.pickDay"));
      return;
    }
    try {
      await update.mutateAsync({
        start_time: draft.start,
        end_time: draft.end,
        work_days: [...draft.days].sort(),
      });
      toast.success(t("workHours.saved"));
    } catch (err) {
      toast.error(describeError(err, t("workHours.saveFailed")));
    }
  }

  const toggleDay = (d: number) =>
    setDraft((x) => ({
      ...x,
      days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d],
    }));

  return (
    <>
      <PageHeader
        title={t("workHours.title")}
        description={t("workHours.desc")}
        icon={CalendarClock}
        tone="sky"
        actions={
          <>
            {dirty && (
              <Button variant="outline" onClick={() => setDraft(initial)}>
                {t("common.cancel")}
              </Button>
            )}
            <Button onClick={() => void save()} disabled={!dirty || update.isPending || isLoading}>
              {t("common.save")}
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={Clock3}
          tone="sky"
          title={t("workHours.cardTitle")}
          description={t("workHours.cardDesc")}
        >
          <SettingRows>
            <SettingRow title={t("workHours.days")} description={t("workHours.daysDesc")}>
              <div className="flex flex-wrap gap-1.5">
                {DAY_KEYS.map((k, i) => {
                  const d = i + 1;
                  const on = draft.days.includes(d);
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "h-10 min-w-[46px] rounded-xl px-2.5 text-[13px] font-semibold",
                        on ? "ctl-lit" : "ctl-soft",
                      )}
                    >
                      {t(`settings.schedule.day${k}`)}
                    </button>
                  );
                })}
              </div>
            </SettingRow>
            <SettingRow title={t("workHours.start")} description={t("workHours.startDesc")}>
              <input
                type="time"
                value={draft.start}
                onChange={(e) => setDraft((x) => ({ ...x, start: e.target.value || x.start }))}
                className={inputCls}
              />
            </SettingRow>
            <SettingRow title={t("workHours.end")} description={t("workHours.endDesc")}>
              <input
                type="time"
                value={draft.end}
                onChange={(e) => setDraft((x) => ({ ...x, end: e.target.value || x.end }))}
                className={inputCls}
              />
            </SettingRow>
          </SettingRows>
        </SectionCard>

        <SectionCard
          icon={Moon}
          tone="violet"
          title={t("workHours.usedTitle")}
          description={t("workHours.usedDesc")}
        >
          <Link
            to="/funnels/settings"
            search={{ tab: "autoreplies" }}
            className="ctl-soft inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold"
          >
            {t("workHours.openAfterHours")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </SectionCard>
      </div>
    </>
  );
}
