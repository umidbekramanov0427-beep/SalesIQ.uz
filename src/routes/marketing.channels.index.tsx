import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  ChevronRight,
  LogIn,
  LogOut,
  Send,
  Trash2,
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
import { channelAnalytics, type ChannelAnalytics } from "@/lib/channel-analytics";
import { downloadXlsx } from "@/lib/xlsx-write";
import { PROJECT_DOT } from "@/lib/marketing-projects";
import {
  useChannelDays,
  useChannelMutations,
  useChannels,
  useMarketingRules,
  type ChannelRow,
} from "@/hooks/use-crm-data";
import { RANGE_OPTIONS } from "@/lib/marketing-rules";
import { MarketingFilterBar, useMarketingFilters } from "@/components/marketing/MarketingFilters";
import { ChannelDialog } from "@/components/marketing/ChannelDialog";
import { ArchiveButton, ArchiveConfirm, ArchiveDialog } from "@/components/marketing/ArchiveDialog";

// Marketing paneli -> Kanallar: the company's Telegram channels (public by
// @name, private ones bound with /bind), each with its project and purpose.
// The platform's bot reads the subscribers every hour; here: how many there
// are, how many joined each day, the best day. Kanal qo'shish adds one;
// deleting puts it in the Arxiv; Excel exports the figures. Follows the
// project filter.

export const Route = createFileRoute("/marketing/channels/")({
  validateSearch: (s: Record<string, unknown>): { add?: boolean | undefined } => ({
    add: s["add"] === true || s["add"] === "true" ? true : undefined,
  }),
  head: () => ({ meta: [{ title: "Kanallar — SalesIQ Marketing" }] }),
  component: ChannelsPage,
});

const dayStr = (d: Date) => new Date(d.getTime() + 5 * 3_600_000).toISOString().slice(0, 10);

function ChannelsPage() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const f = useMarketingFilters();
  const q = useChannels();
  const m = useChannelMutations();
  const rules = useMarketingRules();
  const [range, setRange] = useState<number>(rules.channels.defaultRange);
  useEffect(() => setRange(rules.channels.defaultRange), [rules.channels.defaultRange]);
  const fromDay = dayStr(new Date(Date.now() - (range - 1) * 86_400_000));
  const toDay = dayStr(new Date());
  // The day before too, for the first day's change.
  const days = useChannelDays(dayStr(new Date(Date.now() - range * 86_400_000)));
  const [editing, setEditing] = useState<ChannelRow | null | "new">(search.add ? "new" : null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const all = q.data?.rows ?? [];
  const archived = all.filter((c) => c.archived_at);
  const rows = all.filter((c) => !c.archived_at && (!f.projectId || c.project_id === f.projectId));
  const daysOf = (id: string) => (days.data ?? []).filter((d) => d.channel_id === id);
  const growth = rows.map((c) => ({
    c,
    g: channelAnalytics({ from: fromDay, to: toDay, days: daysOf(c.id), events: [], stats: null }),
  }));
  const totalMembers = rows.reduce((s, c) => s + (c.members ?? 0), 0);
  const totalJoined = growth.reduce((s, x) => s + x.g.joined, 0);
  const totalLeft = growth.reduce((s, x) => s + x.g.left, 0);
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
            t("mkt.ca.joined"),
            t("mkt.ca.left"),
            t("mkt.ca.net"),
            t("mkt.ch.bestDay"),
            t("mkt.ch.invite"),
          ],
          ...growth.map(({ c, g }) => [
            c.title,
            c.username ? `@${c.username}` : "",
            projectOf(c.project_id)?.name ?? "",
            t(`mkt.ch.purpose.${c.purpose}`),
            c.members,
            g.joined,
            g.left,
            g.net,
            g.bestDay?.joined ? `${g.bestDay.day} (+${g.bestDay.joined})` : "",
            c.invite_link ?? "",
          ]),
        ],
      },
      {
        name: t("mkt.exp.days"),
        rows: [
          [
            t("mkt.exp.day"),
            t("mkt.ch.colTitle"),
            t("mkt.ch.members"),
            t("mkt.ca.joined"),
            t("mkt.ca.left"),
          ],
          ...growth.flatMap(({ c, g }) =>
            g.days.map((d) => [d.day, c.title, d.members, d.joined, d.left]),
          ),
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
          onChange={(v) => setRange(Number(v))}
          options={RANGE_OPTIONS.map((r) => ({
            value: String(r),
            label: t("mkt.ch.days", { n: r }),
          }))}
        />
      </MarketingFilterBar>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Send}
          iconTone="sky"
          label={t("mkt.ch.count")}
          tipKey="mkt.ch.count"
          value={String(rows.length)}
        />
        <StatCard
          icon={Users}
          iconTone="violet"
          label={t("mkt.ch.totalMembers")}
          tipKey="mkt.ch.totalMembers"
          value={totalMembers.toLocaleString("ru-RU")}
        />
        <StatCard
          icon={LogIn}
          iconTone="emerald"
          label={t("mkt.ca.joinedN", { n: range })}
          value={`+${totalJoined.toLocaleString("ru-RU")}`}
        />
        <StatCard
          icon={LogOut}
          iconTone="rose"
          label={t("mkt.ca.leftN", { n: range })}
          value={totalLeft ? `−${totalLeft.toLocaleString("ru-RU")}` : "0"}
          hint={t("mkt.ca.netHint", {
            n: `${totalJoined - totalLeft > 0 ? "+" : ""}${(totalJoined - totalLeft).toLocaleString("ru-RU")}`,
          })}
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
              g={growth.find((x) => x.c.id === c.id)!.g}
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
  g,
  project,
  onEdit,
}: {
  c: ChannelRow;
  g: ChannelAnalytics;
  project: { name: string; color: string } | null;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const { refresh, archive } = useChannelMutations();
  const [archiving, setArchiving] = useState(false);
  const maxUp = Math.max(1, ...g.days.map((d) => d.joined));
  const maxDown = Math.max(1, ...g.days.map((d) => d.left));
  const span = maxUp + maxDown;
  const zero = (maxUp / span) * 100;
  const hasFlow = g.days.some((d) => d.joined || d.left);
  const navigate = useNavigate();
  // The whole card opens the channel's analytics; its buttons, menu and
  // dialogs (portals bubble through React too) keep their own clicks.
  const open = (e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (
      el.closest(
        "button, a, input, [role=menu], [role=menuitem], [role=dialog], [role=alertdialog]",
      )
    )
      return;
    if (!e.currentTarget.contains(el)) return;
    void navigate({ to: "/marketing/channels/$id", params: { id: c.id } });
  };
  return (
    <div className="group cursor-pointer" onClick={open}>
      <SectionCard
        icon={Send}
        tone="sky"
        title={c.title || `@${c.username}`}
        description={c.username ? `@${c.username}` : t("mkt.ch.private")}
        actions={
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                refresh.mutate(c.id, {
                  onError: (err) => toast.error(describeError(err, t("mkt.ch.addFailed"))),
                });
              }}
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
            sub={
              g.net
                ? t("mkt.ca.netHint", {
                    n: `${g.net > 0 ? "+" : ""}${g.net.toLocaleString("ru-RU")}`,
                  })
                : undefined
            }
          />
          <Stat
            icon={LogIn}
            label={t("mkt.ca.joined")}
            value={`+${g.joined.toLocaleString("ru-RU")}`}
            tone="text-emerald-700 dark:text-emerald-300"
            sub={
              g.bestDay?.joined
                ? t("mkt.ca.bestDayShort", {
                    d: g.bestDay.day.slice(5).split("-").reverse().join("."),
                    n: g.bestDay.joined,
                  })
                : undefined
            }
          />
          <Stat
            icon={LogOut}
            label={t("mkt.ca.left")}
            value={g.left ? `−${g.left.toLocaleString("ru-RU")}` : "0"}
            tone={g.left ? "text-rose-700 dark:text-rose-300" : undefined}
            sub={g.churnPct != null ? t("mkt.ca.churnShort", { p: g.churnPct }) : undefined}
          />
        </div>
        {/* Joined (up) and left (down) each day. */}
        {hasFlow ? (
          <div className="mt-4">
            <div className="relative flex h-[96px] gap-[3px]">
              <span
                className="absolute inset-x-0 border-t border-border"
                style={{ top: `${zero}%` }}
              />
              {g.days.map((d) => (
                <div key={d.day} className="group/bar relative flex-1">
                  <span className="pointer-events-none absolute left-1/2 top-0 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11.5px] text-foreground shadow-sm group-hover/bar:block">
                    {d.day.slice(5).split("-").reverse().join(".")}: +{d.joined} / −{d.left}
                  </span>
                  <div
                    className="absolute inset-x-0 rounded-t-[2px] bg-emerald-500/85"
                    style={{
                      bottom: `${100 - zero}%`,
                      height: `${(d.joined / span) * 100}%`,
                      minHeight: d.joined ? 2 : 0,
                    }}
                  />
                  <div
                    className="absolute inset-x-0 rounded-b-[2px] bg-rose-500/85"
                    style={{
                      top: `${zero}%`,
                      height: `${(d.left / span) * 100}%`,
                      minHeight: d.left ? 2 : 0,
                    }}
                  />
                </div>
              ))}
            </div>
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
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-[13px]">
          <span className="text-muted-foreground">{t("mkt.ca.cardHint")}</span>
          <Link
            to="/marketing/channels/$id"
            params={{ id: c.id }}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            {t("mkt.ca.open")}
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </SectionCard>
      <ArchiveConfirm
        name={c.title}
        open={archiving}
        onOpenChange={setArchiving}
        onConfirm={() => archive.mutateAsync(c.id)}
      />
    </div>
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
