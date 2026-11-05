import { useEffect, useState } from "react";
import { Copy, ExternalLink, Loader2, RefreshCw, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSendLeadTelegramMessage } from "@/hooks/use-crm-data";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/clipboard";
import { describeError, formatDate } from "@/lib/utils";

// Lead card → "..." → Mijoz kabineti: the lead's private client-cabinet
// link (/cabinet/<token>), made on first open. Copy it, send it in the
// lead's chat, or make a new one (the old link stops working).

type Link = { url: string; createdAt: string; lastOpenedAt: string | null; opens: number };

export function ClientCabinetDialog({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  const send = useSendLeadTelegramMessage();
  const [link, setLink] = useState<Link | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(renew: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/cabinet/link", {
        method: "POST",
        body: JSON.stringify({ leadId, renew }),
      });
      const json = (await res.json().catch(() => ({}))) as Link & { error?: string };
      if (!res.ok) {
        throw new Error(
          json.error === "MIGRATION_PENDING" ? t("cabl.pending") : (json.error ?? t("cabl.failed")),
        );
      }
      setLink(json);
      if (renew) toast.success(t("cabl.renewed"));
    } catch (e) {
      setError(describeError(e, t("cabl.failed")));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (open && !link) void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/12 text-sky-600 dark:text-sky-300">
              <UserRound className="h-4.5 w-4.5" />
            </span>
            {t("cabl.title")}
          </DialogTitle>
          <DialogDescription>{t("cabl.desc")}</DialogDescription>
        </DialogHeader>

        {busy && !link ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
          </div>
        ) : error ? (
          <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
        ) : link ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">
                {link.url}
              </span>
              <button
                type="button"
                onClick={() =>
                  void copyText(link.url).then(
                    () => toast.success(t("la.linkCopied")),
                    () => toast.error(t("common.copyFailed")),
                  )
                }
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[12.5px] font-semibold hover:bg-accent"
              >
                <Copy className="h-3.5 w-3.5" /> {t("cabl.copy")}
              </button>
            </div>
            <p className="text-[12.5px] text-muted-foreground">
              {link.lastOpenedAt
                ? t("cabl.opened", { n: link.opens, at: formatDate(link.lastOpenedAt) })
                : t("cabl.notOpened")}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={send.isPending}
                onClick={() =>
                  send.mutate(
                    { leadId, text: t("cabl.message", { url: link.url }) },
                    {
                      onSuccess: () => toast.success(t("cabl.sent")),
                      onError: (e) => toast.error(describeError(e, t("cabl.sendFailed"))),
                    },
                  )
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {send.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {t("cabl.send")}
              </button>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-accent"
              >
                <ExternalLink className="h-4 w-4" /> {t("cabl.preview")}
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={() => void load(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                <RefreshCw className={busy ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                {t("cabl.renew")}
              </button>
            </div>
            <p className="text-[12px] text-subtle">{t("cabl.note")}</p>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
