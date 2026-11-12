import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, FolderKanban, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PeriodPicker,
  presetPeriod,
  type Period,
  type Preset,
} from "@/components/analytics/PeriodPicker";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { PROJECT_DOT } from "@/lib/marketing-projects";
import { useMarketingProjects, type ProjectRow } from "@/hooks/use-crm-data";

// The marketing panel's filters, shared by every page: the project (Loyiha)
// and the period. They stay as the person moves between pages and come
// back next time (this browser only).

type Filters = {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  preset: Preset;
  setPreset: (p: Preset) => void;
  period: Period;
  setPeriod: (p: Period) => void;
  /** Active (not archived) projects. */
  projects: ProjectRow[];
  project: ProjectRow | null;
};

const Ctx = createContext<Filters | null>(null);
const KEY = "mkt-filters";

function load(): { projectId: string | null; preset: Preset } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { projectId: null, preset: "month" };
    const v = JSON.parse(raw) as { projectId?: unknown; preset?: unknown };
    return {
      projectId: typeof v.projectId === "string" ? v.projectId : null,
      preset:
        typeof v.preset === "string" && v.preset !== "custom" ? (v.preset as Preset) : "month",
    };
  } catch {
    return { projectId: null, preset: "month" };
  }
}

export function MarketingFiltersProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("month");
  const [period, setPeriod] = useState<Period>(() => presetPeriod("month"));
  // Read the saved choice after the first paint (no storage on the server).
  useEffect(() => {
    const saved = load();
    setProjectId(saved.projectId);
    if (saved.preset !== "custom") {
      setPreset(saved.preset);
      setPeriod(presetPeriod(saved.preset));
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ projectId, preset }));
    } catch {
      /* private mode: not remembered */
    }
  }, [projectId, preset]);

  const { data } = useMarketingProjects();
  const projects = useMemo(() => (data?.rows ?? []).filter((p) => !p.archived_at), [data?.rows]);
  const project = projects.find((p) => p.id === projectId) ?? null;
  // A project that was archived or deleted falls back to "all".
  useEffect(() => {
    if (projectId && data && !project) setProjectId(null);
  }, [projectId, data, project]);

  const value = useMemo<Filters>(
    () => ({
      projectId: project?.id ?? null,
      setProjectId,
      preset,
      setPreset,
      period,
      setPeriod,
      projects,
      project,
    }),
    [project, preset, period, projects],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarketingFilters(): Filters {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMarketingFilters must be used inside <MarketingFiltersProvider>");
  return v;
}

/** The project chooser: a chip with the project's color, a list to pick from. */
export function ProjectPicker({ className }: { className?: string }) {
  const { t } = useI18n();
  const { projects, project, setProjectId } = useMarketingFilters();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 items-center gap-2 rounded-xl border px-3 text-[13.5px] transition-colors",
            project
              ? "border-primary/50 bg-primary/5 text-foreground"
              : "border-border bg-card hover:border-primary/30",
            className,
          )}
        >
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{t("mkt.p.filter")}:</span>
          {project && (
            <span
              className={cn("h-2.5 w-2.5 rounded-full", PROJECT_DOT[project.color] ?? "bg-sky-500")}
            />
          )}
          <span className="max-w-[180px] truncate font-semibold">
            {project?.name ?? t("mkt.p.all")}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] rounded-2xl p-1.5">
        {[null, ...projects].map((p) => {
          const on = (p?.id ?? null) === (project?.id ?? null);
          return (
            <button
              key={p?.id ?? "all"}
              type="button"
              onClick={() => {
                setProjectId(p?.id ?? null);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-accent",
                on && "bg-accent font-semibold",
              )}
            >
              <span
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  p
                    ? (PROJECT_DOT[p.color] ?? "bg-sky-500")
                    : "bg-gradient-to-br from-sky-400 to-violet-500",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{p?.name ?? t("mkt.p.all")}</span>
              {on && <Check className="h-4 w-4 text-primary" />}
            </button>
          );
        })}
        <Link
          to="/marketing/settings"
          search={{ tab: "projects" }}
          onClick={() => setOpen(false)}
          className="mt-1 flex items-center gap-2 border-t border-border px-2.5 pb-1 pt-2.5 text-[13px] font-semibold text-primary hover:underline"
        >
          <Plus className="h-4 w-4" />
          {t("mkt.p.add")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The bar under every page's header: the project, the period (where the
 * page has one) and anything the page adds on the right.
 */
export function MarketingFilterBar({
  period = true,
  children,
}: {
  period?: boolean;
  children?: ReactNode;
}) {
  const f = useMarketingFilters();
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <ProjectPicker />
      {period && (
        <PeriodPicker
          preset={f.preset}
          period={f.period}
          onPreset={f.setPreset}
          onPeriod={f.setPeriod}
        />
      )}
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
