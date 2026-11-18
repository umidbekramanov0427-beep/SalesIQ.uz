import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, CircleDashed, PhoneCall, Sparkles, Video, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { NOT_QUAL_REASONS, qualOf, type NotQualReason } from "@/lib/marketing-ai/qual";

// The lead card's "Kval" block: is this lead qualified for marketing? It
// picked up the phone (from the calls, by itself) and watched the webinar
// (the manager taps Ha / Yo'q; the AI also marks it from a call). The
// verdict is worked out; the manager can set it by hand with a reason
// (wrong number, no number, did not pick up, did not watch, other) or put
// it back to automatic. Hidden until the database has the columns.

type QualRow = {
  webinar_watched: boolean | null;
  webinar_watched_source: string | null;
  qual_status: "qualified" | "not_qualified" | null;
  not_qual_reason: NotQualReason | null;
};

export function LeadQualBlock({ leadId, phone }: { leadId: string; phone: string | null }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["lead_qual", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("webinar_watched, webinar_watched_source, qual_status, not_qual_reason")
        .eq("id", leadId)
        .maybeSingle();
      if (error) return null; // columns missing before the migration
      const [answered, unanswered] = await Promise.all([
        supabase
          .from("pbx_calls")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", leadId)
          .gt("duration_seconds", 0),
        supabase
          .from("pbx_calls")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", leadId)
          .eq("duration_seconds", 0)
          .eq("direction", "outgoing"),
      ]);
      return {
        row: data as QualRow | null,
        answered: answered.count ?? 0,
        unanswered: unanswered.count ?? 0,
      };
    },
  });
  if (!q.data?.row) return null;
  const { row, answered, unanswered } = q.data;
  const v = qualOf({
    phone,
    answeredCalls: answered,
    unansweredCalls: unanswered,
    watched: row.webinar_watched,
    manualStatus: row.qual_status,
    manualReason: row.not_qual_reason,
  });

  async function save(patch: Partial<QualRow> & { webinar_watched_at?: string | null }) {
    const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
    if (error) toast.error(describeError(error, t("qual.saveFailed")));
    void qc.invalidateQueries({ queryKey: ["lead_qual", leadId] });
  }

  const chip =
    v.status === "qualified"
      ? {
          icon: BadgeCheck,
          cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
          text: t("qual.yes"),
        }
      : v.status === "not_qualified"
        ? {
            icon: XCircle,
            cls: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
            text: `${t("qual.no")} · ${t(`qual.reason.${v.reason ?? "other"}`)}`,
          }
        : { icon: CircleDashed, cls: "bg-muted text-muted-foreground", text: t("qual.pending") };
  const ChipIcon = chip.icon;

  return (
    <div className="mt-3 rounded-lg border border-[var(--amo-group-line)] px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wide text-foreground">
          {t("qual.title")}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
            chip.cls,
          )}
        >
          <ChipIcon className="h-3.5 w-3.5" />
          {chip.text}
          {v.manual && <span className="opacity-70">· {t("qual.manual")}</span>}
        </span>
      </div>
      <div className="mt-2 space-y-1.5 text-[12.5px]">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">{t("qual.pickedUp")}</span>
          <span
            className={cn(
              "font-semibold",
              answered ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground",
            )}
          >
            {answered
              ? t("qual.answeredN", { n: answered })
              : unanswered
                ? t("qual.noAnswerN", { n: unanswered })
                : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Video className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="flex-1 text-muted-foreground">
            {t("qual.watched")}
            {row.webinar_watched_source === "ai" && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-violet-600 dark:text-violet-300">
                <Sparkles className="h-3 w-3" /> AI
              </span>
            )}
          </span>
          <span className="ctl-track inline-flex rounded-lg p-0.5">
            {([true, false] as const).map((val) => (
              <button
                key={String(val)}
                type="button"
                aria-selected={row.webinar_watched === val}
                onClick={() =>
                  void save({
                    webinar_watched: row.webinar_watched === val ? null : val,
                    webinar_watched_source: row.webinar_watched === val ? null : "manager",
                    webinar_watched_at:
                      row.webinar_watched === val ? null : new Date().toISOString(),
                  })
                }
                className="ctl-tab h-6 rounded-md px-2.5 text-[12px] font-semibold"
              >
                {val ? t("qual.ha") : t("qual.yoq")}
              </button>
            ))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex-1 text-muted-foreground">{t("qual.verdict")}</span>
          <select
            value={
              row.qual_status === "qualified"
                ? "qualified"
                : row.qual_status === "not_qualified"
                  ? (row.not_qual_reason ?? "other")
                  : ""
            }
            onChange={(e) => {
              const val = e.target.value;
              if (!val) void save({ qual_status: null, not_qual_reason: null });
              else if (val === "qualified")
                void save({ qual_status: "qualified", not_qual_reason: null });
              else
                void save({ qual_status: "not_qualified", not_qual_reason: val as NotQualReason });
            }}
            className="h-7 max-w-[170px] rounded-md border border-border bg-card px-1.5 text-[12px]"
          >
            <option value="">{t("qual.auto")}</option>
            <option value="qualified">{t("qual.yes")}</option>
            {NOT_QUAL_REASONS.map((r) => (
              <option key={r} value={r}>
                {t("qual.no")}: {t(`qual.reason.${r}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
