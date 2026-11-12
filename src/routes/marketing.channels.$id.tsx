import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarDays,
  Clock,
  Download,
  Eye,
  Globe,
  Languages,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  TrendingUp,
  Timer,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import { PROJECT_DOT } from "@/lib/marketing-projects";
import { RANGE_OPTIONS } from "@/lib/marketing-rules";
import type { ChannelAnalytics } from "@/lib/channel-analytics";
import {
  useChannelAnalytics,
  useChannelMutations,
  useChannels,
  useMarketingRules,
} from "@/hooks/use-crm-data";
import { useMarketingFilters } from "@/components/marketing/MarketingFilters";
import { ChannelDialog } from "@/components/marketing/ChannelDialog";
import {
  DailyFlowChart,
  HourBars,
  MembersChart,
  ShareBars,
  WeekHeatmap,
  hourLabel,
} from "@/components/marketing/ChannelCharts";

// Marketing paneli -> Kanallar -> one channel: how many joined and left over
// the period and on each day, at what hours and on which weekdays people
// join and leave, how soon newcomers leave, which invite links bring people
// who stay, and -- when the company's Telegram account is the channel's
// admin -- Telegram's own statistics (sources, reading hours, languages,
// notifications). The banner says what is missing for full figures.

export const Route = createFileRoute("/marketing/channels/$id")({
  head: () => ({ meta: [{ title: "Kanal analitikasi — SalesIQ Marketing" }] }),
  component: ChannelPage,
});

const dayStr = (ms: number) => new Date(ms + 5 * 3_600_000).toISOString().slice(0, 10);
const nf = (n: number) => n.toLocaleString("ru-RU");
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${nf(Math.abs(n))}`;
const dm = (day: string) => day.slice(5).split("-").reverse().join(".");

const SOURCE_KEYS: Record<string, string> = {
  url: "url",
  search: "search",
  channels: "channels",
  groups: "groups",
  pm: "pm",
  ads: "ads",
  other: "other",
  "similar channels": "similar",
  "channel recommendations": "similar",
};

function ChannelPage() {
  const { id } = Route.useParams();
  const { t } = useI18n();
  const rules = useMarketingRules();
  const f = useMarketingFilters();
  const channels = useChannels();
  const { refresh } = useChannelMutations();
  const [range, setRange] = useState<number>(rules.channels.defaultRange);
  useEffect(() => setRange(rules.channels.defaultRange), [rules.channels.defaultRange]);
  const [heatKind, setHeatKind] = useState<"joins" | "leaves">("joins");
  const [editing, setEditing] = useState(false);
  const to = dayStr(Date.now());
  const from = dayStr(Date.now() - (range - 1) * 86_400_000);
  const q = useChannelAnalytics(id, from, to);
  const c = channels.data?.rows.find((x) => x.id === id) ?? null;
  const project = c ? (f.projects.find((p) => p.id === c.project_id) ?? null) : null;
  const a = q.data?.analytics;
  const stats = q.data?.stats ?? null;
  const src = q.data?.source;

  function exportXlsx() {
    if (!a || !c) return;
    downloadXlsx(`kanal-${(c.username ?? c.id).slice(0, 30)}-${to}.xlsx`, [
      {
        name: t("mkt.ca.sheetDays"),
        rows: [
          [
            t("mkt.exp.day"),
            t("mkt.ch.members"),
            t("mkt.ca.joined"),
            t("mkt.ca.left"),
            t("mkt.ca.net"),
          ],
          ...a.days.map((d) => [d.day, d.members, d.joined, d.left, d.net]),
        ],
      },
      {
        name: t("mkt.ca.sheetHours"),
        rows: [
          [t("mkt.ca.hour"), t("mkt.ca.joined"), t("mkt.ca.left")],
          ...a.hours.joins.map((j, h) => [hourLabel(h), j, a.hours.leaves[h] ?? 0]),
        ],
      },
      {
        name: t("mkt.ca.sheetLinks"),
        rows: [
          [t("mkt.ca.link"), t("mkt.ca.joined"), t("mkt.ca.left"), t("mkt.ca.stayPct")],
          ...a.links.map((l) => [
            linkTitle(l, t),
            l.joined,
            l.left,
            l.joined ? Math.round(((l.joined - l.left) / l.joined) * 100) : null,
          ]),
        ],
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <Link
        to="/marketing/channels"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("mkt.nav.channels")}
      </Link>
      <PageHeader
        back={false}
        icon={Send}
        tone="sky"
        title={c?.title || (c?.username ? `@${c.username}` : t("mkt.ca.title"))}
        description={c ? (c.username ? `@${c.username}` : t("mkt.ch.private")) : t("mkt.ca.desc")}
        actions={
          <>
            <Button
              variant="outline"
              disabled={refresh.isPending}
              onClick={() =>
                refresh.mutate(id, {
                  onSuccess: () => void q.refetch(),
                  onError: (e) => toast.error(describeError(e, t("mkt.ch.addFailed"))),
                })
              }
            >
              <RefreshCw className={cn("h-4 w-4", refresh.isPending && "animate-spin")} />
              {t("mkt.ch.refresh")}
            </Button>
            <Button variant="outline" onClick={exportXlsx} disabled={!a}>
              <Download className="h-4 w-4" />
              Excel
            </Button>
            {c && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" />
                {t("mkt.p.edit")}
              </Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {project && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-[12.5px] font-semibold text-foreground">
              <span
                className={cn("h-2 w-2 rounded-full", PROJECT_DOT[project.color] ?? "bg-sky-500")}
              />
              {project.name}
            </span>
          )}
          {c && (
            <span className="rounded-lg border border-border bg-card px-2.5 py-1 text-[12.5px] font-semibold text-sky-700 dark:text-sky-300">
              {t(`mkt.ch.purpose.${c.purpose}`)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-1 text-[12.5px] text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {dm(from)} — {dm(to)}
          </span>
        </div>
        <Segmented
          value={String(range)}
          onChange={(v) => setRange(Number(v))}
          options={RANGE_OPTIONS.map((r) => ({
            value: String(r),
            label: t("mkt.ch.days", { n: r }),
          }))}
        />
      </div>

      {q.isLoading || !a ? (
        q.error ? (
          <p className="surface-card px-5 py-8 text-center text-[13.5px] text-muted-foreground">
            {describeError(q.error, t("mkt.ca.loadFailed"))}
          </p>
        ) : (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )
      ) : (
        <>
          <SourceBanner
            migrated={q.data!.migrated}
            botAdmin={src?.botAdmin ?? null}
            account={src?.account ?? null}
            statsError={src?.statsError ?? null}
            hasStats={!!stats}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              icon={Users}
              iconTone="violet"
              label={t("mkt.ch.members")}
              value={
                c?.members != null ? nf(c.members) : a.membersEnd != null ? nf(a.membersEnd) : "—"
              }
              {...(a.membersStart != null
                ? { hint: t("mkt.ca.atStart", { n: nf(a.membersStart) }) }
                : {})}
            />
            <StatCard
              icon={LogIn}
              iconTone="emerald"
              label={t("mkt.ca.joined")}
              value={`+${nf(a.joined)}`}
              {...(a.bestDay?.joined
                ? {
                    hint: t("mkt.ca.bestDayHint", {
                      d: dm(a.bestDay.day),
                      n: nf(a.bestDay.joined),
                    }),
                  }
                : {})}
            />
            <StatCard
              icon={LogOut}
              iconTone="rose"
              label={t("mkt.ca.left")}
              value={a.left ? `−${nf(a.left)}` : "0"}
              {...(a.worstDay?.left
                ? {
                    hint: t("mkt.ca.worstDayHint", {
                      d: dm(a.worstDay.day),
                      n: nf(a.worstDay.left),
                    }),
                  }
                : {})}
            />
            <StatCard
              icon={TrendingUp}
              iconTone={a.net >= 0 ? "emerald" : "rose"}
              label={t("mkt.ca.net")}
              value={signed(a.net)}
              hint={t("mkt.ca.perDay", {
                n: signed(Math.round((a.net / Math.max(1, a.days.length)) * 10) / 10),
              })}
            />
            <StatCard
              icon={AlertTriangle}
              iconTone="amber"
              label={t("mkt.ca.churn")}
              value={a.churnPct != null ? `${a.churnPct}%` : "—"}
              hint={t("mkt.ca.churnHint")}
            />
            <StatCard
              icon={Timer}
              iconTone="sky"
              label={t("mkt.ca.quick", { h: quickLabel(rules.channels.quickLeaveH, t) })}
              value={a.hasEvents ? nf(a.quick.inLimit) : "—"}
              hint={
                a.hasEvents && a.quick.joined
                  ? t("mkt.ca.quickHint", {
                      p: Math.round((a.quick.inLimit / a.quick.joined) * 100),
                    })
                  : t("mkt.ca.needsEvents")
              }
            />
          </div>

          <Insights a={a} quickH={rules.channels.quickLeaveH} />

          <SectionCard
            icon={TrendingUp}
            tone="emerald"
            title={t("mkt.ca.flowTitle")}
            description={t("mkt.ca.flowDesc")}
            actions={<Legend />}
          >
            <DailyFlowChart days={a.days} />
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard
              icon={Users}
              tone="violet"
              title={t("mkt.ca.membersTitle")}
              description={t("mkt.ca.membersDesc")}
            >
              <MembersChart days={a.days} />
            </SectionCard>
            <SectionCard
              icon={Clock}
              tone="sky"
              title={t("mkt.ca.hoursTitle")}
              description={
                a.hasEvents
                  ? t("mkt.ca.hoursDesc", {
                      j: a.peakJoinHour != null ? hourLabel(a.peakJoinHour) : "—",
                      l: a.peakLeaveHour != null ? hourLabel(a.peakLeaveHour) : "—",
                    })
                  : t("mkt.ca.needsEvents")
              }
              actions={<Legend />}
            >
              <HourBars joins={a.hours.joins} leaves={a.hours.leaves} />
            </SectionCard>
          </div>

          <SectionCard
            icon={CalendarDays}
            tone="amber"
            title={t("mkt.ca.heatTitle")}
            description={a.hasEvents ? t("mkt.ca.heatDesc") : t("mkt.ca.needsEvents")}
            actions={
              <Segmented
                value={heatKind}
                onChange={setHeatKind}
                options={[
                  { value: "joins", label: t("mkt.ca.joined") },
                  { value: "leaves", label: t("mkt.ca.left") },
                ]}
              />
            }
          >
            <WeekHeatmap data={a.heat[heatKind]} kind={heatKind} />
          </SectionCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <SectionCard
              icon={Timer}
              tone="rose"
              title={t("mkt.ca.retentionTitle")}
              description={t("mkt.ca.retentionDesc")}
            >
              {a.hasEvents && a.quick.joined ? (
                <Retention a={a} />
              ) : (
                <EmptyNote text={t("mkt.ca.needsEvents")} />
              )}
            </SectionCard>
            <SectionCard
              icon={Link2}
              tone="primary"
              title={t("mkt.ca.linksTitle")}
              description={t("mkt.ca.linksDesc")}
            >
              {a.links.length ? (
                <LinksTable links={a.links} />
              ) : (
                <EmptyNote text={t("mkt.ca.needsEvents")} />
              )}
            </SectionCard>
          </div>

          {stats && (
            <div className="grid gap-5 xl:grid-cols-3">
              <SectionCard
                icon={Globe}
                tone="sky"
                title={t("mkt.ca.sourcesTitle")}
                description={t("mkt.ca.sourcesDesc")}
              >
                {stats.sources.length ? (
                  <ShareBars
                    tone="bg-sky-500"
                    items={stats.sources.slice(0, 8).map((s) => {
                      const k = SOURCE_KEYS[s.name.toLowerCase()];
                      return { name: k ? t(`mkt.ca.src.${k}`) : s.name, value: s.count };
                    })}
                  />
                ) : (
                  <EmptyNote text={t("mkt.ca.noStats")} />
                )}
              </SectionCard>
              <SectionCard
                icon={Eye}
                tone="violet"
                title={t("mkt.ca.readTitle")}
                description={t("mkt.ca.readDesc")}
              >
                {stats.viewHours ? (
                  <ShareBars
                    tone="bg-violet-500"
                    items={stats.viewHours
                      .map((v, h) => ({
                        name: `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`,
                        value: v,
                      }))
                      .sort((x, y) => y.value - x.value)
                      .slice(0, 6)}
                  />
                ) : (
                  <EmptyNote text={t("mkt.ca.noStats")} />
                )}
                <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
                  <Mini icon={Eye} label={t("mkt.ca.viewsPerPost")} value={stats.viewsPerPost} />
                  <Mini icon={Send} label={t("mkt.ca.sharesPerPost")} value={stats.sharesPerPost} />
                  <Mini
                    icon={Bell}
                    label={t("mkt.ca.notif")}
                    value={stats.notificationsPct}
                    suffix="%"
                  />
                </div>
              </SectionCard>
              <SectionCard
                icon={Languages}
                tone="emerald"
                title={t("mkt.ca.langTitle")}
                description={t("mkt.ca.langDesc")}
              >
                {stats.languages.length ? (
                  <ShareBars
                    tone="bg-emerald-500"
                    suffix="%"
                    items={stats.languages
                      .slice(0, 6)
                      .map((l) => ({ name: l.name, value: l.share }))}
                  />
                ) : (
                  <EmptyNote text={t("mkt.ca.noStats")} />
                )}
              </SectionCard>
            </div>
          )}
        </>
      )}
      {editing && c && <ChannelDialog initial={c} onClose={() => setEditing(false)} />}
    </div>
  );
}

type T = (k: string, v?: Record<string, string | number>) => string;

function quickLabel(h: number, t: T) {
  return h < 24 ? t("mkt.rules.hours", { n: h }) : t("mkt.rules.days", { n: h / 24 });
}

function linkTitle(l: { key: string; name: string | null; link: string | null }, t: T) {
  if (l.key === "direct") return t("mkt.ca.direct");
  return l.name || l.link || t("mkt.ca.direct");
}

function Legend() {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
        {t("mkt.ca.joined")}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
        {t("mkt.ca.left")}
      </span>
    </div>
  );
}

/** What is missing for the full figures, and how to fix it. */
function SourceBanner({
  migrated,
  botAdmin,
  account,
  statsError,
  hasStats,
}: {
  migrated: boolean;
  botAdmin: boolean | null;
  account: string | null;
  statsError: string | null;
  hasStats: boolean;
}) {
  const { t } = useI18n();
  const notes: { title: string; body: string; to?: "/marketing/settings" }[] = [];
  if (!migrated) notes.push({ title: t("mkt.ca.migTitle"), body: t("mkt.migrationPending") });
  if (migrated && botAdmin !== true)
    notes.push({ title: t("mkt.ca.botTitle"), body: t("mkt.ca.botBody") });
  if (migrated && account !== "ok")
    notes.push({
      title: t("mkt.ca.accTitle"),
      body: t("mkt.ca.accBody"),
      to: "/marketing/settings",
    });
  else if (migrated && !hasStats && statsError)
    notes.push({ title: t("mkt.ca.statsTitle"), body: t("mkt.ca.statsBody") });
  if (!notes.length) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {notes.map((n) => (
        <div
          key={n.title}
          className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3.5"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 text-[13px]">
            <p className="font-semibold text-foreground">{n.title}</p>
            <p className="mt-0.5 text-muted-foreground">{n.body}</p>
            {n.to && (
              <Link
                to={n.to}
                search={{ tab: "sources" }}
                className="mt-1.5 inline-block font-semibold text-primary hover:underline"
              >
                {t("mkt.ca.openSources")} →
              </Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Short sentences that read the charts for you. */
function Insights({ a, quickH }: { a: ChannelAnalytics; quickH: number }) {
  const { t } = useI18n();
  const lines: string[] = [];
  if (a.peakJoinHour != null)
    lines.push(
      t("mkt.ca.ins.joinHour", {
        h: `${hourLabel(a.peakJoinHour)}–${hourLabel((a.peakJoinHour + 1) % 24)}`,
      }),
    );
  if (a.peakLeaveHour != null)
    lines.push(
      t("mkt.ca.ins.leaveHour", {
        h: `${hourLabel(a.peakLeaveHour)}–${hourLabel((a.peakLeaveHour + 1) % 24)}`,
      }),
    );
  if (a.bestWeekday != null)
    lines.push(t("mkt.ca.ins.weekday", { d: t(`mkt.ca.wdFull.${a.bestWeekday}`) }));
  if (a.bestDay?.joined)
    lines.push(t("mkt.ca.ins.bestDay", { d: dm(a.bestDay.day), n: nf(a.bestDay.joined) }));
  if (a.worstDay?.left)
    lines.push(t("mkt.ca.ins.worstDay", { d: dm(a.worstDay.day), n: nf(a.worstDay.left) }));
  if (a.hasEvents && a.quick.joined)
    lines.push(
      t("mkt.ca.ins.quick", {
        p: Math.round((a.quick.inLimit / a.quick.joined) * 100),
        h: quickLabel(quickH, t),
      }),
    );
  if (a.churnPct != null)
    lines.push(
      a.churnPct > 50
        ? t("mkt.ca.ins.churnHigh", { p: a.churnPct })
        : t("mkt.ca.ins.churnOk", { p: a.churnPct }),
    );
  if (!lines.length) return null;
  return (
    <div className="surface-card p-5">
      <p className="flex items-center gap-2 text-[14px] font-bold text-foreground">
        <Sparkles className="h-4 w-4 text-amber-500" />
        {t("mkt.ca.insights")}
      </p>
      <ul className="mt-3 grid gap-x-8 gap-y-2 md:grid-cols-2">
        {lines.map((l) => (
          <li key={l} className="flex gap-2 text-[13.5px] text-foreground">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Retention({ a }: { a: ChannelAnalytics }) {
  const { t } = useI18n();
  const q = a.quick;
  const left = q.joined - q.stayed;
  const rows = [
    { k: t("mkt.ca.in1h"), v: q.in1h, tone: "bg-rose-600" },
    { k: t("mkt.ca.in24h"), v: q.in24h - q.in1h, tone: "bg-rose-500" },
    { k: t("mkt.ca.in7d"), v: q.in7d - q.in24h, tone: "bg-rose-400" },
    { k: t("mkt.ca.later"), v: Math.max(0, left - q.in7d), tone: "bg-rose-300" },
    { k: t("mkt.ca.stayed"), v: q.stayed, tone: "bg-emerald-500" },
  ];
  return (
    <div>
      <div className="flex h-4 overflow-hidden rounded-full bg-muted">
        {rows.map((r) =>
          r.v > 0 ? (
            <div
              key={r.k}
              className={cn("h-full border-r-2 border-card last:border-r-0", r.tone)}
              style={{ width: `${(r.v / q.joined) * 100}%` }}
              title={`${r.k}: ${nf(r.v)}`}
            />
          ) : null,
        )}
      </div>
      <ul className="mt-4 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.k} className="flex items-center justify-between gap-3 py-2 text-[13px]">
            <span className="flex items-center gap-2 text-foreground">
              <span className={cn("h-2.5 w-2.5 rounded-sm", r.tone)} />
              {r.k}
            </span>
            <span className="tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{nf(r.v)}</span>
              <span className="ml-2 inline-block w-11 text-right">
                {Math.round((r.v / q.joined) * 100)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted-foreground">
        {t("mkt.ca.retentionBase", { n: nf(q.joined) })}
      </p>
    </div>
  );
}

function LinksTable({ links }: { links: ChannelAnalytics["links"] }) {
  const { t } = useI18n();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-semibold">{t("mkt.ca.link")}</th>
            <th className="py-2 pr-3 text-right font-semibold">{t("mkt.ca.joined")}</th>
            <th className="py-2 pr-3 text-right font-semibold">{t("mkt.ca.left")}</th>
            <th className="py-2 text-right font-semibold">{t("mkt.ca.stayPct")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {links.slice(0, 10).map((l) => {
            const stay = l.joined ? Math.round(((l.joined - l.left) / l.joined) * 100) : 0;
            return (
              <tr key={l.key}>
                <td className="max-w-[260px] py-2.5 pr-3">
                  <p className="truncate font-medium text-foreground">{linkTitle(l, t)}</p>
                  {l.name && l.link && (
                    <p className="truncate font-mono text-[11.5px] text-muted-foreground">
                      {l.link}
                    </p>
                  )}
                </td>
                <td className="py-2.5 pr-3 text-right font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  +{nf(l.joined)}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-rose-700 dark:text-rose-300">
                  {l.left ? `−${nf(l.left)}` : "0"}
                </td>
                <td className="py-2.5 text-right">
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[12px] font-semibold tabular-nums",
                      stay >= 80
                        ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                        : stay >= 50
                          ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                          : "bg-rose-500/12 text-rose-700 dark:text-rose-300",
                    )}
                  >
                    {stay}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Mini({
  icon: Icon,
  label,
  value,
  suffix = "",
}: {
  icon: typeof Users;
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div className="bg-card px-3 py-2.5">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 text-[16px] font-bold tabular-nums text-foreground">
        {value != null ? `${nf(Math.round(value * 10) / 10)}${suffix}` : "—"}
      </p>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="grid min-h-[140px] place-items-center rounded-xl border border-dashed border-border px-6 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}
