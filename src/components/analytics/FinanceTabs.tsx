import { useState, type ReactNode } from "react";
import {
  Banknote,
  Coins,
  Loader2,
  Megaphone,
  Plus,
  Scale,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { SectionCard, StatCard } from "@/components/layout/Primitives";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { CollapsibleTable } from "@/components/layout/CollapsibleTable";
import { cn, describeError } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  MARKETING,
  type FinEntry,
  type FinanceData,
  type MonthForecast,
  type MonthPoint,
} from "@/lib/finance";
import { useFinanceEntryMutations } from "@/hooks/use-crm-data";

// Analitika -> Reklama (ad spend, cost per lead / sale, ROI by source),
// Moliya (the period's P&L and the company's own income/expense lines) and
// the month-end projection on Prognoz. Data from /analytics/finance.

const th = "px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-subtle";
const td = "whitespace-nowrap px-3 py-2.5 text-[13px] tabular-nums text-foreground/85";

function useCat() {
  const { t } = useI18n();
  return (c: string) => {
    const key = `fin.cat.${c}`;
    const v = t(key);
    return v === key ? c : v;
  };
}

function RoiChip({ roi }: { roi: number | null }) {
  if (roi == null) return <span className="text-subtle">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-md px-2 py-0.5 font-mono text-[12px] font-semibold",
        roi >= 0
          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
          : "bg-red-500/12 text-red-700 dark:text-red-300",
      )}
    >
      {roi > 0 ? "+" : ""}
      {roi}%
    </span>
  );
}

/** What the ads view needs: by-source figures, the spend lines and source names. */
export type AdsData = Pick<FinanceData, "marketing" | "entries" | "sources">;

export function MarketingTab({
  data,
  canEdit,
  projectId = null,
}: {
  data: AdsData;
  canEdit: boolean;
  /** Marketing panel: new spend lines go to this project. */
  projectId?: string | null;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [adding, setAdding] = useState(false);
  const m = data.marketing;
  const tot = m.total;
  const spendEntries = (data.entries ?? []).filter(
    (e) => e.kind === "expense" && e.category === MARKETING,
  );
  const maxSpend = Math.max(1, ...m.rows.map((r) => r.spend));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={Megaphone}
          iconTone="rose"
          label={t("fin.spend")}
          tipKey="fin.spend"
          value={format(tot.spend)}
        />
        <StatCard
          icon={Users}
          iconTone="sky"
          label={t("fin.newLeads")}
          tipKey="fin.newLeads"
          value={String(tot.leads)}
        />
        <StatCard
          icon={Target}
          iconTone="amber"
          label={t("fin.cpl")}
          tipKey="fin.cpl"
          value={tot.cpl == null ? "—" : format(tot.cpl)}
          info={t("fin.cplInfo")}
        />
        <StatCard
          icon={Coins}
          iconTone="violet"
          label={t("fin.cac")}
          tipKey="fin.cac"
          value={tot.cac == null ? "—" : format(tot.cac)}
          info={t("fin.cacInfo")}
        />
        <StatCard
          icon={TrendingUp}
          iconTone="emerald"
          label="ROI"
          value={tot.roi == null ? "—" : `${tot.roi > 0 ? "+" : ""}${tot.roi}%`}
          info={t("fin.roiInfo")}
        />
      </div>

      <SectionCard
        icon={Megaphone}
        tone="rose"
        title={t("fin.bySource")}
        description={t("fin.bySourceDesc")}
        actions={
          canEdit ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" />
              {t("fin.addSpend")}
            </Button>
          ) : undefined
        }
      >
        {m.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("fin.noSources")}</p>
        ) : (
          <CollapsibleTable minWidth={820}>
            <thead className="border-b border-border">
              <tr>
                <th className={cn(th, "text-left")}>{t("fin.source")}</th>
                <th className={cn(th, "text-left")}>{t("fin.spend")}</th>
                <th className={cn(th, "text-right")}>{t("fin.leads")}</th>
                <th className={cn(th, "text-right")}>{t("fin.cpl")}</th>
                <th className={cn(th, "text-right")}>{t("fin.sales")}</th>
                <th className={cn(th, "text-right")}>{t("fin.cac")}</th>
                <th className={cn(th, "text-right")}>{t("fin.revenue")}</th>
                <th className={cn(th, "text-right")}>ROI</th>
              </tr>
            </thead>
            <tbody>
              {m.rows.map((r) => (
                <tr key={r.source ?? "—"} className="border-b border-border/60 last:border-0">
                  <td className={cn(td, "font-semibold text-foreground")}>
                    {r.source ?? t("fin.noSource")}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 w-[90px] rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-rose-400"
                          style={{ width: `${(r.spend / maxSpend) * 100}%` }}
                        />
                      </div>
                      <span className="whitespace-nowrap text-[13px] tabular-nums">
                        {r.spend ? format(r.spend) : "—"}
                      </span>
                    </div>
                  </td>
                  <td className={cn(td, "text-right")}>{r.leads}</td>
                  <td className={cn(td, "text-right")}>{r.cpl == null ? "—" : format(r.cpl)}</td>
                  <td className={cn(td, "text-right")}>{r.won}</td>
                  <td className={cn(td, "text-right")}>{r.cac == null ? "—" : format(r.cac)}</td>
                  <td className={cn(td, "text-right")}>{r.revenue ? format(r.revenue) : "—"}</td>
                  <td className={cn(td, "text-right")}>
                    <RoiChip roi={r.roi} />
                  </td>
                </tr>
              ))}
            </tbody>
          </CollapsibleTable>
        )}
      </SectionCard>

      {canEdit && spendEntries.length > 0 && (
        <EntriesCard title={t("fin.spendLines")} entries={spendEntries} />
      )}
      {adding && (
        <EntryDialog
          kind="expense"
          lockCategory={MARKETING}
          sources={data.sources}
          projectId={projectId}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

export function PnlTab({ data }: { data: FinanceData }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const cat = useCat();
  const [adding, setAdding] = useState<"income" | "expense" | null>(null);
  const p = data.pnl;
  if (!p) return null;
  const maxExp = Math.max(1, ...p.expenses.map((e) => e.amount));
  const incomeRows = [{ category: "__sales", amount: p.salesRevenue }, ...p.otherIncome].filter(
    (x) => x.amount > 0,
  );
  const maxInc = Math.max(1, ...incomeRows.map((e) => e.amount));
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Banknote}
          iconTone="emerald"
          label={t("fin.income")}
          tipKey="fin.income"
          value={format(p.totalIncome)}
        />
        <StatCard
          icon={Wallet}
          iconTone="rose"
          label={t("fin.expense")}
          tipKey="fin.expense"
          value={format(p.totalExpense)}
        />
        <StatCard
          icon={p.profit >= 0 ? TrendingUp : TrendingDown}
          iconTone={p.profit >= 0 ? "emerald" : "rose"}
          label={t("fin.profit")}
          tipKey="fin.profit"
          value={format(p.profit)}
        />
        <StatCard
          icon={Scale}
          iconTone="violet"
          label={t("fin.margin")}
          tipKey="fin.margin"
          value={p.marginPct == null ? "—" : `${p.marginPct}%`}
          info={t("fin.marginInfo")}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={TrendingUp}
          tone="emerald"
          title={t("fin.incomeTitle")}
          actions={
            <Button variant="outline" onClick={() => setAdding("income")}>
              <Plus className="h-4 w-4" />
              {t("fin.addIncome")}
            </Button>
          }
        >
          <Breakdown
            rows={incomeRows.map((r) => ({
              label: r.category === "__sales" ? t("fin.salesRevenue") : cat(r.category),
              amount: r.amount,
            }))}
            max={maxInc}
            tone="bg-emerald-500"
            empty={t("fin.noIncome")}
          />
        </SectionCard>
        <SectionCard
          icon={TrendingDown}
          tone="rose"
          title={t("fin.expenseTitle")}
          actions={
            <Button variant="outline" onClick={() => setAdding("expense")}>
              <Plus className="h-4 w-4" />
              {t("fin.addExpense")}
            </Button>
          }
        >
          <Breakdown
            rows={p.expenses.map((r) => ({ label: cat(r.category), amount: r.amount }))}
            max={maxExp}
            tone="bg-rose-400"
            empty={t("fin.noExpense")}
          />
        </SectionCard>
      </div>

      {/* The bottom line, as a statement. */}
      <SectionCard icon={Scale} tone="violet" title={t("fin.statement")}>
        <dl className="divide-y divide-border text-[13.5px]">
          <Line label={t("fin.income")} value={format(p.totalIncome)} />
          <Line label={t("fin.expense")} value={`− ${format(p.totalExpense)}`} />
          <Line
            label={t("fin.profit")}
            value={format(p.profit)}
            strong
            tone={
              p.profit >= 0
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-red-700 dark:text-red-300"
            }
          />
        </dl>
      </SectionCard>

      {(data.entries ?? []).length > 0 && (
        <EntriesCard title={t("fin.allLines")} entries={data.entries ?? []} />
      )}
      {adding && (
        <EntryDialog kind={adding} sources={data.sources} onClose={() => setAdding(null)} />
      )}
    </div>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className={cn("text-muted-foreground", strong && "font-semibold text-foreground")}>
        {label}
      </dt>
      <dd
        className={cn(
          "font-mono tabular-nums",
          strong ? "text-[17px] font-bold" : "text-foreground",
          tone,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Breakdown({
  rows,
  max,
  tone,
  empty,
}: {
  rows: { label: string; amount: number }[];
  max: number;
  tone: string;
  empty: string;
}) {
  const { format } = useCurrency();
  if (!rows.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="font-medium text-foreground">{r.label}</span>
            <span className="font-mono tabular-nums text-foreground/85">{format(r.amount)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", tone)}
              style={{ width: `${(r.amount / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EntriesCard({ title, entries }: { title: string; entries: FinEntry[] }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const cat = useCat();
  const { remove } = useFinanceEntryMutations();
  return (
    <SectionCard icon={Coins} tone="slate" title={title}>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 py-2.5 text-[13px]">
            <span className="w-[86px] shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">
              {e.entry_date}
            </span>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-foreground">{cat(e.category)}</span>
              {e.source && <span className="text-muted-foreground"> · {e.source}</span>}
              {e.note && <span className="text-subtle"> — {e.note}</span>}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono tabular-nums",
                e.kind === "income" ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
              )}
            >
              {e.kind === "income" ? "+" : "−"}
              {format(e.amount)}
            </span>
            <button
              type="button"
              onClick={() =>
                remove.mutate(e.id, {
                  onError: (err) => toast.error(describeError(err, t("fin.saveFailed"))),
                })
              }
              aria-label={t("common.delete")}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

const input =
  "h-10 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground outline-none focus:border-primary";

function EntryDialog({
  kind,
  lockCategory,
  sources,
  projectId = null,
  onClose,
}: {
  kind: "income" | "expense";
  lockCategory?: string;
  sources: string[];
  projectId?: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const cat = useCat();
  const { add } = useFinanceEntryMutations();
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState<string>(
    lockCategory ?? (kind === "expense" ? "rent" : "other"),
  );
  const [source, setSource] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const cats = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  async function submit() {
    if (amount <= 0) {
      toast.error(t("fin.amountNeeded"));
      return;
    }
    try {
      await add.mutateAsync({
        entry_date: date,
        kind,
        category,
        source: category === MARKETING ? source.trim() || null : null,
        amount,
        note: note.trim() || null,
        ...(projectId ? { project_id: projectId } : {}),
      });
      toast.success(t("fin.saved"));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error && /finance_entries/.test(err.message)
          ? t("fin.migrationPending")
          : describeError(err, t("fin.saveFailed")),
      );
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {lockCategory === MARKETING
              ? t("fin.addSpend")
              : kind === "income"
                ? t("fin.addIncome")
                : t("fin.addExpense")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("fin.date")}>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className={input}
              />
            </Field>
            <Field label={t("fin.amount")}>
              <input
                inputMode="numeric"
                value={amount ? amount.toLocaleString("ru-RU").replace(/\u00a0/g, " ") : ""}
                placeholder="0"
                onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, "")) || 0)}
                className={cn(input, "text-right font-mono tabular-nums")}
                autoFocus
              />
            </Field>
          </div>
          {!lockCategory && (
            <Field label={t("fin.category")}>
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "h-8 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors",
                      category === c
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {cat(c)}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {category === MARKETING && (
            <Field label={t("fin.source")}>
              <input
                list="fin-sources"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Instagram"
                className={input}
              />
              <datalist id="fin-sources">
                {sources.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <p className="mt-1 text-[12px] text-muted-foreground">{t("fin.sourceHint")}</p>
            </Field>
          )}
          <Field label={t("fin.note")}>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className={input}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={add.isPending}>
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** Prognoz: where the month is heading, and the last six months. */
export function MonthForecastCard({
  forecast,
  months,
}: {
  forecast: MonthForecast;
  months: MonthPoint[];
}) {
  const { t, lang } = useI18n();
  const { format, formatCompact } = useCurrency();
  const f = forecast;
  const max = Math.max(1, ...months.map((m) => m.revenue), f.runRate);
  const delta =
    f.avgPrev3 > 0 ? Math.round(((f.runRate - f.avgPrev3) / f.avgPrev3) * 1000) / 10 : null;
  return (
    <SectionCard
      icon={TrendingUp}
      tone="sky"
      title={t("fin.monthTitle")}
      description={t("fin.monthDesc", { d: f.daysPassed, n: f.daysInMonth })}
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {[
            { k: t("fin.soFar"), v: format(f.soFar) },
            {
              k: t("fin.runRate"),
              v: format(f.runRate),
              sub: delta == null ? null : `${delta > 0 ? "+" : ""}${delta}% ${t("fin.vsAvg")}`,
              strong: true,
            },
            { k: t("fin.pipeline"), v: format(f.pipelineWeighted) },
            { k: t("fin.avgPrev3"), v: format(f.avgPrev3) },
          ].map((c) => (
            <div key={c.k} className="bg-card px-4 py-3">
              <dt className="text-[12px] text-muted-foreground">{c.k}</dt>
              <dd
                className={cn(
                  "mt-1 font-mono text-[17px] font-bold tabular-nums",
                  c.strong ? "text-sky-700 dark:text-sky-300" : "text-foreground",
                )}
              >
                {c.v}
              </dd>
              {c.sub && <p className="mt-0.5 text-[11.5px] text-muted-foreground">{c.sub}</p>}
            </div>
          ))}
        </dl>
        {/* Won revenue by month; this month shows its projection as a ghost bar. */}
        <div className="flex h-[188px] items-end gap-3 border-b border-border pb-0 pt-4">
          {months.map((m, i) => {
            const last = i === months.length - 1;
            const label = m.month.slice(5);
            return (
              <div key={m.month} className="group relative flex h-full flex-1 flex-col justify-end">
                <span className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[11.5px] text-foreground shadow-sm group-hover:block">
                  {m.month}: {format(m.revenue)} · {m.won}
                </span>
                {last && f.runRate > m.revenue && (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t border border-dashed border-sky-500/60 bg-sky-500/10"
                    style={{ height: `${(f.runRate / max) * 100}%` }}
                  />
                )}
                <div
                  className={cn(
                    "relative mx-auto w-full max-w-[44px] rounded-t",
                    last ? "bg-sky-500" : "bg-sky-500/45",
                  )}
                  style={{ height: `${Math.max(1.5, (m.revenue / max) * 100)}%` }}
                />
                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] text-muted-foreground">
                  {label}
                </span>
                {m.revenue > 0 && (
                  <span
                    className="absolute left-1/2 -translate-x-1/2 text-[10.5px] font-semibold tabular-nums text-foreground/70"
                    style={{ bottom: `calc(${(m.revenue / max) * 100}% + 3px)` }}
                  >
                    {formatCompact(m.revenue, lang)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="h-6" />
    </SectionCard>
  );
}
