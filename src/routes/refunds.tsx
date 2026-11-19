import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronDown,
  List as ListIcon,
  Download,
  Loader2,
  Plus,
  Search,
  Undo2,
  Upload,
} from "lucide-react";
import { PageHeader } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { RefundDialog, draftFromRow, type RefundDraft } from "@/components/refunds/RefundDialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { exportRefundsXlsx } from "@/lib/refunds-xlsx";
import {
  refundBucket,
  refundKpis,
  refundSummary,
  type RefundBucket,
  type RefundRow,
} from "@/lib/refunds";
import { useProfilesRaw, useRefundLeads, useRefundRules, useRefunds } from "@/hooks/use-crm-data";
import { RefundSettingsButton } from "@/components/refunds/RefundSettings";
import { RefundAnalytics } from "@/components/refunds/RefundAnalytics";
import { RefundKpiCards, RefundTable } from "@/components/refunds/RefundList";
import { DateRangeFilter } from "@/components/refunds/DateRangeFilter";
import { RefundImportDialog } from "@/components/refunds/RefundImport";

// Pul qaytarish: every client to pay back -- switched on from the lead card,
// added by hand or imported -- with the card the money goes to and whose it
// is. Uploading the transfer's receipt marks it refunded and the bot sends
// the receipt to the client. Excel export for the final report.

type Filter = RefundBucket | "all";

export const Route = createFileRoute("/refunds")({
  validateSearch: (s: Record<string, unknown>): { focus?: string | undefined } => ({
    focus: typeof s["focus"] === "string" ? s["focus"] : undefined,
  }),
  // The admin console's look and type (FocusShell, html.admin-console).
  head: () => ({ meta: [{ title: "Pul qaytarish — SalesIQ" }] }),
  component: RefundsPage,
});

const EMPTY: RefundDraft = {
  lead_id: null,
  client_name: "",
  phone: "",
  amount: 0,
  paid_amount: null,
  card_number: "",
  card_holder: "",
  reason: "",
  stage: "before",
  note: "",
};

function RefundsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { focus } = Route.useSearch();
  const q = useRefunds();
  const rules = useRefundRules();
  const rows = useMemo(() => q.data?.rows ?? [], [q.data?.rows]);
  const { data: profiles } = useProfilesRaw();
  const nameOf = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email])),
    [profiles],
  );
  const canSettle =
    user?.role === "super_admin" || user?.role === "platform_owner" || user?.role === "rop";
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  // Everything by default: a refund that was just paid back stays in view,
  // marked done, instead of jumping to another tab.
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [funnel, setFunnel] = useState("");
  const [operator, setOperator] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [view, setView] = useState<"list" | "analytics">("list");
  const [editing, setEditing] = useState<{ draft: RefundDraft; id?: string } | null>(null);
  const [importing, setImporting] = useState(false);

  // The lead's funnel and responsible manager (the one who added it when
  // the refund has no lead).
  const { data: leadInfo } = useRefundLeads(
    rows.map((r) => r.lead_id).filter((x): x is string => !!x),
  );
  const funnelOf = useCallback(
    (r: RefundRow) => (r.lead_id ? (leadInfo?.get(r.lead_id)?.funnel ?? null) : null),
    [leadInfo],
  );
  const streamOf = useCallback(
    (r: RefundRow) => (r.lead_id ? (leadInfo?.get(r.lead_id)?.stream ?? null) : null) || null,
    [leadInfo],
  );
  const operatorOf = useCallback(
    (r: RefundRow) =>
      (r.lead_id ? leadInfo?.get(r.lead_id)?.owner_id : null) ?? r.created_by ?? null,
    [leadInfo],
  );
  const funnels = [...new Set(rows.map(funnelOf).filter((f): f is string => !!f))].sort();
  const operators = [...new Set(rows.map(operatorOf).filter((o): o is string => !!o))];

  // Everything but the status: the cards, the analytics and the counts follow it.
  const scoped = rows.filter((r) => {
    if (funnel && funnelOf(r) !== funnel) return false;
    if (operator && operatorOf(r) !== operator) return false;
    const day = new Date(new Date(r.created_at).getTime() + 5 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    const s = query.trim().toLowerCase();
    if (!s) return true;
    return [r.client_name, r.phone, r.card_number, r.card_holder, r.reason]
      .filter(Boolean)
      .some((x) => String(x).toLowerCase().includes(s));
  });
  const sum = refundSummary(scoped);
  const kpis = refundKpis(scoped);
  const bucketOf = (r: RefundRow) => refundBucket(r, rules);
  const counts: Record<Filter, number> = {
    all: 0,
    pending: 0,
    refunded: 0,
    problem: 0,
    cancelled: 0,
  };
  for (const r of scoped) {
    const b = bucketOf(r);
    counts[b] += 1;
    if (b !== "cancelled") counts.all += 1;
  }
  // Muammoli first, then the waiting ones, the done ones, the cancelled.
  const ORDER: Record<RefundBucket, number> = { problem: 0, pending: 1, refunded: 2, cancelled: 3 };
  const shown = scoped
    .filter((r) => (filter === "all" ? bucketOf(r) !== "cancelled" : bucketOf(r) === filter))
    .sort(
      (a, b) => ORDER[bucketOf(a)] - ORDER[bucketOf(b)] || b.created_at.localeCompare(a.created_at),
    );
  const filtered = !!(funnel || operator || from || to || query);

  // Who pays the money back: whoever uploaded receipts here, most first.
  const responsible = (() => {
    const n = new Map<string, number>();
    for (const r of scoped)
      if (r.refunded_by) n.set(r.refunded_by, (n.get(r.refunded_by) ?? 0) + 1);
    const ids = [...n.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    const list = ids.length
      ? ids
      : (profiles ?? [])
          .filter((p) => p.role === "super_admin" || p.role === "rop")
          .map((p) => p.id);
    return list
      .slice(0, 3)
      .map((id) => nameOf.get(id))
      .filter(Boolean)
      .join(", ");
  })();
  const dm = (d: string) => d.split("-").reverse().join(".");
  const period =
    from || to ? `${from ? dm(from) : "…"} – ${to ? dm(to) : "…"}` : t("refund.allTime");

  function exportXlsx() {
    exportRefundsXlsx({
      rows: shown,
      t,
      rules,
      kpis,
      period,
      nameOf: (id) => (id ? (nameOf.get(id) ?? "") : ""),
      funnelOf,
      streamOf,
      operatorOf,
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        back={false}
        guide={false}
        icon={Undo2}
        tone="rose"
        caption={`${t("refund.title")} · ${period}`}
        title={t("refund.title")}
        description={t("refund.desc")}
        summary={
          responsible ? (
            <span className="font-sans">
              {t("refund.responsible")}:{" "}
              <b className="font-semibold text-foreground">{responsible}</b>
            </span>
          ) : undefined
        }
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: t("refund.viewList"), icon: ListIcon },
                { value: "analytics", label: t("refund.viewAnalytics"), icon: BarChart3 },
              ]}
            />
            {canSettle && <RefundSettingsButton />}
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" />
              {t("refund.import")}
            </Button>
            <Button variant="outline" onClick={exportXlsx} disabled={!shown.length}>
              <Download className="h-4 w-4" />
              Excel
            </Button>
            <Button onClick={() => setEditing({ draft: EMPTY })}>
              <Plus className="h-4 w-4" />
              {t("refund.add")}
            </Button>
          </>
        }
      />

      {q.data?.missing && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-800 dark:text-amber-200">
          {t("refund.migrationPending")}
        </p>
      )}

      {/* The whole picture: how many asked, what is left to pay, what went back. */}
      <RefundKpiCards k={kpis} />

      <div className="surface-card overflow-hidden !rounded-[12px]">
        {/* The status tabs, then search and the filters -- one line. */}
        <div className="flex flex-wrap items-center gap-2 p-3 xl:flex-nowrap">
          <div className="ctl-track flex shrink-0 flex-wrap gap-0.5 rounded-xl p-[3px] xl:flex-nowrap phone:w-full">
            {(["all", "pending", "refunded", "problem", "cancelled"] as const)
              .filter((f) => f !== "cancelled" || counts.cancelled > 0 || filter === "cancelled")
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-selected={filter === f}
                  className="ctl-tab inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[13.5px] font-medium"
                >
                  {t(`refund.tab.${f}`)}
                  <span
                    className={cn(
                      "min-w-[20px] rounded-full px-1.5 text-center text-[11.5px] font-bold leading-[18px] tabular-nums",
                      f === "pending"
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                        : f === "refunded"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : f === "problem"
                            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                            : "bg-foreground/[0.07] text-foreground/70",
                    )}
                  >
                    {counts[f]}
                  </span>
                </button>
              ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 xl:flex-nowrap phone:grid phone:grid-cols-2">
            <label className="flex h-10 min-w-[130px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 focus-within:border-primary phone:col-span-2 phone:min-w-0 sm:max-w-[300px]">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("refund.search")}
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none"
              />
            </label>
            {(funnels.length > 1 || funnel) && (
              <FilterSelect
                label={t("refund.fFunnel")}
                value={funnel}
                onChange={setFunnel}
                options={funnels.map((f) => ({ value: f, label: f }))}
              />
            )}
            <FilterSelect
              label={t("refund.fOperator")}
              value={operator}
              onChange={setOperator}
              options={operators.map((o) => ({ value: o, label: nameOf.get(o) ?? "—" }))}
            />
            <DateRangeFilter
              from={from}
              to={to}
              onChange={(f, tt) => {
                setFrom(f);
                setTo(tt);
              }}
            />
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setFunnel("");
                  setOperator("");
                  setFrom("");
                  setTo("");
                  setQuery("");
                }}
                className="h-10 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold text-primary hover:bg-primary/8"
              >
                {t("refund.fReset")}
              </button>
            )}
          </div>
        </div>

        {view === "analytics" ? (
          <div className="border-t border-border bg-canvas/40 p-4">
            <RefundAnalytics
              rows={scoped}
              rules={rules}
              funnelOf={funnelOf}
              operatorOf={operatorOf}
              nameOf={(id) => (id ? (nameOf.get(id) ?? "—") : t("refund.noOperator"))}
            />
          </div>
        ) : q.isLoading ? (
          <div className="flex justify-center border-t border-border py-14">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-3 border-t border-border py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-300">
              <Undo2 className="h-6 w-6" />
            </span>
            <p className="text-sm text-muted-foreground">{t("refund.empty")}</p>
          </div>
        ) : (
          <RefundTable
            rows={shown}
            total={counts.all + counts.cancelled}
            focus={focus}
            rules={rules}
            nameOf={(id) => (id ? (nameOf.get(id) ?? "—") : "—")}
            funnelOf={funnelOf}
            streamOf={streamOf}
            operatorOf={operatorOf}
            operators={operators}
            canSettle={canSettle}
            canDelete={isAdmin}
            onEdit={(r) => setEditing({ draft: draftFromRow(r), id: r.id })}
          />
        )}
      </div>

      {editing && (
        <RefundDialog
          initial={editing.draft}
          {...(editing.id ? { editId: editing.id } : {})}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <RefundImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const { t } = useI18n();
  const current = options.find((o) => o.value === value)?.label ?? t("refund.fAll");
  // "Potok: barchasi" as one pill; the real select lies over it (keyboard,
  // phones' native picker).
  return (
    <label
      className={cn(
        "relative flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border px-2.5 text-[13.5px] phone:min-w-0",
        value ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:border-primary/30",
      )}
    >
      <span className="text-muted-foreground">{label}:</span>
      <span className="max-w-[160px] truncate font-semibold text-foreground phone:min-w-0 phone:flex-1">
        {current}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="">{t("refund.fAll")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
