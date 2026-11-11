import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Palette, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  ALL_FUNNELS,
  CONDITION_VALUE,
  LEAD_COLOR_CARD,
  LEAD_COLOR_CONDITIONS,
  LEAD_COLOR_DOT,
  LEAD_COLOR_KEYS,
  PRIORITIES,
  TEMPERATURES,
  leadColor,
  parseLeadColorRules,
  ruleMatches,
  withLeadColorRules,
  type LeadColorConditionKind,
  type LeadColorKey,
  type LeadColorRule,
} from "@/lib/lead-colors";
import {
  useLeadCustomFieldDefs,
  useOrgGeneralSettings,
  usePipelineBoardLeads,
  useUpdateOrgGeneralSettings,
  type CrmLeadView,
} from "@/hooks/use-crm-data";
import type { Json } from "@/integrations/supabase/types";

// Voronka sozlamalari -> "Lid ranglari": the rules that paint lead cards on
// the funnel board. The first matching rule wins, so order matters (arrows
// move a rule up or down). Each rule shows how many of this funnel's leads
// it catches right now, and a column on the right shows the board as it
// will look -- all before saving.

const newId = () => Math.random().toString(36).slice(2, 10);

// One click on an empty page sets up what most teams want first.
const PRESETS: Omit<LeadColorRule, "id" | "funnel">[] = [
  { kind: "overdueTask", value: "", color: "red", enabled: true },
  { kind: "noTask", value: "", color: "orange", enabled: true },
  { kind: "daysInStage", value: "3", color: "amber", enabled: true },
  { kind: "tag", value: "VIP", color: "violet", enabled: true },
];

export function LeadColorsTab({ funnel }: { funnel: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canManage = ["super_admin", "rop", "platform_owner"].includes(user?.role ?? "");
  const save = useUpdateOrgGeneralSettings();
  const { data: fieldDefs = [] } = useLeadCustomFieldDefs();
  const board = usePipelineBoardLeads(funnel);
  const leads = board.rows;

  // Keyed by content: a background refetch of the settings doesn't wipe
  // what is being edited, another admin's save does.
  const { data: settings, isFetched: settingsLoaded } = useOrgGeneralSettings();
  const savedKey = JSON.stringify(parseLeadColorRules(settings?.kanban_card_fields));
  const saved = useMemo(() => JSON.parse(savedKey) as LeadColorRule[], [savedKey]);
  const [rules, setRules] = useState<LeadColorRule[]>(saved);
  // What this page last sent: its own save coming back isn't someone else's.
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (savedKey !== sent.current) setRules(saved);
  }, [savedKey, saved]);

  // Saved as you go, like the rest of Voronka sozlamalari (the bar's
  // "Saqlash" shows it working) -- a moment after the last change.
  const rulesKey = JSON.stringify(rules);
  useEffect(() => {
    if (!canManage || !settingsLoaded || rulesKey === savedKey) return;
    const timer = window.setTimeout(() => {
      sent.current = rulesKey;
      save.mutate(
        {
          kanban_card_fields: withLeadColorRules(
            settings?.kanban_card_fields,
            JSON.parse(rulesKey) as LeadColorRule[],
          ) as Json,
        },
        { onError: (err) => toast.error(describeError(err, t("lcolor.saveFailed"))) },
      );
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on the rules only
  }, [rulesKey]);
  const now = Date.now();

  // Rules of other funnels stay as they are; only this funnel's and the
  // all-funnels ones are shown here.
  const mine = rules.filter((r) => r.funnel === ALL_FUNNELS || r.funnel === funnel);
  const sources = useMemo(
    () => [...new Set(leads.map((l) => l.source).filter(Boolean))].sort(),
    [leads],
  );
  const tags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags))].sort(), [leads]);

  const patch = (id: string, p: Partial<LeadColorRule>) =>
    setRules((list) => list.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string) => setRules((list) => list.filter((r) => r.id !== id));
  const add = (base?: Omit<LeadColorRule, "id" | "funnel">) =>
    setRules((list) => [
      ...list,
      {
        id: newId(),
        funnel,
        ...(base ?? { kind: "noTask", value: "", color: "red", enabled: true }),
      },
    ]);
  // Moves a rule past its neighbour among the rules shown here.
  const move = (id: string, dir: -1 | 1) =>
    setRules((list) => {
      const shown = list.filter((r) => r.funnel === ALL_FUNNELS || r.funnel === funnel);
      const i = shown.findIndex((r) => r.id === id);
      const other = shown[i + dir];
      if (!other) return list;
      const a = list.findIndex((r) => r.id === id);
      const b = list.findIndex((r) => r.id === other.id);
      const next = [...list];
      [next[a], next[b]] = [next[b]!, next[a]!];
      return next;
    });

  const caught = (r: LeadColorRule) => leads.filter((l) => ruleMatches(r, l, now)).length;
  // The leads the preview column shows: painted ones first.
  const preview = useMemo(() => {
    const painted = leads
      .map((l) => ({ l, color: leadColor(l, rules, funnel, now) }))
      .sort((a, b) => Number(!!b.color) - Number(!!a.color));
    return painted.slice(0, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` changes every render
  }, [leads, rules, funnel]);
  const paintedCount = leads.filter((l) => leadColor(l, rules, funnel, now)).length;

  return (
    <>
      <PageHeader title={t("fs.tab.colors")} description={t("lcolor.desc")} icon={Palette} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          {mine.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Palette className="h-6 w-6" />
              </span>
              <p className="mt-4 text-[15px] font-semibold text-foreground">{t("lcolor.empty")}</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
                {t("lcolor.emptyHint")}
              </p>
              {canManage && (
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => PRESETS.forEach((p) => add(p))}>
                    <Wand2 className="h-4 w-4" /> {t("lcolor.presets")}
                  </Button>
                  <Button variant="outline" onClick={() => add()}>
                    <Plus className="h-4 w-4" /> {t("lcolor.add")}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ol className="space-y-2.5">
              {mine.map((r, i) => (
                <RuleRow
                  key={r.id}
                  n={i + 1}
                  rule={r}
                  funnel={funnel}
                  canManage={canManage}
                  count={board.isLoading ? null : caught(r)}
                  first={i === 0}
                  last={i === mine.length - 1}
                  sources={sources}
                  tags={tags}
                  fields={fieldDefs.map((d) => ({ key: d.key, label: d.label }))}
                  onChange={(p) => patch(r.id, p)}
                  onRemove={() => remove(r.id)}
                  onMove={(d) => move(r.id, d)}
                />
              ))}
              {canManage && (
                <li>
                  <button
                    type="button"
                    onClick={() => add()}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-[13px] font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/[0.04]"
                  >
                    <Plus className="h-4 w-4" /> {t("lcolor.add")}
                  </button>
                </li>
              )}
            </ol>
          )}
          <p className="mt-4 text-[12.5px] text-muted-foreground">{t("lcolor.orderHint")}</p>
        </section>

        {/* The board as it will look with these rules. */}
        <aside className="min-w-0">
          <div className="rounded-2xl border border-border bg-surface p-3 xl:sticky xl:top-4">
            <div className="mb-2.5 flex items-baseline justify-between gap-2 px-1">
              <p className="console-caption">{t("lcolor.preview")}</p>
              <p className="font-mono text-[11.5px] text-muted-foreground">
                {t("lcolor.painted", { n: paintedCount, total: leads.length })}
              </p>
            </div>
            {preview.length === 0 ? (
              <p className="px-1 py-8 text-center text-[13px] text-muted-foreground">
                {board.isLoading ? "…" : t("lcolor.noLeads")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {preview.map(({ l, color }) => (
                  <PreviewCard key={l.id} lead={l} color={color} />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function RuleRow({
  n,
  rule,
  funnel,
  canManage,
  count,
  first,
  last,
  sources,
  tags,
  fields,
  onChange,
  onRemove,
  onMove,
}: {
  n: number;
  rule: LeadColorRule;
  funnel: string;
  canManage: boolean;
  count: number | null;
  first: boolean;
  last: boolean;
  sources: string[];
  tags: string[];
  fields: { key: string; label: string }[];
  onChange: (p: Partial<LeadColorRule>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const valueKind = CONDITION_VALUE[rule.kind];
  const control =
    "h-9 min-w-0 rounded-lg border border-input bg-background px-2.5 text-[13px] text-foreground outline-none transition-colors [color-scheme:light] hover:border-primary/50 focus-visible:border-primary dark:[color-scheme:dark] disabled:opacity-60";
  const listId = `lcolor-${rule.id}`;
  return (
    <li
      className={cn(
        "rounded-2xl border bg-card p-3.5 transition-opacity",
        rule.enabled ? "border-border" : "border-dashed border-border opacity-60",
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white",
            LEAD_COLOR_DOT[rule.color],
          )}
        >
          {n}
        </span>
        <span className="text-[13px] font-medium text-muted-foreground">{t("lcolor.if")}</span>
        <select
          value={rule.kind}
          disabled={!canManage}
          onChange={(e) => {
            const kind = e.target.value as LeadColorConditionKind;
            const vk = CONDITION_VALUE[kind];
            onChange({
              kind,
              value:
                vk === "temperature"
                  ? "Hot"
                  : vk === "priority"
                    ? "High"
                    : vk === "number"
                      ? kind === "amountAtLeast"
                        ? "1000000"
                        : "3"
                      : "",
              field: kind === "customField" ? fields[0]?.key : undefined,
            });
          }}
          aria-label={t("lcolor.condition")}
          className={cn(control, "w-[210px] font-semibold")}
        >
          {LEAD_COLOR_CONDITIONS.filter((k) => k !== "customField" || fields.length > 0).map(
            (k) => (
              <option key={k} value={k}>
                {t(`lcolor.cond.${k}`)}
              </option>
            ),
          )}
        </select>

        {valueKind === "field" ? (
          <>
            <select
              value={rule.field ?? ""}
              disabled={!canManage}
              onChange={(e) => onChange({ field: e.target.value })}
              aria-label={t("lcolor.field")}
              className={cn(control, "w-[160px]")}
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <span className="text-[13px] text-muted-foreground">=</span>
            <input
              value={rule.value}
              disabled={!canManage}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder={t("lcolor.valuePh")}
              className={cn(control, "w-[150px]")}
            />
          </>
        ) : valueKind === "text" ? (
          <>
            <input
              value={rule.value}
              list={listId}
              disabled={!canManage}
              onChange={(e) => onChange({ value: e.target.value })}
              placeholder={rule.kind === "tag" ? t("lcolor.tagPh") : t("lcolor.sourcePh")}
              className={cn(control, "w-[170px]")}
            />
            <datalist id={listId}>
              {(rule.kind === "tag" ? tags : sources).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </>
        ) : valueKind === "number" ? (
          <span className="inline-flex items-center gap-2">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={rule.value}
              disabled={!canManage}
              onChange={(e) => onChange({ value: e.target.value })}
              className={cn(control, rule.kind === "amountAtLeast" ? "w-[140px]" : "w-[80px]")}
            />
            <span className="text-[13px] text-muted-foreground">
              {rule.kind === "amountAtLeast" ? t("lcolor.sum") : t("lcolor.days")}
            </span>
          </span>
        ) : valueKind === "temperature" || valueKind === "priority" ? (
          <select
            value={rule.value}
            disabled={!canManage}
            onChange={(e) => onChange({ value: e.target.value })}
            className={cn(control, "w-[140px]")}
          >
            {(valueKind === "temperature" ? TEMPERATURES : PRIORITIES).map((v) => (
              <option key={v} value={v}>
                {valueKind === "temperature" ? t(`lcolor.temp.${v}`) : t(`amo.priority.${v}`)}
              </option>
            ))}
          </select>
        ) : null}

        <span className="flex-1" />
        {count !== null && (
          <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {t("lcolor.caught", { n: count })}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-border pt-3">
        <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("lcolor.color")}>
          {LEAD_COLOR_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={rule.color === c}
              aria-label={t(`lcolor.colorName.${c}`)}
              title={t(`lcolor.colorName.${c}`)}
              disabled={!canManage}
              onClick={() => onChange({ color: c })}
              className={cn(
                "h-6 w-6 rounded-full ring-offset-2 ring-offset-card transition-transform disabled:cursor-default",
                LEAD_COLOR_DOT[c as LeadColorKey],
                rule.color === c ? "scale-110 ring-2 ring-foreground/70" : "hover:scale-110",
              )}
            />
          ))}
        </div>
        <select
          value={rule.funnel === ALL_FUNNELS ? ALL_FUNNELS : funnel}
          disabled={!canManage}
          onChange={(e) => onChange({ funnel: e.target.value })}
          aria-label={t("lcolor.scope")}
          className={cn(control, "h-8 w-auto text-[12.5px]")}
        >
          <option value={funnel}>{t("lcolor.thisFunnel", { name: funnel })}</option>
          <option value={ALL_FUNNELS}>{t("lcolor.allFunnels")}</option>
        </select>
        <span className="flex-1" />
        {canManage && (
          <div className="flex items-center gap-1">
            <Switch
              checked={rule.enabled}
              onCheckedChange={(v) => onChange({ enabled: v })}
              aria-label={t("lcolor.enabled")}
            />
            <IconButton label={t("lcolor.up")} disabled={first} onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("lcolor.down")} disabled={last} onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("common.delete")} onClick={onRemove} danger>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        )}
      </div>
    </li>
  );
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30 disabled:hover:bg-transparent",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// A small stand-in for the board card: name, stage, amount -- painted.
function PreviewCard({ lead, color }: { lead: CrmLeadView; color: LeadColorKey | null }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-2.5 py-2 text-[12.5px] shadow-[0_1px_1px_rgba(16,24,40,0.04)]",
        color && LEAD_COLOR_CARD[color],
      )}
    >
      <p className="truncate font-semibold text-primary">{lead.contactName || lead.name}</p>
      <p className="mt-0.5 flex items-center gap-1.5 truncate text-muted-foreground">
        <span className="truncate">{lead.stage}</span>
        {lead.tags[0] && (
          <span className="shrink-0 rounded bg-foreground/[0.06] px-1 text-[11px]">
            {lead.tags[0]}
          </span>
        )}
      </p>
    </div>
  );
}
