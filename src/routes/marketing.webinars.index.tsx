import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { combineSamples } from "@/lib/webinar-timeline";
import {
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  Trash2,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import { PROJECT_DOT } from "@/lib/marketing-projects";
import { useWebinarMutations, useWebinars, type WebinarRow } from "@/hooks/use-crm-data";
import { StatusChip, WebinarDialog } from "@/components/marketing/WebinarParts";
import { MarketingFilterBar, useMarketingFilters } from "@/components/marketing/MarketingFilters";
import { ArchiveButton, ArchiveConfirm, ArchiveDialog } from "@/components/marketing/ArchiveDialog";

// Marketing paneli -> Vebinarlar: every live webinar (YouTube counted by
// itself, Telegram through the connected account or typed in), with its
// project, peak and average viewers. Follows the project filter; deleting
// archives; Excel exports the list.

export const Route = createFileRoute("/marketing/webinars/")({
  head: () => ({ meta: [{ title: "Vebinarlar — SalesIQ Marketing" }] }),
  component: WebinarsPage,
});

type StatusFilter = "all" | "live" | "planned" | "ended";

function WebinarsPage() {
  const { t } = useI18n();
  const f = useMarketingFilters();
  const q = useWebinars();
  const m = useWebinarMutations();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WebinarRow | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const all = q.data?.rows ?? [];
  const archived = all.filter((w) => w.archived_at);
  const scoped = all.filter(
    (w) => !w.archived_at && (!f.projectId || w.project_id === f.projectId),
  );
  const rows = scoped.filter((w) => status === "all" || w.status === status);
  const stats = (id: string) => {
    // YouTube and Telegram of one webinar are added minute by minute.
    const s = combineSamples((q.data?.samples ?? []).filter((x) => x.webinar_id === id));
    if (!s.length) return null;
    return {
      peak: Math.max(...s.map((x) => x.total)),
      avg: Math.round(s.reduce((a, x) => a + x.total, 0) / s.length),
    };
  };
  const projectOf = (id: string | null) => f.projects.find((p) => p.id === id) ?? null;
  const peaks = scoped.map((w) => stats(w.id)?.peak ?? 0);
  const live = scoped.filter((w) => w.status === "live").length;

  function exportXlsx() {
    downloadXlsx(`vebinarlar-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: t("mkt.nav.webinars"),
        rows: [
          [
            t("mkt.wb.title"),
            t("mkt.p.filter"),
            t("mkt.wb.platformTitle"),
            t("mkt.wb.startsAt"),
            t("mkt.wb.statusTitle"),
            t("mkt.wb.peak"),
            t("mkt.wb.avg"),
            t("mkt.wb.registered"),
          ],
          ...rows.map((w) => {
            const s = stats(w.id);
            return [
              w.title,
              projectOf(w.project_id)?.name ?? "",
              t(`mkt.wb.platform.${w.platform}`),
              w.starts_at ? new Date(w.starts_at).toLocaleString("ru-RU") : "",
              t(`mkt.wb.status.${w.status}`),
              s?.peak ?? null,
              s?.avg ?? null,
              w.registrations,
            ];
          }),
        ],
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={Video}
        tone="violet"
        title={t("mkt.nav.webinars")}
        description={t("mkt.wb.desc")}
        actions={
          <>
            <ArchiveButton count={archived.length} onClick={() => setArchiveOpen(true)} />
            <Button variant="outline" onClick={exportXlsx} disabled={!rows.length}>
              <Download className="h-4 w-4" />
              Excel
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t("mkt.wb.new")}
            </Button>
          </>
        }
      />
      {q.data?.missing && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          {t("mkt.migrationPending")}
        </p>
      )}
      <MarketingFilterBar period={false}>
        <Segmented
          value={status}
          onChange={setStatus}
          options={(["all", "live", "planned", "ended"] as const).map((s) => ({
            value: s,
            label: s === "all" ? t("mkt.p.allStatuses") : t(`mkt.wb.status.${s}`),
          }))}
        />
      </MarketingFilterBar>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Video}
          iconTone="violet"
          label={t("mkt.nav.webinars")}
          tipKey="mkt.nav.webinars"
          value={String(scoped.length)}
        />
        <StatCard
          icon={Radio}
          iconTone="rose"
          label={t("mkt.wb.status.live")}
          tipKey="mkt.wb.status.live"
          value={String(live)}
        />
        <StatCard
          icon={TrendingUp}
          iconTone="emerald"
          label={t("mkt.wb.bestPeak")}
          tipKey="mkt.wb.bestPeak"
          value={peaks.length ? Math.max(...peaks).toLocaleString("ru-RU") : "—"}
        />
        <StatCard
          icon={Users}
          iconTone="sky"
          label={t("mkt.wb.registered")}
          tipKey="mkt.wb.registered"
          value={scoped.reduce((s, w) => s + (w.registrations ?? 0), 0).toLocaleString("ru-RU")}
        />
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card grid place-items-center gap-3 py-14 text-center">
          <Video className="h-8 w-8 text-muted-foreground" />
          <p className="max-w-md text-sm text-muted-foreground">{t("mkt.wb.empty")}</p>
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t("mkt.wb.new")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((w) => (
            <WebinarCard
              key={w.id}
              w={w}
              stats={stats(w.id)}
              project={projectOf(w.project_id)}
              onEdit={() => setEditing(w)}
              onArchive={() => m.archive.mutateAsync(w.id)}
            />
          ))}
        </div>
      )}
      {creating && <WebinarDialog onClose={() => setCreating(false)} />}
      {editing && <WebinarDialog w={editing} onClose={() => setEditing(null)} />}
      {archiveOpen && (
        <ArchiveDialog
          title={t("mkt.arch.webinars")}
          items={archived.map((w) => ({
            id: w.id,
            title: w.title,
            sub: t(`mkt.wb.platform.${w.platform}`),
            archivedAt: w.archived_at!,
          }))}
          onRestore={(id) => m.restore.mutateAsync(id)}
          onDestroy={(id) => m.remove.mutateAsync(id)}
          onClose={() => setArchiveOpen(false)}
        />
      )}
    </div>
  );
}

function WebinarCard({
  w,
  stats,
  project,
  onEdit,
  onArchive,
}: {
  w: WebinarRow;
  stats: { peak: number; avg: number } | null;
  project: { name: string; color: string } | null;
  onEdit: () => void;
  onArchive: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [archiving, setArchiving] = useState(false);
  const turnout =
    stats && w.registrations ? Math.round((stats.peak / w.registrations) * 100) : null;
  const live = w.status === "live";
  const when = w.starts_at
    ? new Date(w.starts_at).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const figures = [
    { k: t("mkt.wb.peak"), v: stats ? stats.peak.toLocaleString("ru-RU") : "—" },
    { k: t("mkt.wb.avg"), v: stats ? stats.avg.toLocaleString("ru-RU") : "—" },
    {
      k: t("mkt.wb.registered"),
      v: w.registrations != null ? w.registrations.toLocaleString("ru-RU") : "—",
    },
    { k: t("mkt.wb.turnout"), v: turnout != null ? `${turnout}%` : "—", bar: turnout },
  ];
  // One webinar = one line of the broadcast log: state, name, when, then
  // its figures across; the live one is edged in red.
  return (
    <article
      className={cn(
        "surface-card px-5 py-4 phone:px-4",
        live && "!border-[color-mix(in_oklab,var(--studio-live)_45%,transparent)]",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusChip status={w.status} />
        <Link
          to="/marketing/webinars/$id"
          params={{ id: w.id }}
          className="min-w-0 truncate text-[16px] font-semibold text-foreground hover:text-primary"
        >
          {w.title}
        </Link>
        <span className="font-mono text-[12px] text-muted-foreground">
          {t(`mkt.wb.platform.${w.platform}`)}
          {when && ` · ${when}`}
        </span>
        {project && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-0.5 text-[12px] font-medium text-foreground">
            <span
              className={cn("h-2 w-2 rounded-full", PROJECT_DOT[project.color] ?? "bg-sky-500")}
            />
            {project.name}
          </span>
        )}
        {w.auto_created && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[12px] font-medium text-muted-foreground">
            <Radio className="h-3 w-3" />
            {t("mkt.wb.auto")}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Link
            to="/marketing/webinars/$id"
            params={{ id: w.id }}
            className="px-2 text-[13px] font-medium text-primary hover:underline"
          >
            {t("mkt.wb.openRow")} →
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t("refund.actions")}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" /> {t("mkt.p.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setArchiving(true)}>
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      <Link
        to="/marketing/webinars/$id"
        params={{ id: w.id }}
        className="mt-3.5 grid grid-cols-4 gap-x-6 gap-y-3 phone:grid-cols-2"
      >
        {figures.map((c) => (
          <div key={c.k} className="min-w-0">
            <p className="studio-label !tracking-[0.08em]">{c.k}</p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums text-foreground">{c.v}</p>
            {c.bar != null && (
              <div className="studio-fader mt-1.5">
                <i style={{ width: `${Math.min(100, c.bar)}%` }} />
              </div>
            )}
          </div>
        ))}
      </Link>
      <ArchiveConfirm
        name={w.title}
        open={archiving}
        onOpenChange={setArchiving}
        onConfirm={onArchive}
      />
    </article>
  );
}
