import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Loader2, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
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
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { timeAgo } from "@/lib/utils";
import {
  useOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  useDeactivateExpiredTrials,
  type OrganizationRow,
} from "@/hooks/use-crm-data";
import { PLANS, PLAN_LABELS, DEFAULT_PLAN } from "@/lib/plan-gating";

export const Route = createFileRoute("/platform/")({
  head: () => ({
    meta: [
      { title: "Platform — SalesIQ" },
      { name: "description", content: "Platform owner: manage companies using SalesIQ." },
    ],
  }),
  component: PlatformPage,
});

function CreateOrgDialog() {
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

function RenameOrgDialog({ org }: { org: OrganizationRow }) {
  const { t } = useI18n();
  const updateOrg = useUpdateOrganization();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(org.name);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || name.trim() === org.name) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await updateOrg.mutateAsync({ id: org.id, patch: { name: name.trim() } });
      toast.success(t("platform.orgUpdated"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.orgUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setName(org.name);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("platform.renameOrg")}
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:h-9 sm:w-9"
        >
          <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("platform.renameOrg")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="rename-org-name">{t("platform.orgName")}</Label>
            <Input
              id="rename-org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteOrgButton({ org }: { org: OrganizationRow }) {
  const { t } = useI18n();
  const deleteOrg = useDeleteOrganization();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await deleteOrg.mutateAsync(org.id);
      toast.success(t("platform.orgDeleted"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.orgDeleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setConfirmText("");
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("platform.deleteOrgButton")}
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive transition-colors hover:bg-destructive/15 sm:h-9 sm:w-9"
        >
          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("platform.confirmDeleteOrgTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("platform.deleteOrgWarning", { name: org.name })}
          </p>
          <div>
            <Label htmlFor={`delete-org-confirm-${org.id}`}>
              {t("platform.typeToConfirm", { name: org.name })}
            </Label>
            <Input
              id={`delete-org-confirm-${org.id}`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={org.name}
              autoFocus
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              disabled={confirmText.trim() !== org.name || busy}
              onClick={() => void submit()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trash2 className="h-4 w-4" />
              {t("platform.deleteOrgButton")}
            </button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlatformPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: orgs, isLoading, error } = useOrganizations();
  const deactivateExpired = useDeactivateExpiredTrials();

  useEffect(() => {
    if (user?.role === "platform_owner") void deactivateExpired.mutateAsync();
    // Runs once per page load to catch any trial that's expired since the
    // last visit — deliberately not in the deps array, deactivateExpired
    // is a new mutate function identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard
        icon={ShieldAlert}
        tone="rose"
        title={t("admin.restrictedTitle")}
        description={t("admin.restrictedDesc")}
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <PageHeader
        icon={Building2}
        tone="primary"
        title={t("platform.title")}
        description={t("platform.desc")}
        actions={<CreateOrgDialog />}
      />

      <SectionCard icon={Building2} tone="primary" title={t("platform.orgsTitle")}>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : error ? (
          <p className="text-sm text-destructive">
            {t("platform.loadFailed")}: {error instanceof Error ? error.message : String(error)}
          </p>
        ) : !orgs?.length ? (
          <p className="text-sm text-muted-foreground">{t("platform.noOrgs")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {orgs.map((org) => (
              <li key={org.id} className="flex items-center gap-2 py-3">
                <Link
                  to="/platform/organizations/$orgId"
                  params={{ orgId: org.id }}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg transition-colors hover:bg-accent"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{org.name}</p>
                    <p className="truncate text-xs text-subtle">
                      {org.plan} · {t("platform.createdAt")}: {timeAgo(org.created_at)}
                      {org.trial_ends_at &&
                        ` · ${t("platform.trialEnds")}: ${new Date(org.trial_ends_at).toLocaleDateString()}`}
                    </p>
                  </div>
                </Link>
                <Pill tone={org.crm_enabled ? "info" : "neutral"}>
                  {org.crm_enabled ? t("platform.badgeCrm") : t("platform.badgeAnalytics")}
                </Pill>
                <Pill tone={org.active ? "success" : "neutral"}>
                  {org.active ? t("platform.active") : t("platform.inactive")}
                </Pill>
                <RenameOrgDialog org={org} />
                <DeleteOrgButton org={org} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
