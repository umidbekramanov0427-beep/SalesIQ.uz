import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { cn, stageColorProps } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type {
  CrmLeadView,
  LeadCustomFieldDefRow,
  ProfileRow,
  StageRow,
} from "@/hooks/use-crm-data";
import { amountInRange, type AmountRangeValue } from "@/components/filters/AmountRangeFilter";
import { DateRangeFilter, type DateFilterValue } from "@/components/leaderboard/DateRangeFilter";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// A funnel's filters, amoCRM-style: one search box with a "Filters" button
// that opens a panel of three columns -- quick presets and the team on the
// left, the lead's properties in the middle, tags on the right. Every
// change applies at once (the state lives in the URL, see funnels.tsx).

export type LeadPreset = "" | "open" | "mine" | "won" | "lost" | "noTasks" | "overdue";
export type LeadTaskFilter = "" | "today" | "tomorrow" | "week" | "month" | "none" | "overdue";

export type LeadFilterState = {
  funnel: string | null;
  ownerIds: string[];
  tags: string[];
  stageIds: string[];
  // The search box: name, company, phone...
  search: string;
  // The panel's "Lead name" field.
  name: string;
  amount: AmountRangeValue;
  // leads.source -- the channel the lead came in through.
  sources: string[];
  preset: LeadPreset;
  tasks: LeadTaskFilter;
  // Select-type custom fields: key -> the value it must have.
  custom: Record<string, string>;
};

export const EMPTY_LEAD_FILTERS: LeadFilterState = {
  funnel: null,
  ownerIds: [],
  tags: [],
  stageIds: [],
  search: "",
  name: "",
  amount: { min: null, max: null },
  sources: [],
  preset: "",
  tasks: "",
  custom: {},
};

// How many filters are on (the search box itself not counted).
export function activeFilterCount(f: LeadFilterState, dateOn: boolean): number {
  return (
    (f.preset ? 1 : 0) +
    (f.ownerIds.length ? 1 : 0) +
    (f.tags.length ? 1 : 0) +
    (f.stageIds.length ? 1 : 0) +
    (f.name.trim() ? 1 : 0) +
    (f.amount.min != null || f.amount.max != null ? 1 : 0) +
    (f.sources.length ? 1 : 0) +
    (f.tasks ? 1 : 0) +
    Object.keys(f.custom).length +
    (dateOn ? 1 : 0)
  );
}

function dayStart(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

function taskMatches(iso: string | null, f: LeadTaskFilter): boolean {
  if (!f) return true;
  if (f === "none") return !iso;
  if (!iso) return false;
  const at = new Date(iso).getTime();
  switch (f) {
    case "overdue":
      return at < Date.now();
    case "today":
      return at >= dayStart(0) && at < dayStart(1);
    case "tomorrow":
      return at >= dayStart(1) && at < dayStart(2);
    case "week":
      return at >= dayStart(0) && at < dayStart(7);
    case "month":
      return at >= dayStart(0) && at < dayStart(30);
  }
}

export function filterLeads(
  leads: CrmLeadView[],
  f: LeadFilterState,
  me?: string | null,
): CrmLeadView[] {
  const q = f.search.trim().toLowerCase();
  const name = f.name.trim().toLowerCase();
  const now = Date.now();
  return leads.filter((l) => {
    if (f.funnel && (l.funnel || "Direct Sales") !== f.funnel) return false;
    switch (f.preset) {
      case "open":
        if (l.stageIsWon || l.stageIsLost) return false;
        break;
      case "mine":
        if (!me || l.ownerId !== me) return false;
        break;
      case "won":
        if (!l.stageIsWon) return false;
        break;
      case "lost":
        if (!l.stageIsLost) return false;
        break;
      case "noTasks":
        if (l.nextFollowUpIso) return false;
        break;
      case "overdue":
        if (!l.nextFollowUpIso || new Date(l.nextFollowUpIso).getTime() >= now) return false;
        break;
    }
    if (f.ownerIds.length && !f.ownerIds.includes(l.ownerId)) return false;
    if (f.stageIds.length && !f.stageIds.includes(l.stageId)) return false;
    if (f.tags.length && !f.tags.some((tag) => l.tags.includes(tag))) return false;
    if (f.sources.length && !f.sources.includes(l.source)) return false;
    if (!amountInRange(l.expectedRevenue, f.amount)) return false;
    if (!taskMatches(l.nextFollowUpIso, f.tasks)) return false;
    for (const [key, want] of Object.entries(f.custom)) {
      if (String(l.customFields[key] ?? "") !== want) return false;
    }
    if (name && !`${l.name} ${l.company}`.toLowerCase().includes(name)) return false;
    if (q) {
      const haystack =
        `${l.name} ${l.company} ${l.contactName} ${l.phone} ${l.email} ${l.id}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Panel building blocks                                               */
/* ------------------------------------------------------------------ */

function ColumnTitle({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-subtle">{children}</p>
  );
}

const FIELD =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-subtle hover:border-primary/40 focus:border-primary focus:ring-2 focus:ring-primary/15";

// A dropdown inside the panel: "Label: All values" until something's
// picked; multi-select with checkboxes, or single with a check.
function PanelSelect({
  label,
  allLabel,
  options,
  selected,
  onChange,
  multi = true,
}: {
  label: string;
  allLabel: string;
  options: { value: string; label: string; swatch?: ReturnType<typeof stageColorProps> }[];
  selected: string[];
  onChange: (v: string[]) => void;
  multi?: boolean;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const picked = options.filter((o) => selected.includes(o.value));
  const summary =
    picked.length === 0
      ? allLabel
      : picked.length === 1
        ? picked[0]!.label
        : t("funnelFilter.nSelected", { count: picked.length });

  function toggle(v: string) {
    if (!multi) return onChange(selected.includes(v) ? [] : [v]);
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  return (
    <Popover onOpenChange={(o) => !o && setQuery("")}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            FIELD,
            "flex items-center gap-2 text-left",
            picked.length > 0 && "border-primary/50 bg-primary/[0.05]",
          )}
        >
          <span className="shrink-0 text-muted-foreground">{label}:</span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              picked.length ? "font-semibold text-foreground" : "text-subtle",
            )}
          >
            {summary}
          </span>
          {picked.length > 0 ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={t("funnelFilter.clear")}
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-subtle hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-56 overflow-hidden p-0"
      >
        {options.length > 8 && (
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-subtle" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("funnelFilter.search")}
              className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
          </div>
        )}
        <div className="max-h-64 overflow-y-auto p-1">
          {multi && options.length > 1 && !q && (
            <button
              type="button"
              onClick={() =>
                onChange(selected.length === options.length ? [] : options.map((o) => o.value))
              }
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] font-medium text-primary hover:bg-accent"
            >
              {selected.length === options.length
                ? t("funnelFilter.selectNone")
                : t("funnelFilter.selectAll")}
            </button>
          )}
          {shown.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => toggle(o.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent",
                  on && "font-semibold",
                )}
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded border",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    !multi && "rounded-full",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                {o.swatch && (
                  <span
                    className={cn("h-3 w-3 shrink-0 rounded-sm", o.swatch.className)}
                    style={o.swatch.style}
                  />
                )}
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
          {shown.length === 0 && (
            <p className="px-2 py-3 text-center text-[12.5px] text-subtle">
              {t("funnelFilter.nothing")}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Search box + Filters panel                                          */
/* ------------------------------------------------------------------ */

export function FunnelSearchFilter({
  value,
  onChange,
  date,
  onDateChange,
  leads,
  owners,
  stages,
  fieldDefs,
  meId,
}: {
  value: LeadFilterState;
  onChange: (v: LeadFilterState) => void;
  date: DateFilterValue;
  onDateChange: (v: DateFilterValue) => void;
  // The funnel's leads before filtering: tag counts, sources, owners.
  leads: CrmLeadView[];
  owners: ProfileRow[];
  stages: StageRow[];
  fieldDefs: LeadCustomFieldDefRow[];
  meId: string | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const dateOn = !!(date.from || date.to);
  const count = activeFilterCount(value, dateOn);
  const set = (patch: Partial<LeadFilterState>) => onChange({ ...value, ...patch });

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) for (const tag of l.tags) m.set(tag, (m.get(tag) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [leads]);
  const sources = useMemo(
    () => [...new Set(leads.map((l) => l.source).filter(Boolean))].sort(),
    [leads],
  );
  const shownTags = tagQuery.trim()
    ? tagCounts.filter(([tag]) => tag.toLowerCase().includes(tagQuery.trim().toLowerCase()))
    : tagCounts;

  const presets: { key: LeadPreset; label: string; dot?: string }[] = [
    { key: "open", label: t("funnelFilter.preset.open") },
    { key: "mine", label: t("funnelFilter.preset.mine") },
    { key: "won", label: t("funnelFilter.preset.won") },
    { key: "lost", label: t("funnelFilter.preset.lost") },
    { key: "noTasks", label: t("funnelFilter.preset.noTasks"), dot: "bg-amber-500" },
    { key: "overdue", label: t("funnelFilter.preset.overdue"), dot: "bg-destructive" },
  ];
  const taskOptions: { value: LeadTaskFilter; label: string }[] = [
    { value: "today", label: t("funnelFilter.tasks.today") },
    { value: "tomorrow", label: t("funnelFilter.tasks.tomorrow") },
    { value: "week", label: t("funnelFilter.tasks.week") },
    { value: "month", label: t("funnelFilter.tasks.month") },
    { value: "none", label: t("funnelFilter.tasks.none") },
    { value: "overdue", label: t("funnelFilter.tasks.overdue") },
  ];
  const selectDefs = fieldDefs.filter(
    (d) => d.field_type === "select" && Array.isArray(d.options) && d.options.length > 0,
  );

  const presetRow = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
      active
        ? "bg-primary/10 font-semibold text-primary"
        : "text-foreground/85 hover:bg-accent hover:text-foreground",
    );

  function reset() {
    onChange({ ...EMPTY_LEAD_FILTERS, funnel: value.funnel, search: value.search });
    onDateChange({ from: null, to: null, label: t("lb.presetAll") });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl border bg-card pl-3.5 pr-1.5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors",
            open ? "border-primary/60 ring-2 ring-primary/15" : "border-border",
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-subtle" />
          <input
            value={value.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder={t("leadFilter.searchPlaceholder")}
            aria-label={t("leadFilter.searchLabel")}
            className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-subtle"
          />
          {value.search && (
            <button
              type="button"
              onClick={() => set({ search: "" })}
              aria-label={t("leadFilter.clearSearch")}
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-subtle hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="h-5 w-px shrink-0 bg-border" />
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-[12.5px] font-semibold transition-colors",
                count > 0 || open
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("funnelFilter.button")}</span>
              {count > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10.5px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(1040px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl p-0"
      >
        <div className="grid max-h-[min(72vh,640px)] grid-cols-1 overflow-y-auto md:grid-cols-[230px_minmax(0,1fr)_270px] md:overflow-hidden">
          {/* Presets and the team */}
          <div className="border-b border-border bg-muted/40 p-3 md:overflow-y-auto md:border-b-0 md:border-r">
            <div className="space-y-0.5">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => set({ preset: value.preset === p.key ? "" : p.key })}
                  disabled={p.key === "mine" && !meId}
                  className={presetRow(value.preset === p.key)}
                >
                  {p.dot && <span className={cn("h-2 w-2 shrink-0 rounded-full", p.dot)} />}
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </div>
            {owners.length > 0 && (
              <>
                <p className="mb-1 mt-4 px-2.5 text-[11px] font-bold uppercase tracking-wider text-subtle">
                  {t("funnelFilter.team")}
                </p>
                <div className="space-y-0.5">
                  {owners.map((o) => {
                    const on = value.ownerIds.length === 1 && value.ownerIds[0] === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => set({ ownerIds: on ? [] : [o.id] })}
                        className={presetRow(on)}
                      >
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/12 text-[9.5px] font-bold text-primary">
                          {(o.full_name || o.email).slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate">{o.full_name || o.email}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Lead properties */}
          <div className="p-4 md:overflow-y-auto">
            <ColumnTitle>{t("funnelFilter.properties")}</ColumnTitle>
            <div className="space-y-2">
              <input
                value={value.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={t("funnelFilter.leadName")}
                className={FIELD}
              />
              <div className="[&>button]:!h-9 [&>button]:!w-full [&>button]:!rounded-lg [&>button]:!bg-background">
                <DateRangeFilter value={date} onChange={onDateChange} />
              </div>
              <PanelSelect
                label={t("funnelFilter.stages")}
                allLabel={t("funnelFilter.all")}
                options={stages.map((s) => ({
                  value: s.id,
                  label: s.name,
                  swatch: stageColorProps(s.color),
                }))}
                selected={value.stageIds}
                onChange={(v) => set({ stageIds: v })}
              />
              <PanelSelect
                label={t("funnelFilter.source")}
                allLabel={t("funnelFilter.all")}
                options={sources.map((s) => ({ value: s, label: s }))}
                selected={value.sources}
                onChange={(v) => set({ sources: v })}
              />
              <PanelSelect
                label={t("funnelFilter.managers")}
                allLabel={t("funnelFilter.all")}
                options={owners.map((o) => ({ value: o.id, label: o.full_name || o.email }))}
                selected={value.ownerIds}
                onChange={(v) => set({ ownerIds: v })}
              />
              <PanelSelect
                label={t("funnelFilter.tasks")}
                allLabel={t("funnelFilter.all")}
                multi={false}
                options={taskOptions}
                selected={value.tasks ? [value.tasks] : []}
                onChange={(v) => set({ tasks: (v[0] ?? "") as LeadTaskFilter })}
              />
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={value.amount.min ?? ""}
                  onChange={(e) =>
                    set({
                      amount: {
                        ...value.amount,
                        min: e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                  placeholder={t("funnelFilter.budgetFrom")}
                  className={FIELD}
                />
                <span className="text-subtle">—</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={value.amount.max ?? ""}
                  onChange={(e) =>
                    set({
                      amount: {
                        ...value.amount,
                        max: e.target.value === "" ? null : Number(e.target.value),
                      },
                    })
                  }
                  placeholder={t("funnelFilter.budgetTo")}
                  className={FIELD}
                />
              </div>
              {selectDefs.length > 0 && (
                <p className="pt-2 text-[11px] font-bold uppercase tracking-wider text-subtle">
                  {t("funnelFilter.customFields")}
                </p>
              )}
              {selectDefs.map((d) => (
                <PanelSelect
                  key={d.id}
                  label={d.label}
                  allLabel={t("funnelFilter.all")}
                  multi={false}
                  options={(d.options as string[]).map((o) => ({ value: o, label: o }))}
                  selected={value.custom[d.key] ? [value.custom[d.key]!] : []}
                  onChange={(v) => {
                    const next = { ...value.custom };
                    if (v[0]) next[d.key] = v[0];
                    else delete next[d.key];
                    set({ custom: next });
                  }}
                />
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="border-t border-border p-4 md:overflow-y-auto md:border-l md:border-t-0">
            <ColumnTitle>{t("funnelFilter.tags")}</ColumnTitle>
            <input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder={t("funnelFilter.findTag")}
              className={FIELD}
            />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {shownTags.map(([tag, n]) => {
                const on = value.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      set({ tags: on ? value.tags.filter((x) => x !== tag) : [...value.tags, tag] })
                    }
                    className={cn(
                      "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[12.5px] transition-colors",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/50",
                    )}
                  >
                    <span className="truncate">{tag}</span>
                    <span
                      className={cn(
                        "tabular-nums",
                        on ? "text-primary-foreground/80" : "text-subtle",
                      )}
                    >
                      {n}
                    </span>
                  </button>
                );
              })}
              {shownTags.length === 0 && (
                <p className="py-2 text-[12.5px] text-subtle">{t("funnelFilter.noTags")}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
          <p className="text-[12.5px] text-muted-foreground">
            {count > 0 ? t("funnelFilter.activeCount", { count }) : t("funnelFilter.noneActive")}
          </p>
          <span className="flex-1" />
          {count > 0 && (
            <button
              type="button"
              onClick={reset}
              className="h-8 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t("funnelFilter.reset")}
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-8 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm transition-[filter] hover:brightness-110"
          >
            {t("funnelFilter.done")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
