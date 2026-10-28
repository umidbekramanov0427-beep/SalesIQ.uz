import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  Instagram,
  Link2,
  Loader2,
  Plus,
  Repeat,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  useCancelLeadPaymentLink,
  useCreateLeadPaymentLink,
  useLeadInstagramLink,
  useLeadPaymentLinks,
  useLeadPaymentSchedules,
  useLeadTelegramLink,
  usePaymentMerchant,
  useSendLeadInstagramMessage,
  useSendLeadTelegramMessage,
  useStopLeadPaymentSchedule,
  useAddLeadPayment,
  useDeleteLeadPayment,
  useLeadLedger,
  useSetNextPaymentDate,
  type LeadPaymentLinkRow,
  type LeadPaymentRow,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { formatSom, parseAmount } from "@/lib/lead-payments/paid-stage";
import { paymentLinkText } from "@/lib/lead-payments/recurring";
import {
  isPaymentMethod,
  ledgerSummary,
  nextPaymentState,
  type PaymentMethod,
} from "@/lib/lead-payments/ledger";
import { cn, describeError, formatDate } from "@/lib/utils";

// The lead card's "To'lovlar": the payments ledger (cash, card, transfer
// taken by hand, plus Payme / Click payments), what is still owed and the
// next payment date, and payment links the client pays into the company's
// own Payme / Click cashbox. Paying moves the lead's stage by itself
// (src/lib/lead-payments/ledger.server.ts).

const payUrl = (id: string) => `${window.location.origin}/pay/${id}`;

function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-bold",
        status === "paid"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : status === "cancelled"
            ? "bg-muted text-muted-foreground"
            : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      )}
    >
      {t(`lpay.status.${status}`)}
    </span>
  );
}

/** Copy / Telegram / Instagram for one payment link. */
function ShareButtons({ leadId, row }: { leadId: string; row: LeadPaymentLinkRow }) {
  const { t } = useI18n();
  const { data: tg } = useLeadTelegramLink(leadId, { poll: false });
  const { data: ig } = useLeadInstagramLink(leadId);
  const sendTg = useSendLeadTelegramMessage();
  const sendIg = useSendLeadInstagramMessage();
  const url = payUrl(row.id);
  const text = paymentLinkText({ amount: Number(row.amount), description: row.description }, url);
  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-50";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={btn}
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          toast.success(t("lpay.copied"));
        }}
      >
        <Copy className="h-3.5 w-3.5" /> {t("lpay.copy")}
      </button>
      {tg && (
        <button
          type="button"
          className={btn}
          disabled={sendTg.isPending}
          onClick={() =>
            sendTg.mutate(
              { leadId, text },
              {
                onSuccess: () => toast.success(t("lpay.sent")),
                onError: (e) => toast.error(describeError(e, t("amo.sendFailed"))),
              },
            )
          }
        >
          <Send className="h-3.5 w-3.5 text-sky-500" /> Telegram
        </button>
      )}
      {ig && (
        <button
          type="button"
          className={btn}
          disabled={sendIg.isPending}
          onClick={() =>
            sendIg.mutate(
              { leadId, text },
              {
                onSuccess: () => toast.success(t("lpay.sent")),
                onError: (e) => toast.error(describeError(e, t("amo.sendFailed"))),
              },
            )
          }
        >
          <Instagram className="h-3.5 w-3.5 text-pink-500" /> Instagram
        </button>
      )}
    </div>
  );
}

export function PaymentLinkDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const { data: merchant, isLoading } = usePaymentMerchant(open);
  const create = useCreateLeadPaymentLink();
  const { data: links = [] } = useLeadPaymentLinks(leadId);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [createdId, setCreatedId] = useState<string | null>(null);
  // "Har oy": the same link again on this day of every month.
  const [monthly, setMonthly] = useState(false);
  const [day, setDay] = useState(() => Math.min(new Date().getDate(), 28));
  const [createdMonthly, setCreatedMonthly] = useState(false);
  const created = links.find((l) => l.id === createdId) ?? null;
  const ready = !!merchant && (merchant.paymeReady || merchant.clickReady);
  const value = parseAmount(amount);

  function close(v: boolean) {
    onOpenChange(v);
    if (!v) {
      setCreatedId(null);
      setAmount("");
      setDescription("");
      setMonthly(false);
      setCreatedMonthly(false);
    }
  }

  async function submit() {
    if (value === null) return;
    try {
      const r = await create.mutateAsync({
        leadId,
        amount: value,
        description,
        ...(monthly ? { monthlyDay: day } : {}),
      });
      setCreatedId(r.id);
      setCreatedMonthly(!!r.scheduleId);
    } catch (err) {
      toast.error(describeError(err, t("lpay.createFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-emerald-600" /> {t("lpay.title")}
        </DialogTitle>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !ready ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
              {t("lpay.noMerchant")}
            </p>
            <Link
              to="/integrations/$slug"
              params={{ slug: "payments" }}
              className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              {t("lpay.setup")}
            </Link>
          </div>
        ) : created ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-emerald-500/10 p-3.5 text-emerald-800 dark:text-emerald-200">
              <Check className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {t("lpay.created", { amount: formatSom(Number(created.amount)) })}
                </p>
                <p className="mt-0.5 text-xs opacity-80">{t("lpay.createdHint")}</p>
              </div>
            </div>
            {createdMonthly && (
              <p className="flex items-start gap-2 rounded-xl bg-primary/8 px-3.5 py-2.5 text-[13px] text-foreground">
                <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {t("lpay.monthlyOn", { day: String(day) })}
              </p>
            )}
            <code className="block truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">
              {payUrl(created.id)}
            </code>
            <ShareButtons leadId={leadId} row={created} />
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="block">
              <span className="text-sm font-semibold text-foreground">{t("lpay.amount")}</span>
              <div className="mt-1.5 flex items-center rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30">
                <input
                  autoFocus
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    setAmount(digits ? formatSom(Number(digits)) : "");
                  }}
                  placeholder="990 000"
                  className="h-12 min-w-0 flex-1 bg-transparent px-3.5 text-lg font-bold tabular-nums text-foreground outline-none"
                />
                <span className="px-3.5 text-sm font-semibold text-muted-foreground">so'm</span>
              </div>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-foreground">{t("lpay.purpose")}</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 200))}
                placeholder={t("lpay.purposePh")}
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <div className="rounded-xl border border-border bg-surface px-3.5 py-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={monthly}
                  onChange={(e) => setMonthly(e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Repeat className="h-4 w-4 text-primary" /> {t("lpay.monthly")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {t("lpay.monthlyHint")}
                  </span>
                </span>
              </label>
              {monthly && (
                <label className="mt-3 flex items-center gap-2 text-sm text-foreground">
                  {t("lpay.monthlyDay")}
                  <select
                    value={day}
                    onChange={(e) => setDay(Number(e.target.value))}
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm font-semibold"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {[merchant.paymeReady && "Payme", merchant.clickReady && "Click"]
                .filter(Boolean)
                .join(" · ")}{" "}
              — {t("lpay.autoStage")}
            </p>
            <button
              type="submit"
              disabled={value === null || create.isPending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("lpay.create")}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

const METHOD_ICON: Record<PaymentMethod, string> = {
  cash: "💵",
  card: "💳",
  transfer: "🏦",
  payme: "🅿️",
  click: "🔷",
  other: "🧾",
};
const MANUAL_METHODS: PaymentMethod[] = ["cash", "card", "transfer", "other"];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** "+ To'lov": a cash/card/transfer payment the manager took by hand. */
function AddPaymentForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const { t } = useI18n();
  const add = useAddLeadPayment(leadId);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const value = Number(amount.replace(/\D/g, "")) || 0;
  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-[var(--amo-box-line)] bg-card p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value <= 0) return;
        add.mutate(
          {
            amount: value,
            method,
            paidAt: date === todayIso() ? undefined : `${date}T12:00:00`,
            note,
          },
          {
            onSuccess: () => {
              toast.success(t("ledger.added"));
              onDone();
            },
            onError: (e) => toast.error(describeError(e, t("ledger.failed"))),
          },
        );
      }}
    >
      <div className="flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30">
        <input
          autoFocus
          inputMode="numeric"
          value={amount}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
            setAmount(digits ? formatSom(Number(digits)) : "");
          }}
          placeholder={t("ledger.amountPh")}
          className="h-11 min-w-0 flex-1 bg-transparent px-3 text-base font-bold tabular-nums text-foreground outline-none"
        />
        <span className="px-3 text-sm font-semibold text-muted-foreground">so'm</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MANUAL_METHODS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMethod(m)}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors",
              method === m
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-foreground hover:bg-accent",
            )}
          >
            <span aria-hidden>{METHOD_ICON[m]}</span> {t(`ledger.method.${m}`)}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          max={todayIso()}
          onChange={(e) => setDate(e.target.value || todayIso())}
          className="h-10 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 300))}
          placeholder={t("ledger.notePh")}
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="h-9 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-accent"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={value <= 0 || add.isPending}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {add.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("ledger.save")}
        </button>
      </div>
    </form>
  );
}

/** Paid / still owed against the deal's sum, and the next agreed payment date. */
function LedgerSummaryBox({
  leadId,
  total,
  rows,
  nextPaymentDate,
}: {
  leadId: string;
  total: number;
  rows: LeadPaymentRow[];
  nextPaymentDate: string | null;
}) {
  const { t } = useI18n();
  const setNext = useSetNextPaymentDate(leadId);
  const sum = ledgerSummary(total, rows);
  const due =
    sum.remaining > 0 || sum.total === 0 ? nextPaymentState(nextPaymentDate, new Date()) : null;
  return (
    <div className="mt-3 rounded-xl border border-[var(--amo-box-line)] bg-card p-3.5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--amo-label)]">
            {t("ledger.paid")}
          </p>
          <p className="mt-0.5 text-[17px] font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
            {formatSom(sum.paid)} <span className="text-[12px] font-semibold">so'm</span>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--amo-label)]">
            {t("ledger.remaining")}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[17px] font-extrabold tabular-nums",
              sum.remaining > 0 ? "text-amber-700 dark:text-amber-300" : "text-foreground",
            )}
          >
            {sum.total > 0 ? (
              <>
                {formatSom(sum.remaining)} <span className="text-[12px] font-semibold">so'm</span>
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
      </div>
      {sum.total > 0 && (
        <div className="mt-2.5">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                sum.state === "full" ? "bg-emerald-500" : "bg-amber-500",
              )}
              style={{ width: `${sum.percent}%` }}
            />
          </div>
          <p className="mt-1 text-[12px] text-[var(--amo-label)]">
            {t("ledger.ofTotal", { percent: String(sum.percent), total: formatSom(sum.total) })}
          </p>
        </div>
      )}
      {sum.state !== "full" || sum.total === 0 ? (
        <label className="mt-3 flex items-center gap-2 border-t border-[var(--amo-box-line)] pt-3">
          <CalendarClock
            className={cn(
              "h-4 w-4 shrink-0",
              due === "overdue"
                ? "text-destructive"
                : due === "today"
                  ? "text-amber-600"
                  : "text-primary",
            )}
          />
          <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">
            {t("ledger.next")}
            {due === "overdue" && (
              <span className="ml-1.5 rounded-full bg-destructive/12 px-1.5 py-0.5 text-[11px] font-bold text-destructive">
                {t("ledger.overdue")}
              </span>
            )}
            {due === "today" && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                {t("ledger.today")}
              </span>
            )}
          </span>
          <input
            type="date"
            value={nextPaymentDate ?? ""}
            disabled={setNext.isPending}
            onChange={(e) =>
              setNext.mutate(e.target.value || null, {
                onError: (err) => toast.error(describeError(err, t("ledger.failed"))),
              })
            }
            className="h-9 rounded-lg border border-border bg-background px-2 text-[13px] text-foreground"
          />
        </label>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 border-t border-[var(--amo-box-line)] pt-3 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300">
          <Check className="h-4 w-4" /> {t("ledger.fullyPaid")}
        </p>
      )}
    </div>
  );
}

/** The lead panel's "To'lovlar": the payments ledger and the Payme/Click links. */
export function LeadPaymentsSection({
  leadId,
  total,
  nextPaymentDate,
  onCreate,
}: {
  leadId: string;
  total: number;
  nextPaymentDate: string | null | undefined;
  onCreate: () => void;
}) {
  const { t } = useI18n();
  const { data: links = [] } = useLeadPaymentLinks(leadId);
  const { data: schedules = [] } = useLeadPaymentSchedules(leadId);
  const { data: ledger } = useLeadLedger(leadId);
  const cancel = useCancelLeadPaymentLink(leadId);
  const stop = useStopLeadPaymentSchedule(leadId);
  const remove = useDeleteLeadPayment(leadId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const hasLedger = Array.isArray(ledger);
  // Before the ledger exists the section only lists payment links.
  if (!hasLedger && links.length === 0 && schedules.length === 0) return null;
  const rows = ledger ?? [];
  const pendingLinks = hasLedger ? links.filter((l) => l.status !== "paid") : links;
  const paidByLinks = links
    .filter((l) => l.status === "paid")
    .reduce((s, l) => s + Number(l.amount), 0);
  return (
    <div className="border-t border-[var(--amo-divider)] px-6 py-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[var(--amo-label)]">
          <CreditCard className="h-4 w-4 text-emerald-600" /> {t("lpay.section")}
        </p>
        <div className="flex items-center gap-3">
          {hasLedger && (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="inline-flex items-center gap-1 text-[13px] font-semibold text-emerald-700 dark:text-emerald-300"
            >
              <Plus className="h-3.5 w-3.5" /> {t("ledger.add")}
            </button>
          )}
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary"
          >
            <Link2 className="h-3.5 w-3.5" /> {t("ledger.link")}
          </button>
        </div>
      </div>
      {!hasLedger && paidByLinks > 0 && (
        <p className="mt-1 text-[12px] text-[var(--amo-label)]">
          {t("lpay.paidTotal", { amount: formatSom(paidByLinks) })}
        </p>
      )}
      {hasLedger && (
        <LedgerSummaryBox
          leadId={leadId}
          total={total}
          rows={rows}
          nextPaymentDate={nextPaymentDate ?? null}
        />
      )}
      {adding && <AddPaymentForm leadId={leadId} onDone={() => setAdding(false)} />}
      {rows.length > 0 && (
        <ul className="mt-2.5 divide-y divide-[var(--amo-box-line)] overflow-hidden rounded-xl border border-[var(--amo-box-line)] bg-card">
          {rows.map((p) => {
            const m = (isPaymentMethod(p.method) ? p.method : "other") as PaymentMethod;
            return (
              <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="text-lg leading-none" aria-hidden>
                  {METHOD_ICON[m]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold tabular-nums text-foreground">
                    {formatSom(Number(p.amount))} so'm
                  </span>
                  <span className="block truncate text-[12px] text-[var(--amo-label)]">
                    {t(`ledger.method.${m}`)} · {formatDate(p.paid_at)}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                </span>
                {!p.link_id &&
                  (confirmId === p.id ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={remove.isPending}
                        onClick={() =>
                          remove.mutate(p.id, {
                            onSuccess: () => setConfirmId(null),
                            onError: (e) => toast.error(describeError(e, t("ledger.failed"))),
                          })
                        }
                        className="text-[12px] font-bold text-destructive"
                      >
                        {t("ledger.deleteYes")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="text-[12px] font-semibold text-muted-foreground"
                      >
                        {t("common.cancel")}
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("ledger.delete")}
                      title={t("ledger.delete")}
                      onClick={() => setConfirmId(p.id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
      {schedules.map((sch) => (
        <div
          key={sch.id}
          className="mt-2.5 flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 px-3.5 py-2.5"
        >
          <Repeat className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-bold tabular-nums text-foreground">
              {formatSom(Number(sch.amount))} so'm
            </span>
            <span className="block text-[12px] text-[var(--amo-label)]">
              {t("lpay.monthlyEvery", { day: String(sch.day_of_month) })} ·{" "}
              {t("lpay.monthlyNext", { date: formatDate(sch.next_run_on) })}
            </span>
          </span>
          <button
            type="button"
            disabled={stop.isPending}
            onClick={() =>
              stop.mutate(sch.id, {
                onError: (e) => toast.error(describeError(e, t("lpay.createFailed"))),
              })
            }
            className="shrink-0 text-[12px] font-semibold text-destructive"
          >
            {t("lpay.monthlyStop")}
          </button>
        </div>
      ))}
      {pendingLinks.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {pendingLinks.map((l) => (
            <li key={l.id} className="rounded-xl border border-[var(--amo-box-line)] bg-card">
              <button
                type="button"
                onClick={() => setOpenId(openId === l.id ? null : l.id)}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold tabular-nums text-foreground">
                    {formatSom(Number(l.amount))} so'm
                  </span>
                  <span className="block truncate text-[12px] text-[var(--amo-label)]">
                    {l.description || formatDate(l.created_at)}
                    {l.status === "paid" && l.provider
                      ? ` · ${l.provider === "payme" ? "Payme" : "Click"}`
                      : ""}
                  </span>
                </span>
                <StatusPill status={l.status} />
              </button>
              {openId === l.id && l.status === "pending" && (
                <div className="space-y-2.5 border-t border-[var(--amo-box-line)] px-3.5 py-3">
                  <ShareButtons leadId={leadId} row={l} />
                  <button
                    type="button"
                    disabled={cancel.isPending}
                    onClick={() =>
                      cancel.mutate(l.id, {
                        onError: (e) => toast.error(describeError(e, t("lpay.createFailed"))),
                      })
                    }
                    className="inline-flex items-center gap-1 text-[12px] font-semibold text-destructive"
                  >
                    <X className="h-3.5 w-3.5" /> {t("lpay.cancel")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
