import { ListChecks, Loader2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { marketingAiPost, useMarketingAiQuery, useProfilesRaw } from "@/hooks/use-crm-data";
import type { AiRec } from "@/lib/marketing-ai/types";
import { PriorityChip, tashkentDay } from "@/components/marketing/ai/shared";

// AI tahlilchi -> Tavsiyalar: the recommendations being worked on -- who
// owns each, its status (Yangi / Jarayonda / Bajarildi / Rad etildi), the
// tracked figure when it was taken and 14 days after it was done.

const STATUSES = ["new", "in_progress", "done", "rejected"] as const;
const RATE_KEYS = new Set([
  "qual_rate",
  "pickup_rate",
  "bad_number_rate",
  "attendance",
  "drop_from_peak",
  "lead_to_advance",
  "advance_to_full",
]);
const LOWER_BETTER = new Set(["bad_number_rate", "drop_from_peak", "cpl", "cpql", "cac"]);

function show(key: string | null, v: number | null) {
  if (v == null) return "—";
  if (key && RATE_KEYS.has(key)) return `${Math.round(v * 1000) / 10}%`;
  if (key === "roas") return `${Math.round(v * 100) / 100}×`;
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function AiRecsTab() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useMarketingAiQuery<{ recs: AiRec[] }>("recs", { action: "recs" });
  const { data: people } = useProfilesRaw();
  const act = async (body: Record<string, unknown>) => {
    try {
      await marketingAiPost(body);
      await qc.invalidateQueries({ queryKey: ["marketing_ai_post"] });
    } catch (e) {
      toast.error(describeError(e, t("ai.failed")));
    }
  };
  const recs = q.data?.recs ?? [];
  return (
    <SectionCard
      icon={ListChecks}
      tone="emerald"
      title={t("ai.recs")}
      description={t("ai.recsDesc")}
    >
      {q.isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : q.error ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">
          {String(q.error.message)}
        </p>
      ) : recs.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-muted-foreground">{t("ai.noRecs")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">{t("ai.r.title")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ai.r.date")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ai.r.priority")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ai.r.owner")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ai.r.status")}</th>
                <th className="py-2 pr-3 font-semibold">{t("ai.r.done")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("ai.r.before")}</th>
                <th className="py-2 pr-3 text-right font-semibold">{t("ai.r.after")}</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {recs.map((r) => {
                const better =
                  r.metric_before != null && r.metric_after != null && r.metric_key
                    ? LOWER_BETTER.has(r.metric_key)
                      ? r.metric_after < r.metric_before
                      : r.metric_after > r.metric_before
                    : null;
                return (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="max-w-[320px] py-2 pr-3">
                      <p className="font-semibold text-foreground">{r.title}</p>
                      {r.problem && (
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{r.problem}</p>
                      )}
                      {r.metric_key && (
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {t(`ai.metric.${r.metric_key}`)}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {tashkentDay(r.created_at)}
                    </td>
                    <td className="py-2 pr-3">
                      <PriorityChip p={r.priority} label={t(`ai.p.${r.priority}`)} />
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={r.assignee_id ?? ""}
                        onChange={(e) =>
                          void act({
                            action: "recUpdate",
                            id: r.id,
                            assigneeId: e.target.value || null,
                          })
                        }
                        className="h-8 max-w-[160px] rounded-md border border-border bg-card px-1.5 text-[12.5px]"
                      >
                        <option value="">—</option>
                        {(people ?? []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.full_name || p.email}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={r.status}
                        onChange={(e) =>
                          void act({ action: "recUpdate", id: r.id, status: e.target.value })
                        }
                        className={cn(
                          "h-8 rounded-md border border-border bg-card px-1.5 text-[12.5px] font-semibold",
                          r.status === "done" && "text-emerald-700 dark:text-emerald-300",
                          r.status === "in_progress" && "text-sky-700 dark:text-sky-300",
                          r.status === "rejected" && "text-muted-foreground",
                        )}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {t(`ai.status.${s}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                      {r.done_at ? tashkentDay(r.done_at) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {show(r.metric_key, r.metric_before)}
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-3 text-right font-semibold tabular-nums",
                        better === true && "text-emerald-600 dark:text-emerald-300",
                        better === false && "text-rose-600 dark:text-rose-300",
                      )}
                    >
                      {r.metric_after != null
                        ? show(r.metric_key, r.metric_after)
                        : r.status === "done"
                          ? t("ai.r.measuring")
                          : "—"}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t("ai.r.deleteAsk")))
                            void act({ action: "recDelete", id: r.id });
                        }}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
