import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  KeyRound,
  Loader2,
  Pencil,
  ListFilter,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill, ChannelActionButton } from "@/components/layout/Primitives";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { InternSettingsDialog } from "@/components/mentor/InternSettingsDialog";
import { internDay, tashkentToday } from "@/lib/intern-roadmap";
import { FilterSelect, FilterSearchInput } from "@/components/filters/FilterSelect";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { describeError, roleTone } from "@/lib/utils";
import {
  useProfilesRaw,
  useUpdateProfile,
  useCreateEmployee,
  useDeleteEmployee,
  useSetEmployeePassword,
  type ProfileRow,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/admin/employees")({
  head: () => ({ meta: [{ title: "Employees — SalesIQ" }] }),
  component: EmployeesPage,
});

// "amaliyotchi" (intern) is offered as a role in the admin UI, but stored
// as a Sotuv menejeri with is_intern = true: interns get exactly a rep's data
// access through every existing RLS policy, plus the AI mentor (see
// 20261016000000_intern_mentor.sql).
type UiRole = ProfileRow["role"] | "amaliyotchi";
const ROLES: UiRole[] = ["sotuv_menejeri", "amaliyotchi", "rop", "super_admin"];
const NO_MANAGER = "__none__";
const DEFAULT_INTERN_DAYS = 14;

function uiRoleOf(p: ProfileRow): UiRole {
  return p.is_intern ? "amaliyotchi" : p.role;
}

function rolePatch(
  role: UiRole,
  existing?: ProfileRow,
  internship?: { startDate: string; days: number },
): Partial<ProfileRow> {
  // is_intern is only written when it changes, so plain role edits keep
  // working on a database that hasn't run the intern migration yet.
  if (role !== "amaliyotchi") return existing?.is_intern ? { role, is_intern: false } : { role };
  return {
    role: "sotuv_menejeri",
    is_intern: true,
    internship_start_date:
      internship?.startDate ?? existing?.internship_start_date ?? tashkentToday(),
    internship_days: internship?.days ?? existing?.internship_days ?? DEFAULT_INTERN_DAYS,
  };
}

function uiRoleTone(role: UiRole) {
  return role === "amaliyotchi" ? ("info" as const) : roleTone(role);
}

function internDayLabel(p: ProfileRow, t: ReturnType<typeof useI18n>["t"]): string {
  const day = internDay(p.internship_start_date);
  if (day == null) return t("mentor.notStarted");
  if (day > p.internship_days) return t("mentor.finished");
  return t("mentor.dayOf", { day, total: p.internship_days });
}

function roleLabels(t: ReturnType<typeof useI18n>["t"]): Record<UiRole, string> {
  return {
    amaliyotchi: t("mentor.internBadge"),
    rep: t("admin.roleRep"),
    manager: t("admin.roleManager"),
    sotuv_menejeri: t("admin.roleRep"),
    rop: t("admin.roleRop"),
    super_admin: t("admin.roleAdmin"),
    platform_owner: t("admin.rolePlatformOwner"),
  };
}

function CreateEmployeeDialog({ ropOptions }: { ropOptions: ProfileRow[] }) {
  const { t } = useI18n();
  const createEmployee = useCreateEmployee();
  const updateProfile = useUpdateProfile();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UiRole>("sotuv_menejeri");
  const [internStart, setInternStart] = useState(() => tashkentToday());
  const [internDays, setInternDays] = useState(DEFAULT_INTERN_DAYS);
  const [department, setDepartment] = useState("Sales");
  const [managerId, setManagerId] = useState("");
  const [busy, setBusy] = useState(false);

  const roleLabel = roleLabels(t);

  function reset() {
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("sotuv_menejeri");
    setInternStart(tashkentToday());
    setInternDays(DEFAULT_INTERN_DAYS);
    setDepartment("Sales");
    setManagerId("");
  }

  async function submit() {
    setBusy(true);
    try {
      const { id } = await createEmployee.mutateAsync({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
      });
      await updateProfile.mutateAsync({
        id,
        patch: {
          ...rolePatch(role, undefined, { startDate: internStart, days: internDays }),
          department: department.trim(),
          ...((role === "sotuv_menejeri" || role === "amaliyotchi") && managerId
            ? { manager_id: managerId }
            : {}),
        },
      });
      toast.success(t("admin.employeeCreated"));
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(describeError(err, t("admin.employeeCreateFailed")));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || password.length < 8) return;
    setConfirming(true);
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
              <Label htmlFor="emp-name">{t("admin.newEmployeeName")}</Label>
              <Input
                id="emp-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="emp-email">{t("admin.colEmail")}</Label>
              <Input
                id="emp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="emp-password">{t("admin.newEmployeePassword")}</Label>
              <Input
                id="emp-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("admin.colRole")}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as UiRole)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {roleLabel[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="emp-dept">{t("admin.colDepartment")}</Label>
                <Input
                  id="emp-dept"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </div>
            </div>
            {role === "amaliyotchi" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="emp-intern-start">{t("mentor.startDate")}</Label>
                  <Input
                    id="emp-intern-start"
                    type="date"
                    value={internStart}
                    onChange={(e) => setInternStart(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="emp-intern-days">{t("mentor.totalDays")}</Label>
                  <Input
                    id="emp-intern-days"
                    type="number"
                    min={1}
                    max={90}
                    value={internDays}
                    onChange={(e) =>
                      setInternDays(Math.min(90, Math.max(1, Number(e.target.value) || 1)))
                    }
                  />
                </div>
              </div>
            )}
            {(role === "sotuv_menejeri" || role === "amaliyotchi") && (
              <div>
                <Label>{t("admin.colManagerRop")}</Label>
                <Select value={managerId} onValueChange={setManagerId}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={t("admin.noManagerRop")} />
                  </SelectTrigger>
                  <SelectContent>
                    {ropOptions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.full_name || r.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
        description={t("admin.confirmCreateDesc", { name: fullName.trim(), role: roleLabel[role] })}
        onConfirm={() => void submit()}
      />
    </>
  );
}

// A shrunk-down stand-in for StatCard, sized to sit inline in a
// SectionCard's header row instead of taking a full-width row of its own --
// "surface-card" gives it the same blue accent glow (--shadow-glow) and
// lighter --color-card background every other card on the platform uses,
// instead of a flat border on the page's own (much darker) background.
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card flex h-9 shrink-0 flex-col items-center justify-center gap-0.5 px-2 sm:h-11 sm:px-3.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle sm:text-xs">
        {label}
      </span>
      <span className="font-display text-xs font-bold leading-none tabular-nums text-foreground sm:text-sm">
        {value}
      </span>
    </div>
  );
}

function EmployeesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: profiles, isLoading } = useProfilesRaw();
  const updateProfile = useUpdateProfile();
  const deleteEmployee = useDeleteEmployee();
  const setPassword = useSetEmployeePassword();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [pendingChange, setPendingChange] = useState<{
    profile: ProfileRow;
    role: UiRole;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProfileRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<ProfileRow | null>(null);
  const [internTarget, setInternTarget] = useState<ProfileRow | null>(null);
  const [passwordValue, setPasswordValue] = useState("");

  const roleLabel = roleLabels(t);

  const employees = profiles ?? [];
  const ropOptions = employees.filter((p) => p.role === "rop");
  const q = query.trim().toLowerCase();
  const filteredEmployees = employees
    .filter((p) => !roleFilter || uiRoleOf(p) === roleFilter)
    .filter(
      (p) =>
        !q || [p.full_name, p.email, p.department].some((v) => (v ?? "").toLowerCase().includes(q)),
    );

  async function applyRoleChange(profile: ProfileRow, role: UiRole) {
    setSavingId(profile.id);
    try {
      await updateProfile.mutateAsync({ id: profile.id, patch: rolePatch(role, profile) });
      toast.success(t("admin.roleUpdated"));
    } catch (err) {
      toast.error(describeError(err, t("admin.roleUpdateFailed")));
    } finally {
      setSavingId(null);
      setEditingId(null);
    }
  }

  async function applyManagerChange(profile: ProfileRow, managerId: string) {
    setSavingId(profile.id);
    try {
      await updateProfile.mutateAsync({
        id: profile.id,
        patch: { manager_id: managerId || null },
      });
      toast.success(t("admin.org.updated"));
    } catch (err) {
      toast.error(describeError(err, t("admin.org.updateFailed")));
    } finally {
      setSavingId(null);
    }
  }

  async function applyDelete(profile: ProfileRow) {
    setDeletingId(profile.id);
    try {
      await deleteEmployee.mutateAsync(profile.id);
      toast.success(t("admin.employeeDeleted"));
    } catch (err) {
      toast.error(describeError(err, t("admin.employeeDeleteFailed")));
    } finally {
      setDeletingId(null);
    }
  }

  async function applySetPassword() {
    if (!passwordTarget || passwordValue.length < 8) return;
    try {
      await setPassword.mutateAsync({ id: passwordTarget.id, password: passwordValue });
      toast.success(t("admin.passwordUpdated"));
      setPasswordTarget(null);
      setPasswordValue("");
    } catch (err) {
      toast.error(describeError(err, t("admin.passwordUpdateFailed")));
    }
  }

  return (
    <>
      <AdminBackLink />
      <PageHeader
        icon={Users}
        tone="sky"
        title={t("hub.item.employees.title")}
        description={t("hub.item.employees.desc")}
        actions={
          <>
            <CreateEmployeeDialog ropOptions={ropOptions} />
            <Pill tone="danger">{t("admin.adminsOnly")}</Pill>
          </>
        }
      />

      {/* The employee table takes all the room it can; the controls column
          stays a narrow fixed rail beside it. minmax(0,1fr) lets the table
          column shrink instead of pushing under the rail. */}
      <div className="mt-6">
        <SectionCard
          title={t("admin.employeeMgmt")}
          description={t("admin.employeeMgmtDesc")}
          className="min-w-0"
          actions={
            <div className="flex w-full flex-wrap items-center gap-2">
              <MiniStat label={t("admin.employees")} value={String(employees.length)} />
              <MiniStat
                label={t("admin.activeRoles")}
                value={String(new Set(employees.map((p) => p.role)).size)}
              />
              <MiniStat
                label={t("admin.departments")}
                value={String(new Set(employees.map((p) => p.department)).size)}
              />
              <MiniStat
                label={t("admin.managers")}
                value={String(employees.filter((p) => p.role === "rop").length)}
              />
              {employees.length > 0 && (
                <>
                  <FilterSelect
                    icon={ListFilter}
                    label={t("admin.roleLabel")}
                    value={roleFilter}
                    onChange={setRoleFilter}
                    className="h-11 w-auto min-w-0 flex-1 border-primary/30"
                  >
                    <option value="">{t("admin.allRoles")}</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel[r]}
                      </option>
                    ))}
                  </FilterSelect>
                  <FilterSearchInput
                    icon={Search}
                    label={t("leadFilter.searchLabel")}
                    value={query}
                    onChange={setQuery}
                    placeholder={t("admin.searchEmployees")}
                    className="h-11 w-auto min-w-0 flex-1 border-primary/30"
                  />
                </>
              )}
            </div>
          }
        >
          {isLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("admin.loadingEmployees")}
            </div>
          )}
          {!isLoading && employees.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("admin.noSignups")}
            </p>
          )}
          {!isLoading && employees.length > 0 && filteredEmployees.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("admin.noEmployeesMatch")}
            </p>
          )}
          {filteredEmployees.length > 0 && (
            <div className="-m-2.5 overflow-x-auto sm:-m-3.5">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-subtle">
                    <th className="w-10 py-2.5 pl-4 pr-2 font-bold">#</th>
                    <th className="px-3 py-2.5 font-bold">{t("admin.colEmployee")}</th>
                    <th className="px-3 py-2.5 font-bold">{t("admin.colEmail")}</th>
                    <th className="px-3 py-2.5 font-bold">{t("admin.colRole")}</th>
                    <th className="px-3 py-2.5 font-bold">{t("admin.colManagerRop")}</th>
                    <th className="py-2.5 pl-3 pr-4 text-right font-bold">
                      {t("admin.colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((p, index) => {
                    const isEditing = editingId === p.id;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border last:border-0 hover:bg-surface"
                      >
                        <td className="py-2.5 pl-4 pr-2 text-sm font-bold text-amber-500">
                          {index + 1}
                        </td>
                        {/* Name with the department under it -- one column
                            instead of two keeps every column on screen. */}
                        <td className="px-3 py-2.5">
                          <p className="whitespace-nowrap font-bold">{p.full_name || "—"}</p>
                          {p.department && p.department !== "Unassigned" && (
                            <p className="text-xs text-subtle">{p.department}</p>
                          )}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2.5 text-muted-foreground">
                          {p.email}
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing ? (
                            <Select
                              value={uiRoleOf(p)}
                              disabled={savingId === p.id}
                              onValueChange={(v) =>
                                setPendingChange({ profile: p, role: v as UiRole })
                              }
                            >
                              <SelectTrigger className="h-9 w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {roleLabel[r]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="inline-flex flex-wrap items-center gap-1.5">
                              <Pill tone={uiRoleTone(uiRoleOf(p))}>{roleLabel[uiRoleOf(p)]}</Pill>
                              {p.is_intern && (
                                <button
                                  type="button"
                                  onClick={() => setInternTarget(p)}
                                  title={t("mentor.settingsTitle")}
                                  className="rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:bg-accent hover:text-foreground hover:underline"
                                >
                                  {internDayLabel(p, t)}
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {p.role === "sotuv_menejeri" ? (
                            <Select
                              value={p.manager_id ?? NO_MANAGER}
                              disabled={savingId === p.id}
                              onValueChange={(v) =>
                                void applyManagerChange(p, v === NO_MANAGER ? "" : v)
                              }
                            >
                              <SelectTrigger className="h-9 w-44">
                                <SelectValue placeholder={t("admin.noManagerRop")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_MANAGER}>
                                  {t("admin.noManagerRop")}
                                </SelectItem>
                                {ropOptions.map((r) => (
                                  <SelectItem key={r.id} value={r.id}>
                                    {r.full_name || r.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-subtle">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-3 pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <ChannelActionButton
                              icon={Pencil}
                              label={t("admin.editRole")}
                              onClick={() => setEditingId(isEditing ? null : p.id)}
                            />
                            {p.id !== user?.id && (
                              <ChannelActionButton
                                icon={KeyRound}
                                label={t("admin.setPassword")}
                                onClick={() => {
                                  setPasswordTarget(p);
                                  setPasswordValue("");
                                }}
                              />
                            )}
                            {p.id !== user?.id && (
                              <ChannelActionButton
                                icon={Trash2}
                                label={t("admin.deleteEmployee")}
                                tone="destructive"
                                loading={deletingId === p.id}
                                onClick={() => setPendingDelete(p)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <InternSettingsDialog
        profile={internTarget}
        open={!!internTarget}
        onOpenChange={(v) => !v && setInternTarget(null)}
      />
      <ConfirmDialog
        open={!!pendingChange}
        onOpenChange={(open) => !open && setPendingChange(null)}
        title={t("admin.confirmSaveTitle")}
        description={
          pendingChange
            ? t("admin.confirmSaveDesc", {
                name: pendingChange.profile.full_name || pendingChange.profile.email,
                role: roleLabel[pendingChange.role],
              })
            : undefined
        }
        onConfirm={() => {
          if (pendingChange) void applyRoleChange(pendingChange.profile, pendingChange.role);
          setPendingChange(null);
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={t("admin.confirmDeleteTitle")}
        description={
          pendingDelete
            ? t("admin.confirmDeleteDesc", {
                name: pendingDelete.full_name || pendingDelete.email,
              })
            : undefined
        }
        onConfirm={() => {
          if (pendingDelete) void applyDelete(pendingDelete);
          setPendingDelete(null);
        }}
      />

      <Dialog
        open={!!passwordTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordTarget(null);
            setPasswordValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.setPasswordTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {passwordTarget?.full_name || passwordTarget?.email}
          </p>
          <div className="space-y-2">
            <Label htmlFor="employee-new-password">{t("admin.newPassword")}</Label>
            <Input
              id="employee-new-password"
              type="password"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              minLength={8}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                setPasswordTarget(null);
                setPasswordValue("");
              }}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-muted-foreground hover:bg-accent"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => void applySetPassword()}
              disabled={setPassword.isPending || passwordValue.length < 8}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {setPassword.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
