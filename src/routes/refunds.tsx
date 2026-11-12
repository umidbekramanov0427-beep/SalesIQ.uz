import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
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
import { downloadXlsx } from "@/lib/xlsx-write";
import { formatCard, refundSummary, type RefundRow, type RefundStatus } from "@/lib/refunds";
import { useProfilesRaw, useRefundLeads, useRefundRules, useRefunds } from "@/hooks/use-crm-data";
import { RefundSettingsButton } from "@/components/refunds/RefundSettings";
import { RefundAnalytics } from "@/components/refunds/RefundAnalytics";
import { RefundSummaryBlock, RefundTable } from "@/components/refunds/RefundList";
import { DateRangeFilter } from "@/components/refunds/DateRangeFilter";
import { RefundImportDialog } from "@/components/refunds/RefundImport";

// Pul qaytarish: every client to pay back -- switched on from the lead card,
// added by hand or imported -- with the card the money goes to and whose it
// is. Uploading the transfer's receipt marks it refunded and the bot sends
// the receipt to the client. Excel export for the final report.

type Filter = "pending" | "refunded" | "cancelled" | "all";

export const Route = createFileRoute("/refunds")({
  validateSearch: (s: Record<string, unknown>): { focus?: string | undefined } => ({
    focus: typeof s["focus"] === "string" ? s["focus"] : undefined,
  }),
  head: () => ({
    meta: [{ title: "Pul qaytarish — SalesIQ" }],
    // The panel's own type: Onest (Latin + Cyrillic) and JetBrains Mono for card numbers.
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap",
      },
    ],
  }),
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
  const [stage, setStage] = useState<"all" | "before" | "after">("all");
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
  const operatorOf = useCallback(
    (r: RefundRow) =>
      (r.lead_id ? leadInfo?.get(r.lead_id)?.owner_id : null) ?? r.created_by ?? null,
    [leadInfo],
  );
  const funnels = [...new Set(rows.map(funnelOf).filter((f): f is string => !!f))].sort();
  const operators = [...new Set(rows.map(operatorOf).filter((o): o is string => !!o))];

  // Everything but the status: the cards, the analytics and the counts follow it.
  const scoped = rows.filter((r) => {
    if (stage !== "all" && r.stage !== stage) return false;
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
  const ORDER: Record<RefundStatus, number> = { pending: 0, refunded: 1, cancelled: 2 };
  const shown = scoped
    .filter((r) => filter === "all" || r.status === filter)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.created_at.localeCompare(a.created_at));
  const filtered = !!(funnel || operator || from || to || stage !== "all" || query);

  function exportXlsx() {
    const statusLabel = (s: RefundStatus) => t(`refund.status.${s}`);
    downloadXlsx(`pul-qaytarish-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: t("refund.title"),
        rows: [
          [
            t("refund.name"),
            t("refund.phone"),
            t("refund.amount"),
            t("refund.paid"),
            t("refund.card"),
            t("refund.holder"),
            t("refund.stage"),
            t("refund.reason"),
            t("refund.colStatus"),
            t("refund.colAdded"),
            t("refund.colBy"),
            t("refund.colRefundedAt"),
            t("refund.colNotified"),
            t("refund.note"),
          ],
          ...rows.map((r) => [
            r.client_name,
            r.phone,
            Number(r.amount) || 0,
            r.paid_amount == null ? null : Number(r.paid_amount),
            formatCard(r.card_number),
            r.card_holder,
            t(`refund.stage.${r.stage}`),
            r.reason,
            statusLabel(r.status),
            r.created_at.slice(0, 10),
            r.created_by ? (nameOf.get(r.created_by) ?? "") : "",
            r.refunded_at ? r.refunded_at.slice(0, 10) : null,
            r.notified_at ? t("refund.yes") : r.status === "refunded" ? t("refund.no") : null,
            r.note,
          ]),
        ],
      },
      {
        name: t("refund.summarySheet"),
        rows: [
          [t("refund.sumTotal"), sum.total],
          [t("refund.stage.before"), sum.before],
          [t("refund.stage.after"), sum.after],
          [t("refund.sumPending"), sum.pending],
          [t("refund.sumToPay"), sum.toPay],
          [t("refund.sumRefunded"), sum.refunded],
          [t("refund.sumPaidBack"), sum.paidBack],
          [t("refund.status.cancelled"), sum.cancelled],
        ],
      },
    ]);
  }

  return (
    <div className="refund-panel space-y-5">
      <PageHeader
        back={false}
        icon={Undo2}
        tone="rose"
        title={t("refund.title")}
        description={t("refund.desc")}
        actions={
          <>
            {canSettle && <RefundSettingsButton />}
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" />
              {t("refund.import")}
            </Button>
            <Button variant="outline" onClick={exportXlsx} disabled={!rows.length}>
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
      <RefundSummaryBlock sum={sum} />

      <div className="surface-card overflow-hidden">
        {/* Status tabs, then search and the filters -- one bar, like a spreadsheet's. */}
        <div className="flex flex-wrap items-center gap-2.5 p-3">
          <div className="flex flex-wrap rounded-xl bg-muted/70 p-1">
            {(["all", "pending", "refunded", "cancelled"] as const).map((f) => {
              const n = f === "all" ? scoped.length : scoped.filter((r) => r.status === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-[14px] font-medium transition-colors",
                    filter === f
                      ? "bg-card font-semibold text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`refund.filter.${f}`)}
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      f === "pending" && "text-amber-600 dark:text-amber-400",
                      f === "refunded" && "text-emerald-600 dark:text-emerald-400",
                      f === "cancelled" && "text-subtle",
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="ml-auto">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: t("refund.viewList"), icon: ListIcon },
                { value: "analytics", label: t("refund.viewAnalytics"), icon: BarChart3 },
              ]}
            />
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 phone:grid phone:grid-cols-2">
            <label className="flex h-10 min-w-[220px] flex-1 phone:col-span-2 phone:min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 focus-within:border-primary phone:w-full">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("refund.search")}
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none"
              />
            </label>
            <FilterSelect
              label={t("refund.fFunnel")}
              value={funnel}
              onChange={setFunnel}
              options={funnels.map((f) => ({ value: f, label: f }))}
            />
            <FilterSelect
              label={t("refund.fOperator")}
              value={operator}
              onChange={setOperator}
              options={operators.map((o) => ({ value: o, label: nameOf.get(o) ?? "—" }))}
            />
            <FilterSelect
              label={t("refund.fStage")}
              value={stage === "all" ? "" : stage}
              onChange={(v) => setStage((v || "all") as "all" | "before" | "after")}
              options={(["before", "after"] as const).map((s) => ({
                value: s,
                label: t(`refund.stage.${s}`),
              }))}
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
                  setStage("all");
                  setQuery("");
                }}
                className="h-10 rounded-xl px-3 text-[13px] font-semibold text-primary hover:bg-primary/8"
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
            total={rows.length}
            focus={focus}
            rules={rules}
            nameOf={(id) => (id ? (nameOf.get(id) ?? "—") : "—")}
            funnelOf={funnelOf}
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
  return (
    <label
      className={cn(
        "flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-[13px] phone:min-w-0",
        value ? "border-primary/50 bg-primary/5" : "border-border bg-card",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[180px] bg-transparent font-semibold text-foreground outline-none phone:min-w-0 phone:flex-1"
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
