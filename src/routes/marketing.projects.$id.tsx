import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  Download,
  Images,
  Loader2,
  Pencil,
  Send,
  Tag,
  Video,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { SectionCard } from "@/components/layout/Primitives";
import { PeriodPicker } from "@/components/analytics/PeriodPicker";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PROJECT_DOT } from "@/lib/marketing-projects";
import {
  useChannels,
  useMarketingData,
  useMarketingProjects,
  useWebinars,
} from "@/hooks/use-crm-data";
import {
  DailyLeads,
  OverviewKpis,
  OverviewLists,
  exportOverview,
} from "@/components/marketing/OverviewParts";
import { ShotsGallery } from "@/components/marketing/ShotsGallery";
import { ProjectDialog } from "@/components/marketing/ProjectDialog";
import { useMarketingFilters } from "@/components/marketing/MarketingFilters";

// One project's own page: its figures (leads from its funnels and UTM
// campaigns, spend, CPL, ROI), its channels and webinars, and Rasmlar --
// every live-stream picture with its time and viewers.

type Tab = "stats" | "channels" | "webinars" | "shots";

export const Route = createFileRoute("/marketing/projects/$id")({
  validateSearch: (s: Record<string, unknown>): { tab?: Tab | undefined } => ({
    tab: ["stats", "channels", "webinars", "shots"].includes(s["tab"] as string)
      ? (s["tab"] as Tab)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Loyiha — SalesIQ Marketing" }] }),
  component: ProjectPage,
});

function ProjectPage() {
  const { t } = useI18n();
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab: Tab = search.tab ?? "stats";
  const f = useMarketingFilters();
  const { data: pd, isLoading } = useMarketingProjects();
  const project = pd?.rows.find((p) => p.id === id) ?? null;
  const q = useMarketingData(f.period, id);
  const all = useMarketingData(f.period);
  const { data: ch } = useChannels();
  const { data: wd } = useWebinars();
  const [editing, setEditing] = useState(false);
  const channels = (ch?.rows ?? []).filter((c) => c.project_id === id && !c.archived_at);
  const webinars = (wd?.rows ?? []).filter((w) => w.project_id === id && !w.archived_at);

  if (isLoading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (!project)
    return (
      <div className="surface-card px-6 py-14 text-center">
        <p className="text-[15px] font-semibold text-foreground">{t("mkt.p.notFound")}</p>
        <Link to="/marketing/settings" className="mt-3 inline-block text-primary hover:underline">
          {t("mkt.p.back")}
        </Link>
      </div>
    );
  const d = q.data;

  return (
    <div className="space-y-5">
      <Link
        to="/marketing/settings"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("mkt.p.back")}
      </Link>

      {/* The project's header: color, name, funnels and campaigns. */}
      <header className="surface-card flex flex-wrap items-start gap-4 p-5">
        <span
          className={cn(
            "grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-[22px] font-bold text-white",
            PROJECT_DOT[project.color] ?? "bg-sky-500",
          )}
        >
          {project.name.trim().slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[24px] font-bold leading-tight text-foreground">{project.name}</h1>
          {project.note && (
            <p className="mt-1 text-[13.5px] text-muted-foreground">{project.note}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Workflow className="h-3.5 w-3.5" />
              {project.funnels.length ? project.funnels.join(", ") : t("mkt.p.noFunnel")}
            </span>
            <span className="flex items-center gap-1.5 font-mono">
              <Tag className="h-3.5 w-3.5" />
              {project.utm_campaigns.length ? project.utm_campaigns.join(", ") : t("mkt.p.noUtm")}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
            {t("mkt.p.edit")}
          </Button>
          <Button
            variant="outline"
            disabled={!d}
            onClick={() => d && exportOverview(d, t, `loyiha-${project.name}`)}
          >
            <Download className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Segmented
          value={tab}
          onChange={(next) =>
            void navigate({ search: { tab: next === "stats" ? undefined : next }, replace: true })
          }
          options={[
            { value: "stats", label: t("mkt.p.tabStats"), icon: BarChart3 },
            {
              value: "channels",
              label: `${t("mkt.nav.channels")} · ${channels.length}`,
              icon: Send,
            },
            {
              value: "webinars",
              label: `${t("mkt.nav.webinars")} · ${webinars.length}`,
              icon: Video,
            },
            { value: "shots", label: t("mkt.shots.button"), icon: Images },
          ]}
        />
        {tab === "stats" && (
          <PeriodPicker
            preset={f.preset}
            period={f.period}
            onPreset={f.setPreset}
            onPeriod={f.setPeriod}
          />
        )}
      </div>

      {tab === "stats" &&
        (!d ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <OverviewKpis d={d} />
            <DailyLeads days={d.days} />
            <OverviewLists d={d} />
          </>
        ))}

      {tab === "channels" && (
        <SectionCard
          icon={Send}
          tone="sky"
          title={t("mkt.nav.channels")}
          description={t("mkt.p.channelsDesc")}
        >
          {channels.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-muted-foreground">
              {t("mkt.p.noChannels")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {channels.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <img src="/brand/telegram.svg" alt="" className="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-foreground">{c.title}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {c.username ? `@${c.username}` : t("mkt.ch.private")} ·{" "}
                      {t(`mkt.ch.purpose.${c.purpose}`)}
                    </p>
                  </div>
                  <span className="text-[16px] font-bold tabular-nums text-foreground">
                    {c.members?.toLocaleString("ru-RU") ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "webinars" && (
        <SectionCard
          icon={Video}
          tone="violet"
          title={t("mkt.nav.webinars")}
          description={t("mkt.p.webinarsDesc")}
        >
          {webinars.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-muted-foreground">
              {t("mkt.p.noWebinars")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {webinars.map((w) => {
                const vs = (wd?.samples ?? [])
                  .filter((s) => s.webinar_id === w.id)
                  .map((s) => s.viewers);
                return (
                  <li key={w.id}>
                    <Link
                      to="/marketing/webinars/$id"
                      params={{ id: w.id }}
                      className="flex items-center gap-3 py-3 hover:bg-accent/40"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400">
                        <Video className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-foreground">
                          {w.title}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          {w.platform === "youtube" ? "YouTube" : "Telegram"} ·{" "}
                          {w.starts_at ? new Date(w.starts_at).toLocaleString("ru-RU") : "—"}
                        </p>
                      </div>
                      <span className="text-right">
                        <span className="block text-[16px] font-bold tabular-nums text-foreground">
                          {vs.length ? Math.max(...vs).toLocaleString("ru-RU") : "—"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{t("mkt.p.peak")}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      {tab === "shots" && <ShotsGallery projectId={project.id} />}

      {editing && (
        <ProjectDialog
          initial={project}
          funnelNames={all.data?.funnelNames ?? []}
          campaignNames={all.data?.campaignNames ?? []}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
