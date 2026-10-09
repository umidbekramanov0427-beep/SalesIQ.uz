import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { parseGuardError } from "@/lib/crm-guards";
import { describeError } from "@/lib/utils";
import {
  fetchFunnelDuplicate,
  notifyTaskAssigned,
  useCompaniesRaw,
  useCrmFunnelNames,
  usePermission,
  useCrmStages,
  useProfilesRaw,
} from "@/hooks/use-crm-data";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRIORITIES = ["Urgent", "High", "Normal", "Low"] as const;

function SubmitButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}

export function NewLeadDialog({ trigger }: { trigger: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [revenue, setRevenue] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("Normal");
  const [funnel, setFunnel] = useState("Direct Sales");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: stages } = useCrmStages();
  // Funnel names come from the small (funnel, owner) list the sidebar
  // already loaded -- not from every lead row.
  const { names: funnelNames } = useCrmFunnelNames();
  const funnelOptions = useMemo(
    () => Array.from(new Set(["Direct Sales", ...funnelNames])),
    [funnelNames],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    let contactId: string | null = null;
    const leadFunnel = funnel.trim() || "Direct Sales";
    try {
      // One client = one lead per funnel.
      const existing = await fetchFunnelDuplicate(leadFunnel, phone, email);
      if (existing) {
        toast.error(t("guard.dupTitle", { funnel: leadFunnel }), {
          description: `${existing.name} · ${existing.owner_name || t("guard.noOwner")}`,
          action: {
            label: t("guard.openLead"),
            onClick: () =>
              void navigate({ to: "/crm/leads/$leadId", params: { leadId: existing.id } }),
          },
        });
        return;
      }
      if (email.trim() || phone.trim()) {
        const { data: contact, error: contactErr } = await supabase
          .from("contacts")
          .insert({
            full_name: name.trim(),
            email: email.trim() || null,
            phone: phone.trim() || null,
            owner_id: user?.id ?? null,
            organization_id: user!.organizationId!,
          })
          .select()
          .single();
        if (contactErr) throw contactErr;
        contactId = contact.id;
      }
      const newStage = stages?.find((s) => s.key === "new");
      const { error: leadErr } = await supabase.from("leads").insert({
        name: name.trim(),
        company_name: company.trim(),
        contact_id: contactId,
        owner_id: user?.id ?? null,
        organization_id: user!.organizationId!,
        priority,
        expected_revenue: revenue ? Number(revenue) : 0,
        stage_id: newStage?.id ?? null,
        funnel: leadFunnel,
      });
      if (leadErr) {
        if (contactId && parseGuardError(leadErr)?.kind === "duplicate") {
          await supabase.from("contacts").delete().eq("id", contactId);
        }
        throw leadErr;
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["leads"] }),
        qc.invalidateQueries({ queryKey: ["contacts"] }),
      ]);
      toast.success(t("qc.leadCreated"));
      setOpen(false);
      setName("");
      setCompany("");
      setEmail("");
      setPhone("");
      setRevenue("");
      setPriority("Normal");
      setFunnel("Direct Sales");
    } catch (err) {
      toast.error(
        parseGuardError(err)?.kind === "duplicate"
          ? t("guard.dupTitle", { funnel: leadFunnel })
          : describeError(err, t("qc.leadCreateFailed")),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("qc.newLead")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("qc.fullName")}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sanzhar Abenov"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("qc.company")}</Label>
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Kazpost Digital"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("qc.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("qc.phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("qc.expectedRevenue")}</Label>
              <Input
                type="number"
                min={0}
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("qc.priority")}</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as (typeof PRIORITIES)[number])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("qc.funnel")}</Label>
            <Input
              value={funnel}
              onChange={(e) => setFunnel(e.target.value)}
              placeholder="Direct Sales"
              list="funnel-options"
            />
            <datalist id="funnel-options">
              {funnelOptions.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <SubmitButton busy={busy} label={t("qc.createLead")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewCompanyDialog({ trigger }: { trigger: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("companies").insert({
        name: name.trim(),
        industry: industry.trim() || null,
        website: website.trim() || null,
        city: city.trim() || null,
        owner_id: user?.id ?? null,
        organization_id: user!.organizationId!,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["companies"] });
      toast.success(t("qc.companyCreated"));
      setOpen(false);
      setName("");
      setIndustry("");
      setWebsite("");
      setCity("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("qc.companyCreateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("qc.newCompany")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("qc.companyName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("qc.industry")}</Label>
              <Input value={industry} onChange={(e) => setIndustry(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("qc.city")}</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("qc.website")}</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="example.com"
            />
          </div>
          <DialogFooter>
            <SubmitButton busy={busy} label={t("qc.createCompany")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewContactDialog({ trigger }: { trigger: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState<string>("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: companies } = useCompaniesRaw();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("contacts").insert({
        full_name: name.trim(),
        company_id: companyId || null,
        position: position.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        owner_id: user?.id ?? null,
        organization_id: user!.organizationId!,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(t("qc.contactCreated"));
      setOpen(false);
      setName("");
      setCompanyId("");
      setPosition("");
      setEmail("");
      setPhone("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("qc.contactCreateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("qc.newContact")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("qc.fullName")}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("qc.company")}</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("common.none")} />
                </SelectTrigger>
                <SelectContent>
                  {(companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("qc.position")}</Label>
              <Input value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("qc.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("qc.phone")}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <SubmitButton busy={busy} label={t("qc.createContact")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewTaskDialog({ trigger }: { trigger: ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("Normal");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profiles } = useProfilesRaw();
  const canAssignTasks = usePermission("Assign tasks");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      // Without "Assign tasks", every task this dialog creates goes to the
      // creator themself, regardless of what's in local state -- the
      // assignee picker below is hidden in that case, but this is the real
      // enforcement point, not just a UI nicety.
      const finalAssigneeId = canAssignTasks ? assigneeId || user?.id || null : (user?.id ?? null);
      const { error } = await supabase.from("tasks").insert({
        title: title.trim(),
        assignee_id: finalAssigneeId,
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        created_by: user?.id ?? null,
        organization_id: user!.organizationId!,
      });
      if (error) throw error;
      if (finalAssigneeId && finalAssigneeId !== user?.id) {
        void notifyTaskAssigned(finalAssigneeId, title.trim());
      }
      await qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(t("qc.taskCreated"));
      setOpen(false);
      setTitle("");
      setAssigneeId("");
      setPriority("Normal");
      setDueDate("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("qc.taskCreateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("qc.newTask")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("qc.title")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("qc.assignee")}</Label>
              {canAssignTasks ? (
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("qc.me")} />
                  </SelectTrigger>
                  <SelectContent>
                    {(profiles ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex h-9 items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground">
                  {t("qc.me")}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t("qc.priority")}</Label>
              <Select
                value={priority}
                onValueChange={(v) => setPriority(v as (typeof PRIORITIES)[number])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("qc.dueDate")}</Label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <DialogFooter>
            <SubmitButton busy={busy} label={t("qc.createTask")} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
