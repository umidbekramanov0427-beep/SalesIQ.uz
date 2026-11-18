import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { OwnerPanel } from "@/components/owner/OwnerPage";
import { apiFetch } from "@/lib/api";
import {
  DEFAULT_MEETING_SETTINGS,
  freeSlots,
  tashkentTime,
  type MeetingSettings,
} from "@/lib/company-leads";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner -> Sozlamalar -> Suhbat vaqtlari: the days, hours and length of the
// calls companies book at sign-up (/applications/slots offers them).
const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const field =
  "h-10 rounded-xl border border-border bg-card px-3 text-[13.5px] text-foreground outline-none focus:border-primary";

export function MeetingSettingsCard() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["owner_meeting_settings"],
    queryFn: async (): Promise<{ ready: boolean; settings: MeetingSettings }> => {
      const res = await apiFetch("/platform/meeting-settings");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const [s, setS] = useState<MeetingSettings>(DEFAULT_MEETING_SETTINGS);
  useEffect(() => {
    if (data) setS(data.settings);
  }, [data]);
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/platform/meeting-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: s }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      void qc.invalidateQueries({ queryKey: ["owner_meeting_settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // How the sign-up page will look with these settings: the next day's times.
  const preview = freeSlots(s, [], new Date())[0];
  const dirty = !!data && JSON.stringify(data.settings) !== JSON.stringify(s);

  return (
    <OwnerPanel title={t("meet.title")} info={t("meet.info")} icon={CalendarClock} tone="amber">
      {data && !data.ready && (
        <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-800 dark:text-amber-200">
          {t("lead.notReady")}
        </p>
      )}
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground">{t("meet.days")}</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => {
              const on = s.days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setS({
                      ...s,
                      days: on ? s.days.filter((x) => x !== d) : [...s.days, d].sort(),
                    })
                  }
                  className={cn(
                    "h-10 w-14 rounded-xl border text-[13px] font-semibold",
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`meet.d${d}`)}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-foreground">
              {t("meet.from")}
            </span>
            <input
              type="time"
              value={s.from}
              onChange={(e) => setS({ ...s, from: e.target.value })}
              className={cn(field, "w-full")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-foreground">
              {t("meet.to")}
            </span>
            <input
              type="time"
              value={s.to}
              onChange={(e) => setS({ ...s, to: e.target.value })}
              className={cn(field, "w-full")}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-foreground">
              {t("meet.minutes")}
            </span>
            <select
              value={s.minutes}
              onChange={(e) => setS({ ...s, minutes: Number(e.target.value) })}
              className={cn(field, "w-full")}
            >
              {[15, 20, 30, 45, 60, 90].map((m) => (
                <option key={m} value={m}>
                  {t("meet.min", { n: m })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-foreground">
              {t("meet.horizon")}
            </span>
            <select
              value={s.horizonDays}
              onChange={(e) => setS({ ...s, horizonDays: Number(e.target.value) })}
              className={cn(field, "w-full")}
            >
              {[3, 5, 7, 14, 21, 30].map((d) => (
                <option key={d} value={d}>
                  {t("meet.daysN", { n: d })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-foreground">
              {t("meet.lead")}
            </span>
            <select
              value={s.leadHours}
              onChange={(e) => setS({ ...s, leadHours: Number(e.target.value) })}
              className={cn(field, "w-full")}
            >
              {[0, 1, 2, 4, 12, 24].map((h) => (
                <option key={h} value={h}>
                  {t("meet.hoursN", { n: h })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="mb-2 text-[12px] font-semibold text-muted-foreground">
            {t("meet.preview")}
          </p>
          {preview ? (
            <div className="flex flex-wrap gap-1.5">
              <span className="mr-1 self-center text-[12.5px] font-semibold text-foreground">
                {preview.day}
              </span>
              {preview.slots.slice(0, 16).map((x) => (
                <span
                  key={x}
                  className="rounded-lg border border-border bg-card px-2 py-1 text-[12px] font-semibold tabular-nums"
                >
                  {tashkentTime(x)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-rose-600">{t("meet.noSlots")}</p>
          )}
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!dirty || save.isPending || !s.days.length}
            onClick={() => save.mutate()}
            className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[13.5px] font-semibold disabled:opacity-50"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </button>
        </div>
      </div>
    </OwnerPanel>
  );
}
