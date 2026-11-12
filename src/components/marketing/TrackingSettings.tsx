import { useEffect, useState } from "react";
import { Camera, Loader2, RotateCcw, Send, Timer } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  CHECK_EVERY_OPTIONS,
  DEFAULT_MARKETING_RULES,
  QUICK_LEAVE_OPTIONS,
  RANGE_OPTIONS,
  SHOT_EVERY_OPTIONS,
  STATS_EVERY_OPTIONS,
  type MarketingRules,
} from "@/lib/marketing-rules";
import { useMarketingRules, useSaveMarketingRules } from "@/hooks/use-crm-data";

// Marketing -> Sozlash -> Kuzatuv: how often a live stream is pictured as
// proof (and whether YouTube's real frame is cut), how often channels are
// re-read, whether the Telegram account reads the recent joins / leaves,
// what counts as "leaving quickly" and the period channel pages open with.

export function TrackingSettings() {
  const { t } = useI18n();
  const saved = useMarketingRules();
  const save = useSaveMarketingRules();
  const [d, setD] = useState<MarketingRules>(saved);
  useEffect(() => setD(saved), [saved]);
  const dirty = JSON.stringify(d) !== JSON.stringify(saved);
  const shots = (patch: Partial<MarketingRules["shots"]>) =>
    setD((x) => ({ ...x, shots: { ...x.shots, ...patch } }));
  const ch = (patch: Partial<MarketingRules["channels"]>) =>
    setD((x) => ({ ...x, channels: { ...x.channels, ...patch } }));
  const mins = (n: number) =>
    n < 60 ? t("mkt.rules.min", { n }) : t("mkt.rules.hours", { n: n / 60 });
  const hrs = (n: number) =>
    n < 24 ? t("mkt.rules.hours", { n }) : t("mkt.rules.days", { n: n / 24 });

  async function submit() {
    try {
      await save.mutateAsync(d);
      toast.success(t("mkt.rules.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "migration_pending"
          ? t("mkt.migrationPending")
          : describeError(err, t("mkt.rules.saveFailed")),
      );
    }
  }

  const perHour = d.shots.enabled ? Math.round(60 / d.shots.everyMin) : 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={Camera}
          tone="rose"
          title={t("mkt.rules.shotsTitle")}
          description={t("mkt.rules.shotsDesc")}
        >
          <Rows>
            <Row title={t("mkt.rules.shotsOn")} desc={t("mkt.rules.shotsOnDesc")}>
              <Switch checked={d.shots.enabled} onCheckedChange={(v) => shots({ enabled: v })} />
            </Row>
            <Row
              title={t("mkt.rules.every")}
              desc={
                d.shots.enabled
                  ? t("mkt.rules.everyDesc", { n: perHour, h: perHour * 2 })
                  : t("mkt.rules.shotsOff")
              }
              stack
              disabled={!d.shots.enabled}
            >
              <Choice
                value={d.shots.everyMin}
                options={SHOT_EVERY_OPTIONS}
                label={mins}
                onChange={(v) => shots({ everyMin: v })}
              />
            </Row>
            <Row
              title={t("mkt.rules.ytFrame")}
              desc={d.shots.youtubeFrame ? t("mkt.rules.ytFrameOn") : t("mkt.rules.ytFrameOff")}
              disabled={!d.shots.enabled}
            >
              <Switch
                checked={d.shots.youtubeFrame}
                onCheckedChange={(v) => shots({ youtubeFrame: v })}
                disabled={!d.shots.enabled}
              />
            </Row>
          </Rows>
        </SectionCard>

        <SectionCard
          icon={Send}
          tone="sky"
          title={t("mkt.rules.chTitle")}
          description={t("mkt.rules.chDesc")}
        >
          <Rows>
            <Row title={t("mkt.rules.check")} desc={t("mkt.rules.checkDesc")} stack>
              <Choice
                value={d.channels.checkEveryMin}
                options={CHECK_EVERY_OPTIONS}
                label={mins}
                onChange={(v) => ch({ checkEveryMin: v })}
              />
            </Row>
            <Row title={t("mkt.rules.stats")} desc={t("mkt.rules.statsDesc")} stack>
              <Choice
                value={d.channels.statsEveryH}
                options={STATS_EVERY_OPTIONS}
                label={hrs}
                onChange={(v) => ch({ statsEveryH: v })}
              />
            </Row>
            <Row title={t("mkt.rules.recent")} desc={t("mkt.rules.recentDesc")}>
              <Switch
                checked={d.channels.recentActions}
                onCheckedChange={(v) => ch({ recentActions: v })}
              />
            </Row>
          </Rows>
        </SectionCard>
      </div>

      <SectionCard
        icon={Timer}
        tone="amber"
        title={t("mkt.rules.calcTitle")}
        description={t("mkt.rules.calcDesc")}
      >
        <Rows>
          <Row
            title={t("mkt.rules.quick")}
            desc={t("mkt.rules.quickDesc", { h: hrs(d.channels.quickLeaveH) })}
            stack
          >
            <Choice
              value={d.channels.quickLeaveH}
              options={QUICK_LEAVE_OPTIONS}
              label={hrs}
              onChange={(v) => ch({ quickLeaveH: v })}
            />
          </Row>
          <Row title={t("mkt.rules.range")} desc={t("mkt.rules.rangeDesc")} stack>
            <Choice
              value={d.channels.defaultRange}
              options={RANGE_OPTIONS}
              label={(n) => t("mkt.ch.days", { n })}
              onChange={(v) => ch({ defaultRange: v })}
            />
          </Row>
        </Rows>
      </SectionCard>

      <div
        className={cn(
          "flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-border bg-card px-4 py-3",
          // Only while something is unsaved does the bar follow the scroll.
          dirty && "sticky bottom-4 z-10 bg-card/95 shadow-lg backdrop-blur",
        )}
      >
        <p className="mr-auto text-[13px] text-muted-foreground">
          {dirty ? t("mkt.rules.unsaved") : t("mkt.rules.allSaved")}
        </p>
        <Button
          variant="outline"
          onClick={() => setD(DEFAULT_MARKETING_RULES)}
          disabled={JSON.stringify(d) === JSON.stringify(DEFAULT_MARKETING_RULES)}
        >
          <RotateCcw className="h-4 w-4" />
          {t("mkt.rules.defaults")}
        </Button>
        <Button onClick={() => void submit()} disabled={!dirty || save.isPending}>
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {children}
    </div>
  );
}

function Row({
  title,
  desc,
  children,
  stack = false,
  disabled = false,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
  stack?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 px-4 py-3.5",
        stack ? "flex-col" : "items-center justify-between",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
      </div>
      <div className={cn(stack ? "overflow-x-auto" : "shrink-0")}>{children}</div>
    </div>
  );
}

function Choice<N extends number>({
  value,
  options,
  label,
  onChange,
}: {
  value: number;
  options: readonly N[];
  label: (n: N) => string;
  onChange: (v: N) => void;
}) {
  return (
    <Segmented
      value={String(value)}
      onChange={(v) => onChange(Number(v) as N)}
      options={options.map((o) => ({ value: String(o), label: label(o) }))}
    />
  );
}
