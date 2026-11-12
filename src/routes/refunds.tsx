import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BarChart3,
  CheckCircle2,
  List as ListIcon,
  Copy,
  Download,
  FileUp,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Search,
  Send,
  Trash2,
  Undo2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefundDialog, draftFromRow, type RefundDraft } from "@/components/refunds/RefundDialog";
import { useAuth } from "@/lib/auth";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { downloadXlsx } from "@/lib/xlsx-write";
import { readXlsxFirstSheet } from "@/lib/xlsx-read";
import { detectCsvDelimiter, parseCsv } from "@/lib/csv-parse";
import {
  cardBrand,
  formatCard,
  parseRefundSheet,
  refundSummary,
  type ImportedRefund,
  type RefundRow,
  type RefundStatus,
} from "@/lib/refunds";
import {
  openRefundReceipt,
  useProfilesRaw,
  useRefundLeads,
  useRefundMutations,
  useRefunds,
} from "@/hooks/use-crm-data";
import { RefundSettingsButton } from "@/components/refunds/RefundSettings";
import { RefundAnalytics } from "@/components/refunds/RefundAnalytics";

// Pul qaytarish: every client to pay back -- switched on from the lead card,
// added by hand or imported -- with the card the money goes to and whose it
// is. Uploading the transfer's receipt marks it refunded and the bot sends
// the receipt to the client. Excel export for the final report.

type Filter = "pending" | "refunded" | "cancelled" | "all";

export const Route = createFileRoute("/refunds")({
  validateSearch: (s: Record<string, unknown>): { focus?: string | undefined } => ({
    focus: typeof s["focus"] === "string" ? s["focus"] : undefined,
  }),
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
  const { format } = useCurrency();
  const { focus } = Route.useSearch();
  const q = useRefunds();
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
    <div className="space-y-5">
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

      {/* The whole picture: how many asked, before / after acceptance, what's left to pay. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border lg:grid-cols-4">
        <Cell label={t("refund.sumTotal")} value={String(sum.total)}>
          <span className="text-[12px] text-muted-foreground">
            {t("refund.stage.before")}: <b className="text-foreground">{sum.before}</b> ·{" "}
            {t("refund.stage.after")}: <b className="text-foreground">{sum.after}</b>
          </span>
        </Cell>
        <Cell
          label={t("refund.sumToPay")}
          value={format(sum.toPay)}
          tone="text-amber-700 dark:text-amber-300"
        >
          <span className="text-[12px] text-muted-foreground">
            {t("refund.peopleN", { n: sum.pending })}
          </span>
        </Cell>
        <Cell
          label={t("refund.sumPaidBack")}
          value={format(sum.paidBack)}
          tone="text-emerald-700 dark:text-emerald-300"
        >
          <span className="text-[12px] text-muted-foreground">
            {t("refund.peopleN", { n: sum.refunded })}
          </span>
        </Cell>
        <Cell
          label={t("refund.progress")}
          value={`${sum.total ? Math.round((sum.refunded / sum.total) * 100) : 0}%`}
        >
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${sum.total ? (sum.refunded / sum.total) * 100 : 0}%` }}
            />
          </div>
        </Cell>
      </div>

      {/* Filters: funnel, manager, dates, when they refused, search -- and the work status. */}
      <div className="surface-card flex flex-wrap items-center gap-2 p-2.5">
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
        <label className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 text-[13px]">
          <span className="text-muted-foreground">{t("refund.fDate")}</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="h-8 bg-transparent outline-none"
            aria-label={t("an.from")}
          />
          <span className="text-muted-foreground">—</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="h-8 bg-transparent outline-none"
            aria-label={t("an.to")}
          />
        </label>
        <Segmented
          value={stage}
          onChange={setStage}
          options={(["all", "before", "after"] as const).map((s) => ({
            value: s,
            label: s === "all" ? t("refund.allStages") : t(`refund.stage.${s}`),
          }))}
        />
        <label className="flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("refund.search")}
            className="h-full flex-1 bg-transparent text-[13.5px] outline-none"
          />
        </label>
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

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={(["all", "pending", "refunded", "cancelled"] as const).map((f) => ({
            value: f,
            label: `${t(`refund.filter.${f}`)}${
              f === "all"
                ? ` · ${scoped.length}`
                : ` · ${scoped.filter((r) => r.status === f).length}`
            }`,
          }))}
        />
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "list", label: t("refund.viewList"), icon: ListIcon },
            { value: "analytics", label: t("refund.viewAnalytics"), icon: BarChart3 },
          ]}
        />
      </div>

      {view === "analytics" ? (
        <RefundAnalytics
          rows={scoped}
          funnelOf={funnelOf}
          operatorOf={operatorOf}
          nameOf={(id) => (id ? (nameOf.get(id) ?? "—") : t("refund.noOperator"))}
        />
      ) : (
        <div className="surface-card overflow-hidden">
          {q.isLoading ? (
            <div className="flex justify-center py-14">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : shown.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">{t("refund.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-subtle">
                    <th className="px-5 py-3 font-medium">{t("refund.colClient")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("refund.amount")}</th>
                    <th className="px-3 py-3 font-medium">{t("refund.cardTitle")}</th>
                    <th className="px-3 py-3 font-medium">{t("refund.reason")}</th>
                    <th className="px-3 py-3 font-medium">{t("refund.colAdded")}</th>
                    <th className="px-3 py-3 font-medium">{t("refund.colStatus")}</th>
                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <RefundLine
                      key={r.id}
                      r={r}
                      focused={r.id === focus}
                      by={r.created_by ? (nameOf.get(r.created_by) ?? "—") : "—"}
                      canSettle={canSettle}
                      canDelete={isAdmin}
                      onEdit={() => setEditing({ draft: draftFromRow(r), id: r.id })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editing && (
        <RefundDialog
          initial={editing.draft}
          {...(editing.id ? { editId: editing.id } : {})}
          onClose={() => setEditing(null)}
        />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

function Cell({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: string;
  tone?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-[22px] font-bold tabular-nums text-foreground phone:text-[17px]",
          tone,
        )}
      >
        {value}
      </p>
      {children}
    </div>
  );
}

function RefundLine({
  r,
  focused,
  by,
  canSettle,
  canDelete,
  onEdit,
}: {
  r: RefundRow;
  focused: boolean;
  by: string;
  canSettle: boolean;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { update, remove, receipt } = useRefundMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  const brand = cardBrand(r.card_number);

  async function upload(file: File) {
    try {
      const res = await receipt.mutateAsync({ id: r.id, file });
      if (res.notified) toast.success(t("refund.sentToClient"));
      else
        toast.warning(
          t(
            res.notifyError === "no_telegram" || res.notifyError === "no_lead"
              ? "refund.savedNoTelegram"
              : "refund.savedNotSent",
          ),
        );
    } catch (err) {
      toast.error(describeError(err, t("refund.receiptFailed")));
    }
  }

  return (
    <tr
      className={cn(
        "border-b border-border align-top last:border-0 hover:bg-surface",
        r.status === "refunded" && "bg-emerald-500/[0.045]",
        focused && "bg-primary/5",
      )}
    >
      <td
        className={cn(
          "border-l-[3px] px-5 py-3.5",
          r.status === "refunded"
            ? "border-l-emerald-500"
            : r.status === "cancelled"
              ? "border-l-muted"
              : "border-l-amber-400",
        )}
      >
        {r.status === "refunded" && (
          <span className="mb-1 inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            {t("refund.done")}
          </span>
        )}
        <p className="font-semibold text-foreground">
          {r.lead_id ? (
            <Link
              to="/crm/leads/$leadId"
              params={{ leadId: r.lead_id }}
              className="hover:underline"
            >
              {r.client_name}
            </Link>
          ) : (
            r.client_name
          )}
        </p>
        <p className="text-[12.5px] tabular-nums text-muted-foreground">{r.phone || "—"}</p>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right tabular-nums">
        <p className="font-mono text-[14px] font-bold text-foreground">
          {format(Number(r.amount) || 0)}
        </p>
        {r.paid_amount != null && (
          <p className="text-[11.5px] text-muted-foreground">
            {t("refund.paidShort")}: {format(Number(r.paid_amount))}
          </p>
        )}
      </td>
      <td className="px-3 py-3.5">
        {r.card_number ? (
          <div className="flex items-start gap-1.5">
            <div>
              <p className="whitespace-nowrap font-mono text-[13.5px] font-semibold tracking-wide text-foreground">
                {formatCard(r.card_number)}
              </p>
              <p className="text-[12px] uppercase text-muted-foreground">
                {r.card_holder || "—"}
                {brand && <span className="ml-1.5 normal-case text-subtle">· {brand}</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(r.card_number ?? "");
                toast.success(t("refund.cardCopied"));
              }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t("refund.copyCard")}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <span className="text-[12.5px] text-amber-700 dark:text-amber-300">
            {t("refund.noCard")}
          </span>
        )}
      </td>
      <td className="max-w-[240px] px-3 py-3.5">
        <span
          className={cn(
            "inline-flex rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold",
            r.stage === "after"
              ? "bg-violet-500/12 text-violet-700 dark:text-violet-300"
              : "bg-sky-500/12 text-sky-700 dark:text-sky-300",
          )}
        >
          {t(`refund.stage.${r.stage}`)}
        </span>
        {r.reason && (
          <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{r.reason}</p>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-[12.5px] text-muted-foreground">
        <p>{new Date(r.created_at).toLocaleDateString("ru-RU")}</p>
        <p className="max-w-[140px] truncate">{by}</p>
      </td>
      <td className="px-3 py-3.5">
        {r.status === "refunded" ? (
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-2 py-0.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("refund.status.refunded")}
            </span>
            <button
              type="button"
              onClick={() =>
                void openRefundReceipt(r.id).catch((e) =>
                  toast.error(describeError(e, t("refund.receiptFailed"))),
                )
              }
              className="flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
            >
              <Receipt className="h-3.5 w-3.5" />
              {t("refund.receipt")}
            </button>
            <p
              className={cn(
                "flex items-center gap-1 text-[11.5px]",
                r.notified_at ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
              )}
            >
              <Send className="h-3 w-3" />
              {r.notified_at ? t("refund.botSent") : t("refund.botNotSent")}
            </p>
          </div>
        ) : r.status === "cancelled" ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[12px] font-semibold text-muted-foreground">
            <XCircle className="h-3.5 w-3.5" />
            {t("refund.status.cancelled")}
          </span>
        ) : canSettle ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={receipt.isPending}>
              {receipt.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="h-4 w-4" />
              )}
              {t("refund.uploadReceipt")}
            </Button>
          </>
        ) : (
          <span className="inline-flex rounded-md bg-amber-500/12 px-2 py-0.5 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
            {t("refund.status.pending")}
          </span>
        )}
      </td>
      <td className="px-3 py-3.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={t("refund.actions")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(r.status === "pending" || canSettle) && r.status !== "cancelled" && (
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" /> {t("refund.edit")}
              </DropdownMenuItem>
            )}
            {r.status === "pending" && (
              <DropdownMenuItem
                onClick={() =>
                  window.confirm(t("refund.cancelConfirm")) &&
                  update.mutate(
                    { id: r.id, patch: { status: "cancelled" } },
                    { onError: (e) => toast.error(describeError(e, t("refund.saveFailed"))) },
                  )
                }
              >
                <XCircle className="h-4 w-4" /> {t("refund.cancel")}
              </DropdownMenuItem>
            )}
            {r.status === "cancelled" && canSettle && (
              <DropdownMenuItem
                onClick={() =>
                  update.mutate(
                    { id: r.id, patch: { status: "pending" } },
                    { onError: (e) => toast.error(describeError(e, t("refund.alreadyOpen"))) },
                  )
                }
              >
                <Undo2 className="h-4 w-4" /> {t("refund.reopen")}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                className="text-destructive"
                onClick={() =>
                  window.confirm(t("refund.deleteConfirm")) &&
                  remove.mutate(r.id, {
                    onError: (e) => toast.error(describeError(e, t("refund.saveFailed"))),
                  })
                }
              >
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// Import: an Excel or CSV sheet with a header row (Ism, Telefon, Summa,
// Karta raqami, Karta egasi, Sabab, Bosqich); preview, then add them all.
function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { add } = useRefundMutations();
  const [parsed, setParsed] = useState<{ rows: ImportedRefund[]; skipped: number } | null>(null);
  const [reading, setReading] = useState(false);

  async function read(file: File) {
    setReading(true);
    try {
      let table: string[][];
      if (/\.xlsx$/i.test(file.name)) table = await readXlsxFirstSheet(file);
      else {
        const text = await file.text();
        const csv = parseCsv(text, detectCsvDelimiter(text));
        table = [csv.headers, ...csv.rows];
      }
      setParsed(parseRefundSheet(table));
    } catch (err) {
      toast.error(describeError(err, t("refund.importFailed")));
    } finally {
      setReading(false);
    }
  }

  async function save() {
    if (!parsed?.rows.length) return;
    try {
      await add.mutateAsync(parsed.rows.map((r) => ({ ...r, lead_id: null })));
      toast.success(t("refund.imported", { n: parsed.rows.length }));
      onClose();
    } catch (err) {
      toast.error(describeError(err, t("refund.importFailed")));
    }
  }

  function template() {
    downloadXlsx("pul-qaytarish-shablon.xlsx", [
      {
        name: "Shablon",
        rows: [
          ["Ism", "Telefon", "Summa", "Karta raqami", "Karta egasi", "Sabab", "Bosqich"],
          [
            "Aziza Karimova",
            "+998901234567",
            2500000,
            "8600 1234 5678 9012",
            "AZIZA KARIMOVA",
            "Vaqti yo'q",
            "qabuldan oldin",
          ],
        ],
      },
    ]);
  }

  const total = parsed?.rows.reduce((s, r) => s + r.amount, 0) ?? 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{t("refund.importTitle")}</DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("refund.importDesc")}</p>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-[13.5px] font-semibold text-primary-foreground hover:opacity-90">
              {reading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {t("refund.pickFile")}
              <input
                type="file"
                accept=".xlsx,.csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void read(f);
                }}
              />
            </label>
            <Button variant="outline" onClick={template}>
              <Download className="h-4 w-4" />
              {t("refund.template")}
            </Button>
          </div>
          {parsed && (
            <div className="rounded-xl border border-border">
              <p className="border-b border-border px-3 py-2 text-[13px]">
                {t("refund.importPreview", { n: parsed.rows.length, sum: format(total) })}
                {parsed.skipped > 0 && (
                  <span className="ml-1 text-amber-700 dark:text-amber-300">
                    · {t("refund.importSkipped", { n: parsed.skipped })}
                  </span>
                )}
              </p>
              <ul className="max-h-[260px] divide-y divide-border overflow-y-auto">
                {parsed.rows.slice(0, 50).map((r, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      {r.client_name}
                    </span>
                    <span className="font-mono text-[12.5px] text-muted-foreground">
                      {r.card_number ? formatCard(r.card_number) : t("refund.noCard")}
                    </span>
                    <span className="w-[120px] text-right font-mono tabular-nums">
                      {format(r.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={!parsed?.rows.length || add.isPending}>
            {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("refund.importDo", { n: parsed?.rows.length ?? 0 })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        "flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-[13px]",
        value ? "border-primary/50 bg-primary/5" : "border-border bg-card",
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 max-w-[180px] bg-transparent font-semibold text-foreground outline-none"
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
