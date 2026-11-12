import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Settings2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { describeError } from "@/lib/utils";

// Bosh sahifa -> Prognoz -> Sozlash: each open stage's chance to end in a
// sale (pipeline_stages.probability). The forecast is every open lead's
// budget times its stage's chance, so this is what makes it right for the
// company. "Tartib bo'yicha" fills 10% ... 90% along the funnel.

type Stage = { id: string; name: string; probability: number };

export function ForecastSettingsButton({ stages }: { stages: Stage[] }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user || !["super_admin", "rop", "platform_owner"].includes(user.role)) return null;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!stages.length}>
        <Settings2 className="h-4 w-4" />
        {t("secset.button")}
      </Button>
      {open && <ForecastSettingsDialog stages={stages} onClose={() => setOpen(false)} />}
    </>
  );
}

function ForecastSettingsDialog({ stages, onClose }: { stages: Stage[]; onClose: () => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(stages.map((s) => [s.id, s.probability])),
  );
  const [saving, setSaving] = useState(false);
  const changed = stages.filter((s) => values[s.id] !== s.probability);

  function byOrder() {
    const n = stages.length;
    setValues(
      Object.fromEntries(
        stages.map((s, i) => [s.id, Math.round(10 + (80 * i) / Math.max(1, n - 1))]),
      ),
    );
  }

  async function save() {
    setSaving(true);
    try {
      for (const s of changed) {
        const { error } = await supabase
          .from("pipeline_stages")
          .update({ probability: values[s.id] ?? 0 })
          .eq("id", s.id);
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["analytics"] });
      await qc.invalidateQueries({ queryKey: ["analytics_finance"] });
      toast.success(t("common.saved"));
      onClose();
    } catch (err) {
      toast.error(describeError(err, t("common.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("fc.title")}</DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("fc.desc")}</p>
        </DialogHeader>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {stages.map((s) => {
            const v = values[s.id] ?? 0;
            return (
              <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">
                  {s.name}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={v}
                  onChange={(e) => setValues((x) => ({ ...x, [s.id]: Number(e.target.value) }))}
                  className="w-32 accent-primary sm:w-40"
                  aria-label={s.name}
                />
                <label className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={v}
                    onChange={(e) =>
                      setValues((x) => ({
                        ...x,
                        [s.id]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))),
                      }))
                    }
                    className="h-8 w-14 rounded-lg border border-border bg-input px-2 text-right text-[13px] tabular-nums outline-none focus:border-primary"
                  />
                  <span className="text-[12px] text-muted-foreground">%</span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-[12px] text-muted-foreground">{t("fc.hint")}</p>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={byOrder}>
            <Wand2 className="h-4 w-4" />
            {t("fc.byOrder")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={saving || !changed.length}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
