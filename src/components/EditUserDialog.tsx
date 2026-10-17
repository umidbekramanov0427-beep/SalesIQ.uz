import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useI18n } from "@/lib/i18n";
import { useUpdateUserAsOwner, type OwnerProfileRow } from "@/hooks/use-crm-data";

const EDITABLE_ROLES = ["sotuv_menejeri", "amaliyotchi", "rop", "super_admin"] as const;
type EditableRole = (typeof EDITABLE_ROLES)[number];

// "amaliyotchi" = a Sotuv menejeri with is_intern set (see platform.update-user.ts).
function editableRoleOf(profile: OwnerProfileRow): EditableRole {
  if (profile.is_intern) return "amaliyotchi";
  return EDITABLE_ROLES.includes(profile.role as EditableRole)
    ? (profile.role as EditableRole)
    : "sotuv_menejeri";
}

export function EditUserDialog({ profile }: { profile: OwnerProfileRow }) {
  const { t } = useI18n();
  const updateUser = useUpdateUserAsOwner();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [role, setRole] = useState<EditableRole>(() => editableRoleOf(profile));
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState(profile.email ?? "");
  const [busy, setBusy] = useState(false);

  const roleLabel: Record<EditableRole, string> = {
    sotuv_menejeri: t("admin.roleRep"),
    amaliyotchi: t("mentor.internBadge"),
    rop: t("admin.roleRop"),
    super_admin: t("admin.roleAdmin"),
  };

  useEffect(() => {
    if (open) {
      setFullName(profile.full_name ?? "");
      setRole(editableRoleOf(profile));
      setPassword("");
      setEmail(profile.email ?? "");
    }
  }, [open, profile]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password && password.length < 8) return;
    setConfirming(true);
  }

  async function submit() {
    setBusy(true);
    try {
      await updateUser.mutateAsync({
        id: profile.id,
        full_name: fullName.trim(),
        role,
        ...(password ? { password } : {}),
        ...(email.trim() && email.trim() !== profile.email ? { email: email.trim() } : {}),
      });
      toast.success(t("platform.userUpdated"));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("platform.userUpdateFailed"));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={t("platform.editUser")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent hover:text-foreground sm:h-9 sm:w-9"
          >
            <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("platform.editUser")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="edit-user-name">{t("admin.newEmployeeName")}</Label>
              <Input
                id="edit-user-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-user-email">{t("platform.loginEmail")}</Label>
              <Input
                id="edit-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>{t("admin.colRole")}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as EditableRole)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EDITABLE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {roleLabel[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-user-password">{t("platform.newPasswordOptional")}</Label>
              <Input
                id="edit-user-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                placeholder={t("platform.leaveBlankToKeep")}
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

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("platform.confirmUpdateUserTitle")}
        description={t("platform.confirmUpdateUserDesc", {
          name: profile.full_name || profile.email,
        })}
        onConfirm={() => void submit()}
      />
    </>
  );
}
