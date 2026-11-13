import { useMemo, useState } from "react";
import { Check, Loader2, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useBulkUpdateLeads, type InboxConversation, type ProfileRow } from "@/hooks/use-crm-data";
import { dealOut } from "@/lib/lead-distribution";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";

// Inbox → «Mas'ulsizlarni taqsimlash» (admins and heads of sales): the chats
// nobody owns go to the chosen people in turn, newest first, so everyone
// gets the same number (one more for the first ones when it does not divide
// evenly). The preview shows exactly how many each person gets; the count
// is the chats themselves, never the messages.

const CHUNK = 200;

export function InboxDistributeDialog({
  open,
  onOpenChange,
  chats,
  people,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The chats with no owner, newest first. */
  chats: InboxConversation[];
  /** Who may get them. */
  people: ProfileRow[];
}) {
  const { t } = useI18n();
  const update = useBulkUpdateLeads();
  const [chosen, setChosen] = useState<string[]>([]);
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);

  const n = Math.min(chats.length, Math.max(0, Number(limit.replace(/\D/g, "")) || chats.length));
  const plan = useMemo(
    () =>
      dealOut(
        chats.slice(0, n).map((c) => c.leadId),
        chosen,
      ),
    [chats, n, chosen],
  );

  function toggle(id: string) {
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  async function apply() {
    if (!chosen.length || !n) return;
    setBusy(true);
    let done = 0;
    try {
      for (const [ownerId, ids] of plan) {
        for (let i = 0; i < ids.length; i += CHUNK) {
          done += await update.mutateAsync({
            ids: ids.slice(i, i + CHUNK),
            patch: { owner_id: ownerId },
          });
        }
      }
      toast.success(t("idist.done", { n: done, people: chosen.length }));
      setChosen([]);
      setLimit("");
      onOpenChange(false);
    } catch (e) {
      toast.error(describeError(e, t("idist.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogTitle className="flex items-center gap-2">
          <Shuffle className="h-5 w-5 text-primary" />
          {t("idist.title")}
        </DialogTitle>
        <p className="text-[13px] text-muted-foreground">{t("idist.desc", { n: chats.length })}</p>

        <label className="mt-1 flex items-center justify-between gap-3 text-[13.5px] font-medium">
          {t("idist.howMany")}
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="numeric"
            placeholder={String(chats.length)}
            className="h-9 w-24 rounded-lg border border-border bg-background px-2.5 text-right tabular-nums outline-none focus:border-primary phone:text-base"
          />
        </label>

        <p className="mt-2 text-[13.5px] font-medium">{t("idist.who")}</p>
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {people.map((p) => {
            const on = chosen.includes(p.id);
            const gets = plan.get(p.id)?.length ?? 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(p.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    on ? "bg-primary/[0.08]" : "hover:bg-accent/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                    {p.full_name || p.email}
                  </span>
                  {on && (
                    <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[12px] font-semibold tabular-nums text-primary">
                      {t("idist.gets", { n: gets })}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="ctl-soft inline-flex h-10 items-center rounded-xl px-4 text-[13px] font-semibold"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void apply()}
            disabled={busy || !chosen.length || !n}
            className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("idist.apply", { n })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
