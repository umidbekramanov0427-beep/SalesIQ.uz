import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Hash,
  KeyRound,
  Loader2,
  Receipt,
  ShieldAlert,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import {
  useDidoxConnect,
  useDidoxStatus,
  useInvoiceSettings,
  useSaveInvoiceSettings,
  type InvoiceSettingsRow,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import {
  formatInvoiceNumber,
  isAccount,
  isCatalogCode,
  isMfo,
  isTin,
} from "@/lib/invoices/invoice";
import { cn, describeError } from "@/lib/utils";

export const Route = createFileRoute("/admin/invoices")({
  head: () => ({ meta: [{ title: "Hisob-faktura va Didox — SalesIQ" }] }),
  component: AdminInvoicesPage,
});

function AdminInvoicesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
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
      </>
    );
  }
  return <InvoiceSettings />;
}

type Form = Pick<
  InvoiceSettingsRow,
  | "company_name"
  | "tin"
  | "vat_reg_code"
  | "account"
  | "bank_mfo"
  | "bank_name"
  | "address"
  | "director"
  | "accountant"
  | "phone"
  | "has_vat"
  | "vat_rate"
  | "prefix"
  | "default_catalog_code"
  | "default_catalog_name"
  | "default_package_code"
  | "default_package_name"
>;

const EMPTY: Form = {
  company_name: "",
  tin: "",
  vat_reg_code: "",
  account: "",
  bank_mfo: "",
  bank_name: "",
  address: "",
  director: "",
  accountant: "",
  phone: "",
  has_vat: true,
  vat_rate: 12,
  prefix: "HF",
  default_catalog_code: "",
  default_catalog_name: "",
  default_package_code: "",
  default_package_name: "",
};

// The company's requisites (they print on every invoice and go to
// Didox), numbering and VAT, defaults for new lines, and the Didox login.
function InvoiceSettings() {
  const { t } = useI18n();
  const { data: cfg, isLoading } = useInvoiceSettings();
  const save = useSaveInvoiceSettings();
  const [form, setForm] = useState<Form>(EMPTY);
  const settings = cfg?.settings ?? null;

  useEffect(() => {
    if (!settings) return;
    const next = { ...EMPTY };
    for (const k of Object.keys(EMPTY) as (keyof Form)[]) {
      const v = settings[k];
      (next as Record<string, unknown>)[k] = v ?? EMPTY[k];
    }
    setForm(next);
  }, [settings]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function onSave() {
    try {
      await save.mutateAsync({ ...form, vat_rate: Number(form.vat_rate) || 0 });
      toast.success(t("inv.settingsSaved"));
    } catch (err) {
      toast.error(
        err instanceof Error && err.message === "MIGRATION_PENDING"
          ? t("inv.migrationPending")
          : describeError(err, t("inv.saveFailed")),
      );
    }
  }

  const input =
    "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50";
  const field = (
    k: keyof Form,
    label: string,
    opts: { check?: (v: string) => boolean; hint?: string; numeric?: boolean; wide?: boolean } = {},
  ) => {
    const v = String(form[k] ?? "");
    const bad = !!opts.check && !!v && !opts.check(v);
    return (
      <label className={cn("block", opts.wide && "sm:col-span-2")}>
        <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">{label}</span>
        <input
          className={cn(input, bad && "border-destructive/60")}
          inputMode={opts.numeric ? "numeric" : undefined}
          value={v}
          onChange={(e) => set(k, e.target.value as never)}
        />
        {(bad || opts.hint) && (
          <span
            className={cn(
              "mt-1 block text-[11.5px]",
              bad ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {bad ? t("inv.badFormat") : opts.hint}
          </span>
        )}
      </label>
    );
  };

  return (
    <>
      <PageHeader
        icon={Receipt}
        tone="amber"
        title={t("inv.adminTitle")}
        description={t("inv.adminDesc")}
        actions={
          <Link
            to="/invoices"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-accent"
          >
            <Receipt className="h-4 w-4" /> {t("inv.listTitle")}
          </Link>
        }
      />

      {cfg && !cfg.ready ? (
        <SectionCard icon={Receipt} tone="amber" title={t("inv.notReadyTitle")}>
          <p className="text-sm text-muted-foreground">{t("inv.migrationPending")}</p>
        </SectionCard>
      ) : isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </p>
      ) : (
        <div className="space-y-5">
          <SectionCard
            icon={Building2}
            tone="sky"
            title={t("inv.requisitesTitle")}
            description={t("inv.requisitesDesc")}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {field("company_name", t("inv.companyName"), { wide: true })}
              {field("tin", t("inv.tin"), { check: isTin, numeric: true, hint: t("inv.tinHint") })}
              {field("vat_reg_code", t("inv.vatCode"), { numeric: true })}
              {field("account", t("inv.account"), {
                check: isAccount,
                numeric: true,
                hint: t("inv.accountHint"),
              })}
              {field("bank_mfo", t("inv.mfo"), {
                check: isMfo,
                numeric: true,
                hint: t("inv.mfoHint"),
              })}
              {field("bank_name", t("inv.bankName"))}
              {field("phone", t("inv.phone"))}
              {field("address", t("inv.address"), { wide: true })}
              {field("director", t("inv.director"))}
              {field("accountant", t("inv.accountant"))}
            </div>
          </SectionCard>

          <SectionCard
            icon={Hash}
            tone="violet"
            title={t("inv.numberingTitle")}
            description={t("inv.numberingDesc", {
              next: formatInvoiceNumber(form.prefix, settings?.next_number ?? 1),
            })}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {field("prefix", t("inv.prefix"))}
              <label className="flex items-end gap-3">
                <span className="flex h-10 items-center gap-2 text-sm text-foreground">
                  <Switch checked={form.has_vat} onCheckedChange={(v) => set("has_vat", v)} />
                  {t("inv.vatPayer")}
                </span>
                {form.has_vat && (
                  <span className="w-28">
                    <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                      {t("inv.vatRateShort")}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className={input}
                      value={form.vat_rate}
                      onChange={(e) => set("vat_rate", Number(e.target.value))}
                    />
                  </span>
                )}
              </label>
              {field("default_catalog_code", t("inv.defaultMxik"), {
                check: isCatalogCode,
                numeric: true,
                hint: t("inv.mxikHint"),
              })}
              {field("default_catalog_name", t("inv.defaultMxikName"))}
              {field("default_package_code", t("inv.defaultUnitCode"))}
              {field("default_package_name", t("inv.defaultUnitName"))}
            </div>
          </SectionCard>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void onSave()}
              disabled={save.isPending}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
          </div>

          <DidoxCard defaultTin={form.tin} />
        </div>
      )}
    </>
  );
}

function DidoxCard({ defaultTin }: { defaultTin: string }) {
  const { t } = useI18n();
  const status = useDidoxStatus();
  const connect = useDidoxConnect();
  const [tin, setTin] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => {
    if (!tin && defaultTin) setTin(defaultTin);
  }, [defaultTin, tin]);
  const s = status.data;

  async function onConnect() {
    try {
      await connect.mutateAsync({
        action: "didox-connect",
        tin: tin.replace(/\s+/g, ""),
        password,
      });
      setPassword("");
      toast.success(t("inv.didoxConnected"));
    } catch (err) {
      toast.error(describeError(err, t("inv.didoxConnectFailed")));
    }
  }

  return (
    <SectionCard
      icon={KeyRound}
      tone="emerald"
      title="Didox"
      description={t("inv.didoxDesc")}
      actions={
        <a
          href="https://didox.uz"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline"
        >
          didox.uz <ExternalLink className="h-3.5 w-3.5" />
        </a>
      }
    >
      {s?.connected ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" /> {t("inv.didoxConnectedAs", { tin: s.tin ?? "" })}
          </span>
          {s.lastError && (
            <span className="text-[13px] text-destructive">
              {t("inv.didoxLastError")}: {s.lastError}
            </span>
          )}
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm(t("inv.didoxDisconnectConfirm"))) return;
              try {
                await connect.mutateAsync({ action: "didox-disconnect" });
              } catch (err) {
                toast.error(describeError(err, t("inv.actionFailed")));
              }
            }}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[13px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Unplug className="h-4 w-4" /> {t("inv.didoxDisconnect")}
          </button>
        </div>
      ) : s && !s.ready ? (
        <p className="text-sm text-muted-foreground">{t("inv.migrationPending")}</p>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-foreground/85">
            <li>{t("inv.didoxStep1")}</li>
            <li>{t("inv.didoxStep2")}</li>
            <li>{t("inv.didoxStep3")}</li>
          </ol>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label>
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                {t("inv.tin")}
              </span>
              <input
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50"
                inputMode="numeric"
                value={tin}
                onChange={(e) => setTin(e.target.value)}
              />
            </label>
            <label>
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                {t("inv.didoxPassword")}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void onConnect()}
              disabled={!isTin(tin) || !password || connect.isPending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {connect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("inv.didoxConnect")}
            </button>
          </div>
          <p className="text-[12px] text-muted-foreground">{t("inv.didoxSecurity")}</p>
        </div>
      )}
    </SectionCard>
  );
}
