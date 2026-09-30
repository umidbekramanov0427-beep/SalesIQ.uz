import { useState } from "react";
import {
  ChevronDown,
  GitBranch,
  ListFilter,
  Search,
  SlidersHorizontal,
  Tag,
  User,
} from "lucide-react";
import { cn, stageColorProps } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { CrmLeadView, ProfileRow, StageRow } from "@/hooks/use-crm-data";
import {
  AmountRangeFilter,
  amountInRange,
  type AmountRangeValue,
} from "@/components/filters/AmountRangeFilter";
import { FilterSelect, FilterSearchInput } from "@/components/filters/FilterSelect";

export type LeadFilterState = {
  funnel: string | null;
  ownerId: string | null;
  tags: string[];
  stageId: string | null;
  search: string;
  amount: AmountRangeValue;
  // leads.source -- which integration/channel the lead came in through
  // (AmoCRM, Bitrix24, a named web form, a webhook lead source, "manual",
  // "Import"). Tucked behind the "Advanced filters" button rather than its
  // own always-visible tile since it's reached for far less often than
  // owner/stage/tags.
  sources: string[];
};

export const EMPTY_LEAD_FILTERS: LeadFilterState = {
  funnel: null,
  ownerId: null,
  tags: [],
  stageId: null,
  search: "",
  amount: { min: null, max: null },
  sources: [],
};

export function filterLeads(leads: CrmLeadView[], f: LeadFilterState): CrmLeadView[] {
  const q = f.search.trim().toLowerCase();
  return leads.filter((l) => {
    if (f.funnel && (l.funnel || "Direct Sales") !== f.funnel) return false;
    if (f.ownerId && l.ownerId !== f.ownerId) return false;
    if (f.stageId && l.stageId !== f.stageId) return false;
    if (f.tags.length > 0 && !f.tags.some((tag) => l.tags.includes(tag))) return false;
    if (f.sources.length > 0 && !f.sources.includes(l.source)) return false;
    if (!amountInRange(l.expectedRevenue, f.amount)) return false;
    if (q) {
      const haystack = `${l.name} ${l.company} ${l.phone} ${l.id} ${l.score}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

// Shared checkbox-list popover behind a pill button -- used for both the
// tag filter and the source filter below, so a second multi-value filter
// didn't mean copy-pasting the whole open/toggle/popover implementation.
function MultiSelectFilter({
  icon: Icon,
  label,
  options,
  selected,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  function toggle(opt: string) {
    onChange(selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-56 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background text-[13px] font-medium text-foreground outline-none transition-colors hover:bg-accent"
      >
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        {label}
        {selected.length > 0 && (
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
            {selected.length}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10 cursor-default"
            aria-label={t("common.close")}
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-20 mt-2 max-h-64 w-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-card">
            {options.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-subtle">{t("common.none")}</p>
            )}
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  selected.includes(opt) && "bg-primary/10 text-primary",
                )}
              >
                <span className="truncate">{opt}</span>
                {selected.includes(opt) && <span>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function LeadFilterBar({
  value,
  onChange,
  funnels,
  showFunnelFilter = true,
  owners,
  tags,
  sources,
  stages,
}: {
  value: LeadFilterState;
  onChange: (v: LeadFilterState) => void;
  funnels: string[];
  // Hidden inside a single funnel's own detail view (Funnels), where a
  // funnel picker would be redundant -- still shown on pages that list
  // leads across every funnel at once.
  showFunnelFilter?: boolean;
  owners: ProfileRow[];
  tags: string[];
  // Distinct leads.source values seen in the current scope (AmoCRM,
  // Bitrix24, a web form's name, a lead source's name, "manual", "Import")
  // -- offered as checkboxes behind the "Advanced filters" button.
  sources: string[];
  stages: StageRow[];
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-3">
      {showFunnelFilter && (
        <FilterSelect
          icon={GitBranch}
          label={t("leadFilter.funnelLabel")}
          value={value.funnel ?? ""}
          onChange={(v) => onChange({ ...value, funnel: v || null })}
        >
          <option value="">{t("leadFilter.allFunnels")}</option>
          {funnels.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </FilterSelect>
      )}

      <FilterSelect
        icon={User}
        label={t("leadFilter.ownerLabel")}
        value={value.ownerId ?? ""}
        onChange={(v) => onChange({ ...value, ownerId: v || null })}
      >
        <option value="">{t("leadFilter.allOwners")}</option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.full_name || o.email}
          </option>
        ))}
      </FilterSelect>

      <FilterSelect
        icon={ListFilter}
        label={t("leadFilter.stageLabel")}
        value={value.stageId ?? ""}
        onChange={(v) => onChange({ ...value, stageId: v || null })}
      >
        <option value="">{t("leadFilter.allStages")}</option>
        {stages
          .filter((s) => !value.funnel || (s.pipeline_name || "Direct Sales") === value.funnel)
          .map((s) => {
            const { className, style } = stageColorProps(s.color);
            return (
              <option key={s.id} value={s.id} className={className} style={style}>
                {s.name}
              </option>
            );
          })}
      </FilterSelect>

      <MultiSelectFilter
        icon={Tag}
        label={t("leadFilter.allTags")}
        options={tags}
        selected={value.tags}
        onChange={(v) => onChange({ ...value, tags: v })}
      />

      <AmountRangeFilter value={value.amount} onChange={(v) => onChange({ ...value, amount: v })} />

      <FilterSearchInput
        icon={Search}
        label={t("leadFilter.searchLabel")}
        value={value.search}
        onChange={(v) => onChange({ ...value, search: v })}
        placeholder={t("leadFilter.searchPlaceholder")}
      />

      <MultiSelectFilter
        icon={SlidersHorizontal}
        label={t("leadFilter.advancedFilters")}
        options={sources}
        selected={value.sources}
        onChange={(v) => onChange({ ...value, sources: v })}
      />
    </div>
  );
}
