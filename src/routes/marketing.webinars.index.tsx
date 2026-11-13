import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
    const s = (q.data?.samples ?? []).filter((x) => x.webinar_id === id);
    if (!s.length) return null;
    return {
      peak: Math.max(...s.map((x) => x.viewers)),
      avg: Math.round(s.reduce((a, x) => a + x.viewers, 0) / s.length),
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
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
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
  return (
    <article className="surface-card flex flex-col p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
            w.platform === "youtube"
              ? "bg-rose-500/12 text-rose-600 dark:text-rose-400"
              : w.platform === "telegram"
                ? "bg-sky-500/12 text-sky-600 dark:text-sky-400"
                : "bg-violet-500/12 text-violet-600 dark:text-violet-400",
          )}
        >
          <Video className="h-5 w-5" />
        </span>
        <Link to="/marketing/webinars/$id" params={{ id: w.id }} className="min-w-0 flex-1">
          <p className="truncate text-[15.5px] font-bold text-foreground hover:text-primary">
            {w.title}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {t(`mkt.wb.platform.${w.platform}`)}
            {w.starts_at &&
              ` · ${new Date(w.starts_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
          </p>
        </Link>
        <StatusChip status={w.status} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="-mr-1 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
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
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {project && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold text-foreground">
            <span
              className={cn("h-2 w-2 rounded-full", PROJECT_DOT[project.color] ?? "bg-sky-500")}
            />
            {project.name}
          </span>
        )}
        {w.auto_created && (
          <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-2 py-0.5 text-[12px] font-semibold text-sky-700 dark:text-sky-300">
            <Radio className="h-3 w-3" />
            {t("mkt.wb.auto")}
          </span>
        )}
      </div>
      <Link
        to="/marketing/webinars/$id"
        params={{ id: w.id }}
        className="mt-4 grid grid-cols-3 gap-2"
      >
        {[
          { k: t("mkt.wb.peak"), v: stats ? stats.peak.toLocaleString("ru-RU") : "—" },
          { k: t("mkt.wb.avg"), v: stats ? stats.avg.toLocaleString("ru-RU") : "—" },
          {
            k: t("mkt.wb.registered"),
            v: w.registrations != null ? w.registrations.toLocaleString("ru-RU") : "—",
          },
        ].map((c) => (
          <div key={c.k} className="rounded-xl bg-surface px-3 py-2.5">
            <p className="text-[11.5px] text-muted-foreground">{c.k}</p>
            <p className="text-[18px] font-bold tabular-nums text-foreground">{c.v}</p>
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
