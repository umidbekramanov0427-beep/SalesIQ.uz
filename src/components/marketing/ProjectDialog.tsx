import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { PROJECT_COLORS, PROJECT_DOT, parseList } from "@/lib/marketing-projects";
import { useProjectMutations, type ProjectRow } from "@/hooks/use-crm-data";

// Loyiha qo'shish / tahrirlash: a name and a color, the CRM funnels whose
// leads are this project's, the UTM campaign names (utm_campaign) that are
// too, and a note. The funnels and campaigns the company already has are
// offered as one-click chips.

export function ProjectDialog({
  initial,
  funnelNames,
  campaignNames,
  onClose,
}: {
  initial?: ProjectRow | null;
  funnelNames: string[];
  campaignNames: string[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { save } = useProjectMutations();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "sky");
  const [funnels, setFunnels] = useState<string[]>(initial?.funnels ?? []);
  const [utms, setUtms] = useState<string[]>(initial?.utm_campaigns ?? []);
  const [utmText, setUtmText] = useState("");
  const [note, setNote] = useState(initial?.note ?? "");

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  async function submit() {
    const allUtms = parseList([...utms, utmText].join("\n"));
    if (!name.trim()) {
      toast.error(t("mkt.p.nameNeeded"));
      return;
    }
    try {
      await save.mutateAsync({
        ...(initial ? { id: initial.id } : {}),
        draft: {
          name: name.trim(),
          color,
          funnels,
          utm_campaigns: allUtms,
          note: note.trim() || null,
        },
      });
      toast.success(initial ? t("mkt.p.saved") : t("mkt.p.created"));
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error && /marketing_projects/.test(err.message)
          ? t("mkt.p.migrationPending")
          : describeError(err, t("mkt.p.saveFailed")),
      );
    }
  }

  const chip = (on: boolean) =>
    cn(
      "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12.5px] font-medium transition-colors",
      on
        ? "border-primary bg-primary/10 text-primary"
        : "border-border text-foreground hover:border-primary/40",
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle>{initial ? t("mkt.p.editTitle") : t("mkt.p.newTitle")}</DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("mkt.p.formDesc")}</p>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.p.name")}
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              autoFocus
              placeholder={t("mkt.p.namePh")}
              className="h-11 w-full rounded-xl border border-border bg-input px-3 text-[15px] font-semibold outline-none focus:border-primary"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.p.color")}
            </span>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-white ring-offset-2 ring-offset-background transition",
                    PROJECT_DOT[c],
                    color === c && "ring-2 ring-foreground",
                  )}
                >
                  {color === c && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.p.funnels")}
            </span>
            <p className="mb-2 text-[12px] text-subtle">{t("mkt.p.funnelsHint")}</p>
            {funnelNames.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">{t("mkt.p.noFunnels")}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {funnelNames.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFunnels((x) => toggle(x, f))}
                    className={chip(funnels.includes(f))}
                  >
                    {funnels.includes(f) && <Check className="h-3.5 w-3.5" />}
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.p.utms")}
            </span>
            <p className="mb-2 text-[12px] text-subtle">{t("mkt.p.utmsHint")}</p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-input px-2 py-1.5 focus-within:border-primary">
              {utms.map((u) => (
                <span
                  key={u}
                  className="inline-flex items-center gap-1 rounded-md bg-violet-500/12 px-2 py-0.5 font-mono text-[12.5px] text-violet-700 dark:text-violet-300"
                >
                  {u}
                  <button
                    type="button"
                    onClick={() => setUtms((x) => x.filter((y) => y !== u))}
                    aria-label={t("common.delete")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                value={utmText}
                onChange={(e) => setUtmText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === ",") && utmText.trim()) {
                    e.preventDefault();
                    setUtms((x) => parseList([...x, utmText].join("\n")));
                    setUtmText("");
                  }
                }}
                placeholder={utms.length ? "" : "kuz_aksiyasi"}
                className="h-8 min-w-[140px] flex-1 bg-transparent font-mono text-[13px] outline-none"
              />
            </div>
            {campaignNames.filter((c) => !utms.includes(c)).length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] text-subtle">{t("mkt.p.fromLeads")}</span>
                {campaignNames
                  .filter((c) => !utms.includes(c))
                  .slice(0, 12)
                  .map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setUtms((x) => [...x, c])}
                      className="rounded-md border border-dashed border-border px-2 py-0.5 font-mono text-[12px] text-muted-foreground hover:border-primary/50 hover:text-primary"
                    >
                      + {c}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">
              {t("mkt.p.note")}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-xl border border-border bg-input px-3 py-2 text-[13.5px] outline-none focus:border-primary"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? t("common.save") : t("mkt.p.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
