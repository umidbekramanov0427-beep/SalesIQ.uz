import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpen,
  Building2,
  Check,
  Copy,
  CreditCard,
  Download,
  Eraser,
  Fingerprint,
  Globe2,
  KeyRound,
  Loader2,
  Lock,
  Palette,
  PenLine,
  Plus,
  QrCode,
  Smartphone,
  Trophy,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard } from "@/components/layout/Primitives";
import { MfaCard } from "@/components/settings/MfaCard";
import { AccentColorPicker } from "@/components/settings/AccentColorPicker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import {
  useMyOrganization,
  useOrgSubscriptionPayments,
  useSecuritySettings,
  useUpdateSecuritySettings,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { apiFetch } from "@/lib/api";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { HELP_ARTICLES, HELP_GROUPS, pick } from "@/lib/help/articles";
import { PLAN_LABELS, type Plan } from "@/lib/plan-gating";
import { useOrgAccess } from "@/lib/use-org-access";
import {
  COUNTRIES,
  DATE_FORMATS,
  DEFAULT_STATUSES,
  FONT_SIZES,
  FONT_ZOOM,
  PREF_CURRENCIES,
  SHAPE_SIZES,
  SHAPE_ZOOM,
  TIME_FORMATS,
  TIME_ZONES,
  applyLook,
  readPrefs,
  vcardCode,
  type ProfilePrefs,
} from "@/lib/profile-prefs";
import { qrDataUrl, qrSvg } from "@/lib/qr";
import { cn, describeError } from "@/lib/utils";
import {
  NeedsMigrationError,
  useMyProfile,
  useSaveMyProfile,
  type MyProfilePatch,
} from "./my-profile";

// Sozlamalar → Profil: 5CRM's profile window (a ring of ten sections around
// the avatar) laid out the admin-panel way -- one card per subject, the
// section list on the left of the settings page. Every function of theirs
// is here: personal data and statuses, results, signature and QR business
// card, subscription, statistics, business details, guides, security and
// the look.

export const fieldCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary disabled:opacity-60";

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12.5px] font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

function useSaver() {
  const { t } = useI18n();
  const save = useSaveMyProfile();
  return {
    pending: save.isPending,
    run: async (patch: MyProfilePatch, ok = t("pf.saved")) => {
      try {
        await save.mutateAsync(patch);
        toast.success(ok);
        return true;
      } catch (err) {
        toast.error(
          err instanceof NeedsMigrationError
            ? t("pf.needDb")
            : describeError(err, t("pf.saveFailed")),
        );
        return false;
      }
    },
  };
}

function SaveButton({
  pending,
  onClick,
  label,
}: {
  pending: boolean;
  onClick: () => void;
  label?: string;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={onClick}
      className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      {label ?? t("pf.save")}
    </button>
  );
}

/* ---------------------------- 1. Shaxsiy ma'lumot ---------------------------- */

export function PersonalSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: me, isLoading } = useMyProfile();
  const saver = useSaver();
  const [f, setF] = useState({
    gender: "",
    full_name: "",
    last_name: "",
    phone: "",
    birth_date: "",
    address: "",
    city: "",
    position: "",
  });
  const [statuses, setStatuses] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [prefs, setPrefs] = useState<ProfilePrefs>(readPrefs(null));
  const [emailConfirmed, setEmailConfirmed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!me) return;
    setF({
      gender: me.gender ?? "",
      full_name: me.full_name ?? "",
      last_name: me.last_name ?? "",
      phone: me.phone ?? "",
      birth_date: me.birth_date ?? "",
      address: me.address ?? "",
      city: me.city ?? "",
      position: me.position ?? "",
    });
    setStatuses(me.statuses ?? [...DEFAULT_STATUSES].map((k) => t(`pf.status.${k}`)));
    setStatus(me.status_text ?? "");
    setPrefs(readPrefs(me.prefs));
  }, [me, t]);

  useEffect(() => {
    void supabase.auth
      .getUser()
      .then(({ data }) => setEmailConfirmed(!!data.user?.email_confirmed_at));
  }, []);

  async function sendEmailCode() {
    const { error } = await supabase.auth.resend({ type: "signup", email: user!.email });
    if (error) toast.error(t("pf.emailNoMail"));
    else toast.success(t("pf.emailSent"));
  }

  if (isLoading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.full_name.trim()) {
      toast.error(t("pf.nameRequired"));
      return;
    }
    await saver.run({
      full_name: f.full_name.trim(),
      last_name: f.last_name.trim() || null,
      gender: f.gender || null,
      phone: f.phone.trim() || null,
      birth_date: f.birth_date || null,
      address: f.address.trim() || null,
      city: f.city.trim() || null,
      position: f.position.trim(),
      statuses,
      status_text: status || null,
      prefs: { ...(me?.prefs as object), ...prefs },
    });
  }

  return (
    <div className="space-y-5">
      <SectionCard
        icon={User}
        tone="primary"
        title={t("pf.nav.personal")}
        description={t("pf.personalDesc")}
      >
        <div className="mb-4 flex gap-2">
          {(["male", "female"] as const).map((g) => (
            <label
              key={g}
              className={cn(
                "inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-[13px] font-semibold",
                f.gender === g
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              <input
                type="radio"
                name="gender"
                className="sr-only"
                checked={f.gender === g}
                onChange={() => setF({ ...f, gender: g })}
              />
              {t(`pf.gender.${g}`)}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("pf.firstName")}>
            <input value={f.full_name} onChange={set("full_name")} className={fieldCls} />
          </Field>
          <Field label={t("pf.lastName")}>
            <input value={f.last_name} onChange={set("last_name")} className={fieldCls} />
          </Field>
          <Field
            label={t("pf.email")}
            hint={
              emailConfirmed === false ? (
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-destructive">{t("pf.emailUnconfirmed")}</span>
                  <button
                    type="button"
                    onClick={() => void sendEmailCode()}
                    className="font-semibold text-primary hover:underline"
                  >
                    {t("pf.emailGetCode")}
                  </button>
                </span>
              ) : emailConfirmed ? (
                <span className="font-semibold text-success">{t("pf.emailConfirmed")}</span>
              ) : null
            }
          >
            <input value={user?.email ?? ""} disabled className={fieldCls} />
          </Field>
          <Field label={t("pf.address")}>
            <input value={f.address} onChange={set("address")} className={fieldCls} />
          </Field>
          <Field label={t("pf.phone")}>
            <input
              value={f.phone}
              onChange={set("phone")}
              placeholder="+998 90 123 45 67"
              className={fieldCls}
            />
          </Field>
          <Field label={t("pf.birthDate")}>
            <input
              type="date"
              value={f.birth_date}
              onChange={set("birth_date")}
              className={fieldCls}
            />
          </Field>
          <Field label={t("pf.city")}>
            <input value={f.city} onChange={set("city")} className={fieldCls} />
          </Field>
          <Field label={t("pf.position")}>
            <input value={f.position} onChange={set("position")} className={fieldCls} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        icon={Check}
        tone="emerald"
        title={t("pf.statuses")}
        description={t("pf.statusesDesc")}
      >
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <span
              key={s}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12.5px] font-semibold",
                status === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              <button type="button" onClick={() => setStatus(status === s ? "" : s)}>
                {s}
              </button>
              <button
                type="button"
                aria-label={t("pf.remove")}
                onClick={() => {
                  setStatuses(statuses.filter((x) => x !== s));
                  if (status === s) setStatus("");
                }}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value.slice(0, 40))}
            placeholder={t("pf.statusNew")}
            className={cn(fieldCls, "max-w-xs")}
          />
          <button
            type="button"
            disabled={!newStatus.trim() || statuses.includes(newStatus.trim())}
            onClick={() => {
              setStatuses([...statuses, newStatus.trim()]);
              setNewStatus("");
            }}
            className="ctl-soft inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {t("pf.add")}
          </button>
        </div>
      </SectionCard>

      <SectionCard icon={Globe2} tone="sky" title={t("pf.system")} description={t("pf.systemDesc")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("pf.timezone")}>
            <select
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
              className={fieldCls}
            >
              {TIME_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("pf.country")}>
            <select
              value={prefs.country}
              onChange={(e) => setPrefs({ ...prefs, country: e.target.value })}
              className={fieldCls}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {t(`pf.countryName.${c.code}`)} ({c.dial})
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("pf.dateFormat")}>
            <select
              value={prefs.dateFormat}
              onChange={(e) =>
                setPrefs({ ...prefs, dateFormat: e.target.value as ProfilePrefs["dateFormat"] })
              }
              className={fieldCls}
            >
              {DATE_FORMATS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("pf.timeFormat")}>
            <select
              value={prefs.timeFormat}
              onChange={(e) =>
                setPrefs({ ...prefs, timeFormat: e.target.value as ProfilePrefs["timeFormat"] })
              }
              className={fieldCls}
            >
              {TIME_FORMATS.map((d) => (
                <option key={d} value={d}>
                  {t(`pf.time.${d}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("pf.currency")}>
            <select
              value={prefs.currency}
              onChange={(e) =>
                setPrefs({ ...prefs, currency: e.target.value as ProfilePrefs["currency"] })
              }
              className={fieldCls}
            >
              {PREF_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <SaveButton pending={saver.pending} onClick={() => void save()} />
      </div>
    </div>
  );
}

/* ------------------------------ lead figures ------------------------------ */

type LeadFigure = {
  owner_id: string | null;
  budget: number | null;
  created_at: string;
  stage_changed_at: string | null;
  pipeline_stages: { is_won: boolean | null; is_lost: boolean | null } | null;
};

function useLeadFigures(scope: "mine" | "org") {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile-figures", scope, user?.id],
    enabled: !!user?.organizationId,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("owner_id, budget, created_at, stage_changed_at, pipeline_stages(is_won, is_lost)")
        .eq("organization_id", user!.organizationId!)
        .is("amocrm_id", null)
        .limit(10_000);
      if (scope === "mine") q = q.eq("owner_id", user!.id);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as LeadFigure[];
      const month = new Date();
      month.setDate(1);
      month.setHours(0, 0, 0, 0);
      const inMonth = (iso: string | null) => !!iso && new Date(iso) >= month;
      const won = rows.filter((r) => r.pipeline_stages?.is_won);
      const lost = rows.filter((r) => r.pipeline_stages?.is_lost);
      const open = rows.filter((r) => !r.pipeline_stages?.is_won && !r.pipeline_stages?.is_lost);
      const sum = (list: LeadFigure[]) => list.reduce((s, r) => s + Number(r.budget ?? 0), 0);
      return {
        leads: rows.length,
        monthLeads: rows.filter((r) => inMonth(r.created_at)).length,
        won: won.length,
        monthWon: won.filter((r) => inMonth(r.stage_changed_at)).length,
        lost: lost.length,
        open: open.length,
        revenue: sum(won),
        monthRevenue: sum(won.filter((r) => inMonth(r.stage_changed_at))),
        agreed: sum(open),
        conversion: rows.length ? Math.round((won.length / rows.length) * 1000) / 10 : 0,
      };
    },
  });
}

function Figure({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1.5 text-[24px] font-extrabold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ------------------------------- 2. Natijalarim ------------------------------- */

export function ResultsSection() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { data, isLoading } = useLeadFigures("mine");
  return (
    <SectionCard
      icon={Trophy}
      tone="amber"
      title={t("pf.nav.results")}
      description={t("pf.resultsDesc")}
    >
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : !data || data.leads === 0 ? (
        <div className="grid place-items-center gap-2 py-10 text-center text-muted-foreground">
          <BarChart3 className="h-7 w-7" />
          <p className="text-[13px]">{t("pf.resultsEmpty")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure
            label={t("pf.r.monthWon")}
            value={data.monthWon}
            sub={format(data.monthRevenue)}
          />
          <Figure label={t("pf.r.monthLeads")} value={data.monthLeads} />
          <Figure label={t("pf.r.conversion")} value={`${data.conversion}%`} />
          <Figure label={t("pf.r.won")} value={data.won} sub={format(data.revenue)} />
          <Figure label={t("pf.r.open")} value={data.open} sub={format(data.agreed)} />
          <Figure label={t("pf.r.lost")} value={data.lost} />
        </div>
      )}
    </SectionCard>
  );
}

/* ---------------------------- 5. Statistika ---------------------------- */

export function StatsSection() {
  const { t } = useI18n();
  const { format } = useCurrency();
  const { user } = useAuth();
  const scope = user?.role === "sotuv_menejeri" ? "mine" : "org";
  const { data, isLoading } = useLeadFigures(scope);
  return (
    <SectionCard
      icon={BarChart3}
      tone="violet"
      title={t("pf.nav.stats")}
      description={t(`pf.statsDesc.${scope}`)}
    >
      {isLoading || !data ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Figure label={t("pf.s.total")} value={format(data.revenue)} />
          <Figure label={t("pf.s.month")} value={format(data.monthRevenue)} />
          <Figure label={t("pf.s.agreed")} value={format(data.agreed)} />
          <Figure label={t("pf.s.monthLeads")} value={data.monthLeads} />
        </div>
      )}
    </SectionCard>
  );
}

/* --------------------------- 3. Imzo va vizitka --------------------------- */

function SignaturePad({
  value,
  onSave,
  pending,
}: {
  value: string | null;
  onSave: (png: string | null) => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = value;
    }
  }, [value]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) * c.width) / r.width,
      y: ((e.clientY - r.top) * c.height) / r.height,
    };
  };

  return (
    <div>
      <canvas
        ref={ref}
        width={720}
        height={200}
        aria-label={t("pf.signatureArea")}
        onPointerDown={(e) => {
          const ctx = ref.current!.getContext("2d")!;
          const p = point(e);
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(
            "--foreground",
          )
            ? "#1e3a8a"
            : "#000";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          drawing.current = true;
          ref.current!.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = ref.current!.getContext("2d")!;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setDirty(true);
        }}
        onPointerUp={() => (drawing.current = false)}
        className="h-[150px] w-full touch-none rounded-xl border border-dashed border-border bg-white"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            setDirty(true);
          }}
          className="ctl-soft inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold"
        >
          <Eraser className="h-4 w-4" /> {t("pf.clear")}
        </button>
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={() => {
            const c = ref.current!;
            const blank = !c
              .getContext("2d")!
              .getImageData(0, 0, c.width, c.height)
              .data.some((v, i) => i % 4 === 3 && v > 0);
            onSave(blank ? null : c.toDataURL("image/png"));
            setDirty(false);
          }}
          className="ctl-lit inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {t("pf.signatureSave")}
        </button>
      </div>
    </div>
  );
}

export function SignatureSection() {
  const { t } = useI18n();
  const { data: me } = useMyProfile();
  const saver = useSaver();
  const code = me?.vcard_code ?? null;
  const link =
    code && typeof window !== "undefined" ? `${window.location.origin}/card/${code}` : "";
  const qr = useMemo(() => (link ? qrDataUrl(link) : ""), [link]);

  function download() {
    const blob = new Blob([qrSvg(link)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vizitka-qr.svg";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-5">
      <SectionCard
        icon={PenLine}
        tone="primary"
        title={t("pf.signature")}
        description={t("pf.signatureDesc")}
      >
        <SignaturePad
          value={me?.signature_data ?? null}
          pending={saver.pending}
          onSave={(png) => void saver.run({ signature_data: png }, t("pf.signatureSaved"))}
        />
      </SectionCard>
      <SectionCard
        icon={QrCode}
        tone="emerald"
        title={t("pf.vcard")}
        description={t("pf.vcardDesc")}
        actions={
          code ? (
            <button
              type="button"
              onClick={() => void saver.run({ vcard_code: null }, t("pf.vcardDeleted"))}
              className="text-[13px] font-semibold text-destructive hover:underline"
            >
              {t("pf.delete")}
            </button>
          ) : (
            <button
              type="button"
              disabled={saver.pending}
              onClick={() => void saver.run({ vcard_code: vcardCode() }, t("pf.vcardMade"))}
              className="ctl-lit inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold"
            >
              <Plus className="h-4 w-4" /> {t("pf.vcardMake")}
            </button>
          )
        }
      >
        {code ? (
          <div className="flex flex-wrap items-start gap-5">
            <img
              src={qr}
              alt={t("pf.vcard")}
              className="h-40 w-40 rounded-lg border border-border bg-white p-1"
            />
            <div className="min-w-0 flex-1 space-y-3">
              <Field label={t("pf.vcardLink")}>
                <div className="flex gap-2">
                  <input readOnly value={link} className={fieldCls} />
                  <button
                    type="button"
                    aria-label={t("pf.copy")}
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(link)
                        .then(() => toast.success(t("pf.copied")))
                    }
                    className="ctl-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </Field>
              <div className="flex flex-wrap gap-3 text-[13px] font-semibold">
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {t("pf.vcardOpen")}
                </a>
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Download className="h-3.5 w-3.5" /> {t("pf.vcardDownload")}
                </button>
              </div>
              <p className="text-[12px] text-muted-foreground">{t("pf.vcardHint")}</p>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">{t("pf.vcardNone")}</p>
        )}
      </SectionCard>
    </div>
  );
}

/* ----------------------------- 4. Obunalar ----------------------------- */

const stamp = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

export function SubscriptionSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const access = useOrgAccess();
  const { data: payments = [] } = useOrgSubscriptionPayments();
  const plan = (user?.orgPlan ?? "start_iq") as Plan;
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return (
    <div className="space-y-5">
      <SectionCard
        icon={CreditCard}
        tone="primary"
        title={t("pf.nav.subscription")}
        description={t("pf.subDesc")}
      >
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("pf.sub.plan")}
            </p>
            <p className="mt-1 text-[18px] font-extrabold text-foreground">
              {PLAN_LABELS[plan] ?? plan}
              <span
                className={cn(
                  "ml-2 rounded-full border px-2 py-0.5 align-middle text-[11px] font-bold",
                  access.phase === "expired"
                    ? "border-destructive/50 text-destructive"
                    : "border-success/50 text-success",
                )}
              >
                {t(`pf.sub.phase.${access.phase}`)}
              </span>
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {t("pf.sub.until")}: {stamp(user?.orgTrialEndsAt)}
              {access.trialDaysLeft !== null &&
                ` · ${t("pf.sub.daysLeft", { n: access.trialDaysLeft })}`}
            </p>
          </div>
          {isAdmin && (
            <Link
              to="/billing"
              className="ctl-lit inline-flex h-10 items-center rounded-xl px-5 text-sm font-semibold"
            >
              {t("pf.sub.pay")}
            </Link>
          )}
        </div>
      </SectionCard>
      <SectionCard icon={CreditCard} tone="sky" title={t("pf.sub.history")}>
        {payments.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("pf.sub.historyEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">{t("pf.sub.date")}</th>
                  <th className="py-2 pr-3">{t("pf.sub.what")}</th>
                  <th className="py-2 pr-3">{t("pf.sub.via")}</th>
                  <th className="py-2 pr-3 text-right">{t("pf.sub.amount")}</th>
                  <th className="py-2 text-right">{t("pf.sub.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => {
                  const row = p as typeof p & { months?: number | null };
                  return (
                    <tr key={p.id}>
                      <td className="py-2 pr-3 tabular-nums">{stamp(p.created_at)}</td>
                      <td className="py-2 pr-3">
                        {PLAN_LABELS[p.plan as Plan] ?? p.plan}
                        {row.months ? ` · ${t("pf.sub.months", { n: row.months })}` : ""}
                      </td>
                      <td className="py-2 pr-3 capitalize">{p.provider}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {Number(p.amount).toLocaleString("ru-RU")}
                      </td>
                      <td className="py-2 text-right">{t(`pf.sub.st.${p.status}`)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

/* --------------------------- 7. Biznes ma'lumoti --------------------------- */

export function BusinessInfoSection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: org } = useMyOrganization();
  const { data: me } = useMyProfile();
  const access = useOrgAccess();
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth
      .getUser()
      .then(({ data }) => setLastSignIn(data.user?.last_sign_in_at ?? null));
  }, []);
  const o = (org ?? {}) as { name?: string; subdomain?: string | null; created_at?: string | null };
  const Row = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-right text-[13.5px] font-semibold text-foreground">{value}</span>
    </div>
  );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SectionCard icon={Building2} tone="primary" title={t("pf.biz.title")}>
        <Row label={t("pf.biz.name")} value={o.name ?? "—"} />
        <Row
          label={t("pf.biz.subdomain")}
          value={o.subdomain ? `${o.subdomain}.salesiq.uz` : "—"}
        />
        <Row
          label={t("pf.sub.plan")}
          value={PLAN_LABELS[(user?.orgPlan ?? "start_iq") as Plan] ?? user?.orgPlan}
        />
        <Row label={t("pf.biz.state")} value={t(`pf.sub.phase.${access.phase}`)} />
        <Row label={t("pf.biz.registered")} value={stamp(o.created_at)} />
        <Row label={t("pf.sub.until")} value={stamp(user?.orgTrialEndsAt)} />
      </SectionCard>
      <SectionCard icon={User} tone="sky" title={t("pf.biz.account")}>
        <Row label={t("pf.email")} value={user?.email ?? "—"} />
        <Row label={t("pf.biz.role")} value={t(`pf.role.${user?.role ?? "sotuv_menejeri"}`)} />
        <Row label={t("pf.biz.created")} value={stamp(me?.created_at)} />
        <Row label={t("pf.biz.lastSignIn")} value={stamp(lastSignIn)} />
      </SectionCard>
    </div>
  );
}

/* ----------------------------- 8. Qo'llanmalar ----------------------------- */

export function GuidesSection() {
  const { t, lang } = useI18n();
  return (
    <SectionCard
      icon={BookOpen}
      tone="amber"
      title={t("pf.nav.guides")}
      description={t("pf.guidesDesc")}
    >
      <div className="space-y-5">
        {HELP_GROUPS.map((g) => {
          const list = HELP_ARTICLES.filter((a) => a.group === g);
          if (list.length === 0) return null;
          return (
            <div key={g}>
              <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
                {t(`help.group.${g}`)}
              </p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {list.map((a) => (
                  <li key={a.slug} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-semibold text-foreground">
                        {pick(a.title, lang)}
                      </p>
                      <p className="line-clamp-1 text-[12.5px] text-muted-foreground">
                        {pick(a.summary, lang)}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-[12px] text-muted-foreground sm:block">
                      {t("pf.guideSteps", { n: a.steps.length })}
                    </span>
                    <Link
                      to="/help/$slug"
                      params={{ slug: a.slug }}
                      className="shrink-0 text-[13px] font-semibold text-primary hover:underline"
                    >
                      {t("pf.guideRead")}
                    </Link>
                    <Link
                      to="/help/$slug"
                      params={{ slug: a.slug }}
                      search={{ print: true }}
                      className="shrink-0 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      PDF
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/* ------------------------------ 9. Xavfsizlik ------------------------------ */

function PasswordCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  async function change() {
    if (next.length < 8) {
      toast.error(t("pf.pw.short"));
      return;
    }
    if (next !== again) {
      toast.error(t("pf.pw.mismatch"));
      return;
    }
    setBusy(true);
    try {
      // The current password first: a session left open is not enough.
      const check = await supabase.auth.signInWithPassword({ email: user!.email, password: cur });
      if (check.error) throw new Error(t("pf.pw.wrong"));
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) throw error;
      setCur("");
      setNext("");
      setAgain("");
      toast.success(t("pf.pw.changed"));
    } catch (err) {
      toast.error(describeError(err, t("pf.saveFailed")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard
      icon={KeyRound}
      tone="primary"
      title={t("pf.pw.title")}
      description={t("pf.pw.desc")}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("pf.pw.current")}>
          <input
            type="password"
            autoComplete="current-password"
            value={cur}
            onChange={(e) => setCur(e.target.value)}
            className={fieldCls}
          />
        </Field>
        <Field label={t("pf.pw.new")}>
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={fieldCls}
          />
        </Field>
        <Field label={t("pf.pw.again")}>
          <input
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className={fieldCls}
          />
        </Field>
      </div>
      <div className="mt-4">
        <SaveButton pending={busy} onClick={() => void change()} label={t("pf.pw.change")} />
      </div>
    </SectionCard>
  );
}

function QuickLoginCard() {
  const { t } = useI18n();
  const [link, setLink] = useState<string | null>(null);
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!link) return;
    const id = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setLink(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [link]);
  async function make() {
    setBusy(true);
    try {
      const res = await apiFetch("/account/quick-login", { method: "POST" });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? t("pf.saveFailed"));
      setLink(json.url);
      setLeft(120);
    } catch (err) {
      toast.error(describeError(err, t("pf.saveFailed")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SectionCard
      icon={Smartphone}
      tone="emerald"
      title={t("pf.quick.title")}
      description={t("pf.quick.desc")}
    >
      {link ? (
        <div className="flex flex-wrap items-center gap-5">
          <img
            src={qrDataUrl(link)}
            alt={t("pf.quick.title")}
            className="h-44 w-44 rounded-lg border border-border bg-white p-1"
          />
          <div className="space-y-2 text-[13px]">
            <p className="font-semibold text-warning">{t("pf.quick.secret")}</p>
            <p className="text-muted-foreground">{t("pf.quick.left", { n: left })}</p>
            <button
              type="button"
              onClick={() => setLink(null)}
              className="font-semibold text-primary hover:underline"
            >
              {t("pf.quick.hide")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void make()}
          className="ctl-lit inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
          {t("pf.quick.make")}
        </button>
      )}
    </SectionCard>
  );
}

function OrgLocksCard() {
  const { t } = useI18n();
  const { data: s } = useSecuritySettings();
  const update = useUpdateSecuritySettings();
  const { data: bound = [], refetch } = useQuery({
    queryKey: ["bound-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, bound_device_id")
        .not("bound_device_id", "is", null);
      if (error) return [];
      return data as { id: string; full_name: string; bound_device_id: string }[];
    },
  });
  async function unlock(id: string) {
    const res = await apiFetch("/account/device-unlock", {
      method: "POST",
      body: JSON.stringify({ profileId: id }),
    });
    if (res.ok) {
      toast.success(t("pf.lock.freed"));
      void refetch();
    } else toast.error(t("pf.saveFailed"));
  }
  const toggle = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onSuccess: () => toast.success(t("pf.saved")),
      onError: () => toast.error(t("pf.needDb")),
    });
  return (
    <SectionCard icon={Lock} tone="rose" title={t("pf.lock.title")} description={t("pf.lock.desc")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
          <div>
            <p className="text-[14px] font-semibold text-foreground">{t("pf.lock.ip")}</p>
            <p className="text-[12.5px] text-muted-foreground">{t("pf.lock.ipDesc")}</p>
            <Link
              to="/admin/security"
              className="text-[12.5px] font-semibold text-primary hover:underline"
            >
              {t("pf.lock.ipList")}
            </Link>
          </div>
          <Switch
            checked={!!s?.ip_allowlist_enabled}
            onCheckedChange={(v) => toggle({ ip_allowlist_enabled: v })}
          />
        </div>
        <div className="rounded-xl border border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-foreground">{t("pf.lock.device")}</p>
              <p className="text-[12.5px] text-muted-foreground">{t("pf.lock.deviceDesc")}</p>
            </div>
            <Switch
              checked={!!s?.device_lock}
              onCheckedChange={(v) => toggle({ device_lock: v })}
            />
          </div>
          {bound.length > 0 && (
            <ul className="mt-3 divide-y divide-border border-t border-border">
              {bound.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className="font-semibold">{b.full_name}</span>
                  <button
                    type="button"
                    onClick={() => void unlock(b.id)}
                    className="font-semibold text-primary hover:underline"
                  >
                    {t("pf.lock.free")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function SecuritySection() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  return (
    <div className="space-y-5">
      {user?.role === "platform_owner" && (
        <SectionCard icon={Lock} tone="rose" title={t("pf.nav.security")}>
          <Link
            to="/platform/settings"
            search={{ tab: "security" }}
            className="ctl-soft inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold"
          >
            {t("os.tab.security")}
          </Link>
        </SectionCard>
      )}
      <PasswordCard />
      <MfaCard />
      <SectionCard
        icon={Fingerprint}
        tone="violet"
        title={t("pf.passkey.title")}
        description={t("pf.passkey.desc")}
      >
        <button
          type="button"
          disabled
          title={t("pf.passkey.soon")}
          className="ctl-soft inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-semibold opacity-60"
        >
          <Plus className="h-4 w-4" /> {t("pf.passkey.add")}
        </button>
        <p className="mt-2 text-[12px] text-muted-foreground">{t("pf.passkey.soon")}</p>
      </SectionCard>
      <QuickLoginCard />
      {isAdmin && <OrgLocksCard />}
    </div>
  );
}

/* ------------------------------ 10. Ko'rinish ------------------------------ */

export function AppearanceSection() {
  const { t } = useI18n();
  const { unit, setUnit } = useCurrency();
  const { user } = useAuth();
  const { data: me } = useMyProfile();
  const saver = useSaver();
  const prefs = readPrefs(me?.prefs);
  const [font, setFont] = useState(prefs.fontSize);
  const [shape, setShape] = useState(prefs.shapeSize);
  useEffect(() => {
    setFont(readPrefs(me?.prefs).fontSize);
    setShape(readPrefs(me?.prefs).shapeSize);
  }, [me?.prefs]);

  async function choose(next: { fontSize?: typeof font; shapeSize?: typeof shape }) {
    const look = { fontSize: next.fontSize ?? font, shapeSize: next.shapeSize ?? shape };
    setFont(look.fontSize);
    setShape(look.shapeSize);
    applyLook(look);
    await saver.run({ prefs: { ...(me?.prefs as object), ...look } }, t("pf.saved"));
  }

  const Tile = ({
    on,
    label,
    sub,
    onClick,
    size,
  }: {
    on: boolean;
    label: string;
    sub: string;
    onClick: () => void;
    size: number;
  }) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border px-3 py-3 transition-colors",
        on
          ? "border-primary text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="font-bold" style={{ fontSize: size }}>
        Aa
      </span>
      <span className="text-[12.5px] font-semibold">{label}</span>
      <span className="text-[11px] tabular-nums">{sub}</span>
    </button>
  );

  return (
    <div className="space-y-5">
      <SectionCard
        icon={Palette}
        tone="violet"
        title={t("pf.look.font")}
        description={t("pf.look.fontDesc")}
      >
        <div className="grid grid-cols-4 gap-2">
          {FONT_SIZES.map((s) => (
            <Tile
              key={s}
              on={font === s}
              label={t(`pf.look.f.${s}`)}
              sub={`${Math.round(FONT_ZOOM[s] * 100)}%`}
              size={14 * FONT_ZOOM[s]}
              onClick={() => void choose({ fontSize: s })}
            />
          ))}
        </div>
      </SectionCard>
      <SectionCard
        icon={Palette}
        tone="sky"
        title={t("pf.look.shape")}
        description={t("pf.look.shapeDesc")}
      >
        <div className="grid grid-cols-4 gap-2">
          {SHAPE_SIZES.map((s) => (
            <Tile
              key={s}
              on={shape === s}
              label={t(`pf.look.s.${s}`)}
              sub={`${Math.round(SHAPE_ZOOM[s] * 100)}%`}
              size={14}
              onClick={() => void choose({ shapeSize: s })}
            />
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-border p-4">
          <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("pf.look.sample")}
          </p>
          <div style={{ zoom: FONT_ZOOM[font] }}>
            <p className="text-[14px] font-semibold text-foreground">{t("pf.look.sampleLead")}</p>
            <p className="text-[12.5px] text-muted-foreground">{t("pf.look.sampleText")}</p>
            <div className="mt-2 flex gap-2" style={{ zoom: SHAPE_ZOOM[shape] }}>
              <span className="ctl-lit inline-flex h-9 items-center rounded-xl px-4 text-[13px] font-semibold">
                {t("pf.look.sampleCall")}
              </span>
              <span className="ctl-soft inline-flex h-9 items-center rounded-xl px-4 text-[13px] font-semibold">
                {t("pf.look.sampleNote")}
              </span>
            </div>
          </div>
        </div>
      </SectionCard>
      <SectionCard
        icon={Palette}
        tone="emerald"
        title={t("settings.nav.personalization")}
        description={t("settings.personalizationDesc")}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {user?.role !== "sotuv_menejeri" && (
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-3 text-[13px] font-semibold text-foreground">
                {t("settings.currency")}
              </p>
              <SegmentedControl value={unit} options={CURRENCIES} onChange={setUnit} />
            </div>
          )}
          <AccentColorPicker />
        </div>
      </SectionCard>
    </div>
  );
}
