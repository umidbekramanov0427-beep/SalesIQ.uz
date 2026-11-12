import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import { computePay, isEmptyScheme, monthRange, parseScheme, type PayScheme } from "@/lib/payroll";
import { usePayrollView, useSavePayrollScheme, type PayrollRow } from "@/hooks/use-crm-data";

// Nazorat -> Oylik: the month's pay per employee from their own scheme
// (Admin sets it per person, or the company's default), with a month
// switcher, totals and an Excel export.

const MONTHS_KEY = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

export function PayrollBoard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { format } = useCurrency();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const range = useMemo(() => monthRange(ym.y, ym.m), [ym.y, ym.m]);
  const { rows, rules, missing, isLoading } = usePayrollView(range);
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const [editing, setEditing] = useState<{ scope: string; row: PayrollRow | null } | null>(null);
  const isCurrent = ym.y === now.getFullYear() && ym.m === now.getMonth();
  const monthLabel = `${t(`payroll.month.${MONTHS_KEY[ym.m]}`)} ${ym.y}`;

  const shift = (d: number) =>
    setYm(({ y, m }) => {
      const n = m + d;
      return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
    });

  const sum = (k: "fixed" | "commission" | "perSale" | "bonus" | "fines" | "total") =>
    rows.reduce((s, r) => s + r[k], 0);

  function exportXlsx() {
    downloadXlsx(`oylik-${ym.y}-${String(ym.m + 1).padStart(2, "0")}.xlsx`, [
      {
        name: monthLabel,
        rows: [
          [
            t("payroll.colEmployee"),
            t("payroll.colSales"),
            t("payroll.colSalesCount"),
            t("payroll.colPlan"),
            t("payroll.colFixed"),
            t("payroll.colCommission"),
            t("payroll.colBonus"),
            t("payroll.colFines"),
            t("payroll.colTotal"),
          ],
          ...rows.map((r) => [
            r.name,
            r.revenue,
            r.salesCount,
            r.planPct,
            r.fixed,
            r.commission + r.perSale,
            r.bonus,
            r.fines,
            r.total,
          ]),
          [
            t("payroll.totalRow"),
            rows.reduce((s, r) => s + r.revenue, 0),
            rows.reduce((s, r) => s + r.salesCount, 0),
            null,
            sum("fixed"),
            sum("commission") + sum("perSale"),
            sum("bonus"),
            sum("fines"),
            sum("total"),
          ],
        ],
      },
    ]);
  }

  return (
    <section className="surface-card p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
            <Wallet className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-foreground">{t("payroll.title")}</h2>
            <p className="text-xs text-subtle">{t("payroll.desc")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 phone:w-full">
          <div className="inline-flex h-10 items-center rounded-xl border border-border bg-card phone:w-full phone:justify-between">
            <button
              type="button"
              onClick={() => shift(-1)}
              aria-label={t("payroll.prevMonth")}
              className="grid h-10 w-9 place-items-center text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[124px] text-center text-[13.5px] font-semibold text-foreground">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => shift(1)}
              disabled={isCurrent}
              aria-label={t("payroll.nextMonth")}
              className="grid h-10 w-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {isAdmin && (
            <Button variant="outline" onClick={() => setEditing({ scope: "base", row: null })}>
              <Settings2 className="h-4 w-4" />
              {t("payroll.baseScheme")}
            </Button>
          )}
          <Button variant="outline" onClick={exportXlsx} disabled={!rows.length}>
            <Download className="h-4 w-4" />
            Excel
          </Button>
        </div>
      </div>

      {missing && (
        <p className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          {t("payroll.migrationPending")}
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-5">
        {[
          { label: t("payroll.sumTotal"), value: sum("total"), strong: true },
          { label: t("payroll.colFixed"), value: sum("fixed") },
          { label: t("payroll.colCommission"), value: sum("commission") + sum("perSale") },
          { label: t("payroll.colBonus"), value: sum("bonus") },
          { label: t("payroll.colFines"), value: -sum("fines"), negative: true },
        ].map((c) => (
          <div
            key={c.label}
            className={cn("bg-card px-4 py-3", c.strong && "col-span-2 lg:col-span-1")}
          >
            <p className="text-[12px] text-muted-foreground">{c.label}</p>
            <p
              className={cn(
                "mt-1 font-mono text-[18px] font-bold tabular-nums phone:text-[15px]",
                c.strong ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
                c.negative && c.value !== 0 && "text-red-700 dark:text-red-300",
              )}
            >
              {format(c.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="-mx-6 overflow-x-auto sm:-mx-8">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
              <th className="px-6 py-3 font-medium sm:px-8">{t("payroll.colEmployee")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("payroll.colSales")}</th>
              <th className="px-3 py-3 font-medium">{t("payroll.colPlan")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("payroll.colFixed")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("payroll.colCommission")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("payroll.colBonus")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("payroll.colFines")}</th>
              <th className="px-3 py-3 text-right font-medium">{t("payroll.colTotal")}</th>
              {isAdmin && <th className="w-12 px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.profileId}
                className="border-b border-border last:border-0 hover:bg-surface"
              >
                <td className="px-6 py-3.5 sm:px-8">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-mint text-xs font-semibold text-mint-foreground">
                      {r.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.name}</p>
                      <SchemeChip scheme={r.scheme} own={r.ownScheme} />
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                  <span className="block text-foreground">{format(r.revenue)}</span>
                  <span className="text-[11.5px] text-subtle">
                    {t("payroll.salesN", { n: r.salesCount })}
                  </span>
                </td>
                <td className="px-3 py-3.5">
                  <PlanBar pct={r.planPct} steps={r.scheme.kpi.map((s) => s.minPct)} />
                </td>
                <Money v={r.fixed} />
                <Money v={r.commission + r.perSale} />
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                  <span
                    className={
                      r.bonus
                        ? "font-semibold text-emerald-700 dark:text-emerald-300"
                        : "text-subtle"
                    }
                  >
                    {r.bonus ? `+${format(r.bonus)}` : "—"}
                  </span>
                  {r.step && (
                    <span className="block text-[11px] text-subtle">≥ {r.step.minPct}%</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
                  <span
                    className={
                      r.fines ? "font-semibold text-red-700 dark:text-red-300" : "text-subtle"
                    }
                  >
                    {r.fines ? `−${format(r.fines)}` : "—"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3.5 text-right font-mono text-[14.5px] font-bold tabular-nums text-foreground">
                  {format(r.total)}
                </td>
                {isAdmin && (
                  <td className="px-3 py-3.5">
                    <button
                      type="button"
                      onClick={() => setEditing({ scope: r.profileId, row: r })}
                      title={t("payroll.editScheme")}
                      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </p>
        )}
        {!isLoading && rows.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("payroll.empty")}</p>
        )}
      </div>

      {editing && (
        <SchemeDialog
          scope={editing.scope}
          row={editing.row}
          initial={
            editing.scope === "base" ? rules.base : (rules.people[editing.scope] ?? rules.base)
          }
          hasOwn={editing.scope !== "base" && !!rules.people[editing.scope]}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function Money({ v }: { v: number }) {
  const { format } = useCurrency();
  return (
    <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums text-muted-foreground">
      {v ? format(v) : "—"}
    </td>
  );
}

function SchemeChip({ scheme, own }: { scheme: PayScheme; own: boolean }) {
  const { t } = useI18n();
  const parts: string[] = [];
  if (scheme.fixed) parts.push(t("payroll.chipFixed"));
  if (scheme.salesPct) parts.push(`${scheme.salesPct}%`);
  if (scheme.perSale) parts.push(t("payroll.chipPerSale"));
  if (scheme.kpi.length) parts.push("KPI");
  return (
    <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px]">
      <span
        className={cn(
          "rounded px-1.5 py-px font-semibold",
          own
            ? "bg-violet-500/10 text-violet-700 dark:text-violet-300"
            : "bg-muted text-muted-foreground",
        )}
      >
        {own ? t("payroll.ownScheme") : t("payroll.baseShort")}
      </span>
      <span className="truncate text-subtle">
        {isEmptyScheme(scheme) ? t("payroll.noScheme") : parts.join(" + ")}
      </span>
    </span>
  );
}

// How far into the plan, with the KPI steps marked on the bar.
function PlanBar({ pct, steps }: { pct: number | null; steps: number[] }) {
  const { t } = useI18n();
  if (pct == null) return <span className="text-[12px] text-subtle">{t("payroll.noPlan")}</span>;
  const max = Math.max(120, ...steps.map((s) => s + 10), Math.min(pct, 200));
  const w = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="w-[150px]">
      <div className="relative h-2 rounded-full bg-muted">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            pct >= 100 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-400" : "bg-red-400",
          )}
          style={{ width: w(pct) }}
        />
        {steps.map((s) => (
          <span
            key={s}
            className="absolute -top-0.5 h-3 w-0.5 rounded bg-foreground/50"
            style={{ left: w(s) }}
            title={`${s}%`}
          />
        ))}
      </div>
      <p className="mt-1 font-mono text-[12px] font-semibold tabular-nums text-foreground">
        {pct}%
      </p>
    </div>
  );
}

const group = (n: number) => (n ? n.toLocaleString("ru-RU").replace(/\u00a0/g, " ") : "");

const field =
  "h-10 w-full rounded-xl border border-border bg-input px-3 text-right font-mono text-[14px] tabular-nums text-foreground outline-none focus:border-primary";

function SchemeDialog({
  scope,
  row,
  initial,
  hasOwn,
  onClose,
}: {
  scope: string;
  row: PayrollRow | null;
  initial: PayScheme;
  hasOwn: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const save = useSavePayrollScheme();
  const [draft, setDraft] = useState<PayScheme>(initial);
  useEffect(() => setDraft(initial), [initial]);
  const clean = parseScheme(draft);
  const preview = row
    ? computePay(clean, {
        revenue: row.revenue,
        salesCount: row.salesCount,
        planPct: row.planPct,
        fines: row.rawFines,
      })
    : null;

  async function submit(next: PayScheme | null) {
    try {
      await save.mutateAsync({ scope, scheme: next });
      toast.success(t("payroll.saved"));
      onClose();
    } catch (err) {
      toast.error(describeError(err, t("payroll.saveFailed")));
    }
  }

  const num = (k: "fixed" | "salesPct" | "perSale", label: string, suffix: string) => (
    <label className="space-y-1">
      <span className="text-[12.5px] font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <input
          inputMode="decimal"
          value={k === "salesPct" ? draft[k] || "" : group(draft[k])}
          placeholder="0"
          onChange={(e) =>
            setDraft((d) => ({
              ...d,
              [k]: Number(e.target.value.replace(k === "salesPct" ? /[^\d.]/g : /\D/g, "")) || 0,
            }))
          }
          className={field}
        />
        <span className="w-8 shrink-0 text-[12.5px] text-muted-foreground">{suffix}</span>
      </div>
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {scope === "base"
              ? t("payroll.baseScheme")
              : t("payroll.schemeFor", { name: row?.name ?? "" })}
          </DialogTitle>
          <p className="text-[13px] text-muted-foreground">
            {scope === "base" ? t("payroll.baseHint") : t("payroll.ownHint")}
          </p>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          {num("fixed", t("payroll.fFixed"), t("payroll.sum"))}
          {num("salesPct", t("payroll.fPct"), "%")}
          {num("perSale", t("payroll.fPerSale"), t("payroll.sum"))}
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-medium text-muted-foreground">
            {t("payroll.fKpi")}
          </p>
          <div className="space-y-2">
            {draft.kpi.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[12.5px] text-muted-foreground">{t("payroll.planFrom")}</span>
                <input
                  inputMode="numeric"
                  value={s.minPct || ""}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      kpi: d.kpi.map((x, j) =>
                        j === i
                          ? { ...x, minPct: Number(e.target.value.replace(/\D/g, "")) || 0 }
                          : x,
                      ),
                    }))
                  }
                  className={cn(field, "w-20")}
                />
                <span className="text-[12.5px] text-muted-foreground">% →</span>
                <input
                  inputMode="numeric"
                  value={group(s.bonus)}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      kpi: d.kpi.map((x, j) =>
                        j === i
                          ? { ...x, bonus: Number(e.target.value.replace(/\D/g, "")) || 0 }
                          : x,
                      ),
                    }))
                  }
                  className={cn(field, "flex-1")}
                />
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, kpi: d.kpi.filter((_, j) => j !== i) }))}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {draft.kpi.length < 6 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    kpi: [...d.kpi, { minPct: (d.kpi.at(-1)?.minPct ?? 90) + 10, bonus: 0 }],
                  }))
                }
              >
                <Plus className="h-4 w-4" />
                {t("payroll.addStep")}
              </Button>
            )}
          </div>
        </div>
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-3.5 py-3">
          <span>
            <span className="block text-[13.5px] font-semibold text-foreground">
              {t("payroll.fFines")}
            </span>
            <span className="block text-[12px] text-muted-foreground">
              {t("payroll.fFinesHint")}
            </span>
          </span>
          <Switch
            checked={draft.deductFines}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, deductFines: v }))}
          />
        </label>
        {preview && row && (
          <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-[13px]">
            <p className="text-muted-foreground">
              {t("payroll.preview", { sales: format(row.revenue), n: row.salesCount })}
            </p>
            <p className="mt-1 font-mono text-[20px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {format(preview.total)}
            </p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {hasOwn ? (
            <Button variant="ghost" onClick={() => void submit(null)} disabled={save.isPending}>
              {t("payroll.useBase")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submit(clean)} disabled={save.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
