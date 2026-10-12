import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  Blocks,
  Loader2,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users2,
  Building2,
  AlertTriangle,
  SearchX,
  Info,
  Activity,
  Users,
  KeyRound,
  CalendarClock,
  Snowflake,
  Plug,
  Copy,
  Eye,
  EyeOff,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageHeader,
  SectionCard,
  Pill,
  ChannelActionButton,
  IconTile,
} from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SubdomainCard } from "@/components/settings/SubdomainCard";
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
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, roleTone, timeAgo } from "@/lib/utils";
import type { CardTone } from "@/lib/tones";
import { effectiveSeatLimit, PLANS as PLAN_IDS, PLAN_LABELS } from "@/lib/plan-gating";
import { freezePatch, orgPhase, unfreezePatch } from "@/lib/org-access";
import {
  useOrganizations,
  useUpdateOrganization,
  useAllProfiles,
  useAllAmoConnections,
  useAllAiAgents,
  useAddOrgEmployee,
  useDeleteUserAsOwner,
  useDeleteOrganization,
  useCompanyDirectory,
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
      void navigate({ to: "/platform/companies" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.orgDeleteFailed"));
      setBusy(false);
    }
  }

  return (
    <SectionCard
      icon={AlertTriangle}
      tone="rose"
      title={t("platform.dangerZone")}
      description={t("platform.dangerZoneDesc")}
    >
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

type OrgSection =
  "details" | "access" | "plan" | "freeze" | "modules" | "users" | "status" | "danger";

// One clickable card per area of the company; the chosen one opens below.
function SectionTile({
  icon,
  tone,
  title,
  hint,
  active,
  onClick,
}: {
  icon: LucideIcon;
  tone: CardTone;
  title: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-2xl border bg-card p-3.5 text-left transition-colors",
        active
          ? "border-primary ring-2 ring-primary/25"
          : "border-border hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <IconTile icon={icon} tone={tone} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
        <span className="block truncate text-xs text-subtle">{hint}</span>
      </span>
    </button>
  );
}

function SecretValue({ value }: { value: string }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-sm tabular-nums text-foreground">
        {visible ? value : "•".repeat(Math.min(value.length, 10))}
      </span>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="text-subtle hover:text-foreground"
        title={visible ? t("pc.hide") : t("pc.show")}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          toast.success(t("pc.copied"));
        }}
        className="text-subtle hover:text-foreground"
        title={t("pc.copy")}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </span>
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
  const { data: directory } = useCompanyDirectory();
  const updateOrg = useUpdateOrganization();
  const deleteUser = useDeleteUserAsOwner();
  const queryClient = useQueryClient();

  const org = orgs?.find((o) => o.id === orgId);
  const [section, setSection] = useState<OrgSection>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [plan, setPlan] = useState<string>("start_iq");
  const [extraSeats, setExtraSeats] = useState("0");
  const [unlimitedSeats, setUnlimitedSeats] = useState(false);
  const [endsOn, setEndsOn] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [confirming, setConfirming] = useState<null | "save" | "freeze" | "unfreeze">(null);
  const [busy, setBusy] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<OwnerProfileRow | null>(null);

  useEffect(() => {
    if (org) {
      setName(org.name);
      setPhone(org.phone ?? "");
      setPlan(org.plan);
      setExtraSeats(String(org.extra_seats ?? 0));
      setUnlimitedSeats(!!org.unlimited_seats);
      setEndsOn(org.trial_ends_at ? org.trial_ends_at.slice(0, 10) : "");
    }
  }, [org]);

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

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!org) {
    return (
      <SectionCard
        icon={SearchX}
        tone="rose"
        title={t("platform.orgNotFoundTitle")}
        description={t("platform.orgNotFoundDesc")}
      >
        <Link to="/platform/companies" className="text-sm font-medium text-primary hover:underline">
          {t("platform.backToList")}
        </Link>
      </SectionCard>
    );
  }

  const orgUsers = (profiles ?? []).filter((p) => p.organization_id === org.id);
  const admins = orgUsers.filter((p) => p.role === "super_admin");
  const amoConnection = (amoConnections ?? []).find((c) => c.organization_id === org.id);
  const orgAiAgents = (aiAgents ?? []).filter((a) => a.organization_id === org.id);
  const dirEntry = directory?.companies.find((c) => c.id === org.id) ?? null;
  const frozen = !!org.frozen_at;
  const phase = orgPhase(org);

  async function patchOrg(patch: Partial<OrganizationRow>, okMessage: string) {
    setBusy(true);
    try {
      await updateOrg.mutateAsync({ id: org!.id, patch });
      toast.success(okMessage);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.orgUpdateFailed"));
    } finally {
      setBusy(false);
    }
  }

  function saveDetails() {
    return patchOrg({ name: name.trim(), phone: phone.trim() || null }, t("platform.orgUpdated"));
  }

  function savePlan() {
    return patchOrg(
      {
        plan,
        extra_seats: Math.max(0, Number(extraSeats) || 0),
        unlimited_seats: unlimitedSeats,
        // End of that day in Tashkent.
        ...(endsOn ? { trial_ends_at: new Date(`${endsOn}T23:59:59+05:00`).toISOString() } : {}),
      },
      t("platform.orgUpdated"),
    );
  }

  // An offline payment (cash, bank transfer) the platform owner confirms by
  // hand -- the same effect a Payme/Click payment has in
  // reactivateOrgAfterPayment: ends the free trial for good (full plan from
  // now on) and adds one 30-day period on top of whatever's left.
  function grantPaidMonth() {
    const currentEnd = org!.trial_ends_at ? new Date(org!.trial_ends_at).getTime() : 0;
    const base = Math.max(Date.now(), currentEnd);
    return patchOrg(
      {
        active: true,
        is_trial: false,
        trial_ends_at: new Date(base + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      t("platform.paidMonthGranted"),
    );
  }

  function setCrmEnabled(on: boolean) {
    return patchOrg({ crm_enabled: on }, on ? t("platform.crmOnToast") : t("platform.crmOffToast"));
  }

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

  const frozenDays = org.frozen_at
    ? Math.max(0, Math.floor((Date.now() - new Date(org.frozen_at).getTime()) / 86_400_000))
    : 0;

  const tiles: { id: OrgSection; icon: LucideIcon; tone: CardTone; title: string; hint: string }[] =
    [
      {
        id: "details",
        icon: Info,
        tone: "primary",
        title: t("orgcard.details"),
        hint: org.subdomain
          ? `${org.subdomain}.salesiq.uz`
          : (org.phone ?? t("orgcard.detailsHint")),
      },
      {
        id: "access",
        icon: KeyRound,
        tone: "amber",
        title: t("orgcard.access"),
        hint: dirEntry?.login ?? admins[0]?.email ?? "—",
      },
      {
        id: "plan",
        icon: CalendarClock,
        tone: "emerald",
        title: t("orgcard.plan"),
        hint: `${PLAN_LABELS[org.plan as (typeof PLAN_IDS)[number]] ?? org.plan} · ${t(`platform.phase.${phase}`)}`,
      },
      {
        id: "freeze",
        icon: Snowflake,
        tone: "sky",
        title: t("orgcard.freeze"),
        hint: frozen
          ? t("orgcard.frozenFor", { days: String(frozenDays) })
          : org.active
            ? t("platform.active")
            : t("platform.inactive"),
      },
      {
        id: "modules",
        icon: Blocks,
        tone: "violet",
        title: t("platform.modulesTitle"),
        hint: org.crm_enabled ? t("platform.moduleCrmOn") : t("platform.moduleCrmOff"),
      },
      {
        id: "users",
        icon: Users,
        tone: "sky",
        title: t("platform.orgUsersTitle"),
        hint: t("orgcard.usersCount", { count: String(orgUsers.length) }),
      },
      {
        id: "status",
        icon: Plug,
        tone: "emerald",
        title: t("orgcard.integrations"),
        hint: amoConnection ? `amoCRM · ${amoConnection.subdomain}` : t("platform.notConnected"),
      },
      {
        id: "danger",
        icon: AlertTriangle,
        tone: "rose",
        title: t("orgcard.danger"),
        hint: t("orgcard.dangerHint"),
      },
    ];

  const primaryBtn =
    "inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60";

  return (
    <>
      <PageHeader
        icon={Building2}
        tone="primary"
        title={org.name}
        description={t("platform.orgDetailDesc")}
        actions={
          <div className="flex items-center gap-2">
            {frozen ? (
              <Pill tone="info">{t("orgcard.frozen")}</Pill>
            ) : (
              <Pill tone={org.active ? "success" : "neutral"}>
                {org.active ? t("platform.active") : t("platform.inactive")}
              </Pill>
            )}
          </div>
        }
      />

      <div className="phone-joined grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => (
          <SectionTile
            key={tile.id}
            icon={tile.icon}
            tone={tile.tone}
            title={tile.title}
            hint={tile.hint}
            active={section === tile.id}
            onClick={() => setSection(tile.id)}
          />
        ))}
      </div>

      <div className="mt-4">
        {section === "details" && (
          <>
            <SectionCard icon={Info} tone="primary" title={t("orgcard.details")}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="detail-name">{t("platform.orgName")}</Label>
                  <Input id="detail-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="detail-phone">{t("platform.orgPhone")}</Label>
                  <Input
                    id="detail-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy || !name.trim()}
                  onClick={() => setConfirming("save")}
                  className={primaryBtn}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </button>
                <span className="text-xs text-subtle">
                  {t("platform.createdAt")}: {timeAgo(org.created_at)}
                </span>
              </div>
            </SectionCard>
            {/* The company's own address ("code") -- assigned here once it has
              bought the platform (the company itself only sees it). */}
            <SubdomainCard
              organizationId={org.id}
              subdomain={org.subdomain ?? null}
              editable
              onChanged={() => queryClient.invalidateQueries({ queryKey: ["organizations"] })}
            />
          </>
        )}

        {section === "access" && (
          <SectionCard
            icon={KeyRound}
            tone="amber"
            title={t("orgcard.access")}
            description={t("orgcard.accessDesc")}
          >
            {admins.length === 0 ? (
              <p className="text-sm text-subtle">{t("orgcard.noAdmin")}</p>
            ) : (
              <ul className="divide-y divide-border">
                {admins.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {a.full_name || a.email}
                      </p>
                      <p className="text-xs text-subtle">{t("admin.roleAdmin")}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                        {t("platform.loginEmail")}
                      </p>
                      <p className="truncate text-sm text-foreground">{a.email}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
                        {t("orgcard.password")}
                      </p>
                      {dirEntry?.superAdminId === a.id && dirEntry.password ? (
                        <SecretValue value={dirEntry.password} />
                      ) : (
                        <span className="text-sm text-subtle">{t("pc.unknown")}</span>
                      )}
                    </div>
                    <EditUserDialog profile={a} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        )}

        {section === "plan" && (
          <SectionCard icon={CalendarClock} tone="emerald" title={t("orgcard.plan")}>
            <div className="grid gap-4 md:grid-cols-3">
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
                      effectiveSeatLimit(plan, Number(extraSeats) || 0, unlimitedSeats) === null
                        ? t("platform.seatLimitUnlimited")
                        : String(effectiveSeatLimit(plan, Number(extraSeats) || 0, unlimitedSeats)),
                  })}
                </p>
              </div>
              <div>
                <Label htmlFor="detail-ends">{t("orgcard.endsOn")}</Label>
                <Input
                  id="detail-ends"
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                />
                <p className="mt-1.5 text-xs text-subtle">{t(`platform.phase.${phase}`)}</p>
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                checked={unlimitedSeats}
                onChange={(e) => setUnlimitedSeats(e.target.checked)}
              />
              <span>
                {t("platform.unlimitedSeats")}
                <span className="block text-xs text-subtle">
                  {t("platform.unlimitedSeatsHint")}
                </span>
              </span>
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePlan()}
                className={primaryBtn}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void grantPaidMonth()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-success-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {t("platform.grantPaidMonth")}
              </button>
            </div>
          </SectionCard>
        )}

        {section === "freeze" && (
          <SectionCard
            icon={Snowflake}
            tone="sky"
            title={t("orgcard.freeze")}
            description={t("orgcard.freezeDesc")}
          >
            {frozen ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-foreground">
                  <p className="font-semibold">
                    {t("orgcard.frozenSince", {
                      date: new Date(org.frozen_at!).toLocaleString(),
                      days: String(frozenDays),
                    })}
                  </p>
                  {org.frozen_reason && (
                    <p className="mt-1 text-muted-foreground">{org.frozen_reason}</p>
                  )}
                </div>
                <p className="text-xs text-subtle">{t("orgcard.unfreezeHint")}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming("unfreeze")}
                  className={primaryBtn}
                >
                  {t("orgcard.unfreeze")}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="freeze-reason">{t("orgcard.freezeReason")}</Label>
                  <textarea
                    id="freeze-reason"
                    value={freezeReason}
                    onChange={(e) => setFreezeReason(e.target.value)}
                    rows={2}
                    placeholder={t("orgcard.freezeReasonPlaceholder")}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  />
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirming("freeze")}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <Snowflake className="h-4 w-4" /> {t("orgcard.freezeNow")}
                </button>
              </div>
            )}
          </SectionCard>
        )}

        {section === "modules" && (
          <SectionCard
            icon={Blocks}
            tone="violet"
            title={t("platform.modulesTitle")}
            description={t("platform.modulesDesc")}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {t("platform.moduleAnalytics")}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-subtle">
                    {t("platform.moduleAnalyticsDesc")}
                  </p>
                </div>
                <Pill tone="success">{t("platform.moduleAlwaysOn")}</Pill>
              </div>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  org.crm_enabled ? "border-primary/40 bg-primary/5" : "border-border bg-surface"
                }`}
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Blocks className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t("platform.moduleCrm")}</p>
                  <p className="mt-0.5 text-xs leading-snug text-subtle">
                    {t("platform.moduleCrmDesc")}
                  </p>
                </div>
                <Switch
                  checked={org.crm_enabled === true}
                  disabled={busy}
                  onCheckedChange={(v) => void setCrmEnabled(v)}
                />
              </label>
            </div>
          </SectionCard>
        )}

        {section === "users" && (
          <SectionCard
            icon={Users}
            tone="sky"
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
        )}

        {section === "status" && (
          <SectionCard
            icon={Activity}
            tone="emerald"
            title={t("orgcard.integrations")}
            actions={
              <Link
                to="/platform/integrations"
                search={{ org: org.id }}
                className="text-sm font-semibold text-primary hover:underline"
              >
                {t("orgcard.manageIntegrations")}
              </Link>
            }
          >
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
            </ul>
          </SectionCard>
        )}

        {section === "danger" && <DeleteOrgDangerZone org={org} />}
      </div>

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
        open={confirming === "freeze" || confirming === "unfreeze"}
        onOpenChange={(v) => !v && setConfirming(null)}
        title={confirming === "freeze" ? t("orgcard.confirmFreeze") : t("orgcard.confirmUnfreeze")}
        description={
          confirming === "freeze"
            ? t("orgcard.confirmFreezeDesc", { name: org.name })
            : t("orgcard.confirmUnfreezeDesc", { name: org.name, days: String(frozenDays) })
        }
        onConfirm={() => {
          const kind = confirming;
          setConfirming(null);
          if (kind === "freeze") {
            void patchOrg(freezePatch(freezeReason), t("orgcard.frozenToast")).then(() =>
              setFreezeReason(""),
            );
          } else {
            void patchOrg(unfreezePatch(org), t("orgcard.unfrozenToast"));
          }
        }}
      />
    </>
  );
}
