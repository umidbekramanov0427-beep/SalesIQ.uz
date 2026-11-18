import { useState } from "react";
import { ArrowDown, ArrowUp, Lightbulb, Megaphone } from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CampaignRow, Metrics } from "@/lib/marketing-ai/metrics";
import { KindTag, num, pct, useMoney } from "@/components/marketing/ai/shared";

// AI tahlilchi -> Kampaniyalar: every campaign side by side (leads,
// qualified, prepaid, paid in full, spend, CPL, CPQL, CAC, ROAS, wrong or
// missing numbers), sortable; under it a recommendation worked out from
// these numbers only.

type Key =
  | "leads"
  | "qualified"
  | "qualRate"
  | "advance"
  | "full"
  | "spend"
  | "cpl"
  | "cpql"
  | "cac"
  | "roas"
  | "bad";

const COLS: { key: Key; label: string; money?: boolean }[] = [
  { key: "leads", label: "ai.c.leads" },
  { key: "qualified", label: "ai.c.qualified" },
  { key: "qualRate", label: "ai.c.qualRate" },
  { key: "advance", label: "ai.c.prepaid" },
  { key: "full", label: "ai.c.full" },
  { key: "spend", label: "ai.c.spend", money: true },
  { key: "cpl", label: "CPL", money: true },
  { key: "cpql", label: "CPQL", money: true },
  { key: "cac", label: "CAC", money: true },
  { key: "roas", label: "ROAS" },
  { key: "bad", label: "ai.c.bad" },
];

const value = (c: CampaignRow, k: Key): number | null =>
  k === "bad" ? c.reasons.wrong_number + c.reasons.no_number : (c[k] as number | null);

export function AiCampaignsTab({ m }: { m: Metrics }) {
  const { t } = useI18n();
  const money = useMoney();
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({ key: "leads", desc: true });
  const rows = [...m.campaigns].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return sort.desc ? y - x : x - y;
  });
  const advice = adviceOf(m);

  return (
    <div className="space-y-5">
      <SectionCard
        icon={Megaphone}
        tone="rose"
        title={t("ai.campaigns")}
        description={t("ai.campaignsDesc")}
      >
        {rows.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted-foreground">
            {t("ai.noCampaigns")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 text-left font-semibold">{t("ai.c.name")}</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="py-2 pr-3 text-right font-semibold">
                      <button
                        type="button"
                        onClick={() =>
                          setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))
                        }
                        className={cn(
                          "inline-flex items-center gap-1 uppercase",
                          sort.key === c.key && "text-foreground",
                        )}
                      >
                        {c.label.startsWith("ai.") ? t(c.label) : c.label}
                        {sort.key === c.key &&
                          (sort.desc ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUp className="h-3 w-3" />
                          ))}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.name} className="border-b border-border/60">
                    <td className="max-w-[220px] truncate py-2 pr-3 font-semibold text-foreground">
                      {c.name}
                    </td>
                    {COLS.map((col) => {
                      const v = value(c, col.key);
                      return (
                        <td key={col.key} className="py-2 pr-3 text-right tabular-nums">
                          {col.key === "qualRate"
                            ? pct(v)
                            : col.key === "roas"
                              ? v != null
                                ? `${v}×`
                                : "—"
                              : col.money
                                ? money(v)
                                : num(v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      {advice.length > 0 && (
        <SectionCard
          icon={Lightbulb}
          tone="emerald"
          title={t("ai.cAdvice")}
          description={t("ai.cAdviceDesc")}
        >
          <ul className="space-y-2 text-[13.5px] text-foreground">
            {advice.map((a, i) => (
              <li key={i}>
                <KindTag kind="advice" label={t("ai.advice")} />
                {t(a.key, a.vars)}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

/** Recommendations from the numbers only: move budget, fix forms, stop. */
function adviceOf(m: Metrics): { key: string; vars: Record<string, string | number> }[] {
  const out: { key: string; vars: Record<string, string | number> }[] = [];
  const priced = m.campaigns.filter((c) => c.cpql != null && c.qualified >= 3);
  if (priced.length >= 2) {
    const sorted = [...priced].sort((a, b) => a.cpql! - b.cpql!);
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;
    if (worst.cpql! > best.cpql! * 1.5)
      out.push({
        key: "ai.adv.move",
        vars: {
          from: worst.name,
          to: best.name,
          x: Math.round((worst.cpql! / best.cpql!) * 10) / 10,
        },
      });
  }
  for (const c of m.campaigns) {
    const bad = c.reasons.wrong_number + c.reasons.no_number;
    if (c.leads >= 10 && bad / c.leads >= 0.25)
      out.push({
        key: "ai.adv.form",
        vars: { name: c.name, pct: Math.round((bad / c.leads) * 100) },
      });
    if ((c.spend ?? 0) > 0 && c.leads >= 10 && c.qualified === 0)
      out.push({ key: "ai.adv.stop", vars: { name: c.name, n: c.leads } });
  }
  return out.slice(0, 6);
}
