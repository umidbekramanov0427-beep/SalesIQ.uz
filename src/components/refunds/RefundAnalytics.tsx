import { useMemo } from "react";
import { BarChart3, MessageSquareWarning, UserRound, Workflow } from "lucide-react";
import { ListCard } from "@/components/layout/ListCard";
import { SectionCard } from "@/components/layout/Primitives";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { groupRefunds, weeklyRefunds, type RefundGroup, type RefundRow } from "@/lib/refunds";

// Pul qaytarish -> Analitika: why clients leave, which managers' clients
// and which funnels they come from (count, money, how many already paid
// back), and requests against refunds week by week. Follows the filters.

export function RefundAnalytics({
  rows,
  funnelOf,
  operatorOf,
  nameOf,
}: {
  rows: RefundRow[];
  funnelOf: (r: RefundRow) => string | null;
  operatorOf: (r: RefundRow) => string | null;
  nameOf: (id: string | null) => string;
}) {
  const { t } = useI18n();
  const reasons = useMemo(() => groupRefunds(rows, (r) => r.reason), [rows]);
  const operators = useMemo(() => groupRefunds(rows, operatorOf), [rows, operatorOf]);
  const funnels = useMemo(() => groupRefunds(rows, funnelOf), [rows, funnelOf]);
  const weeks = useMemo(() => weeklyRefunds(rows, new Date()), [rows]);
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.requested, w.refunded)));

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard
        icon={BarChart3}
        tone="violet"
        title={t("refund.anWeeks")}
        description={t("refund.anWeeksDesc")}
      >
        <div className="flex h-[150px] items-end gap-2 border-b border-border">
          {weeks.map((w) => (
            <div
              key={w.week}
              className="group relative flex h-full flex-1 items-end justify-center gap-[3px]"
            >
              <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11.5px] text-foreground shadow-sm group-hover:block">
                {w.week.slice(5).split("-").reverse().join(".")}: {t("refund.anRequested")}{" "}
                {w.requested} · {t("refund.status.refunded")} {w.refunded}
              </span>
              <div
                className="w-[38%] max-w-[18px] rounded-t bg-amber-400"
                style={{ height: `${(w.requested / max) * 100}%`, minHeight: w.requested ? 3 : 0 }}
              />
              <div
                className="w-[38%] max-w-[18px] rounded-t bg-emerald-500"
                style={{ height: `${(w.refunded / max) * 100}%`, minHeight: w.refunded ? 3 : 0 }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10.5px] text-muted-foreground">
          {weeks.map((w) => (
            <span key={w.week} className="flex-1 text-center">
              {w.week.slice(5).split("-").reverse().join(".")}
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-4 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> {t("refund.anRequested")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {t("refund.status.refunded")}
          </span>
        </div>
      </SectionCard>
      <ListCard<RefundGroup>
        icon={MessageSquareWarning}
        tone="rose"
        title={t("refund.anReasons")}
        description={t("refund.anReasonsDesc")}
        items={reasons}
        searchText={(g) => g.key ?? ""}
        renderRow={(g) => (
          <GroupLine
            key={g.key ?? "—"}
            g={g}
            label={g.key ?? t("refund.noReason")}
            total={rows.length}
          />
        )}
      />
      <ListCard<RefundGroup>
        icon={UserRound}
        tone="sky"
        title={t("refund.anOperators")}
        description={t("refund.anOperatorsDesc")}
        items={operators}
        searchText={(g) => nameOf(g.key)}
        renderRow={(g) => (
          <GroupLine key={g.key ?? "—"} g={g} label={nameOf(g.key)} total={rows.length} />
        )}
      />
      <ListCard<RefundGroup>
        icon={Workflow}
        tone="emerald"
        title={t("refund.anFunnels")}
        description={t("refund.anFunnelsDesc")}
        items={funnels}
        searchText={(g) => g.key ?? ""}
        renderRow={(g) => (
          <GroupLine
            key={g.key ?? "—"}
            g={g}
            label={g.key ?? t("refund.noFunnel")}
            total={rows.length}
          />
        )}
      />
    </div>
  );
}

function GroupLine({ g, label, total }: { g: RefundGroup; label: string; total: number }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const share = total ? Math.round((g.count / total) * 100) : 0;
  return (
    <div className="border-b border-border/60 py-2.5 last:border-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
        <span className="truncate font-semibold text-foreground">{label}</span>
        <span className="shrink-0 text-[12.5px] tabular-nums text-muted-foreground">
          {t("refund.peopleN", { n: g.count })} · {format(g.amount)}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className="bg-emerald-500"
          style={{ width: `${total ? (g.refunded / total) * 100 : 0}%` }}
        />
        <span
          className="bg-amber-400"
          style={{ width: `${total ? ((g.count - g.refunded) / total) * 100 : 0}%` }}
        />
      </div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        {share}% · {t("refund.status.refunded")}: {g.refunded}/{g.count}
      </p>
    </div>
  );
}
