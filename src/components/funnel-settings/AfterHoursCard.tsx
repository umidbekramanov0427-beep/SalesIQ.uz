import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock3, Loader2, Moon } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import {
  useOrgGeneralSettings,
  useOrgWorkSchedule,
  useUpdateOrgGeneralSettings,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";

// Voronka sozlamalari → Avto-javoblar: the message a client gets when they
// write outside the company's working hours (lib/auto-reply.server.ts
// sends it on Telegram and Instagram, once per 12 hours per lead).

const DAY_KEYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AfterHoursCard() {
  const { t } = useI18n();
  const { data: general } = useOrgGeneralSettings();
  const { data: schedule } = useOrgWorkSchedule();
  const update = useUpdateOrgGeneralSettings();
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded || general === undefined) return;
    setEnabled(!!general?.after_hours_enabled);
    setText(general?.after_hours_text ?? t("afterHours.defaultText"));
    setLoaded(true);
  }, [general, loaded, t]);

  const days = (schedule?.work_days ?? [1, 2, 3, 4, 5])
    .map((d) => t(`settings.schedule.day${DAY_KEYS[d]}`))
    .join(", ");
  const hours = `${(schedule?.start_time ?? "09:00").slice(0, 5)}–${(schedule?.end_time ?? "18:00").slice(0, 5)}`;
  const dirty =
    loaded &&
    (enabled !== !!general?.after_hours_enabled ||
      text.trim() !== (general?.after_hours_text ?? t("afterHours.defaultText")));

  function save() {
    update.mutate(
      { after_hours_enabled: enabled, after_hours_text: text.trim() || null },
      {
        onSuccess: () => toast.success(t("afterHours.saved")),
        onError: (e) => toast.error(describeError(e, t("fs.saveFailedMigration"))),
      },
    );
  }

  return (
    <SectionCard
      icon={Moon}
      tone="violet"
      title={t("afterHours.title")}
      description={t("afterHours.desc")}
      actions={
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label={t("afterHours.title")} />
      }
    >
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3.5 py-2.5 text-[13px] text-muted-foreground">
        <Clock3 className="h-4 w-4 shrink-0" />
        <span>
          {t("afterHours.schedule")}: <b className="text-foreground">{days}</b> ·{" "}
          <b className="tabular-nums text-foreground">{hours}</b>
        </span>
        <Link
          to="/settings"
          search={{ section: "workSchedule" } as never}
          className="ml-auto text-[13px] font-semibold text-[var(--primary-ink)] hover:underline"
        >
          {t("afterHours.editSchedule")}
        </Link>
      </div>
      <label className="mt-3 block">
        <span className="text-[13px] font-medium text-muted-foreground">
          {t("afterHours.textLabel")}
        </span>
        <textarea
          rows={3}
          value={text}
          disabled={!enabled}
          maxLength={1000}
          onChange={(e) => setText(e.target.value)}
          className="mt-1.5 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[12px] text-subtle">{t("afterHours.note")}</p>
        <button
          type="button"
          disabled={!dirty || update.isPending}
          onClick={save}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("rbac.save")}
        </button>
      </div>
    </SectionCard>
  );
}
