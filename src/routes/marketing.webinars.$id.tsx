import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Flag,
  Images,
  ListChecks,
  Loader2,
  Pencil,
  Play,
  Radio,
  Square,
  TrendingDown,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ShotsGallery } from "@/components/marketing/ShotsGallery";
import { Button } from "@/components/ui/button";
import { SERIES, WebinarChart, eventName } from "@/components/marketing/ViewersChart";
import {
  EventsList,
  LiveConsole,
  ScenarioCard,
  StageLossTable,
} from "@/components/marketing/WebinarLive";
import { StatusChip, WebinarDialog } from "@/components/marketing/WebinarParts";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import {
  combineSamples,
  isEventKind,
  peaks,
  stageLosses,
  totalAt,
  type WebinarEvent,
} from "@/lib/webinar-timeline";
import { useChannels, useWebinar, useWebinarMutations } from "@/hooks/use-crm-data";

// One webinar, streamed on YouTube and in a Telegram live at the same time:
// the viewers of both and their sum minute by minute, the stream's events
// (lesson start, Telegram live on, SMS, presentation, tariffs, timers, Q&A)
// pressed on the live console or recorded by the server, how many were lost
// between one event and the next, the scenario against what happened, and
// the two streams' pictures side by side. Excel for the report.

export const Route = createFileRoute("/marketing/webinars/$id")({
  head: () => ({ meta: [{ title: "Vebinar — SalesIQ Marketing" }] }),
  component: WebinarPage,
});

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const num = (n: number) => n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");

function WebinarPage() {
  const { t } = useI18n();
  const { id } = Route.useParams();
  const q = useWebinar(id);
  const m = useWebinarMutations();
  const { data: channels } = useChannels();
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState("");
  const w = q.data?.webinar;

  const points = useMemo(
    () =>
      combineSamples(
        (q.data?.samples ?? []).map((s) => ({ at: s.at, viewers: s.viewers, source: s.source })),
      ),
    [q.data?.samples],
  );
  const events: WebinarEvent[] = useMemo(
    () =>
      (q.data?.marks ?? [])
        .filter((x) => isEventKind(x.kind))
        .map((x) => ({
          id: x.id,
          at: x.at,
          kind: x.kind as WebinarEvent["kind"],
          seq: x.seq ?? null,
          label: x.label,
          auto: x.auto ?? false,
          aiGuess: x.ai_guess ?? false,
          confirmed: x.confirmed ?? true,
          meta: (x.meta as WebinarEvent["meta"]) ?? null,
        })),
    [q.data?.marks],
  );

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!w)
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">{t("mkt.wb.notFound")}</p>
    );

  const pk = peaks(points);
  const totals = points.map((p) => p.total);
  const avg = totals.length ? Math.round(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
  const last = points.at(-1)?.total ?? null;
  const minutes =
    points.length > 1
      ? Math.round((Date.parse(points.at(-1)!.at) - Date.parse(points[0]!.at)) / 60_000)
      : 0;
  const hasYt = !!w.youtube_video_id;
  const channel = (channels?.rows ?? []).find((c) => c.id === w.channel_id);
  const hasTg = !!w.channel_id;
  const auto = hasYt || (hasTg && !!channel?.track_live);
  const startIso = w.starts_at ?? points[0]?.at ?? null;

  const setStatus = (status: "live" | "ended") =>
    m.save.mutate(
      {
        id: w.id,
        patch:
          status === "live"
            ? { status, ...(w.starts_at ? {} : { starts_at: new Date().toISOString() }) }
            : { status, ended_at: new Date().toISOString() },
      },
      { onError: (e) => toast.error(describeError(e, t("mkt.wb.saveFailed"))) },
    );

  function addCount() {
    const n = Number(count);
    if (!count || !Number.isFinite(n) || n < 0) return;
    m.addSample.mutate(
      { webinarId: w!.id, viewers: Math.round(n) },
      {
        onSuccess: () => setCount(""),
        onError: (e) => toast.error(describeError(e, t("mkt.wb.saveFailed"))),
      },
    );
  }

  function exportXlsx() {
    const { stages } = stageLosses(points, events);
    downloadXlsx(`vebinar-${w!.title.slice(0, 40)}.xlsx`, [
      {
        name: t("mkt.wb.sheetSummary"),
        rows: [
          [t("mkt.wb.title"), w!.title],
          [t("mkt.wb.registered"), w!.registrations],
          [t("mkt.wb.peak"), pk.total?.viewers ?? null],
          [t("mkt.wb.peakAt"), pk.total ? hm(pk.total.at) : null],
          ["YouTube " + t("mkt.wb.peak").toLowerCase(), pk.youtube?.viewers ?? null],
          ["Telegram " + t("mkt.wb.peak").toLowerCase(), pk.telegram?.viewers ?? null],
          [t("mkt.wb.avg"), avg],
          [t("mkt.wb.duration"), minutes],
          [],
          [t("mkt.wb.event"), t("mkt.wb.time"), t("mkt.wb.viewersShort")],
          ...[...events]
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((e) => [eventName(t, e), hm(e.at), totalAt(points, e.at)]),
          [],
          [t("mkt.wb.stage"), t("mkt.wb.atStart"), t("mkt.wb.atEnd"), t("mkt.wb.change")],
          ...stages.map((s) => [
            `${eventName(t, s.from)} → ${s.to ? eventName(t, s.to) : t("mkt.wb.streamEnd")}`,
            s.start,
            s.end,
            s.change,
          ]),
        ],
      },
      {
        name: t("mkt.wb.sheetMinutes"),
        rows: [
          [t("mkt.wb.time"), "YouTube", "Telegram", t("mkt.wb.total")],
          ...points.map((p) => [hm(p.at), p.youtube, p.telegram, p.total]),
        ],
      },
    ]);
  }

  const kpis: {
    k: string;
    v: string;
    sub?: string | undefined;
    color?: string;
    strong?: boolean;
  }[] = [
    {
      k: t("mkt.wb.peakTotal"),
      v: pk.total ? num(pk.total.viewers) : "—",
      sub: pk.total ? `★ ${hm(pk.total.at)}` : undefined,
      strong: true,
    },
    ...(hasYt
      ? [
          {
            k: "YouTube",
            v: pk.youtube ? num(pk.youtube.viewers) : "—",
            sub: pk.youtube ? t("mkt.wb.peakAtShort", { time: hm(pk.youtube.at) }) : undefined,
            color: SERIES.youtube,
          },
        ]
      : []),
    ...(hasTg
      ? [
          {
            k: "Telegram",
            v: pk.telegram ? num(pk.telegram.viewers) : "—",
            sub: pk.telegram ? t("mkt.wb.peakAtShort", { time: hm(pk.telegram.at) }) : undefined,
            color: SERIES.telegram,
          },
        ]
      : []),
    { k: t("mkt.wb.avg"), v: avg != null ? num(avg) : "—" },
    { k: t("mkt.wb.now"), v: last != null ? num(last) : "—" },
    {
      k: t("mkt.wb.registered"),
      v: w.registrations != null ? num(w.registrations) : "—",
      sub:
        w.registrations && pk.total
          ? t("mkt.wb.came", { pct: Math.round((pk.total.viewers / w.registrations) * 100) })
          : undefined,
    },
    { k: t("mkt.wb.duration"), v: minutes ? t("mkt.wb.minutes", { n: minutes }) : "—" },
  ];

  return (
    <div className="space-y-5">
      <Link
        to="/marketing/webinars"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("mkt.nav.webinars")}
      </Link>
      <PageHeader
        back={false}
        icon={Video}
        tone="violet"
        title={w.title}
        description={`${
          [
            hasYt ? "YouTube" : null,
            hasTg
              ? `Telegram${channel ? ` · ${channel.title || `@${channel.username}`}` : ""}`
              : null,
          ]
            .filter(Boolean)
            .join(" + ") || t("mkt.wb.platform.other")
        }${w.starts_at ? ` · ${new Date(w.starts_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}`}
        actions={
          <>
            <StatusChip status={w.status} />
            {w.status !== "live" && w.status !== "ended" && (
              <Button onClick={() => setStatus("live")}>
                <Play className="h-4 w-4" /> {t("mkt.wb.start")}
              </Button>
            )}
            {w.status === "live" && (
              <Button variant="outline" onClick={() => setStatus("ended")}>
                <Square className="h-4 w-4" /> {t("mkt.wb.end")}
              </Button>
            )}
            <Button variant="outline" onClick={exportXlsx} disabled={!points.length}>
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => setEditing(true)}
              aria-label={t("mkt.wb.edit")}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {w.poll_error === "no_key" && hasYt && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("mkt.wb.noKey")}
        </p>
      )}
      {w.poll_error && w.poll_error !== "no_key" && hasYt && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("mkt.wb.pollError")}: {w.poll_error}
        </p>
      )}
      {hasTg && channel && !channel.track_live && (
        <p className="flex items-start gap-2 rounded-lg bg-sky-500/10 px-3 py-2 text-[13px] text-sky-800 dark:text-sky-200">
          <Radio className="mt-0.5 h-4 w-4 shrink-0" />
          {t("mkt.wb.tgNotTracked")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]">
        {kpis.map((c) => (
          <div key={c.k} className="bg-card px-4 py-3.5">
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              {c.color && <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />}
              {c.k}
            </p>
            <p
              className={cn(
                "mt-1 font-mono text-[22px] font-bold tabular-nums",
                c.strong ? "text-primary" : "text-foreground",
              )}
            >
              {c.v}
            </p>
            {c.sub && <p className="text-[11.5px] text-muted-foreground">{c.sub}</p>}
          </div>
        ))}
      </div>

      <SectionCard
        icon={Users}
        tone="violet"
        title={t("mkt.wb.chartTitle")}
        description={auto ? t("mkt.wb.chartBoth") : t("mkt.wb.chartManual")}
      >
        <WebinarChart points={points} events={events} />
      </SectionCard>

      <div className="grid items-start gap-5 xl:grid-cols-[1.15fr_1fr]">
        <SectionCard
          icon={Flag}
          tone="rose"
          title={t("mkt.wb.consoleTitle")}
          description={t("mkt.wb.consoleDesc")}
        >
          <LiveConsole w={w} events={events} />
          <form
            className="mt-4 flex items-end gap-2 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              addCount();
            }}
          >
            <label className="flex-1 space-y-1">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {auto ? t("mkt.wb.countBackup") : t("mkt.wb.countNow")}
              </span>
              <input
                inputMode="numeric"
                value={count}
                onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className="h-10 w-full rounded-xl border border-border bg-input px-3 text-right font-mono text-[16px] font-semibold tabular-nums outline-none focus:border-primary"
              />
            </label>
            <Button type="submit" disabled={!count || m.addSample.isPending}>
              {t("mkt.wb.addCount")}
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          icon={Flag}
          tone="violet"
          title={t("mkt.wb.eventsTitle")}
          description={t("mkt.wb.eventsDesc")}
        >
          <EventsList events={events} points={points} peak={pk.total?.viewers ?? null} />
        </SectionCard>
      </div>

      <SectionCard
        icon={TrendingDown}
        tone="rose"
        title={t("mkt.wb.lossTitle")}
        description={t("mkt.wb.lossDesc")}
      >
        <StageLossTable points={points} events={events} />
      </SectionCard>

      <SectionCard
        icon={ListChecks}
        tone="amber"
        title={t("mkt.wb.planTitle")}
        description={t("mkt.wb.planDesc")}
      >
        <ScenarioCard w={w} events={events} startIso={startIso} />
      </SectionCard>

      <SectionCard
        icon={Images}
        tone="violet"
        title={t("mkt.shots.title")}
        description={hasYt && hasTg ? t("mkt.shots.descPaired") : t("mkt.shots.desc")}
      >
        <ShotsGallery webinarId={w.id} paired={hasYt && hasTg} />
      </SectionCard>
      {editing && <WebinarDialog w={w} onClose={() => setEditing(false)} />}
    </div>
  );
}
