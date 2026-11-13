import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Flag,
  Loader2,
  Pencil,
  Play,
  Square,
  Trash2,
  Images,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ShotsGallery } from "@/components/marketing/ShotsGallery";
import { Button } from "@/components/ui/button";
import { ViewersChart, MARK_COLOR } from "@/components/marketing/ViewersChart";
import { StatusChip, WebinarDialog } from "@/components/marketing/WebinarParts";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import { MARK_KINDS, webinarStats, type Mark, type MarkKind } from "@/lib/webinars";
import { useWebinar, useWebinarMutations } from "@/hooks/use-crm-data";

// One webinar: the viewers line (YouTube counted every minute by itself;
// Telegram typed in here), the host's marks -- intro, lesson, price,
// offer, Q&A -- pressed during the stream, the peak and how many were in
// the room at each mark. Excel for the report.

export const Route = createFileRoute("/marketing/webinars/$id")({
  head: () => ({ meta: [{ title: "Vebinar — SalesIQ Marketing" }] }),
  component: WebinarPage,
});

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

function WebinarPage() {
  const { t } = useI18n();
  const { id } = Route.useParams();
  const q = useWebinar(id);
  const m = useWebinarMutations();
  const [editing, setEditing] = useState(false);
  const [count, setCount] = useState("");
  const [label, setLabel] = useState("");
  const w = q.data?.webinar;
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

  const samples = (q.data?.samples ?? []).map((s) => ({ at: s.at, viewers: s.viewers }));
  const marks: Mark[] = (q.data?.marks ?? []).map((x) => ({
    id: x.id,
    at: x.at,
    kind: x.kind as MarkKind,
    label: x.label,
  }));
  const st = webinarStats(samples, marks);
  const manual = w.platform !== "youtube" || !w.youtube_video_id;

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
    downloadXlsx(`vebinar-${w!.title.slice(0, 40)}.xlsx`, [
      {
        name: t("mkt.wb.sheetSummary"),
        rows: [
          [t("mkt.wb.title"), w!.title],
          [t("mkt.wb.registered"), w!.registrations],
          [t("mkt.wb.peak"), st.peak?.viewers ?? null],
          [t("mkt.wb.peakAt"), st.peak ? hm(st.peak.at) : null],
          [t("mkt.wb.avg"), st.avg],
          [t("mkt.wb.duration"), st.minutes],
          [],
          [t("mkt.wb.mark"), t("mkt.wb.time"), t("mkt.wb.viewersShort")],
          ...st.marks.map((x) => [x.label || t(`mkt.wb.mark.${x.kind}`), hm(x.at), x.viewers]),
        ],
      },
      {
        name: t("mkt.wb.sheetMinutes"),
        rows: [
          [t("mkt.wb.time"), t("mkt.wb.viewersShort")],
          ...samples.map((s) => [hm(s.at), s.viewers]),
        ],
      },
    ]);
  }

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
        description={`${t(`mkt.wb.platform.${w.platform}`)}${w.starts_at ? ` · ${new Date(w.starts_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}`}
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
            <Button variant="outline" onClick={exportXlsx} disabled={!samples.length}>
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

      {w.poll_error === "no_key" && !manual && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("mkt.wb.noKey")}
        </p>
      )}
      {w.poll_error && w.poll_error !== "no_key" && !manual && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("mkt.wb.pollError")}: {w.poll_error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-5">
        {[
          {
            k: t("mkt.wb.peak"),
            v: st.peak ? String(st.peak.viewers) : "—",
            sub: st.peak ? hm(st.peak.at) : undefined,
            strong: true,
          },
          { k: t("mkt.wb.avg"), v: st.avg != null ? String(st.avg) : "—" },
          { k: t("mkt.wb.now"), v: st.last != null ? String(st.last) : "—" },
          {
            k: t("mkt.wb.registered"),
            v: w.registrations != null ? String(w.registrations) : "—",
            sub:
              w.registrations && st.peak
                ? t("mkt.wb.came", { pct: Math.round((st.peak.viewers / w.registrations) * 100) })
                : undefined,
          },
          { k: t("mkt.wb.duration"), v: st.minutes ? t("mkt.wb.minutes", { n: st.minutes }) : "—" },
        ].map((c) => (
          <div key={c.k} className="bg-card px-4 py-3.5">
            <p className="text-[12px] text-muted-foreground">{c.k}</p>
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
        description={manual ? t("mkt.wb.chartManual") : t("mkt.wb.chartAuto")}
      >
        <ViewersChart samples={samples} marks={marks} />
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        {/* During the stream: one tap for each moment, and the count when typed in. */}
        <SectionCard
          icon={Flag}
          tone="rose"
          title={t("mkt.wb.liveTitle")}
          description={t("mkt.wb.liveDesc")}
        >
          <div className="flex flex-wrap gap-2">
            {MARK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                disabled={m.addMark.isPending}
                onClick={() =>
                  m.addMark.mutate(
                    {
                      webinarId: w.id,
                      kind: k,
                      label: k === "custom" ? label.trim() || null : null,
                    },
                    {
                      onSuccess: () => {
                        setLabel("");
                        toast.success(t("mkt.wb.marked", { name: t(`mkt.wb.mark.${k}`) }));
                      },
                      onError: (e) => toast.error(describeError(e, t("mkt.wb.saveFailed"))),
                    },
                  )
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl ctl-soft px-3.5 text-[13px] font-semibold text-foreground"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: MARK_COLOR[k] }} />
                {t(`mkt.wb.mark.${k}`)}
              </button>
            ))}
          </div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
            placeholder={t("mkt.wb.customPh")}
            className="mt-2 h-9 w-full rounded-lg border border-border bg-input px-3 text-[13px] outline-none focus:border-primary"
          />
          <form
            className="mt-4 flex items-end gap-2 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              addCount();
            }}
          >
            <label className="flex-1 space-y-1">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {manual ? t("mkt.wb.countNow") : t("mkt.wb.countBackup")}
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
          title={t("mkt.wb.marksTitle")}
          description={t("mkt.wb.marksDesc")}
        >
          {st.marks.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("mkt.wb.noMarks")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {st.marks.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: MARK_COLOR[x.kind] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                    {x.label || t(`mkt.wb.mark.${x.kind}`)}
                  </span>
                  <span className="font-mono text-[12.5px] text-muted-foreground">{hm(x.at)}</span>
                  <span className="w-[92px] text-right">
                    <b className="font-mono text-[15px] tabular-nums text-foreground">
                      {x.viewers ?? "—"}
                    </b>
                    {x.viewers != null && st.peak && (
                      <span className="ml-1 text-[11.5px] text-muted-foreground">
                        {Math.round((x.viewers / st.peak.viewers) * 100)}%
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => m.removeMark.mutate(x.id)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label={t("common.delete")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
      {/* Proof pictures of this stream (every 5 min while live, or uploaded). */}
      <SectionCard
        icon={Images}
        tone="violet"
        title={t("mkt.shots.title")}
        description={t("mkt.shots.desc")}
      >
        <ShotsGallery webinarId={w.id} />
      </SectionCard>
      {editing && <WebinarDialog w={w} onClose={() => setEditing(false)} />}
    </div>
  );
}
