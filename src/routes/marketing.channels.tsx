import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Trash2,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, StatCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { channelGrowth } from "@/lib/webinars";
import { downloadXlsx } from "@/lib/xlsx-write";
import { PROJECT_DOT } from "@/lib/marketing-projects";
import {
  useChannelDays,
  useChannelMutations,
  useChannels,
  type ChannelRow,
} from "@/hooks/use-crm-data";
import { MarketingFilterBar, useMarketingFilters } from "@/components/marketing/MarketingFilters";
import { ChannelDialog } from "@/components/marketing/ChannelDialog";
import { ArchiveButton, ArchiveConfirm, ArchiveDialog } from "@/components/marketing/ArchiveDialog";

// Marketing paneli -> Kanallar: the company's Telegram channels (public by
// @name, private ones bound with /bind), each with its project and purpose.
// The platform's bot reads the subscribers every hour; here: how many there
// are, how many joined each day, the best day. Kanal qo'shish adds one;
// deleting puts it in the Arxiv; Excel exports the figures. Follows the
// project filter.

export const Route = createFileRoute("/marketing/channels")({
  validateSearch: (s: Record<string, unknown>): { add?: boolean | undefined } => ({
    add: s["add"] === true || s["add"] === "true" ? true : undefined,
  }),
  head: () => ({ meta: [{ title: "Kanallar — SalesIQ Marketing" }] }),
  component: ChannelsPage,
});

const RANGES = [7, 30, 90] as const;
const dayStr = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

function ChannelsPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const f = useMarketingFilters();
  const q = useChannels();
  const m = useChannelMutations();
  const [range, setRange] = useState<(typeof RANGES)[number]>(30);
  const fromDay = dayStr(new Date(Date.now() - (range - 1) * 86_400_000));
  const days = useChannelDays(fromDay);
  const [editing, setEditing] = useState<ChannelRow | null | "new">(search.add ? "new" : null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const all = q.data?.rows ?? [];
  const archived = all.filter((c) => c.archived_at);
  const rows = all.filter((c) => !c.archived_at && (!f.projectId || c.project_id === f.projectId));
  const daysOf = (id: string) => (days.data ?? []).filter((d) => d.channel_id === id);
  const growth = rows.map((c) => ({ c, g: channelGrowth(daysOf(c.id)) }));
  const totalMembers = rows.reduce((s, c) => s + (c.members ?? 0), 0);
  const totalGrowth = growth.reduce((s, x) => s + x.g.growth, 0);
  const best = growth
    .filter((x) => x.g.best?.delta != null)
    .sort((a, b) => (b.g.best!.delta ?? 0) - (a.g.best!.delta ?? 0))[0];
  const projectOf = (id: string | null) => f.projects.find((p) => p.id === id) ?? null;

  function close() {
    setEditing(null);
    if (search.add) void navigate({ search: {}, replace: true });
  }

  function exportXlsx() {
    downloadXlsx(`kanallar-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: t("mkt.nav.channels"),
        rows: [
          [
            t("mkt.ch.colTitle"),
            "@",
            t("mkt.p.filter"),
            t("mkt.ch.purposeTitle"),
            t("mkt.ch.members"),
            t("mkt.ch.growth"),
            t("mkt.ch.bestDay"),
            t("mkt.ch.invite"),
          ],
          ...growth.map(({ c, g }) => [
            c.title,
            c.username ? `@${c.username}` : "",
            projectOf(c.project_id)?.name ?? "",
            t(`mkt.ch.purpose.${c.purpose}`),
            c.members,
            g.growth,
            g.best ? `${g.best.day} (+${g.best.delta ?? 0})` : "",
            c.invite_link ?? "",
          ]),
        ],
      },
      {
        name: t("mkt.exp.days"),
        rows: [
          [t("mkt.exp.day"), t("mkt.ch.colTitle"), t("mkt.ch.members")],
          ...rows.flatMap((c) => daysOf(c.id).map((d) => [d.day, c.title, d.members])),
        ],
      },
    ]);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        icon={Send}
        tone="sky"
        title={t("mkt.nav.channels")}
        description={t("mkt.ch.desc")}
        actions={
          <>
            <ArchiveButton count={archived.length} onClick={() => setArchiveOpen(true)} />
            <Button variant="outline" onClick={exportXlsx} disabled={!rows.length}>
              <Download className="h-4 w-4" />
              Excel
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" />
              {t("mkt.ch.addButton")}
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
          value={String(range)}
          onChange={(v) => setRange(Number(v) as (typeof RANGES)[number])}
          options={RANGES.map((r) => ({ value: String(r), label: t("mkt.ch.days", { n: r }) }))}
        />
      </MarketingFilterBar>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Send}
          iconTone="sky"
          label={t("mkt.ch.count")}
          value={String(rows.length)}
        />
        <StatCard
          icon={Users}
          iconTone="violet"
          label={t("mkt.ch.totalMembers")}
          value={totalMembers.toLocaleString("ru-RU")}
        />
        <StatCard
          icon={TrendingUp}
          iconTone={totalGrowth >= 0 ? "emerald" : "rose"}
          label={t("mkt.ch.growthN", { n: range })}
          value={`${totalGrowth > 0 ? "+" : ""}${totalGrowth.toLocaleString("ru-RU")}`}
        />
        <StatCard
          icon={TrendingUp}
          iconTone="amber"
          label={t("mkt.ch.bestDay")}
          value={best?.g.best?.delta != null ? `+${best.g.best.delta}` : "—"}
          {...(best
            ? {
                hint: `${best.c.title} · ${best.g.best!.day.slice(5).split("-").reverse().join(".")}`,
              }
            : {})}
        />
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <img src="/brand/telegram.svg" alt="" className="h-14 w-14" />
          <p className="text-[15px] font-bold text-foreground">{t("mkt.ch.emptyTitle")}</p>
          <p className="max-w-[440px] text-[13.5px] text-muted-foreground">{t("mkt.ch.empty")}</p>
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            {t("mkt.ch.addButton")}
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {rows.map((c) => (
            <ChannelCard
              key={c.id}
              c={c}
              days={daysOf(c.id)}
              project={projectOf(c.project_id)}
              onEdit={() => setEditing(c)}
            />
          ))}
        </div>
      )}

      {editing && <ChannelDialog initial={editing === "new" ? null : editing} onClose={close} />}
      {archiveOpen && (
        <ArchiveDialog
          title={t("mkt.arch.channels")}
          items={archived.map((c) => ({
            id: c.id,
            title: c.title,
            sub: c.username ? `@${c.username}` : t("mkt.ch.private"),
            archivedAt: c.archived_at!,
          }))}
          onRestore={(id) => m.restore.mutateAsync(id)}
          onDestroy={(id) => m.remove.mutateAsync(id)}
          onClose={() => setArchiveOpen(false)}
        />
      )}
    </div>
  );
}

function ChannelCard({
  c,
  days,
  project,
  onEdit,
}: {
  c: ChannelRow;
  days: { day: string; members: number }[];
  project: { name: string; color: string } | null;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const { refresh, archive } = useChannelMutations();
  const [archiving, setArchiving] = useState(false);
  const g = useMemo(() => channelGrowth(days), [days]);
  const deltas = g.days.filter((d) => d.delta != null);
  const maxAbs = Math.max(1, ...deltas.map((d) => Math.abs(d.delta ?? 0)));
  return (
    <SectionCard
      icon={Send}
      tone="sky"
      title={c.title || `@${c.username}`}
      description={c.username ? `@${c.username}` : t("mkt.ch.private")}
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
        </div>
      }
    >
      {/* Project, purpose, live tracking. */}
      <div className="-mt-1 mb-3 flex flex-wrap items-center gap-1.5">
        {project && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold text-foreground">
            <span
              className={cn("h-2 w-2 rounded-full", PROJECT_DOT[project.color] ?? "bg-sky-500")}
            />
            {project.name}
          </span>
        )}
        <span className="rounded-md bg-sky-500/10 px-2 py-0.5 text-[12px] font-semibold text-sky-700 dark:text-sky-300">
          {t(`mkt.ch.purpose.${c.purpose}`)}
        </span>
        {c.track_live && (
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[12px] font-semibold text-rose-700 dark:text-rose-300">
            <Radio className="h-3 w-3" />
            {t("mkt.ch.liveOn")}
          </span>
        )}
      </div>
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
      <ArchiveConfirm
        name={c.title}
        open={archiving}
        onOpenChange={setArchiving}
        onConfirm={() => archive.mutateAsync(c.id)}
      />
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
      <p className={cn("mt-1 text-[18px] font-bold tabular-nums text-foreground", tone)}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
