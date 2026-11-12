import { useState, type ReactNode } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  cardBrand,
  cleanCardNumber,
  formatCard,
  type RefundRow,
  type RefundStage,
} from "@/lib/refunds";
import { useRefundMutations } from "@/hooks/use-crm-data";

// Adding or editing one refund: who, how much, which card the money goes
// back to (and whose it is), why, and whether the client refused before or
// after being accepted. From the lead card the lead's name, phone and what
// they paid are filled in.

export type RefundDraft = {
  lead_id: string | null;
  client_name: string;
  phone: string;
  amount: number;
  paid_amount: number | null;
  card_number: string;
  card_holder: string;
  reason: string;
  stage: RefundStage;
  note: string;
};

export function draftFromRow(r: RefundRow): RefundDraft {
  return {
    lead_id: r.lead_id,
    client_name: r.client_name,
    phone: r.phone ?? "",
    amount: Number(r.amount) || 0,
    paid_amount: r.paid_amount == null ? null : Number(r.paid_amount),
    card_number: formatCard(r.card_number),
    card_holder: r.card_holder ?? "",
    reason: r.reason ?? "",
    stage: r.stage,
    note: r.note ?? "",
  };
}

const input =
  "h-10 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground outline-none transition-colors focus:border-primary";
const group = (n: number) => (n ? n.toLocaleString("ru-RU").replace(/ /g, " ") : "");

export function RefundDialog({
  initial,
  editId,
  onClose,
  onSaved,
}: {
  initial: RefundDraft;
  /** Set when editing an existing refund. */
  editId?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const { add, update } = useRefundMutations();
  const [d, setD] = useState<RefundDraft>(initial);
  const set = (patch: Partial<RefundDraft>) => setD((x) => ({ ...x, ...patch }));
  const card = cleanCardNumber(d.card_number);
  const cardBad = d.card_number.trim() !== "" && !card;
  const busy = add.isPending || update.isPending;

  async function save() {
    const problem = !d.client_name.trim()
      ? "refund.nameNeeded"
      : d.amount <= 0
        ? "refund.amountNeeded"
        : cardBad
          ? "refund.cardBad"
          : null;
    if (problem) {
      toast.error(t(problem));
      return;
    }
    const row = {
      lead_id: d.lead_id,
      client_name: d.client_name.trim(),
      phone: d.phone.trim() || null,
      amount: d.amount,
      paid_amount: d.paid_amount,
      card_number: card,
      card_holder: d.card_holder.trim() || null,
      reason: d.reason.trim() || null,
      stage: d.stage,
      note: d.note.trim() || null,
    };
    try {
      if (editId) await update.mutateAsync({ id: editId, patch: row });
      else await add.mutateAsync([row]);
      toast.success(t(editId ? "refund.updated" : "refund.added"));
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error && /lead_refunds_one_open|duplicate/.test(err.message)
          ? t("refund.alreadyOpen")
          : err instanceof Error && /lead_refunds/.test(err.message)
            ? t("refund.migrationPending")
            : describeError(err, t("refund.saveFailed")),
      );
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t(editId ? "refund.editTitle" : "refund.newTitle")}</DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("refund.dialogDesc")}</p>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("refund.name")}>
              <input
                value={d.client_name}
                onChange={(e) => set({ client_name: e.target.value })}
                className={input}
                autoFocus={!d.client_name}
              />
            </Field>
            <Field label={t("refund.phone")}>
              <input
                value={d.phone}
                inputMode="tel"
                onChange={(e) => set({ phone: e.target.value })}
                className={input}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("refund.amount")}>
              <input
                inputMode="numeric"
                value={group(d.amount)}
                placeholder="0"
                onChange={(e) => set({ amount: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                className={cn(input, "text-right font-mono tabular-nums")}
                autoFocus={!!d.client_name}
              />
            </Field>
            <Field label={t("refund.paid")}>
              <input
                inputMode="numeric"
                value={group(d.paid_amount ?? 0)}
                placeholder="—"
                onChange={(e) =>
                  set({ paid_amount: Number(e.target.value.replace(/\D/g, "")) || null })
                }
                className={cn(input, "text-right font-mono tabular-nums")}
              />
            </Field>
          </div>
          {d.paid_amount != null && d.paid_amount > 0 && d.amount !== d.paid_amount && (
            <button
              type="button"
              onClick={() => set({ amount: d.paid_amount ?? 0 })}
              className="-mt-1 justify-self-end text-[12px] font-semibold text-primary hover:underline"
            >
              {t("refund.useFull", { sum: group(d.paid_amount) })}
            </button>
          )}
          <div className="rounded-xl border border-border bg-surface p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              {t("refund.cardTitle")}
            </p>
            <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr]">
              <Field label={t("refund.card")}>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={d.card_number}
                    placeholder="8600 0000 0000 0000"
                    onChange={(e) =>
                      set({
                        card_number: formatCard(e.target.value.replace(/\D/g, "").slice(0, 19)),
                      })
                    }
                    className={cn(
                      input,
                      "font-mono tabular-nums tracking-wide",
                      cardBad && "border-destructive",
                    )}
                  />
                  {card && cardBrand(card) && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {cardBrand(card)}
                    </span>
                  )}
                </div>
              </Field>
              <Field label={t("refund.holder")}>
                <input
                  value={d.card_holder}
                  placeholder="AZIZA KARIMOVA"
                  onChange={(e) => set({ card_holder: e.target.value.toUpperCase() })}
                  className={cn(input, "uppercase")}
                />
              </Field>
            </div>
          </div>
          <Field label={t("refund.stage")}>
            <div className="grid grid-cols-2 gap-2">
              {(["before", "after"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set({ stage: s })}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left text-[13px] transition-colors",
                    d.stage === s
                      ? "border-primary/50 bg-primary/8 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="block font-semibold">{t(`refund.stage.${s}`)}</span>
                  <span className="block text-[11.5px]">{t(`refund.stageHint.${s}`)}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("refund.reason")}>
            <input
              value={d.reason}
              maxLength={500}
              placeholder={t("refund.reasonPh")}
              onChange={(e) => set({ reason: e.target.value })}
              className={input}
            />
          </Field>
          <Field label={t("refund.note")}>
            <input
              value={d.note}
              maxLength={1000}
              onChange={(e) => set({ note: e.target.value })}
              className={input}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
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
