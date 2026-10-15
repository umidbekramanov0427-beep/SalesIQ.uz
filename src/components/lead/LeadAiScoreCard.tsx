import { useQueryClient } from "@tanstack/react-query";
import { Flame, Lightbulb, Loader2, RefreshCw, Snowflake, Sparkles, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import type { CrmLeadView } from "@/hooks/use-crm-data";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, timeAgo } from "@/lib/utils";

const LOOK = {
  Hot: {
    icon: Flame,
    bar: "bg-orange-500",
    chip: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  },
  VeryHot: { icon: Flame, bar: "bg-red-500", chip: "bg-red-500/12 text-red-700 dark:text-red-300" },
  Warm: {
    icon: Sun,
    bar: "bg-amber-500",
    chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  },
  Cold: {
    icon: Snowflake,
    bar: "bg-sky-500",
    chip: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
} as const;

// The lead's AI score: Hot / Warm / Cold with the 0-100 bar, why (from the
// chat or the last analysed call) and the one thing to do next. "Qayta
// baholash" scores it from the chat right now.
export function LeadAiScoreCard({ lead }: { lead: CrmLeadView }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const look = LOOK[lead.temperature as keyof typeof LOOK] ?? LOOK.Warm;
  const Icon = look.icon;
  const reasons = (lead.aiScoreReason ?? "").split("\n").filter(Boolean);

  async function rescore() {
    setBusy(true);
    try {
      const res = await apiFetch("/lead-score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId: lead.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.error === "MIGRATION_PENDING" ? t("score.migrationPending") : json.error,
        );
      }
      await qc.invalidateQueries({ queryKey: ["lead_detail", lead.id] });
      void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
      toast.success(json.source === "ai" ? t("score.doneAi") : t("score.doneRules"));
    } catch (err) {
      toast.error(describeError(err, t("score.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      icon={Sparkles}
      tone="violet"
      title={t("score.title")}
      description={
        lead.aiScoredAt ? t("score.updated", { ago: timeAgo(lead.aiScoredAt) }) : t("score.desc")
      }
      actions={
        <button
          type="button"
          onClick={() => void rescore()}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("score.rescore")}
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-base font-bold",
            look.chip,
          )}
        >
          <Icon className="h-5 w-5" /> {t(`score.temp.${lead.temperature}`)}
        </span>
        <div className="min-w-[200px] flex-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">{t("score.chance")}</span>
            <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
              {lead.score}
              <span className="text-sm text-muted-foreground">/100</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-[width] duration-500", look.bar)}
              style={{ width: `${Math.max(3, Math.min(100, lead.score))}%` }}
            />
          </div>
        </div>
      </div>

      {reasons.length > 0 ? (
        <ul className="mt-4 space-y-1.5">
          {reasons.map((r) => (
            <li key={r} className="flex gap-2 text-sm text-foreground/90">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
              {r}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">{t("score.noReasons")}</p>
      )}

      {lead.aiNextAction && (
        <div className="mt-4 flex gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-3.5 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-semibold text-foreground">{t("score.next")}</p>
            <p className="text-foreground/85">{lead.aiNextAction}</p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
