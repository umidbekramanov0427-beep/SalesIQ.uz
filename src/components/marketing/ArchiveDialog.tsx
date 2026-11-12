import { useState } from "react";
import { Archive, ArchiveRestore, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";

// Arxiv: deleting a project, channel or webinar only puts it here (it
// leaves the lists, filters and reports). From here it comes back, or is
// deleted for good after a second, red confirmation.

export type ArchivedItem = { id: string; title: string; sub?: string; archivedAt: string };

export function ArchiveButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <Button variant="outline" onClick={onClick}>
      <Archive className="h-4 w-4" />
      {t("mkt.arch.button")}
      {count > 0 && (
        <span className="rounded-md bg-muted px-1.5 text-[11.5px] font-bold tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
    </Button>
  );
}

export function ArchiveDialog({
  title,
  items,
  onRestore,
  onDestroy,
  onClose,
}: {
  title: string;
  items: ArchivedItem[];
  onRestore: (id: string) => Promise<unknown>;
  onDestroy: (id: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);
  const [doomed, setDoomed] = useState<ArchivedItem | null>(null);
  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error(describeError(err, t("mkt.arch.failed")));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-foreground">
              <Archive className="h-[18px] w-[18px]" />
            </span>
            {title}
          </DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("mkt.arch.desc")}</p>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-10 text-center text-[13.5px] text-muted-foreground">
            {t("mkt.arch.empty")}
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-foreground">{it.title}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {[
                      it.sub,
                      t("mkt.arch.when", {
                        date: new Date(it.archivedAt).toLocaleDateString("ru-RU"),
                      }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === it.id}
                  onClick={() => void run(it.id, () => onRestore(it.id), t("mkt.arch.restored"))}
                >
                  {busy === it.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArchiveRestore className="h-4 w-4" />
                  )}
                  {t("mkt.arch.restore")}
                </Button>
                <button
                  type="button"
                  onClick={() => setDoomed(it)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t("mkt.arch.destroy")}
                  title={t("mkt.arch.destroy")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AlertDialog open={!!doomed} onOpenChange={(o) => !o && setDoomed(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("mkt.arch.destroyTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("mkt.arch.destroyBody", { name: doomed?.title ?? "" })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const it = doomed;
                  setDoomed(null);
                  if (it) void run(it.id, () => onDestroy(it.id), t("mkt.arch.destroyed"));
                }}
              >
                <Trash2 className="h-4 w-4" />
                {t("mkt.arch.destroy")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

/** "Delete" that archives: asks first, then tells where the item went. */
export function ArchiveConfirm({
  name,
  open,
  onOpenChange,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => Promise<unknown>;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("mkt.arch.confirmTitle", { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("mkt.arch.confirmBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              void onConfirm()
                .then(() =>
                  toast.success(t("mkt.arch.archived"), {
                    description: t("mkt.arch.archivedHint"),
                  }),
                )
                .catch((err) => toast.error(describeError(err, t("mkt.arch.failed"))))
            }
          >
            <Archive className="h-4 w-4" />
            {t("mkt.arch.toArchive")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
