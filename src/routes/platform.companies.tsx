import { useMemo, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  LayoutGrid,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
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
import { useQueryClient } from "@tanstack/react-query";
import {
  useCompanyDirectory,
  useUpdateUserAsOwner,
  type CompanyDirectoryEntry,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/platform/companies")({
  head: () => ({
    meta: [
      { title: "Kompaniyalar — SalesIQ" },
      {
        name: "description",
        content: "Platform owner: choose which company to continue into.",
      },
    ],
  }),
  component: CompaniesPage,
});

function copyValue(value: string, label: string) {
  void navigator.clipboard.writeText(value).then(() => toast.success(`${label} nusxalandi.`));
}

function SetPasswordDialog({ company }: { company: CompanyDirectoryEntry }) {
  const { t } = useI18n();
  const updateUser = useUpdateUserAsOwner();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!company.superAdminId) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!company.superAdminId || password.length < 8) return;
    setBusy(true);
    try {
      await updateUser.mutateAsync({ id: company.superAdminId, password });
      void qc.invalidateQueries({ queryKey: ["company_directory"] });
      toast.success(t("pc.passwordSet"));
      setPassword("");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("pc.passwordFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setPassword("");
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
        >
          <KeyRound className="h-3.5 w-3.5" /> {t("pc.setPassword")}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{company.name}: yangi parol</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor={`new-pw-${company.id}`}>{t("pc.newPasswordPh")}</Label>
            <Input
              id={`new-pw-${company.id}`}
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoFocus
              required
            />
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={busy || password.length < 8}
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

function CompanyRow({ company, index }: { company: CompanyDirectoryEntry; index: number }) {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const canEnter = !!company.login && !!company.password;

  async function enter() {
    if (!company.login || !company.password) return;
    setBusy(true);
    const result = await signIn(company.login, company.password);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${company.name} sifatida kirildi.`);
    void navigate({ to: "/", replace: true });
  }

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3.5 pr-3 text-sm font-bold tabular-nums text-subtle">{index + 1}</td>
      <td className="py-3.5 pr-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{company.name}</p>
            <p className="text-xs text-subtle">{company.plan}</p>
          </div>
          <Pill tone={company.active ? "success" : "neutral"}>
            {company.active ? "Faol" : "Faol emas"}
          </Pill>
        </div>
      </td>
      <td className="px-4 py-3.5 text-center text-sm font-semibold tabular-nums text-foreground">
        {company.employeeCount}
      </td>
      <td className="px-4 py-3.5">
        {company.login ? (
          <button
            type="button"
            onClick={() => copyValue(company.login!, "Login")}
            className="inline-flex items-center gap-1.5 text-sm text-foreground transition-colors hover:text-primary"
            title={t("pc.copy")}
          >
            <span className="truncate">{company.login}</span>
            <Copy className="h-3.5 w-3.5 shrink-0 text-subtle" />
          </button>
        ) : (
          <span className="text-sm text-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-3.5">
        {company.password ? (
          <div className="flex items-center gap-2">
            <span className="min-w-[7ch] font-mono text-sm tabular-nums text-foreground">
              {visible ? company.password : "•".repeat(Math.min(company.password.length, 10))}
            </span>
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="shrink-0 text-subtle transition-colors hover:text-foreground"
              title={visible ? t("pc.hide") : t("pc.show")}
            >
              {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => copyValue(company.password!, "Parol")}
              className="shrink-0 text-subtle transition-colors hover:text-foreground"
              title={t("pc.copy")}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-subtle">{t("pc.unknown")}</span>
            <SetPasswordDialog company={company} />
          </div>
        )}
      </td>
      <td className="py-3.5 pl-4 text-right">
        <button
          type="button"
          onClick={() => void enter()}
          disabled={!canEnter || busy}
          title={canEnter ? undefined : t("pc.setPasswordFirst")}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t("pc.enter")}
        </button>
      </td>
    </tr>
  );
}

function CompaniesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data, isLoading, error } = useCompanyDirectory();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const companies = data?.companies ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [data, search]);

  if (user && user.role !== "platform_owner") {
    return (
      <SectionCard
        icon={ShieldAlert}
        tone="rose"
        title={t("pc.restricted")}
        description={t("pc.ownerOnly")}
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> {t("pc.noAccess")}
        </div>
      </SectionCard>
    );
  }

  return (
    <>
      <PageHeader icon={LayoutGrid} tone="sky" title={t("pc.title")} description={t("pc.desc")} />

      <div className="surface-card mb-6 flex flex-wrap items-center justify-between gap-4 border border-primary/20 bg-primary/5 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {data?.owner.name || "Platforma egasi"}
            </p>
            <p className="truncate text-xs text-subtle">{data?.owner.email}</p>
          </div>
          <Pill tone="gold">{t("pc.platformOwner")}</Pill>
        </div>
        <button
          type="button"
          onClick={() => void navigate({ to: "/platform", replace: true })}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("pc.enter")}
        </button>
      </div>

      <SectionCard
        icon={Building2}
        tone="primary"
        title={t("pc.connected")}
        actions={
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("pc.searchPh")}
              className="h-10 w-64 rounded-xl border border-border bg-accent pl-9 pr-3 text-sm outline-none focus:border-primary/40"
            />
          </span>
        }
      >
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-subtle">{t("pc.notFound")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-subtle">
                  <th className="py-2.5 pr-3">#</th>
                  <th className="py-2.5 pr-4">{t("pc.company")}</th>
                  <th className="px-4 py-2.5 text-center">{t("pc.employees")}</th>
                  <th className="px-4 py-2.5">{t("pc.login")}</th>
                  <th className="px-4 py-2.5">{t("pc.password")}</th>
                  <th className="py-2.5 pl-4 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <CompanyRow key={c.id} company={c} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
