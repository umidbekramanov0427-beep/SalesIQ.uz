import { useMemo, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Layers,
  ListFilter,
  Loader2,
  Shuffle,
  Tag,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { StagePickButton } from "@/components/crm/StagePickButton";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  PICK_PATTERNS,
  dealOut,
  pickIndices,
  sortLikeBoard,
  type BoardSortBy,
  type PickPattern,
} from "@/lib/lead-distribution";
import {
  useBulkUpdateLeads,
  type CrmLeadView,
  type ProfileRow,
  type StageRow,
} from "@/hooks/use-crm-data";

// "Lid taqsimlash" (the funnel's "..." menu, admins and ROPs): hand a batch
// of one stage's leads to salespeople without ticking them one by one.
// Pick the stage, how many, which ones (from the start, every second one,
// the middle, ...), optionally only some tags or dates, and who gets them;
// the right side shows the stage's column with the chosen leads marked and
// how many each person gets, before anything changes.

const QUICK_COUNTS = [10, 20, 30] as const;
/** Leads per update request (keeps the URL of `id=in.(...)` short). */
const CHUNK = 200;

const dayStart = (v: string) => (v ? new Date(`${v}T00:00:00`).getTime() : null);
const dayEnd = (v: string) => (v ? new Date(`${v}T23:59:59.999`).getTime() : null);

export function LeadDistributeWindow({
  leads,
  stages,
  owners,
  sortBy,
  onClose,
}: {
  /** Every lead of the funnel. */
  leads: CrmLeadView[];
  /** The funnel's stages in board order. */
  stages: StageRow[];
  owners: ProfileRow[];
  sortBy: BoardSortBy;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const update = useBulkUpdateLeads();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) m.set(l.stageId, (m.get(l.stageId) ?? 0) + 1);
    return m;
  }, [leads]);
  const [stageId, setStageId] = useState<string | null>(
    () => stages.find((s) => (counts.get(s.id) ?? 0) > 0)?.id ?? stages[0]?.id ?? null,
  );
  const [count, setCount] = useState(10);
  const [customCount, setCustomCount] = useState("");
  const [pattern, setPattern] = useState<PickPattern>("start");
  const [patternsOpen, setPatternsOpen] = useState(false);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Only this funnel's tags, most used first.
  const funnelTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of leads) for (const tag of l.tags) m.set(tag, (m.get(tag) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [leads]);

  // The stage's column as the board shows it, then the tag / date filters.
  const column = useMemo(() => {
    const inStage = sortLikeBoard(
      leads.filter((l) => l.stageId === stageId),
      sortBy,
    );
    const lo = dayStart(from);
    const hi = dayEnd(to);
    return inStage.filter((l) => {
      if (tags.size > 0 && !l.tags.some((tag) => tags.has(tag))) return false;
      const created = new Date(l.createdAtIso).getTime();
      if (lo !== null && created < lo) return false;
      if (hi !== null && created > hi) return false;
      return true;
    });
  }, [leads, stageId, sortBy, tags, from, to]);
  const stageTotal = stageId ? (counts.get(stageId) ?? 0) : 0;
  const picked = useMemo(
    () => pickIndices(column.length, count, pattern),
    [column.length, count, pattern],
  );
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const chosen = picked.map((i) => column[i]!);
  const shares = dealOut(chosen, people);

  const team = useMemo(() => {
    const rank: Record<string, number> = { sotuv_menejeri: 0, rop: 1, super_admin: 2 };
    return owners
      .filter((p) => p.role !== "platform_owner")
      .sort(
        (a, b) =>
          (rank[a.role] ?? 9) - (rank[b.role] ?? 9) ||
          (a.full_name || a.email).localeCompare(b.full_name || b.email),
      );
  }, [owners]);
  const nameOf = (id: string) => {
    const p = owners.find((o) => o.id === id);
    return p ? p.full_name || p.email : "";
  };

  function togglePerson(id: string) {
    setPeople((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function apply() {
    if (chosen.length === 0 || people.length === 0) return;
    setBusy(true);
    let done = 0;
    try {
      for (const [ownerId, list] of shares) {
        const ids = list.map((l) => l.id);
        for (let i = 0; i < ids.length; i += CHUNK) {
          done += await update.mutateAsync({
            ids: ids.slice(i, i + CHUNK),
            patch: { owner_id: ownerId },
          });
        }
      }
      toast.success(t("distrib.done", { count: done, people: people.length }));
      onClose();
    } catch (err) {
      toast.error(describeError(err, t("distrib.failed")));
    } finally {
      setBusy(false);
    }
  }

  const isQuick = (QUICK_COUNTS as readonly number[]).includes(count) && customCount === "";
  const short = chosen.length < Math.min(count, column.length);

  return (
    <Dialog open onOpenChange={(v) => !v && !busy && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-[1040px] flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-border px-6 pb-4 pt-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
            <Shuffle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[19px] font-bold">{t("distrib.title")}</DialogTitle>
            <p className="text-[12.5px] text-muted-foreground">{t("distrib.subtitle")}</p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* Settings */}
          <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
            <Section icon={Layers} title={t("distrib.stage")}>
              <StagePickButton
                stages={stages}
                value={stageId}
                counts={counts}
                onChange={setStageId}
                disabled={busy}
              />
            </Section>

            <Section icon={ListFilter} title={t("distrib.count")}>
              <div className="grid grid-cols-4 gap-2">
                {QUICK_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setCount(n);
                      setCustomCount("");
                    }}
                    className={cn(
                      "h-10 rounded-xl border text-[14px] font-bold tabular-nums transition-colors",
                      isQuick && count === n
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:border-primary/40",
                    )}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={customCount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    setCustomCount(v);
                    if (v) setCount(Math.max(1, Number(v)));
                    else setCount(10);
                  }}
                  placeholder={t("distrib.custom")}
                  className={cn(
                    "h-10 min-w-0 rounded-xl border bg-background px-3 text-center text-[14px] font-bold tabular-nums outline-none placeholder:font-medium placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-primary/15",
                    customCount ? "border-primary" : "border-border",
                  )}
                />
              </div>

              {/* "Shartni tanlash": which leads of the column. */}
              <button
                type="button"
                onClick={() => setPatternsOpen((v) => !v)}
                aria-expanded={patternsOpen}
                className={cn(
                  "mt-2.5 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  patternsOpen
                    ? "border-primary bg-primary/[0.05]"
                    : "border-border hover:border-primary/40",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-bold uppercase tracking-wide text-primary">
                    {t("distrib.pattern")}
                  </span>
                  <span className="block truncate text-[13.5px] font-semibold text-foreground">
                    {t(`distrib.p.${pattern}`)}
                  </span>
                </span>
                <PatternStrip pattern={pattern} />
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    patternsOpen && "rotate-180",
                  )}
                />
              </button>
              {patternsOpen && (
                <div className="mt-2 space-y-1.5">
                  {PICK_PATTERNS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setPattern(p);
                        setPatternsOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
                        pattern === p
                          ? "border-primary bg-primary/[0.07]"
                          : "border-border hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                          pattern === p ? "border-primary" : "border-muted-foreground/40",
                        )}
                      >
                        {pattern === p && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">
                        {t(`distrib.p.${p}`)}
                      </span>
                      <PatternStrip pattern={p} />
                    </button>
                  ))}
                </div>
              )}
            </Section>

            <Section icon={Tag} title={t("distrib.tags")} hint={t("distrib.tagsHint")}>
              {funnelTags.length === 0 ? (
                <p className="text-[12.5px] text-subtle">{t("distrib.noTags")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {funnelTags.map(([tag, n]) => {
                    const on = tags.has(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setTags((prev) => {
                            const next = new Set(prev);
                            if (next.has(tag)) next.delete(tag);
                            else next.add(tag);
                            return next;
                          })
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-semibold transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-foreground hover:border-primary/40",
                        )}
                      >
                        {on && <Check className="h-3 w-3" />}
                        {tag}
                        <span
                          className={cn(
                            "tabular-nums",
                            on ? "text-primary-foreground/80" : "text-muted-foreground",
                          )}
                        >
                          {n}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section icon={CalendarDays} title={t("distrib.date")} hint={t("distrib.dateHint")}>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label={t("distrib.dateFrom")}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-[13.5px] font-medium outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
                />
                <span className="text-muted-foreground">—</span>
                <input
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label={t("distrib.dateTo")}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-[13.5px] font-medium outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
                />
                {(from || to) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFrom("");
                      setTo("");
                    }}
                    className="inline-flex h-10 items-center gap-1 rounded-xl px-2.5 text-[12.5px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" /> {t("distrib.clear")}
                  </button>
                )}
              </div>
            </Section>

            <Section icon={Users} title={t("distrib.people")} hint={t("distrib.peopleHint")}>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {team.map((p) => {
                  const on = people.includes(p.id);
                  const gets = shares.get(p.id)?.length ?? 0;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePerson(p.id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors",
                        on ? "border-primary bg-primary/[0.07]" : "border-border hover:bg-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-card",
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-foreground">
                          {p.full_name || p.email}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {t(`distrib.role.${p.role}`)}
                        </span>
                      </span>
                      {on && (
                        <span className="shrink-0 rounded-full bg-primary/15 px-2 text-[12px] font-bold tabular-nums text-primary">
                          +{gets}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* Preview */}
          <aside className="flex min-h-0 flex-col border-t border-border bg-muted/30 lg:border-l lg:border-t-0">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
                {t("distrib.preview")}
              </p>
              <p className="mt-1 text-[22px] font-extrabold tabular-nums text-foreground">
                {chosen.length}
                <span className="ml-1.5 text-[13px] font-semibold text-muted-foreground">
                  {t("distrib.ofColumn", { count: column.length })}
                </span>
              </p>
              {column.length !== stageTotal && (
                <p className="text-[12px] text-muted-foreground">
                  {t("distrib.filtered", { total: stageTotal, count: column.length })}
                </p>
              )}
              {short && (
                <p className="mt-1 text-[12px] font-semibold text-amber-700 dark:text-amber-400">
                  {t("distrib.short", { count: chosen.length })}
                </p>
              )}
              {/* The whole column, chosen leads marked. */}
              {column.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-[3px]" aria-hidden>
                  {column.map((l, i) => (
                    <span
                      key={l.id}
                      className={cn(
                        "h-2.5 w-2.5 rounded-[3px]",
                        pickedSet.has(i) ? "bg-primary" : "bg-foreground/[0.12]",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
            <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-3">
              {chosen.length === 0 ? (
                <li className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-[12.5px] text-muted-foreground">
                  {t("distrib.empty")}
                </li>
              ) : (
                chosen.map((l, k) => {
                  const owner = people.length ? people[k % people.length]! : null;
                  return (
                    <li
                      key={l.id}
                      className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2"
                    >
                      <span className="w-7 shrink-0 text-right font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
                        #{picked[k]! + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-foreground">
                          {l.name}
                        </span>
                        <span className="block truncate text-[11.5px] text-muted-foreground">
                          {l.owner && l.owner !== "Unassigned" ? l.owner : t("distrib.noOwner")}
                          {owner && (
                            <span className="font-semibold text-primary"> → {nameOf(owner)}</span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-muted-foreground">
                        {l.id.slice(0, 8)}
                      </span>
                    </li>
                  );
                })
              )}
            </ol>
          </aside>
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-3">
          <p className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-muted-foreground">
            {people.length === 0
              ? t("distrib.pickPeople")
              : t("distrib.summary", { count: chosen.length, people: people.length })}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-10 rounded-xl px-4 text-[13px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("amo.cancel")}
          </button>
          <button
            type="button"
            disabled={busy || chosen.length === 0 || people.length === 0}
            onClick={() => void apply()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-5 text-[13.5px] font-bold text-primary-foreground shadow-sm transition-[filter,opacity] hover:brightness-110 disabled:opacity-45"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
            {t("distrib.apply", { count: chosen.length })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: typeof Layers;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="text-[13px] font-extrabold text-foreground">{title}</h3>
        {hint && <span className="truncate text-[12px] text-muted-foreground">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** A 15-lead column with what the pattern picks out of 5, as a tiny picture. */
function PatternStrip({ pattern }: { pattern: PickPattern }) {
  const on = new Set(pickIndices(15, 5, pattern));
  return (
    <span className="flex shrink-0 gap-[2px]" aria-hidden>
      {Array.from({ length: 15 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-3 w-[5px] rounded-[2px]",
            on.has(i) ? "bg-primary" : "bg-foreground/[0.14]",
          )}
        />
      ))}
    </span>
  );
}
