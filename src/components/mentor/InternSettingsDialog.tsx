import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { tashkentToday } from "@/lib/intern-roadmap";
import { describeError } from "@/lib/utils";
import { useUpdateProfile, type ProfileRow } from "@/hooks/use-crm-data";

// Admin panel -> an Amaliyotchi's "N-kun / M" label: changes when the
// probation started and how long it lasts. Becoming or stopping being an
// intern is done with the role itself (the "Amaliyotchi" role option).
export function InternSettingsDialog({
  profile,
  open,
  onOpenChange,
}: {
  profile: ProfileRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const update = useUpdateProfile();
  const [startDate, setStartDate] = useState(tashkentToday());
  const [days, setDays] = useState(14);

  useEffect(() => {
    if (!open || !profile) return;
    setStartDate(profile.internship_start_date ?? tashkentToday());
    setDays(profile.internship_days ?? 14);
  }, [open, profile]);

  async function save() {
    if (!profile) return;
    try {
      await update.mutateAsync({
        id: profile.id,
        patch: {
          internship_start_date: startDate,
          internship_days: Math.min(90, Math.max(1, days)),
        },
      });
      void qc.invalidateQueries({ queryKey: ["org_interns"] });
      toast.success(t("mentor.settingsSaved"));
      onOpenChange(false);
    } catch (err) {
      toast.error(describeError(err, t("mentor.settingsFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("mentor.settingsTitle")}</DialogTitle>
          <DialogDescription>{profile?.full_name || profile?.email}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="intern-start">{t("mentor.startDate")}</Label>
            <Input
              id="intern-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="intern-days">{t("mentor.totalDays")}</Label>
            <Input
              id="intern-days"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 1)}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => void save()}
            disabled={update.isPending || !startDate}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("mentor.save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
