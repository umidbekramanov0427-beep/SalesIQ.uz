import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { channelGrowth } from "@/lib/webinars";
import {
  useChannelDays,
  useChannelMutations,
  useChannels,
  type ChannelRow,
} from "@/hooks/use-crm-data";

// Marketing paneli -> Kanallar: the company's public Telegram channels (a
// webinar's channel, the main channel...). The platform's bot reads the
// subscriber count every hour; here: how many there are, how many joined
// each day, the best day.

export const Route = createFileRoute("/marketing/channels")({
  head: () => ({ meta: [{ title: "Kanallar — SalesIQ Marketing" }] }),
  component: ChannelsPage,
});

const RANGES = [7, 30, 90] as const;
const dayStr = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

function ChannelsPage() {
  const { t } = useI18n();
  const q = useChannels();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const fromDay = dayStr(new Date(Date.now() - (range - 1) * 86_400_000));
  const days = useChannelDays(fromDay);
  const { add } = useChannelMutations();
  const [input, setInput] = useState("");

  async function connect() {
    if (!input.trim()) return;
    try {
      const r = (await add.mutateAsync(input.trim())) as { title?: string; members?: number };
      toast.success(t("mkt.ch.added", { title: r.title ?? "", n: r.members ?? 0 }));
      setInput("");
    } catch (err) {
      toast.error(describeError(err, t("mkt.ch.addFailed")));
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={Send}
        tone="sky"
        title={t("mkt.nav.channels")}
        description={t("mkt.ch.desc")}
      />
      {q.data?.missing && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          {t("mkt.migrationPending")}
        </p>
      )}
      <SectionCard
        icon={Plus}
        tone="sky"
        title={t("mkt.ch.addTitle")}
        description={t("mkt.ch.addDesc")}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="@kanal_nomi yoki https://t.me/kanal_nomi"
            className="h-10 min-w-[260px] flex-1 rounded-xl border border-border bg-input px-3 text-[14px] outline-none focus:border-primary"
          />
          <Button type="submit" disabled={add.isPending || !input.trim()}>
            {add.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("mkt.ch.connect")}
          </Button>
        </form>
      </SectionCard>

      <div className="flex items-center justify-between gap-3">
        <p className="console-caption">{t("mkt.ch.list")}</p>
        <Segmented
          value={String(range)}
          onChange={(v) => setRange(Number(v) as (typeof RANGES)[number])}
          options={RANGES.map((r) => ({ value: String(r), label: t("mkt.ch.days", { n: r }) }))}
        />
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (q.data?.rows ?? []).length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("mkt.ch.empty")}</p>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {(q.data?.rows ?? []).map((c) => (
            <ChannelCard
              key={c.id}
              c={c}
              days={(days.data ?? []).filter((d) => d.channel_id === c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ChannelCard({ c, days }: { c: ChannelRow; days: { day: string; members: number }[] }) {
  const { t } = useI18n();
  const { refresh, remove } = useChannelMutations();
  const g = useMemo(() => channelGrowth(days), [days]);
  const deltas = g.days.filter((d) => d.delta != null);
  const maxAbs = Math.max(1, ...deltas.map((d) => Math.abs(d.delta ?? 0)));
  return (
    <SectionCard
      icon={Send}
      tone="sky"
      title={c.title || `@${c.username}`}
      description={`@${c.username}`}
      actions={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              refresh.mutate(c.id, {
                onError: (e) => toast.error(describeError(e, t("mkt.ch.addFailed"))),
              })
            }
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("mkt.ch.refresh")}
          >
            <RefreshCw className={cn("h-4 w-4", refresh.isPending && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => window.confirm(t("mkt.ch.removeConfirm")) && remove.mutate(c.id)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title={t("common.delete")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
        <Stat
          icon={Users}
          label={t("mkt.ch.members")}
          value={c.members?.toLocaleString("ru-RU") ?? "—"}
        />
        <Stat
          icon={TrendingUp}
          label={t("mkt.ch.growth")}
          value={`${g.growth > 0 ? "+" : ""}${g.growth.toLocaleString("ru-RU")}`}
          tone={
            g.growth > 0
              ? "text-emerald-700 dark:text-emerald-300"
              : g.growth < 0
                ? "text-red-700 dark:text-red-300"
                : undefined
          }
        />
        <Stat
          icon={TrendingUp}
          label={t("mkt.ch.bestDay")}
          value={g.best?.delta != null ? `+${g.best.delta}` : "—"}
          sub={g.best ? g.best.day.slice(5).split("-").reverse().join(".") : undefined}
        />
      </div>
      {/* Joined (up) or left (down) each day. */}
      {deltas.length > 0 ? (
        <div className="mt-4">
          <div className="relative flex h-[110px] items-center gap-[3px]">
            <span className="absolute inset-x-0 top-1/2 border-t border-border" />
            {deltas.map((d) => {
              const h = (Math.abs(d.delta ?? 0) / maxAbs) * 50;
              const up = (d.delta ?? 0) >= 0;
              return (
                <div
                  key={d.day}
                  className="group relative flex h-full flex-1 flex-col justify-center"
                >
                  <span className="pointer-events-none absolute left-1/2 top-0 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11.5px] text-foreground shadow-sm group-hover:block">
                    {d.day}: {up ? "+" : ""}
                    {d.delta} · {d.members.toLocaleString("ru-RU")}
                  </span>
                  <div className="flex h-1/2 items-end">
                    {up && (
                      <div
                        className="w-full rounded-t bg-sky-500/80"
                        style={{ height: `${h * 2}%`, minHeight: d.delta ? 2 : 0 }}
                      />
                    )}
                  </div>
                  <div className="flex h-1/2 items-start">
                    {!up && (
                      <div
                        className="w-full rounded-b bg-rose-400/80"
                        style={{ height: `${h * 2}%` }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">{t("mkt.ch.chartHint")}</p>
        </div>
      ) : (
        <p className="mt-4 text-[12.5px] text-muted-foreground">{t("mkt.ch.noHistory")}</p>
      )}
      {c.last_error && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("mkt.ch.error")}: {c.last_error}
        </p>
      )}
    </SectionCard>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string | undefined;
  tone?: string | undefined;
}) {
  return (
    <div className="bg-card px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={cn("mt-1 font-mono text-[18px] font-bold tabular-nums text-foreground", tone)}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
