import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Globe2,
  Phone,
  Plus,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { checkPhone } from "@/lib/leads/intake-clean";
import {
  PHONE_COUNTRIES,
  countryName,
  displayPhone,
  phoneCountry,
  type CountryCode,
  type PhoneRules,
} from "@/lib/phone-rules";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { usePhoneRules, useUpdateOrgGeneralSettings } from "@/hooks/use-crm-data";
import type { Json } from "@/integrations/supabase/types";

// Admin -> Telefon raqamlari formati: the countries the company's clients
// call from, in order. A number typed without its country code is read as
// the first listed country it fits; every number is stored the same way,
// "+<code><number>" (src/lib/phone-rules.ts). Uzbekistan alone until set.
// A tester on the right shows what any typed number becomes.

export const Route = createFileRoute("/admin/phone-format")({
  head: () => ({ meta: [{ title: "Telefon raqamlari formati — SalesIQ" }] }),
  component: PhoneFormatPage,
});

function useCountryName() {
  const { lang } = useI18n();
  return (code: CountryCode) => countryName(code, lang);
}

function PhoneFormatPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const saved = usePhoneRules();
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<PhoneRules>(saved);
  useEffect(() => setDraft(JSON.parse(savedKey) as PhoneRules), [savedKey]);
  const dirty = JSON.stringify(draft) !== savedKey;
  const update = useUpdateOrgGeneralSettings();
  const canManage = user?.role === "super_admin" || user?.role === "platform_owner";

  if (user && !canManage) {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
        </SectionCard>
      </>
    );
  }

  async function save() {
    try {
      await update.mutateAsync({ phone_rules: draft as unknown as Json });
      toast.success(t("phoneFmt.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && /phone_rules/.test(err.message)
          ? t("phoneFmt.migrationPending")
          : describeError(err, t("phoneFmt.saveFailed")),
      );
    }
  }

  return (
    <>
      <PageHeader
        title={t("phoneFmt.title")}
        description={t("phoneFmt.desc")}
        icon={Phone}
        tone="emerald"
        actions={
          <>
            {dirty && (
              <Button variant="outline" onClick={() => setDraft(saved)}>
                {t("common.cancel")}
              </Button>
            )}
            <Button onClick={() => void save()} disabled={!dirty || update.isPending}>
              {t("common.save")}
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <CountryList rules={draft} onChange={setDraft} />
          <SectionCard icon={Globe2} tone="sky" title={t("phoneFmt.onlyTitle")}>
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span className="text-[13.5px] leading-relaxed text-muted-foreground">
                {t("phoneFmt.onlyDesc")}
              </span>
              <Switch
                checked={draft.onlyListed}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, onlyListed: v }))}
              />
            </label>
          </SectionCard>
        </div>
        <Tester rules={draft} />
      </div>
    </>
  );
}

function CountryList({
  rules,
  onChange,
}: {
  rules: PhoneRules;
  onChange: (r: PhoneRules) => void;
}) {
  const { t } = useI18n();
  const name = useCountryName();
  const rest = PHONE_COUNTRIES.filter((c) => !rules.countries.includes(c.code));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...rules.countries];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange({ ...rules, countries: next });
  };
  return (
    <SectionCard
      icon={Phone}
      tone="emerald"
      title={t("phoneFmt.countries")}
      description={t("phoneFmt.countriesDesc")}
    >
      <ol className="space-y-2">
        {rules.countries.map((code, i) => {
          const c = phoneCountry(code);
          return (
            <li
              key={code}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5",
                i === 0 ? "border-primary/40 bg-primary/[0.04]" : "border-border",
              )}
            >
              <span className="w-5 text-center font-mono text-[12px] text-subtle">{i + 1}</span>
              <span className="text-[26px] leading-none" aria-hidden>
                {c.flag}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-semibold text-foreground">
                    {name(code)}
                  </span>
                  <span className="font-mono text-[12.5px] text-muted-foreground">+{c.dial}</span>
                  {i === 0 && (
                    <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      {t("phoneFmt.main")}
                    </span>
                  )}
                </span>
                <span className="block truncate font-mono text-[12px] text-muted-foreground">
                  {[
                    c.example,
                    c.trunk ? `${c.trunk} ${c.example}` : null,
                    `+${c.dial} ${c.example}`,
                  ]
                    .filter(Boolean)
                    .join("  ·  ")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5">
                <IconBtn label={t("lcolor.up")} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label={t("lcolor.down")}
                  disabled={i === rules.countries.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" />
                </IconBtn>
                <IconBtn
                  label={t("common.delete")}
                  disabled={rules.countries.length === 1}
                  onClick={() =>
                    onChange({ ...rules, countries: rules.countries.filter((x) => x !== code) })
                  }
                >
                  <X className="h-4 w-4" />
                </IconBtn>
              </span>
            </li>
          );
        })}
      </ol>
      {rest.length > 0 && (
        <label className="relative mt-3 flex items-center">
          <Plus className="pointer-events-none absolute left-3 h-4 w-4 text-primary" />
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              onChange({
                ...rules,
                countries: [...rules.countries, e.target.value as CountryCode],
              })
            }
            className="h-10 w-full cursor-pointer appearance-none rounded-xl border border-dashed border-border bg-transparent pl-9 pr-3 text-[13.5px] font-semibold text-primary outline-none transition-colors [color-scheme:light] hover:border-primary/50 focus-visible:border-primary dark:[color-scheme:dark]"
          >
            <option value="">{t("phoneFmt.add")}</option>
            {rest.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {name(c.code)} (+{c.dial})
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {t("phoneFmt.orderHint")}
      </p>
    </SectionCard>
  );
}

function IconBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-25 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

// Type any number and see what it becomes, plus how the listed countries'
// usual ways of writing a number come out.
function Tester({ rules }: { rules: PhoneRules }) {
  const { t } = useI18n();
  const name = useCountryName();
  const [value, setValue] = useState("");
  const samples = useMemo(() => {
    const out: string[] = [];
    for (const code of rules.countries.slice(0, 3)) {
      const c = phoneCountry(code);
      out.push(c.example);
      if (c.trunk) out.push(`${c.trunk} ${c.example}`);
    }
    out.push("+82 10 9876 5121");
    return [...new Set(out)];
  }, [rules.countries]);

  const result = (raw: string) => {
    const r = checkPhone(raw, rules);
    return r.ok
      ? {
          ok: true as const,
          text: displayPhone(r.phone),
          note: r.country ? `${r.country.flag} ${name(r.country.code)}` : "",
        }
      : { ok: false as const, text: t(`phoneFmt.reason.${r.reason}`), note: "" };
  };
  const typed = value.trim() ? result(value) : null;

  return (
    <SectionCard icon={CheckCircle2} tone="violet" title={t("phoneFmt.test")}>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="tel"
        placeholder={t("phoneFmt.testPh")}
        className="h-11 w-full rounded-xl border border-border bg-input px-3.5 font-mono text-[15px] text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-subtle focus:border-primary"
      />
      <div
        className={cn(
          "mt-3 rounded-xl border px-4 py-3 transition-colors",
          !typed
            ? "border-dashed border-border"
            : typed.ok
              ? "border-emerald-500/40 bg-emerald-500/[0.06]"
              : "border-destructive/40 bg-destructive/[0.05]",
        )}
      >
        {!typed ? (
          <p className="text-[13px] text-muted-foreground">{t("phoneFmt.testHint")}</p>
        ) : (
          <div className="flex items-start gap-2.5">
            {typed.ok ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "text-[16px] font-semibold",
                  typed.ok ? "font-mono tabular-nums text-foreground" : "text-destructive",
                )}
              >
                {typed.text}
              </p>
              {typed.note && <p className="text-[12.5px] text-muted-foreground">{typed.note}</p>}
            </div>
          </div>
        )}
      </div>

      <p className="console-caption mb-2 mt-5">{t("phoneFmt.examples")}</p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {samples.map((s) => {
          const r = result(s);
          return (
            <li key={s} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
              <span className="truncate font-mono text-muted-foreground">{s}</span>
              <span
                className={cn(
                  "shrink-0 text-right",
                  r.ok ? "font-mono font-semibold text-foreground" : "text-destructive",
                )}
              >
                {r.text}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
