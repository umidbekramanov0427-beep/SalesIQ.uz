import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  HandCoins,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  Undo2,
  Upload,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CardTools, useCardChrome } from "@/components/layout/CardTools";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { TONE_TILE, type CardTone } from "@/lib/tones";
import { cn, describeError } from "@/lib/utils";
import {
  REFUND_STEPS,
  formatCard,
  receiptCode,
  refundDue,
  refundProblem,
  refundStepCount,
  refundSteps,
  type RefundKpis,
  type RefundRow,
  type RefundRules,
  type RefundStepKey,
  type RefundStepState,
  type RefundSummary,
} from "@/lib/refunds";
import { openRefundReceipt, useRefundMutations } from "@/hooks/use-crm-data";

// Pul qaytarish's look (the owner's reference): four figures -- what the
// clients paid, what must go back, what went back (with a progress bar) and
// what is still on the card -- then one table: who, whose client and from
// which funnel, how much, the card, the five steps of the refund (Jarayon),
// the receipt's number with its link, and where it stands. Uploading the
// receipt does steps 1-5 by itself; a step the bot could not do (the client
// blocked it) turns red and a person marks it done by hand.

/* ---- The four figures --------------------------------------------------- */

function KpiCard({
  icon,
  tone,
  label,
  tipKey,
  value,
  children,
}: {
  icon: LucideIcon;
  tone: CardTone;
  label: string;
  tipKey: string;
  value: string;
  children?: ReactNode;
}) {
  const chrome = useCardChrome({ tipKey, label });
  return (
    <div className={cn("surface-card flex flex-col !rounded-[12px] px-5 py-4")}>
      <div className="flex items-center gap-2.5">
        <span
          className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", TONE_TILE[tone])}
        >
          {(() => {
            const Icon = icon;
            return <Icon className="h-4 w-4" />;
          })()}
        </span>
        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {label}
        </p>
        <CardTools chrome={chrome} label={label} />
      </div>
      <p className="mt-3 whitespace-nowrap text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground phone:text-[22px]">
        {value}
      </p>
      <div className="mt-2.5 text-[12.5px] text-muted-foreground">{children}</div>
    </div>
  );
}

export function RefundKpiCards({ k }: { k: RefundKpis }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={Wallet}
        tone="violet"
        label={t("refund.kReceived")}
        tipKey="refund.kReceived"
        value={format(k.received)}
      >
        {t("refund.kClients", { n: k.clients })}
      </KpiCard>
      <KpiCard
        icon={HandCoins}
        tone="amber"
        label={t("refund.kToRefund")}
        tipKey="refund.kToRefund"
        value={format(k.toRefund)}
      >
        {t("refund.kToRefundHint")}
      </KpiCard>
      <KpiCard
        icon={CheckCircle2}
        tone="emerald"
        label={t("refund.kRefunded")}
        tipKey="refund.kRefunded"
        value={format(k.refunded)}
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
            style={{ width: `${k.pct}%` }}
          />
        </div>
        <p className="mt-1.5 tabular-nums">
          <b className="font-semibold text-emerald-700 dark:text-emerald-300">{k.pct}%</b>
          {k.left > 0
            ? ` · ${t("refund.kLeft", { amount: format(k.left) })}`
            : ` · ${t("refund.kAllBack")}`}
        </p>
      </KpiCard>
      <KpiCard
        icon={CreditCard}
        tone="sky"
        label={t("refund.kOnCard")}
        tipKey="refund.kOnCard"
        value={format(k.onCard)}
      >
        {t("refund.kOnCardHint")}
      </KpiCard>
    </div>
  );
}

/** Where the money stands: paid back and still to pay, on one line (Analitika). */
export function RefundMoneyLine({ sum }: { sum: RefundSummary }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const money = sum.toPay + sum.paidBack;
  return (
    <div className="surface-card px-5 py-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold text-foreground">{t("refund.moneyLine")}</span>
        <span className="tabular-nums text-muted-foreground">
          {t("refund.moneyTotal")}: <b className="text-foreground">{format(money)}</b>
        </span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-emerald-500 transition-[width] duration-500"
          style={{ width: `${money ? (sum.paidBack / money) * 100 : 0}%` }}
        />
        <div
          className="h-full bg-amber-400 transition-[width] duration-500"
          style={{ width: `${money ? (sum.toPay / money) * 100 : 0}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {t("refund.sumPaidBack")} ·{" "}
          {format(sum.paidBack)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> {t("refund.sumToPay")} ·{" "}
          {format(sum.toPay)}
        </span>
      </div>
    </div>
  );
}

/* ---- The table ---------------------------------------------------------- */

/** Each manager keeps one dot color across the table. */
const MANAGER_DOT = [
  "bg-amber-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-rose-500",
  "bg-teal-500",
];

const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

export type RefundListProps = {
  rows: RefundRow[];
  total: number;
  focus: string | undefined;
  rules: RefundRules;
  nameOf: (id: string | null) => string;
  funnelOf: (r: RefundRow) => string | null;
  streamOf: (r: RefundRow) => string | null;
  operatorOf: (r: RefundRow) => string | null;
  operators: string[];
  canSettle: boolean;
  canDelete: boolean;
  onEdit: (r: RefundRow) => void;
};

export function RefundTable(p: RefundListProps) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const sum = p.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const th =
    "whitespace-nowrap px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground";
  return (
    <>
      <div className="overflow-x-auto phone:hidden">
        <table className="w-full min-w-[1220px] border-collapse text-[14px]">
          <thead>
            <tr className="border-y border-border bg-surface/70">
              <th className={cn(th, "w-12 pl-5")}>#</th>
              <th className={th}>{t("refund.colClient")}</th>
              <th className={th}>{t("refund.colOwner")}</th>
              <th className={cn(th, "text-right")}>{t("refund.colAmount")}</th>
              <th className={th}>{t("refund.card")}</th>
              <th className={th}>{t("refund.colProgress")}</th>
              <th className={th}>{t("refund.colReceipt")}</th>
              <th className={th}>{t("refund.colStatus")}</th>
              <th className={cn(th, "w-[76px] pr-5")} />
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r, i) => (
              <RefundTableRow key={r.id} n={i + 1} r={r} {...p} />
            ))}
          </tbody>
        </table>
      </div>
      {/* Phones: one block per client, nothing scrolls sideways. */}
      <ul className="hidden divide-y divide-border border-t border-border phone:block">
        {p.rows.map((r) => (
          <RefundPhoneRow key={r.id} r={r} {...p} />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-5 py-3.5 text-[12.5px] text-muted-foreground">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold text-foreground">{t("refund.stepsLegend")}:</span>
          {REFUND_STEPS.map((k, i) => (
            <span key={k} className="whitespace-nowrap">
              <b className="font-mono text-foreground">{i + 1}</b> · {t(`refund.step.${k}`)}
            </span>
          ))}
        </span>
        <span className="ml-auto whitespace-nowrap tabular-nums">
          {t("refund.shownRows", { n: p.rows.length, total: p.total })} ·{" "}
          <b className="text-foreground">{format(sum)}</b>
        </span>
      </div>
    </>
  );
}

function RefundTableRow({
  n,
  r,
  focus,
  rules,
  nameOf,
  funnelOf,
  streamOf,
  operatorOf,
  operators,
  canSettle,
  canDelete,
  onEdit,
}: RefundListProps & { n: number; r: RefundRow }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const rowRef = useRef<HTMLTableRowElement>(null);
  const focused = r.id === focus;
  const owner = operatorOf(r);
  const funnel = streamOf(r) ?? funnelOf(r);

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  const td = "px-3 py-3.5 align-middle";
  return (
    <tr
      ref={rowRef}
      className={cn(
        "group border-b border-border/70 transition-colors last:border-0 hover:bg-surface/70",
        r.status === "cancelled" && "opacity-60",
        focused && "bg-primary/[0.07]",
      )}
    >
      <td className={cn(td, "pl-5 font-mono text-[12.5px] tabular-nums text-muted-foreground")}>
        {n}
      </td>

      <td className={td}>
        <p className="max-w-[220px] truncate text-[14.5px] font-semibold text-foreground">
          {r.lead_id ? (
            <Link
              to="/crm/leads/$leadId"
              params={{ leadId: r.lead_id }}
              className="hover:text-primary hover:underline"
            >
              {r.client_name}
            </Link>
          ) : (
            r.client_name
          )}
        </p>
        <p className="mt-0.5 whitespace-nowrap font-mono text-[12.5px] tabular-nums text-muted-foreground">
          {r.phone || "—"}
        </p>
      </td>

      <td className={td}>
        <p className="flex max-w-[200px] items-center gap-2 text-[14px] font-medium text-foreground">
          <span
            className={cn(
              "h-2.5 w-2.5 shrink-0 rounded-full",
              owner
                ? MANAGER_DOT[Math.max(0, operators.indexOf(owner)) % MANAGER_DOT.length]
                : "bg-muted-foreground/40",
            )}
          />
          <span className="truncate">{owner ? nameOf(owner) : "—"}</span>
        </p>
        <p className="mt-0.5 max-w-[200px] truncate pl-[18px] text-[12.5px] text-muted-foreground">
          {funnel ?? t(`refund.stage.${r.stage}`)}
        </p>
      </td>

      <td className={cn(td, "text-right")}>
        <p className="whitespace-nowrap text-[15px] font-bold tabular-nums text-foreground">
          {format(Number(r.amount) || 0)}
        </p>
        {r.paid_amount != null && (
          <p className="whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
            {t("refund.paidShort")}: {format(Number(r.paid_amount))}
          </p>
        )}
      </td>

      <td className={td}>
        <CardCell r={r} />
      </td>

      <td className={td}>
        <StepDots r={r} canSettle={canSettle} />
      </td>

      <td className={td}>
        <ReceiptCell r={r} canSettle={canSettle} />
      </td>

      <td className={td}>
        <StatusCell r={r} rules={rules} canEdit={canSettle || r.status === "pending"} />
      </td>

      <td className={cn(td, "pr-5")}>
        <RowActions r={r} canSettle={canSettle} canDelete={canDelete} onEdit={() => onEdit(r)} />
      </td>
    </tr>
  );
}

function CardCell({ r }: { r: RefundRow }) {
  const { t } = useI18n();
  if (!r.card_number) {
    return (
      <span className="text-[13px] font-medium text-amber-700 dark:text-amber-300">
        {t("refund.noCard")}
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0">
        <p className="whitespace-nowrap font-mono text-[13.5px] font-medium tracking-wide text-foreground">
          {formatCard(r.card_number)}
        </p>
        <p className="max-w-[200px] truncate text-[12px] uppercase tracking-wide text-muted-foreground">
          {r.card_holder || "—"}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(r.card_number ?? "");
          toast.success(t("refund.cardCopied"));
        }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
        aria-label={t("refund.copyCard")}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ---- Jarayon: five circles ---------------------------------------------- */

const MANUAL_STEP: Partial<Record<RefundStepKey, "notified_at" | "noted_at" | "budgeted_at">> = {
  sent: "notified_at",
  noted: "noted_at",
  budget: "budgeted_at",
};

function StepDots({ r, canSettle }: { r: RefundRow; canSettle: boolean }) {
  const { t } = useI18n();
  const steps = refundSteps(r);
  const { done, total } = refundStepCount(steps);
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {REFUND_STEPS.map((k, i) => (
          <StepDot
            key={k}
            r={r}
            step={k}
            n={i + 1}
            state={steps[k]}
            canMark={canSettle && r.status === "refunded" && !!MANUAL_STEP[k]}
          />
        ))}
      </div>
      <span
        className={cn(
          "font-mono text-[12.5px] font-semibold tabular-nums",
          done === total ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
        )}
        title={t("refund.stepsDone", { n: done, total })}
      >
        {done}/{total}
      </span>
    </div>
  );
}

function StepDot({
  r,
  step,
  n,
  state,
  canMark,
}: {
  r: RefundRow;
  step: RefundStepKey;
  n: number;
  state: RefundStepState;
  canMark: boolean;
}) {
  const { t } = useI18n();
  const { update } = useRefundMutations();
  const column = MANUAL_STEP[step];
  const name = t(`refund.step.${step}`);
  const dot = (
    <span
      className={cn(
        "grid h-[22px] w-[22px] place-items-center rounded-full text-[10.5px] font-bold transition-transform",
        state === "done" && "bg-emerald-500 text-white",
        state === "failed" && "bg-rose-500 text-white ring-2 ring-rose-500/25",
        state === "todo" && "border border-dashed border-muted-foreground/45 text-muted-foreground",
        state === "na" && "bg-muted text-muted-foreground/50",
        canMark && "cursor-pointer hover:scale-110",
      )}
    >
      {state === "done" ? (
        <Check className="h-3 w-3" strokeWidth={3} />
      ) : state === "failed" ? (
        "!"
      ) : state === "na" ? (
        "–"
      ) : (
        n
      )}
    </span>
  );
  const label = `${n}. ${name} — ${t(`refund.stepState.${state}`)}`;
  if (!canMark || !column) {
    return (
      <span title={label} aria-label={label}>
        {dot}
      </span>
    );
  }
  const set = (value: string | null) =>
    update.mutate(
      {
        id: r.id,
        patch:
          column === "notified_at"
            ? { notified_at: value, ...(value ? { notify_error: null } : {}) }
            : { [column]: value },
      },
      {
        onSuccess: () => toast.success(value ? t("refund.stepMarked") : t("refund.stepUnmarked")),
        onError: (e) => toast.error(describeError(e, t("refund.saveFailed"))),
      },
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" title={label} aria-label={label}>
          {dot}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[280px]">
        <DropdownMenuLabel className="text-[13px]">
          {n}. {name}
        </DropdownMenuLabel>
        {state === "failed" && (
          <p className="px-2 pb-2 text-[12.5px] leading-snug text-rose-700 dark:text-rose-300">
            {t("refund.sendFailedHint")}
            {r.notify_error && r.notify_error !== "off" && (
              <span className="mt-1 block font-mono text-[11.5px] text-muted-foreground">
                {notifyReason(t, r.notify_error)}
              </span>
            )}
          </p>
        )}
        <DropdownMenuSeparator />
        {state === "done" ? (
          <DropdownMenuItem onClick={() => set(null)}>
            <Undo2 className="h-4 w-4" /> {t("refund.stepUnmark")}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => set(new Date().toISOString())}>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {step === "sent" ? t("refund.sentByHand") : t("refund.stepMark")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function notifyReason(t: ReturnType<typeof useI18n>["t"], err: string) {
  if (err === "no_telegram" || err === "no_lead") return t(`refund.why.${err}`);
  if (/blocked|forbidden|deactivated/i.test(err)) return t("refund.why.blocked");
  return err;
}

/* ---- The receipt: #001 and its link, or the upload button ---------------- */

function ReceiptCell({ r, canSettle }: { r: RefundRow; canSettle: boolean }) {
  const { t } = useI18n();
  const { receipt } = useRefundMutations();
  const fileRef = useRef<HTMLInputElement>(null);
  async function upload(file: File) {
    try {
      const res = (await receipt.mutateAsync({ id: r.id, file })) as {
        notified?: boolean;
        notifyError?: string | null;
        receiptNo?: number | null;
      };
      const code = receiptCode(res.receiptNo);
      if (res.notified) toast.success(t("refund.sentToClientNo", { code: code || "" }).trim());
      else
        toast.warning(
          t(
            res.notifyError === "no_telegram" || res.notifyError === "no_lead"
              ? "refund.savedNoTelegram"
              : res.notifyError === "off"
                ? "refund.savedOff"
                : "refund.savedNotSent",
          ),
        );
    } catch (err) {
      toast.error(describeError(err, t("refund.receiptFailed")));
    }
  }
  const input = (
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
  );

  if (r.receipt_path) {
    const code = receiptCode(r.receipt_no);
    return (
      <div className="flex items-center gap-2">
        {code && (
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[12.5px] font-semibold text-foreground">
            {code}
          </span>
        )}
        <button
          type="button"
          onClick={() =>
            void openRefundReceipt(r.id).catch((e) =>
              toast.error(describeError(e, t("refund.receiptFailed"))),
            )
          }
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
        >
          {t("refund.receiptLink")}
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  if (r.status === "pending" && canSettle) {
    return (
      <>
        {input}
        <button
          type="button"
          title={t("refund.uploadReceipt")}
          aria-label={t("refund.uploadReceipt")}
          onClick={() => fileRef.current?.click()}
          disabled={receipt.isPending}
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl transition-transform hover:scale-105 disabled:pointer-events-none",
            TONE_TILE.primary,
          )}
        >
          {receipt.isPending ? (
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          ) : (
            <Upload className="h-[18px] w-[18px]" />
          )}
        </button>
      </>
    );
  }
  return <span className="text-muted-foreground/60">—</span>;
}

/* ---- Holat: the badge, the reason, the note ------------------------------ */

const BADGE = {
  refunded: {
    cls: "bg-emerald-500/14 text-emerald-800 dark:text-emerald-200",
    icon: CheckCircle2,
  },
  pending: { cls: "bg-amber-500/14 text-amber-800 dark:text-amber-200", icon: Clock3 },
  problem: { cls: "bg-rose-500/14 text-rose-700 dark:text-rose-200", icon: AlertTriangle },
  cancelled: { cls: "bg-muted text-muted-foreground", icon: XCircle },
} as const;

function StatusCell({ r, rules, canEdit }: { r: RefundRow; rules: RefundRules; canEdit: boolean }) {
  const { t } = useI18n();
  const problem = refundProblem(r, rules);
  const kind = r.status === "cancelled" ? "cancelled" : problem ? "problem" : r.status;
  const badge = BADGE[kind];
  const due = refundDue(r, rules);
  const reason = problem
    ? problem.kind === "overdue"
      ? t("refund.dueLate", { n: problem.days })
      : problem.kind === "no_card"
        ? t("refund.noCard")
        : t("refund.notSentShort")
    : due.kind === "today"
      ? t("refund.dueToday")
      : due.kind === "left"
        ? t("refund.dueLeft", { n: due.days })
        : r.status === "refunded" && r.refunded_at
          ? dateText(r.refunded_at)
          : null;
  return (
    <div className="min-w-[150px]">
      <span
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold",
          badge.cls,
        )}
      >
        <badge.icon className="h-3.5 w-3.5" />
        {t(kind === "problem" ? "refund.status.problem" : `refund.status.${kind}`)}
      </span>
      {reason && (
        <p
          className={cn(
            "mt-1 max-w-[210px] truncate text-[12px]",
            problem ? "font-medium text-rose-700 dark:text-rose-300" : "text-muted-foreground",
          )}
        >
          {reason}
        </p>
      )}
      <NoteButton r={r} canEdit={canEdit} />
    </div>
  );
}

function NoteButton({ r, canEdit }: { r: RefundRow; canEdit: boolean }) {
  const { t } = useI18n();
  const { update } = useRefundMutations();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(r.note ?? "");
  useEffect(() => {
    if (open) setText(r.note ?? "");
  }, [open, r.note]);
  if (!canEdit && !r.note) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={!canEdit}
          className={cn(
            "mt-1 block max-w-[210px] truncate text-left text-[12px]",
            r.note
              ? "text-foreground/80 hover:text-foreground"
              : "font-semibold text-primary opacity-70 hover:opacity-100",
          )}
          title={r.note ?? undefined}
        >
          {r.note ? `📝 ${r.note}` : `+ ${t("refund.addNote")}`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] p-3">
        <p className="mb-2 text-[13px] font-semibold text-foreground">{t("refund.note")}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={500}
          autoFocus
          className="w-full rounded-lg border border-border bg-input px-2.5 py-2 text-[13.5px] outline-none focus:border-primary"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { id: r.id, patch: { note: text.trim() || null } },
                {
                  onSuccess: () => setOpen(false),
                  onError: (e) => toast.error(describeError(e, t("refund.saveFailed"))),
                },
              )
            }
          >
            {t("common.save")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function RowActions({
  r,
  canSettle,
  canDelete,
  onEdit,
}: {
  r: RefundRow;
  canSettle: boolean;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { update, remove } = useRefundMutations();
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <>
      <div className="flex items-center justify-end gap-0.5">
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground opacity-50 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            aria-label={t("common.delete")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("refund.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("refund.deleteBody", {
                name: r.client_name,
                amount: format(Number(r.amount) || 0),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                remove.mutate(r.id, {
                  onSuccess: () => toast.success(t("refund.deleted")),
                  onError: (e) => toast.error(describeError(e, t("refund.saveFailed"))),
                })
              }
            >
              <Trash2 className="h-4 w-4" />
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RefundPhoneRow({
  r,
  rules,
  nameOf,
  operatorOf,
  canSettle,
  canDelete,
  onEdit,
}: RefundListProps & { r: RefundRow }) {
  const { format } = useCurrency();
  const owner = operatorOf(r);
  return (
    <li className={cn("px-4 py-3.5", r.status === "cancelled" && "opacity-60")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{r.client_name}</p>
          <p className="text-[12.5px] tabular-nums text-muted-foreground">
            {r.phone || "—"} · {owner ? nameOf(owner) : "—"}
          </p>
        </div>
        <p className="whitespace-nowrap text-[15px] font-bold tabular-nums text-foreground">
          {format(Number(r.amount) || 0)}
        </p>
      </div>
      {r.card_number && (
        <p className="mt-1.5 font-mono text-[13.5px] tracking-wide text-foreground">
          {formatCard(r.card_number)}
          <span className="ml-2 font-sans text-[12px] text-muted-foreground">{r.card_holder}</span>
        </p>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <StepDots r={r} canSettle={canSettle} />
        <ReceiptCell r={r} canSettle={canSettle} />
      </div>
      <div className="mt-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <StatusCell r={r} rules={rules} canEdit={canSettle || r.status === "pending"} />
        </div>
        <RowActions r={r} canSettle={canSettle} canDelete={canDelete} onEdit={() => onEdit(r)} />
      </div>
    </li>
  );
}
