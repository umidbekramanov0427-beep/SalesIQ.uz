import {
  CardSettingsButton,
  SettingSection,
  ToggleRow,
  ViewPicker,
} from "@/components/dashboard/CardSettings";
import { useCardSettings } from "@/lib/home-card-settings";
import { Link } from "@tanstack/react-router";
import {
  AlarmClockOff,
  CalendarCheck,
  CheckCircle2,
  ClipboardX,
  LayoutGrid,
  ListOrdered,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useDailyWork } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { formatSom } from "@/lib/lead-payments/paid-stage";
import type { DailyWorkItem } from "@/lib/daily-work";
import { cn } from "@/lib/utils";

const GRID_COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

type Tile = {
  key: string;
  icon: LucideIcon;
  item: DailyWorkItem;
  tone: string;
  search: Record<string, string>;
  sub?: string;
};

/**
 * "Bugungi ish": the manager opens the CRM and sees what to do first --
 * overdue and today's tasks, open leads with no task or no owner, and
 * deals waiting for the rest of the payment. Each tile opens the funnel
 * holding most of them with the matching filter. Hidden for a company
 * without CRM leads (analytics only).
 */
export function DailyWorkCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data } = useDailyWork();
  const { settings, update, reset, changed } = useCardSettings("dailyWork");
  if (!data || data.empty) return null;
  const isRep = user?.role === "sotuv_menejeri";

  const tiles: Tile[] = [
    {
      key: "overdue",
      icon: AlarmClockOff,
      item: data.overdue,
      tone: "text-destructive bg-destructive/10",
      search: { view: "tasks" },
    },
    {
      key: "today",
      icon: CalendarCheck,
      item: data.today,
      tone: "text-primary bg-primary/10",
      search: { view: "tasks" },
    },
    {
      key: "noTask",
      icon: ClipboardX,
      item: data.noTask,
      tone: "text-amber-600 bg-amber-500/10 dark:text-amber-400",
      search: { preset: "noTasks" },
    },
    ...(isRep
      ? []
      : [
          {
            key: "unassigned",
            icon: UserX,
            item: data.unassigned,
            tone: "text-violet-600 bg-violet-500/10 dark:text-violet-400",
            search: { preset: "unassigned" },
          },
        ]),
    {
      key: "payment",
      icon: Wallet,
      item: data.payment,
      tone: "text-success bg-success/10",
      search: { stage: (data.payment.stageIds ?? []).join(",") },
      ...(data.payment.amount ? { sub: `${formatSom(data.payment.amount)} so'm` } : {}),
    },
  ];
  const allClear = tiles.every((x) => x.item.count === 0);
  const hidden = new Set(settings.hide ?? []);
  const shown = tiles.filter((x) => !hidden.has(x.key));
  const view = settings.view === "list" ? "list" : "tiles";
  const actions = (
    <CardSettingsButton title={t("daily.title")} changed={changed} onReset={reset}>
      <SettingSection label={t("cardset.view")}>
        <ViewPicker
          value={view}
          onChange={(v) => update({ view: v === "tiles" ? undefined : v })}
          options={[
            { value: "tiles", label: t("cardset.view.tiles"), icon: LayoutGrid },
            { value: "list", label: t("cardset.view.list"), icon: ListOrdered },
          ]}
        />
      </SettingSection>
      <SettingSection label={t("cardset.metrics")} hint={t("cardset.metricsHint")}>
        <div className="space-y-2.5">
          {tiles.map((x) => (
            <ToggleRow
              key={x.key}
              label={t(`daily.${x.key}`)}
              checked={!hidden.has(x.key)}
              onChange={(v) => {
                const next = new Set(hidden);
                if (v) next.delete(x.key);
                else next.add(x.key);
                if (next.size >= tiles.length) return;
                update({ hide: [...next] });
              }}
            />
          ))}
        </div>
      </SettingSection>
    </CardSettingsButton>
  );

  return (
    <SectionCard
      className="mb-5"
      icon={CalendarCheck}
      tone="primary"
      title={t("daily.title")}
      description={allClear ? t("daily.allClear") : t("daily.desc")}
      actions={actions}
    >
      <div
        className={cn(
          view === "list"
            ? "divide-y divide-border overflow-hidden rounded-xl border border-border"
            : "grid gap-2.5 phone:grid-cols-2",
          view === "tiles" && (GRID_COLS[shown.length] ?? "grid-cols-5"),
        )}
      >
        {shown.map(({ key, icon: Icon, item, tone, search, sub }) => {
          const done = item.count === 0;
          const body = (
            <>
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-lg",
                    done ? "bg-muted text-muted-foreground" : tone,
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span
                  className={cn(
                    "font-display text-[26px] font-bold leading-none tabular-nums",
                    done ? "text-muted-foreground/60" : "text-foreground",
                  )}
                >
                  {item.count}
                </span>
              </span>
              <span className="mt-2.5 block text-[13px] font-semibold leading-tight text-foreground">
                {t(`daily.${key}`)}
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                {done ? t("daily.none") : (sub ?? item.funnel)}
              </span>
            </>
          );
          if (view === "list") {
            const row = (
              <>
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                    done ? "bg-muted text-muted-foreground" : tone,
                  )}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-foreground">
                    {t(`daily.${key}`)}
                  </span>
                  <span className="block truncate text-[11.5px] text-muted-foreground">
                    {done ? t("daily.none") : (sub ?? item.funnel)}
                  </span>
                </span>
                <span
                  className={cn(
                    "font-display text-[20px] font-bold tabular-nums",
                    done ? "text-muted-foreground/60" : "text-foreground",
                  )}
                >
                  {item.count}
                </span>
              </>
            );
            const rowCls = "flex items-center gap-3 bg-surface px-3 py-2.5";
            return done || !item.funnel ? (
              <div key={key} className={rowCls}>
                {row}
              </div>
            ) : (
              <Link
                key={key}
                to="/funnels"
                search={{ funnel: item.funnel, ...search }}
                className={cn(rowCls, "transition-colors hover:bg-accent/40")}
              >
                {row}
              </Link>
            );
          }
          const cls =
            "block rounded-xl border border-border bg-surface p-3 text-left transition-colors";
          return done || !item.funnel ? (
            <div key={key} className={cls}>
              {body}
            </div>
          ) : (
            <Link
              key={key}
              to="/funnels"
              search={{ funnel: item.funnel, ...search }}
              className={cn(cls, "hover:border-primary/40 hover:bg-accent/40")}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
