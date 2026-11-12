import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  FolderKanban,
  Images,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Tag,
  Trash2,
  Video,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PROJECT_DOT } from "@/lib/marketing-projects";
import {
  useChannels,
  useMarketingProjects,
  useProjectMutations,
  useWebinars,
  type ProjectRow,
} from "@/hooks/use-crm-data";
import { ProjectDialog } from "@/components/marketing/ProjectDialog";
import { ArchiveButton, ArchiveConfirm, ArchiveDialog } from "@/components/marketing/ArchiveDialog";
import { ShotsDialog } from "@/components/marketing/ShotsGallery";

// Sozlash -> Loyihalar: every project as a card -- its color, funnels and
// UTM campaigns, how many channels and webinars it has -- with Ochish (its
// own page), Rasmlar (the live-stream pictures), edit and delete (to the
// archive). Arxiv on top brings archived ones back or deletes them.

export function ProjectsBoard({
  funnelNames,
  campaignNames,
}: {
  funnelNames: string[];
  campaignNames: string[];
}) {
  const { t } = useI18n();
  const { data, isLoading } = useMarketingProjects();
  const { data: ch } = useChannels();
  const { data: wd } = useWebinars();
  const m = useProjectMutations();
  const [editing, setEditing] = useState<ProjectRow | null | "new">(null);
  const [archiving, setArchiving] = useState<ProjectRow | null>(null);
  const [shots, setShots] = useState<ProjectRow | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const rows = data?.rows ?? [];
  const active = rows.filter((p) => !p.archived_at);
  const archived = rows.filter((p) => p.archived_at);
  const counts = useMemo(() => {
    const c = new Map<string, { channels: number; webinars: number }>();
    const get = (id: string) => c.get(id) ?? { channels: 0, webinars: 0 };
    for (const x of ch?.rows ?? [])
      if (x.project_id && !x.archived_at)
        c.set(x.project_id, { ...get(x.project_id), channels: get(x.project_id).channels + 1 });
    for (const w of wd?.rows ?? [])
      if (w.project_id && !w.archived_at)
        c.set(w.project_id, { ...get(w.project_id), webinars: get(w.project_id).webinars + 1 });
    return c;
  }, [ch?.rows, wd?.rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-[13.5px] text-muted-foreground">{t("mkt.p.boardDesc")}</p>
        <ArchiveButton count={archived.length} onClick={() => setArchiveOpen(true)} />
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" />
          {t("mkt.p.add")}
        </Button>
      </div>

      {data?.missing && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          {t("mkt.p.migrationPending")}
        </p>
      )}

      {!isLoading && active.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-500/12 text-sky-600 dark:text-sky-400">
            <FolderKanban className="h-7 w-7" />
          </span>
          <p className="text-[16px] font-bold text-foreground">{t("mkt.p.emptyTitle")}</p>
          <p className="max-w-[460px] text-[13.5px] text-muted-foreground">
            {t("mkt.p.emptyDesc")}
          </p>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t("mkt.p.add")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {active.map((p) => {
            const c = counts.get(p.id) ?? { channels: 0, webinars: 0 };
            const dot = PROJECT_DOT[p.color] ?? "bg-sky-500";
            return (
              <article key={p.id} className="surface-card flex flex-col p-5">
                <header className="flex items-start gap-3">
                  <span
                    className={cn(
                      "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[17px] font-bold text-white",
                      dot,
                    )}
                  >
                    {p.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[16.5px] font-bold text-foreground">{p.name}</h3>
                    <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">
                      {p.note ||
                        t("mkt.p.since", {
                          date: new Date(p.created_at).toLocaleDateString("ru-RU"),
                        })}
                    </p>
                  </div>
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
                      <DropdownMenuItem onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4" /> {t("mkt.p.edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setArchiving(p)}
                      >
                        <Trash2 className="h-4 w-4" /> {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </header>

                <div className="mt-4 space-y-2">
                  <ChipRow icon={Workflow} empty={t("mkt.p.noFunnel")} items={p.funnels} />
                  <ChipRow icon={Tag} empty={t("mkt.p.noUtm")} items={p.utm_campaigns} mono />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Count icon={Send} label={t("mkt.nav.channels")} n={c.channels} />
                  <Count icon={Video} label={t("mkt.nav.webinars")} n={c.webinars} />
                </div>

                <footer className="mt-4 flex gap-2 border-t border-border pt-4">
                  <Button asChild className="flex-1">
                    <Link to="/marketing/projects/$id" params={{ id: p.id }}>
                      {t("mkt.p.open")}
                      <ArrowUpRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => setShots(p)}>
                    <Images className="h-4 w-4" />
                    {t("mkt.shots.button")}
                  </Button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <ProjectDialog
          initial={editing === "new" ? null : editing}
          funnelNames={funnelNames}
          campaignNames={campaignNames}
          onClose={() => setEditing(null)}
        />
      )}
      <ArchiveConfirm
        name={archiving?.name ?? ""}
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        onConfirm={() => m.archive.mutateAsync(archiving!.id)}
      />
      {shots && (
        <ShotsDialog projectId={shots.id} title={shots.name} onClose={() => setShots(null)} />
      )}
      {archiveOpen && (
        <ArchiveDialog
          title={t("mkt.arch.projects")}
          items={archived.map((p) => ({ id: p.id, title: p.name, archivedAt: p.archived_at! }))}
          onRestore={(id) => m.restore.mutateAsync(id)}
          onDestroy={(id) => m.destroy.mutateAsync(id)}
          onClose={() => setArchiveOpen(false)}
        />
      )}
    </div>
  );
}

function ChipRow({
  icon: Icon,
  items,
  empty,
  mono = false,
}: {
  icon: typeof Tag;
  items: string[];
  empty: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {items.length === 0 ? (
        <span className="text-[12.5px] text-subtle">{empty}</span>
      ) : (
        <div className="flex flex-wrap gap-1">
          {items.slice(0, 6).map((x) => (
            <span
              key={x}
              className={cn(
                "rounded-md bg-muted px-1.5 py-0.5 text-[12px] text-foreground/85",
                mono && "font-mono",
              )}
            >
              {x}
            </span>
          ))}
          {items.length > 6 && (
            <span className="px-1 text-[12px] text-muted-foreground">+{items.length - 6}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Count({ icon: Icon, label, n }: { icon: typeof Tag; label: string; n: number }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="ml-auto text-[16px] font-bold tabular-nums text-foreground">{n}</span>
    </div>
  );
}
