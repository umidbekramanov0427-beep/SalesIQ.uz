import { downloadXlsx, type XlsxCell, type XlsxRich, type XlsxStyle } from "@/lib/xlsx-write";
import {
  formatCard,
  receiptCode,
  refundBucket,
  refundProblem,
  refundStepCount,
  refundSteps,
  type RefundBucket,
  type RefundKpis,
  type RefundRow,
  type RefundRules,
} from "@/lib/refunds";

// Pul qaytarish -> Excel: the table as it is on the page (what is shown,
// in the same order), laid out like the panel -- a title and the period over
// a dark header row with filters, money with thousands separators, the
// status as a coloured flag (Qaytarildi green, Kutilmoqda amber, Muammo red),
// the receipt's number, the five steps as "4/5" and a link into the CRM per
// row, a total line under it -- and a second sheet with the four figures.

type T = (key: string, vars?: Record<string, string | number>) => string;

const FLAG: Record<RefundBucket, XlsxStyle> = {
  refunded: "ok",
  pending: "warn",
  problem: "bad",
  cancelled: "gray",
};

const day = (iso: string | null | undefined) =>
  iso
    ? new Date(new Date(iso).getTime() + 5 * 3_600_000)
        .toISOString()
        .slice(0, 10)
        .split("-")
        .reverse()
        .join(".")
    : "";

const c = (v: XlsxRich["v"], s: XlsxStyle, href?: string): XlsxRich =>
  href ? { v, s, href } : { v, s };

export function exportRefundsXlsx(o: {
  rows: RefundRow[];
  t: T;
  rules: RefundRules;
  kpis: RefundKpis;
  period: string;
  nameOf: (id: string | null) => string;
  funnelOf: (r: RefundRow) => string | null;
  streamOf: (r: RefundRow) => string | null;
  operatorOf: (r: RefundRow) => string | null;
  origin?: string;
}) {
  const { t, rules } = o;
  const origin = o.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const now = new Date();
  const head = [
    "#",
    t("refund.xReceipt"),
    t("refund.colClient"),
    t("refund.phone"),
    t("refund.xManager"),
    t("refund.fStream"),
    t("refund.fFunnel"),
    t("refund.xAmount"),
    t("refund.xPaid"),
    t("refund.card"),
    t("refund.holder"),
    t("refund.colStatus"),
    t("refund.colProgress"),
    t("refund.xReason"),
    t("refund.colAdded"),
    t("refund.colRefundedAt"),
    t("refund.xLink"),
  ];
  const lastCol = String.fromCharCode(64 + head.length);

  const body: XlsxCell[][] = o.rows.map((r, i) => {
    const bucket = refundBucket(r, rules, now);
    const problem = refundProblem(r, rules, now);
    const { done, total } = refundStepCount(refundSteps(r));
    const owner = o.operatorOf(r);
    const why = problem
      ? problem.kind === "overdue"
        ? t("refund.dueLate", { n: problem.days })
        : problem.kind === "no_card"
          ? t("refund.noCard")
          : t("refund.notSentShort")
      : null;
    const link = r.lead_id ? `${origin}/crm/leads/${r.lead_id}` : `${origin}/refunds?focus=${r.id}`;
    return [
      c(i + 1, "center"),
      c(receiptCode(r.receipt_no) || null, "mono"),
      c(r.client_name, "strong"),
      c(r.phone, "mono"),
      c(owner ? o.nameOf(owner) : "", "text"),
      c(o.streamOf(r) ?? "", "text"),
      c(o.funnelOf(r) ?? "", "text"),
      c(Number(r.amount) || 0, "money"),
      c(r.paid_amount == null ? null : Number(r.paid_amount), "num"),
      c(formatCard(r.card_number), "mono"),
      c(r.card_holder, "text"),
      c(
        t(bucket === "problem" ? "refund.status.problem" : `refund.status.${bucket}`),
        FLAG[bucket],
      ),
      c(`${done}/${total}`, done === total ? "ok" : "center"),
      c([why, r.reason, r.note].filter(Boolean).join(" · "), "muted"),
      c(day(r.created_at), "center"),
      c(day(r.refunded_at), "center"),
      c(t("refund.xOpen"), "link", link),
    ];
  });

  const sum = o.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const paid = o.rows.reduce((s, r) => s + (r.paid_amount == null ? 0 : Number(r.paid_amount)), 0);
  const totalRow: XlsxCell[] = head.map((_, i) =>
    i === 2
      ? c(t("refund.xTotal", { n: o.rows.length }), "totalLabel")
      : i === 7
        ? c(sum, "totalMoney")
        : i === 8
          ? c(paid || null, "totalMoney")
          : c(null, "totalLabel"),
  );

  const title = `${t("refund.title")} — ${t("refund.xReport")}`;
  const subtitle = `${t("refund.xPeriod")}: ${o.period} · ${t("refund.xMade")}: ${day(now.toISOString())} ${now
    .toTimeString()
    .slice(0, 5)} · ${t("refund.shownRows", { n: o.rows.length, total: o.rows.length })}`;

  const k = o.kpis;
  const counts = { refunded: 0, pending: 0, problem: 0, cancelled: 0 } as Record<
    RefundBucket,
    number
  >;
  for (const r of o.rows) counts[refundBucket(r, rules, now)] += 1;

  downloadXlsx(`pul-qaytarish-${now.toISOString().slice(0, 10)}.xlsx`, [
    {
      name: t("refund.title"),
      header: 2,
      rows: [
        [c(title, "title")],
        [c(subtitle, "subtitle")],
        head.map((h) => c(h, "head")),
        ...body,
        totalRow,
      ],
      merges: [`A1:${lastCol}1`, `A2:${lastCol}2`],
      heights: { 0: 30, 1: 20, 2: 30 },
      widths: [6, 9, 26, 17, 20, 14, 18, 15, 14, 22, 22, 15, 10, 34, 12, 12, 12],
    },
    {
      name: t("refund.summarySheet"),
      header: 2,
      rows: [
        [c(title, "title")],
        [c(`${t("refund.xPeriod")}: ${o.period}`, "subtitle")],
        [c(t("refund.xFigure"), "head"), c(t("refund.xValue"), "head")],
        [c(t("refund.kReceived"), "kpiLabel"), c(k.received, "kpiValue")],
        [c(t("refund.kToRefund"), "kpiLabel"), c(k.toRefund, "kpiValue")],
        [c(t("refund.kRefunded"), "kpiLabel"), c(k.refunded, "kpiValue")],
        [c(t("refund.kOnCard"), "kpiLabel"), c(k.onCard, "kpiValue")],
        [c(t("refund.xLeft"), "kpiLabel"), c(k.left, "kpiValue")],
        [c(t("refund.xDonePct"), "kpiLabel"), c(`${k.pct}%`, k.pct >= 100 ? "ok" : "center")],
        [c(t("refund.tab.refunded"), "ok"), c(counts.refunded, "center")],
        [c(t("refund.tab.pending"), "warn"), c(counts.pending, "center")],
        [c(t("refund.tab.problem"), "bad"), c(counts.problem, "center")],
        [c(t("refund.tab.cancelled"), "gray"), c(counts.cancelled, "center")],
      ],
      merges: ["A1:B1", "A2:B2"],
      heights: { 0: 30, 2: 26 },
      widths: [34, 22],
    },
  ]);
}
