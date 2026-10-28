import { Link } from "@tanstack/react-router";
import { CalendarClock, ExternalLink, Sparkles, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useAmoCrmLink,
  type LeadAnalyticsHotRow,
  type LeadAnalyticsRecoverableRow,
} from "@/hooks/use-crm-data";

type T = (k: string, vars?: Record<string, string | number>) => string;

const money = (v: number | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// "05.11 14:30"; past ones are flagged so they read as late.
function contactLabel(iso: string | null | undefined): { text: string; late: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  return {
    text: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}${hasTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : ""}`,
    late: d.getTime() < Date.now(),
  };
}

function Chip({
  icon: Icon,
  children,
  tone = "muted",
}: {
  icon?: typeof UserRound;
  children: React.ReactNode;
  tone?: "muted" | "late" | "ok";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        tone === "late" && "bg-destructive/10 text-destructive",
        tone === "ok" && "bg-primary/10 text-primary",
        tone === "muted" && "bg-muted text-muted-foreground",
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function LeadName({ id, name }: { id: string; name: string }) {
  return (
    <Link
      to="/crm/leads/$leadId"
      params={{ leadId: id }}
      search={{ from: "audio" }}
      className="truncate text-sm font-bold text-foreground underline-offset-2 hover:text-primary hover:underline"
    >
      {name}
    </Link>
  );
}

function AmoLink({ amoId }: { amoId: number | null | undefined }) {
  const link = useAmoCrmLink()(amoId ?? null);
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noreferrer"
      title="amoCRM"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

/**
 * Lost leads the AI judged winnable: the lead (opens its call analysis),
 * why it can come back, its manager, how long ago it was lost, the next
 * contact and its value.
 */
export function RecoverableList({
  rows,
  format,
  t,
}: {
  rows: LeadAnalyticsRecoverableRow[];
  format: (n: number) => string;
  t: T;
}) {
  if (rows.length === 0) return <Empty text={t("leadAnalytics.noLost")} />;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => {
        const contact = contactLabel(r.next_follow_up);
        return (
          <li key={r.lead_id} className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
              <LeadName id={r.lead_id} name={r.name} />
              {r.reason && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  <Sparkles className="mr-1 inline h-3 w-3 text-violet-500" />
                  {r.reason}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Chip icon={UserRound}>
                  {r.manager && r.manager !== "—" ? r.manager : t("leadAnalytics.noManager")}
                </Chip>
                {r.days_since_closed != null && (
                  <Chip>{t("leadAnalytics.lostDaysAgo", { n: r.days_since_closed })}</Chip>
                )}
                <Chip
                  icon={CalendarClock}
                  tone={contact ? (contact.late ? "late" : "ok") : "muted"}
                >
                  {contact ? contact.text : t("leadAnalytics.noNextContact")}
                </Chip>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-bold tabular-nums text-success">
                {format(money(r.value))}
              </span>
              <AmoLink amoId={r.amocrm_id} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const HEAT: Record<string, string> = {
  VeryHot: "bg-destructive",
  Hot: "bg-orange-500",
  Warm: "bg-amber-400",
};

/**
 * Open leads the AI rates hot, hottest first, with a colored edge by
 * urgency: the lead, its stage and manager, score, the AI's next action
 * and next contact, and its value.
 */
export function HotList({
  rows,
  format,
  t,
}: {
  rows: LeadAnalyticsHotRow[];
  format: (n: number) => string;
  t: T;
}) {
  if (rows.length === 0) return <Empty text={t("leadAnalytics.noHot")} />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const contact = contactLabel(r.next_follow_up);
        return (
          <li
            key={r.lead_id}
            className="relative flex items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface py-2.5 pl-4 pr-3"
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 w-1",
                HEAT[r.temperature] ?? "bg-muted-foreground/40",
              )}
            />
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-card font-display text-sm font-extrabold tabular-nums text-foreground ring-1 ring-border">
              {r.score}
            </span>
            <div className="min-w-0 flex-1">
              <LeadName id={r.lead_id} name={r.name} />
              <p className="truncate text-[11px] text-muted-foreground">
                {r.stage} ·{" "}
                {r.manager && r.manager !== "—" ? r.manager : t("leadAnalytics.noManager")}
              </p>
              {r.next_action && (
                <p className="mt-0.5 line-clamp-1 text-xs text-foreground">
                  <Sparkles className="mr-1 inline h-3 w-3 text-violet-500" />
                  {r.next_action}
                </p>
              )}
              {contact && (
                <div className="mt-1">
                  <Chip icon={CalendarClock} tone={contact.late ? "late" : "ok"}>
                    {contact.text}
                  </Chip>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-sm font-bold tabular-nums text-foreground">
                {format(money(r.value))}
              </span>
              <AmoLink amoId={r.amocrm_id} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
