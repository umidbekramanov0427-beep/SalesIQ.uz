import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, ShieldAlert, Trash2, UserPlus, Users2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, ChannelActionButton } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EditUserDialog } from "@/components/EditUserDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { roleTone, timeAgo } from "@/lib/utils";
import { effectiveSeatLimit, PLANS as PLAN_IDS, PLAN_LABELS } from "@/lib/plan-gating";
import { orgPhase } from "@/lib/org-access";
import {
  useOrganizations,
  useUpdateOrganization,
  useAllProfiles,
  useAllAmoConnections,
  useAllAiAgents,
  useAddOrgEmployee,
  useDeleteUserAsOwner,
  useDeleteOrganization,
  type OwnerProfileRow,
  type OrganizationRow,
} from "@/hooks/use-crm-data";

const ORG_ROLES = ["sotuv_menejeri", "amaliyotchi", "rop", "super_admin"] as const;
type OrgRole = (typeof ORG_ROLES)[number];

export const Route = createFileRoute("/platform/organizations/$orgId")({
  head: () => ({
    meta: [{ title: "Company — SalesIQ" }],
  }),
  component: OrgDetailPage,
});

function AddOrgEmployeeDialog({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const addEmployee = useAddOrgEmployee();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<OrgRole>("sotuv_menejeri");
  const [busy, setBusy] = useState(false);

  const roleLabel: Record<OrgRole, string> = {
    sotuv_menejeri: t("admin.roleRep"),
    amaliyotchi: t("mentor.internBadge"),
    rop: t("admin.roleRop"),
    super_admin: t("admin.roleAdmin"),
  };

  function reset() {
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("sotuv_menejeri");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 8) return;
    setConfirming(true);
  }

  async function submit() {
    setBusy(true);
    try {
      await addEmployee.mutateAsync({
        organization_id: orgId,
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        role,
      });
      toast.success(t("admin.employeeCreated"));
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.employeeCreateFailed"));
    } finally {
      setBusy(false);
      setConfirming(false);
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
          <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-muted-foreground hover:bg-accent">
            <UserPlus className="h-4 w-4" /> {t("admin.addEmployee")}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.addEmployee")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="org-emp-name">{t("admin.newEmployeeName")}</Label>
              <Input
                id="org-emp-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-emp-email">{t("admin.colEmail")}</Label>
              <Input
                id="org-emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="org-emp-password">{t("admin.newEmployeePassword")}</Label>
              <Input
                id="org-emp-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div>
              <Label>{t("admin.colRole")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as OrgRole)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("admin.addEmployee")}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("admin.confirmCreateTitle")}
        description={t("admin.confirmCreateDesc", {
          name: fullName.trim() || email.trim(),
          role: roleLabel[role],
        })}
        onConfirm={() => void submit()}
      />
    </>
  );
}

function DeleteOrgDangerZone({ org }: { org: OrganizationRow }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const deleteOrg = useDeleteOrganization();
  const [confirmText, setConfirmText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await deleteOrg.mutateAsync(org.id);
      toast.success(t("platform.orgDeleted"));
      void navigate({ to: "/platform" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.orgDeleteFailed"));
      setBusy(false);
    }
  }

  return (
    <SectionCard title={t("platform.dangerZone")} description={t("platform.dangerZoneDesc")}>
      <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-muted-foreground">
          {t("platform.deleteOrgWarning", { name: org.name })}
        </p>
        <div>
          <Label htmlFor="delete-confirm-name">
            {t("platform.typeToConfirm", { name: org.name })}
          </Label>
          <Input
            id="delete-confirm-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={org.name}
          />
        </div>
        <button
          type="button"
          disabled={confirmText.trim() !== org.name || busy}
          onClick={() => setConfirming(true)}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          <Trash2 className="h-4 w-4" />
          {t("platform.deleteOrgButton")}
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("platform.confirmDeleteOrgTitle")}
        description={t("platform.confirmDeleteOrgDesc", { name: org.name })}
        onConfirm={() => {
          setConfirming(false);
          void submit();
        }}
      />
    </SectionCard>
  );
}

function OrgDetailPage() {
  const { orgId } = Route.useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const { data: orgs, isLoading } = useOrganizations();
  const { data: profiles } = useAllProfiles();
  const { data: amoConnections } = useAllAmoConnections();
  const { data: aiAgents } = useAllAiAgents();
  const updateOrg = useUpdateOrganization();
  const deleteUser = useDeleteUserAsOwner();

  const org = orgs?.find((o) => o.id === orgId);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<string>("start_iq");
  const [extraSeats, setExtraSeats] = useState("0");
  const [confirming, setConfirming] = useState<null | "save" | "deactivate" | "activate">(null);
  const [busy, setBusy] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<OwnerProfileRow | null>(null);

  useEffect(() => {
    if (org) {
      setName(org.name);
      setPhone(org.phone ?? "");
      setPlan(org.plan);
      setExtraSeats(String(org.extra_seats ?? 0));
    }
  }, [org]);

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard title={t("admin.restrictedTitle")} description={t("admin.restrictedDesc")}>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("admin.restrictedHint")}
        </div>
      </SectionCard>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!org) {
    return (
      <SectionCard
        title={t("platform.orgNotFoundTitle")}
        description={t("platform.orgNotFoundDesc")}
      >
        <Link to="/platform" className="text-sm font-medium text-primary hover:underline">
          {t("platform.backToList")}
        </Link>
      </SectionCard>
    );
  }

  const orgUsers = (profiles ?? []).filter((p) => p.organization_id === org.id);
  const amoConnection = (amoConnections ?? []).find((c) => c.organization_id === org.id);
  const orgAiAgents = (aiAgents ?? []).filter((a) => a.organization_id === org.id);

  async function saveDetails() {
    setBusy(true);
    try {
      await updateOrg.mutateAsync({
        id: org!.id,
        patch: {
          name: name.trim(),
          phone: phone.trim() || null,
          plan,
          extra_seats: Math.max(0, Number(extraSeats) || 0),
        },
      });
      toast.success(t("platform.orgUpdated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.orgUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive() {
    setBusy(true);
    try {
      await updateOrg.mutateAsync({ id: org!.id, patch: { active: !org!.active } });
      toast.success(org!.active ? t("platform.orgDeactivated") : t("platform.orgActivated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.orgUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }

  // An offline payment (cash, bank transfer) the platform owner confirms by
  // hand -- the same effect a Payme/Click payment has in
  // reactivateOrgAfterPayment: ends the free trial for good (full plan from
  // now on) and adds one 30-day period on top of whatever's left.
  async function grantPaidMonth() {
    setBusy(true);
    try {
      const currentEnd = org!.trial_ends_at ? new Date(org!.trial_ends_at).getTime() : 0;
      const base = Math.max(Date.now(), currentEnd);
      await updateOrg.mutateAsync({
        id: org!.id,
        patch: {
          active: true,
          is_trial: false,
          trial_ends_at: new Date(base + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      toast.success(t("platform.paidMonthGranted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.orgUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }

  const phase = orgPhase(org);

  async function applyDeleteUser(profile: OwnerProfileRow) {
    setDeletingUserId(profile.id);
    try {
      await deleteUser.mutateAsync(profile.id);
      toast.success(t("admin.employeeDeleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.employeeDeleteFailed"));
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <>
      <PageHeader
        title={org.name}
        description={t("platform.orgDetailDesc")}
        actions={
          <Link
            to="/platform"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> {t("platform.backToList")}
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t("platform.orgDetailsTitle")}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="detail-name">{t("platform.orgName")}</Label>
              <Input id="detail-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="detail-phone">{t("platform.orgPhone")}</Label>
              <Input id="detail-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="detail-plan">{t("platform.orgPlan")}</Label>
              <select
                id="detail-plan"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {PLAN_IDS.map((p) => (
                  <option key={p} value={p}>
                    {PLAN_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="detail-extra-seats">{t("platform.extraSeatsLabel")}</Label>
              <Input
                id="detail-extra-seats"
                type="number"
                min={0}
                value={extraSeats}
                onChange={(e) => setExtraSeats(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-subtle">
                {t("platform.seatUsageHint", {
                  used: String(orgUsers.length),
                  limit:
                    effectiveSeatLimit(plan, Number(extraSeats) || 0) === null
                      ? t("platform.seatLimitUnlimited")
                      : String(effectiveSeatLimit(plan, Number(extraSeats) || 0)),
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
              <Pill tone={phase === "paid" ? "success" : phase === "trial" ? "info" : "danger"}>
                {t(`platform.phase.${phase}`)}
              </Pill>
              {org.trial_ends_at && (
                <span className="text-xs text-subtle">
                  {t("platform.trialEnds")}: {new Date(org.trial_ends_at).toLocaleDateString()}
                </span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void grantPaidMonth()}
                className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl bg-success px-3 text-xs font-semibold text-success-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {t("platform.grantPaidMonth")}
              </button>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming("save")}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(org.active ? "deactivate" : "activate")}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
              >
                {org.active ? t("platform.deactivate") : t("platform.activate")}
              </button>
              <Pill tone={org.active ? "success" : "neutral"}>
                {org.active ? t("platform.active") : t("platform.inactive")}
              </Pill>
            </div>
          </div>
        </SectionCard>

        <SectionCard title={t("platform.orgStatusTitle")}>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("platform.amocrmStatus")}</span>
              {amoConnection ? (
                <Pill tone={amoConnection.last_sync_error ? "danger" : "success"}>
                  {amoConnection.subdomain}
                </Pill>
              ) : (
                <Pill tone="neutral">{t("platform.notConnected")}</Pill>
              )}
            </li>
            {amoConnection?.last_synced_at && (
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("platform.lastSynced")}</span>
                <span className="text-foreground">{timeAgo(amoConnection.last_synced_at)}</span>
              </li>
            )}
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("platform.aiAgentsStatus")}</span>
              <Pill tone={orgAiAgents.some((a) => a.active) ? "success" : "neutral"}>
                {orgAiAgents.filter((a) => a.active).length}/{orgAiAgents.length}
              </Pill>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("platform.createdAt")}</span>
              <span className="text-foreground">{timeAgo(org.created_at)}</span>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard
        title={t("platform.orgUsersTitle")}
        actions={<AddOrgEmployeeDialog orgId={org.id} />}
      >
        {orgUsers.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-subtle">
            <Users2 className="h-4 w-4" /> {t("platform.noUsers")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {orgUsers.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.full_name || p.email}
                  </p>
                  <p className="truncate text-xs text-subtle">{p.email}</p>
                </div>
                <Pill tone={p.is_intern ? "info" : roleTone(p.role)}>
                  {p.is_intern ? "amaliyotchi" : p.role}
                </Pill>
                <EditUserDialog profile={p} />
                <ChannelActionButton
                  icon={Trash2}
                  label={t("admin.deleteEmployee")}
                  tone="destructive"
                  loading={deletingUserId === p.id}
                  onClick={() => setPendingDeleteUser(p)}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <DeleteOrgDangerZone org={org} />

      <ConfirmDialog
        open={!!pendingDeleteUser}
        onOpenChange={(open) => !open && setPendingDeleteUser(null)}
        title={t("admin.confirmDeleteTitle")}
        description={
          pendingDeleteUser
            ? t("admin.confirmDeleteDesc", {
                name: pendingDeleteUser.full_name || pendingDeleteUser.email,
              })
            : undefined
        }
        onConfirm={() => {
          if (pendingDeleteUser) void applyDeleteUser(pendingDeleteUser);
          setPendingDeleteUser(null);
        }}
      />

      <ConfirmDialog
        open={confirming === "save"}
        onOpenChange={(v) => !v && setConfirming(null)}
        title={t("platform.confirmSaveTitle")}
        description={t("platform.confirmSaveDesc", { name: name.trim() })}
        onConfirm={() => {
          setConfirming(null);
          void saveDetails();
        }}
      />
      <ConfirmDialog
        open={confirming === "deactivate" || confirming === "activate"}
        onOpenChange={(v) => !v && setConfirming(null)}
        title={
          confirming === "deactivate"
            ? t("platform.confirmDeactivateTitle")
            : t("platform.confirmActivateTitle")
        }
        description={t("platform.confirmActiveDesc", { name: org.name })}
        onConfirm={() => {
          setConfirming(null);
          void toggleActive();
        }}
      />
    </>
  );
}
