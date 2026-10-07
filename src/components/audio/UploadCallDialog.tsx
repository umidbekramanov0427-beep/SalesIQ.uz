import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCrmLeads, useUploadManualCall } from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { enqueueCallAnalysis } from "@/lib/auto-analyze";

// Manual call-recording upload -- used from Audio tahlil (pick any lead)
// and from a lead's own page (attached to that lead).
export function UploadCallDialog({
  open,
  onOpenChange,
  defaultLeadId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  // Opened from a lead's own page: the recording is attached to that lead
  // and the (whole-org) lead picker is neither fetched nor shown.
  defaultLeadId?: string;
}) {
  const { t } = useI18n();
  // Only fetch the (expensive, whole-org) leads picker list once the dialog
  // is actually opened — this used to run unconditionally on every Audio
  // Analytics page load just to populate a dropdown nobody looked at yet.
  const { rows: leads } = useCrmLeads(undefined, { enabled: open && !defaultLeadId });
  const uploadCall = useUploadManualCall();
  const [file, setFile] = useState<File | null>(null);
  const [leadId, setLeadId] = useState(defaultLeadId ?? "");
  const [phone, setPhone] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [connected, setConnected] = useState(true);

  function reset() {
    setFile(null);
    setLeadId(defaultLeadId ?? "");
    setPhone("");
    setDirection("out");
    setConnected(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    try {
      const created = await uploadCall.mutateAsync({
        file,
        leadId: leadId || null,
        phone: phone.trim(),
        direction,
        connected,
      });
      // Analysis starts right away -- no extra click needed.
      enqueueCallAnalysis(created.id);
      toast.success(t("audio.uploadSuccessAnalyzing"));
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("audio.uploadFailed"));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("audio.uploadCall")}</DialogTitle>
          <DialogDescription>{t("audio.uploadCallDesc")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("audio.uploadCallFile")}
            </span>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
              className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-primary"
            />
          </label>

          {!defaultLeadId && (
            <label className="block">
              <span className="text-[13px] font-medium text-muted-foreground">
                {t("audio.uploadCallLead")}
              </span>
              <select
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm outline-none focus:border-primary/40"
              >
                <option value="">{t("audio.uploadCallNoLead")}</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} {l.company ? `· ${l.company}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-[13px] font-medium text-muted-foreground">
              {t("audio.uploadCallPhone")}
            </span>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-border bg-background p-2.5 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                checked={direction === "out"}
                onChange={() => setDirection("out")}
              />
              {t("audio.directionOut")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                checked={direction === "in"}
                onChange={() => setDirection("in")}
              />
              {t("audio.directionIn")}
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={connected}
                onChange={(e) => setConnected(e.target.checked)}
              />
              {t("audio.connected")}
            </label>
          </div>

          <DialogFooter>
            <button
              type="submit"
              disabled={uploadCall.isPending || !file}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {uploadCall.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("audio.uploadCallSubmit")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
