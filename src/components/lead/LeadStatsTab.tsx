import type { ReactNode } from "react";
import { usePbxCalls, type CrmLeadView } from "@/hooks/use-crm-data";
import { leadDebt } from "@/components/crm/LeadFilterBar";
import { stageAge } from "@/components/crm/KanbanLeadCard";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";

// Lead card → Statistika (5CRM): the lead's age, how long it has been in its
// stage, the first contact and the calls, the last touch, repeat requests,
// and the money -- the facts a manager checks before calling.
export function LeadStatsTab({ lead }: { lead: CrmLeadView }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { data: calls = [] } = usePbxCalls({ leadId: lead.id });
  const answered = calls.filter((c) => (c.duration_seconds ?? 0) > 0);
  const talk = answered.reduce((n, c) => n + (c.duration_seconds ?? 0), 0);
  const longest = answered.reduce((n, c) => Math.max(n, c.duration_seconds ?? 0), 0);
  const firstCall = calls.length ? calls[calls.length - 1]!.created_at : null;
  const when = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  const mins = (s: number) =>
    s >= 60 ? t("lstats.minSec", { m: Math.floor(s / 60), s: s % 60 }) : t("lstats.sec", { s });
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(lead.createdAtIso)) / 86_400_000),
  );
  const firstContactMin =
    lead.firstContactAtIso != null
      ? Math.round((Date.parse(lead.firstContactAtIso) - Date.parse(lead.createdAtIso)) / 60_000)
      : null;

  const groups: { title: string; rows: [string, ReactNode][] }[] = [
    {
      title: t("lstats.g.time"),
      rows: [
        [t("lstats.created"), when(lead.createdAtIso)],
        [t("lstats.age"), t("lstats.days", { n: ageDays })],
        [
          t("lstats.inStage"),
          lead.stageChangedAtIso ? `${lead.stage} · ${stageAge(lead.stageChangedAtIso, t)}` : "—",
        ],
        [t("lstats.lastContact"), when(lead.lastContactIso)],
        [t("lstats.updated"), when(lead.updatedAtIso)],
      ],
    },
    {
      title: t("lstats.g.calls"),
      rows: [
        [
          t("lstats.firstContact"),
          firstContactMin == null
            ? t("lstats.noContact")
            : t("lstats.after", {
                time:
                  firstContactMin < 60
                    ? t("lstats.m", { n: firstContactMin })
                    : t("lstats.h", { n: Math.round(firstContactMin / 60) }),
              }),
        ],
        [t("lstats.firstCall"), when(firstCall)],
        [t("lstats.calls"), `${calls.length} · ${t("lstats.answered", { n: answered.length })}`],
        [t("lstats.talk"), mins(talk)],
        [t("lstats.longest"), longest ? mins(longest) : "—"],
      ],
    },
    {
      title: t("lstats.g.money"),
      rows: [
        [t("lstats.sum"), format(lead.expectedRevenue || 0)],
        [t("lstats.paid"), format(lead.paidAmount ?? 0)],
        [t("lstats.debt"), format(leadDebt(lead))],
        [t("lstats.repeat"), String(lead.repeatCount)],
      ],
    },
  ];

  return (
    <div className="space-y-4 px-6 py-5">
      {groups.map((g) => (
        <section key={g.title} className="overflow-hidden rounded-xl border border-border">
          <h3 className="border-b border-border bg-muted/40 px-4 py-2 text-[11.5px] font-bold uppercase tracking-wider text-subtle">
            {g.title}
          </h3>
          <dl className="divide-y divide-border/70">
            {g.rows.map(([k, v]) => (
              <div
                key={k}
                className="flex items-center justify-between gap-4 px-4 py-2.5 text-[13px]"
              >
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium tabular-nums text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
