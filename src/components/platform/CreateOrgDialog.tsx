import { useState, type FormEvent } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";
import { useCreateOrganization } from "@/hooks/use-crm-data";
import { PLANS, PLAN_LABELS, DEFAULT_PLAN } from "@/lib/plan-gating";

// New company with its super admin (and optionally a ROP) -- opened from
// the Kompaniyalar page header.
export function CreateOrgDialog() {
  const { t } = useI18n();
  const createOrg = useCreateOrganization();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [ropName, setRopName] = useState("");
  const [ropEmail, setRopEmail] = useState("");
  const [ropPassword, setRopPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<(typeof PLANS)[number]>(DEFAULT_PLAN);
  const [trialDays, setTrialDays] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setName("");
    setAdminName("");
    setAdminEmail("");
    setAdminPassword("");
    setRopName("");
    setRopEmail("");
    setRopPassword("");
    setPhone("");
    setPlan(DEFAULT_PLAN);
    setTrialDays("");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !adminEmail.trim() || adminPassword.length < 8) return;
    if (!ropEmail.trim() || ropPassword.length < 8) return;
    setConfirming(true);
  }

  async function submit() {
    setBusy(true);
    try {
      await createOrg.mutateAsync({
        name: name.trim(),
        admin_email: adminEmail.trim(),
        admin_password: adminPassword,
        admin_full_name: adminName.trim(),
        rop_email: ropEmail.trim(),
        rop_password: ropPassword,
        rop_full_name: ropName.trim(),
        phone: phone.trim() || undefined,
        plan,
        trial_days: trialDays ? Number(trialDays) : undefined,
      });
      toast.success(t("platform.created"));
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogTrigger asChild>
          <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            <Plus className="h-4 w-4" /> {t("platform.createOrg")}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platform.createOrg")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="org-name">{t("platform.orgName")}</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-admin-name">{t("platform.adminName")}</Label>
              <Input
                id="org-admin-name"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-admin-email">{t("platform.adminEmail")}</Label>
              <Input
                id="org-admin-email"
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-admin-password">{t("platform.adminPassword")}</Label>
              <Input
                id="org-admin-password"
                type="text"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-rop-name">{t("platform.ropName")}</Label>
              <Input
                id="org-rop-name"
                value={ropName}
                onChange={(e) => setRopName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-rop-email">{t("platform.ropEmail")}</Label>
              <Input
                id="org-rop-email"
                type="email"
                value={ropEmail}
                onChange={(e) => setRopEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-rop-password">{t("platform.ropPassword")}</Label>
              <Input
                id="org-rop-password"
                type="text"
                value={ropPassword}
                onChange={(e) => setRopPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-phone">{t("platform.orgPhone")}</Label>
              <Input id="org-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="org-plan">{t("platform.orgPlan")}</Label>
              <select
                id="org-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value as (typeof PLANS)[number])}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {PLANS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="org-trial">{t("platform.orgTrialDays")}</Label>
              <Input
                id="org-trial"
                type="number"
                min={0}
                placeholder={t("platform.orgTrialPlaceholder")}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
              />
            </div>
            <DialogFooter>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("platform.create")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("platform.confirmCreateTitle")}
        description={t("platform.confirmCreateDesc", { name: name.trim() })}
        onConfirm={() => {
          setConfirming(false);
          void submit();
        }}
      />
    </>
  );
}
