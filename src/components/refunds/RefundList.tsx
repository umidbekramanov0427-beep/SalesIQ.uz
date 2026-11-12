import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Receipt,
  Send,
  Trash2,
  Undo2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/layout/Primitives";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { TONE_TILE, type CardTone } from "@/lib/tones";
import { cn, describeError } from "@/lib/utils";
import {
  formatCard,
  refundDue,
  type RefundRow,
  type RefundRules,
  type RefundSummary,
} from "@/lib/refunds";
import { openRefundReceipt, useRefundMutations } from "@/hooks/use-crm-data";

// Pul qaytarish's look: the four figures as the platform's stat cards with
// one money line under them (paid back / still to pay), and the refunds as
// one table -- who, whose client and from which funnel, how much, the card,
// when it was added and how many days are left, the receipt as one small
// tile (open it, or upload it), and where it stands.

export function RefundSummaryBlock({ sum }: { sum: RefundSummary }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const donePct = sum.total ? Math.round((sum.refunded / sum.total) * 100) : 0;
  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          iconTone="violet"
          label={t("refund.sumTotal")}
          value={String(sum.total)}
          hint={`${t("refund.stage.before")}: ${sum.before} · ${t("refund.stage.after")}: ${sum.after}`}
        />
        <StatCard
          icon={Clock3}
          iconTone="amber"
          label={t("refund.sumToPay")}
          value={format(sum.toPay)}
          hint={t("refund.peopleN", { n: sum.pending })}
        />
        <StatCard
          icon={CheckCircle2}
          iconTone="emerald"
          label={t("refund.sumPaidBack")}
          value={format(sum.paidBack)}
          hint={t("refund.peopleN", { n: sum.refunded })}
        />
        <StatCard
          icon={CircleDollarSign}
          iconTone="sky"
          label={t("refund.progress")}
          value={`${donePct}%`}
          hint={t("refund.doneOf", { n: sum.refunded, total: sum.total })}
        />
      </div>
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

const STATUS_CHIP = {
  pending: { cls: "bg-amber-500/12 text-amber-800 dark:text-amber-200", icon: Clock3 },
  refunded: { cls: "bg-emerald-500/14 text-emerald-800 dark:text-emerald-200", icon: CheckCircle2 },
  cancelled: { cls: "bg-muted text-muted-foreground", icon: XCircle },
} as const;

/** Each manager keeps one dot color across the table. */
const MANAGER_DOT = [
  "bg-amber-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-sky-500",
  "bg-rose-500",
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
    "whitespace-nowrap px-3 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle";
  return (
    <>
      <div className="overflow-x-auto phone:hidden">
        <table className="w-full min-w-[1180px] border-collapse text-[14px]">
          <thead>
            <tr className="border-y border-border bg-surface/60">
              <th className={cn(th, "w-10 pl-5")}>#</th>
              <th className={th}>{t("refund.colClient")}</th>
              <th className={th}>{t("refund.colOwner")}</th>
              <th className={cn(th, "text-right")}>{t("refund.colAmount")}</th>
              <th className={th}>{t("refund.card")}</th>
              <th className={th}>{t("refund.colDue")}</th>
              <th className={cn(th, "text-center")}>{t("refund.colReceipt")}</th>
              <th className={th}>{t("refund.colStatus")}</th>
              <th className={cn(th, "w-[84px] pr-5")} />
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
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-border px-5 py-3 text-[13px] text-muted-foreground">
        <span className="tabular-nums">
          {t("refund.shownOf", { n: p.rows.length, total: p.total })} ·{" "}
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
  const funnel = funnelOf(r);
  const due = refundDue(r, rules);
  const chip = STATUS_CHIP[r.status];

  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  const td = "px-3 py-3.5 align-middle";
  return (
    <tr
      ref={rowRef}
      className={cn(
        "group border-b border-border/70 transition-colors last:border-0 hover:bg-surface/70",
        r.status === "refunded" && "bg-emerald-500/[0.035]",
        r.status === "cancelled" && "opacity-65",
        focused && "bg-primary/[0.07]",
      )}
    >
      <td className={cn(td, "pl-5 text-[13px] tabular-nums text-subtle")}>{n}</td>

      <td className={td}>
        <p className="max-w-[210px] truncate text-[15px] font-semibold text-foreground">
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
        <p className="mt-0.5 font-mono text-[12.5px] tabular-nums tracking-wide text-muted-foreground">
          {r.phone || "—"}
        </p>
      </td>

      <td className={td}>
        <p className="flex max-w-[190px] items-center gap-2 truncate text-[14px] font-medium text-foreground">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              owner
                ? MANAGER_DOT[Math.max(0, operators.indexOf(owner)) % MANAGER_DOT.length]
                : "bg-muted-foreground/40",
            )}
          />
          <span className="truncate">{owner ? nameOf(owner) : "—"}</span>
        </p>
        {funnel && (
          <span className="mt-1 inline-flex max-w-[190px] truncate rounded-md bg-muted px-1.5 py-0.5 text-[12px] font-medium text-muted-foreground">
            {funnel}
          </span>
        )}
      </td>

      <td className={cn(td, "text-right")}>
        <p
          className={cn(
            "whitespace-nowrap text-[15.5px] font-bold tabular-nums",
            r.status === "refunded" ? "text-emerald-700 dark:text-emerald-300" : "text-foreground",
          )}
        >
          {format(Number(r.amount) || 0)}
        </p>
        {r.paid_amount != null && (
          <p className="whitespace-nowrap text-[12px] text-muted-foreground">
            {t("refund.paidShort")}: {format(Number(r.paid_amount))}
          </p>
        )}
      </td>

      <td className={td}>
        {r.card_number ? (
          <div className="flex items-center gap-1.5">
            <div className="min-w-0">
              <p className="whitespace-nowrap font-mono text-[14px] font-medium tracking-wide text-foreground">
                {formatCard(r.card_number)}
              </p>
              <p className="max-w-[210px] truncate text-[12.5px] text-muted-foreground">
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
        ) : (
          <span className="text-[13px] font-medium text-amber-700 dark:text-amber-300">
            {t("refund.noCard")}
          </span>
        )}
      </td>

      <td className={td}>
        <p className="whitespace-nowrap text-[13.5px] tabular-nums text-foreground">
          {dateText(r.created_at)}
        </p>
        {due.kind === "done" ? (
          r.status === "refunded" && r.refunded_at ? (
            <p className="mt-0.5 whitespace-nowrap text-[12px] text-emerald-700 dark:text-emerald-300">
              ✓ {dateText(r.refunded_at)}
            </p>
          ) : null
        ) : (
          <span
            title={t("refund.dueOn", { date: dateText(due.due.toISOString()) })}
            className={cn(
              "mt-1 inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold",
              due.kind === "overdue"
                ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                : due.kind === "today" || due.days <= 1
                  ? "bg-amber-500/14 text-amber-800 dark:text-amber-200"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {due.kind === "overdue"
              ? t("refund.dueLate", { n: due.days })
              : due.kind === "today"
                ? t("refund.dueToday")
                : t("refund.dueLeft", { n: due.days })}
          </span>
        )}
      </td>

      {/* The receipt: one tile -- open it, or upload it. */}
      <td className={cn(td, "text-center")}>
        <ReceiptTile r={r} canSettle={canSettle} />
      </td>

      <td className={td}>
        <span
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 text-[12.5px] font-bold",
            chip.cls,
          )}
        >
          <chip.icon className="h-3.5 w-3.5" />
          {t(`refund.status.${r.status}`)}
        </span>
        <p
          className="mt-1 max-w-[200px] truncate text-[12.5px] text-muted-foreground"
          title={r.reason ?? undefined}
        >
          <span
            className={cn(
              "font-semibold",
              r.stage === "after"
                ? "text-violet-700 dark:text-violet-300"
                : "text-sky-700 dark:text-sky-300",
            )}
          >
            {t(`refund.stage.${r.stage}`)}
          </span>
          {r.reason ? ` · ${r.reason}` : ""}
        </p>
      </td>

      <td className={cn(td, "pr-5")}>
        <RowActions r={r} canSettle={canSettle} canDelete={canDelete} onEdit={() => onEdit(r)} />
      </td>
    </tr>
  );
}

function ReceiptTile({ r, canSettle }: { r: RefundRow; canSettle: boolean }) {
  const { t } = useI18n();
  const { receipt } = useRefundMutations();
  const fileRef = useRef<HTMLInputElement>(null);
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

  const tile = (tone: CardTone) =>
    cn(
      "relative grid h-10 w-10 place-items-center rounded-xl transition-transform hover:scale-105 disabled:pointer-events-none",
      TONE_TILE[tone],
    );

  return (
    <div className="inline-flex">
      {r.status === "refunded" ? (
        <button
          type="button"
          title={r.notified_at ? t("refund.botSent") : t("refund.botNotSent")}
          aria-label={t("refund.receipt")}
          onClick={() =>
            void openRefundReceipt(r.id).catch((e) =>
              toast.error(describeError(e, t("refund.receiptFailed"))),
            )
          }
          className={tile("emerald")}
        >
          <Receipt className="h-[18px] w-[18px]" />
          {r.notified_at && (
            <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-sky-500 text-white ring-2 ring-card">
              <Send className="h-2.5 w-2.5" />
            </span>
          )}
        </button>
      ) : r.status === "pending" && canSettle ? (
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
          <button
            type="button"
            title={t("refund.uploadReceipt")}
            aria-label={t("refund.uploadReceipt")}
            onClick={() => fileRef.current?.click()}
            disabled={receipt.isPending}
            className={tile("primary")}
          >
            {receipt.isPending ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" />
            ) : (
              <Upload className="h-[18px] w-[18px]" />
            )}
          </button>
        </>
      ) : (
        <span className="text-subtle">—</span>
      )}
    </div>
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
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground opacity-60 transition hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
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
  const { t } = useI18n();
  const { format } = useCurrency();
  const due = refundDue(r, rules);
  const chip = STATUS_CHIP[r.status];
  const owner = operatorOf(r);
  return (
    <li className={cn("px-4 py-3.5", r.status === "cancelled" && "opacity-65")}>
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
      <div className="mt-2 flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold",
            chip.cls,
          )}
        >
          <chip.icon className="h-3.5 w-3.5" />
          {t(`refund.status.${r.status}`)}
        </span>
        {due.kind !== "done" && (
          <span
            className={cn(
              "text-[12px] font-semibold",
              due.kind === "overdue" ? "text-rose-600" : "text-muted-foreground",
            )}
          >
            {due.kind === "overdue"
              ? t("refund.dueLate", { n: due.days })
              : due.kind === "today"
                ? t("refund.dueToday")
                : t("refund.dueLeft", { n: due.days })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <ReceiptTile r={r} canSettle={canSettle} />
          <RowActions r={r} canSettle={canSettle} canDelete={canDelete} onEdit={() => onEdit(r)} />
        </div>
      </div>
    </li>
  );
}
