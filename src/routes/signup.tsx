import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuthSkin } from "@/components/auth/auth-skins";
import { cn } from "@/lib/utils";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  Check,
  Gift,
  Loader2,
  Lock,
  Mail,
  Phone,
  PhoneCall,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { SELF_SIGNUP_TRIAL_DAYS } from "@/lib/org-access";
import {
  AuthBackdrop,
  GlassCard,
  GlassError,
  GlassField,
  GlassHeading,
  GlassSubmit,
  useCardFlip,
} from "@/components/auth/AuthGlass";
import { normalizePlan, PLAN_LABELS, PLANS, SEAT_LIMITS, type Plan } from "@/lib/plan-gating";
import { clearStoredRef, storedRef } from "@/lib/referral";
import { normalizePhone, TEAM_SIZES } from "@/lib/applications";
import {
  BUSINESS_KINDS,
  callDay,
  CURRENT_TOOLS,
  tashkentTime,
  type SlotDay,
} from "@/lib/company-leads";

// Sign-up as a short wizard: the plan, three questions about the business,
// the account, and a time for the first call with SalesIQ. The account is
// created at the end; the answers and the call become the platform owner's
// lead (Owner -> Arizalar, company-leads.server.ts).

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { plan?: Plan | undefined } => ({
    plan:
      search["plan"] === "analyst_iq" || search["plan"] === "master_iq"
        ? search["plan"]
        : search["plan"] === "start_iq"
          ? "start_iq"
          : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign up — SalesIQ" },
      { name: "description", content: "Create your company's SalesIQ workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SignupPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STEPS = ["plan", "business", "account", "call"] as const;
type Step = (typeof STEPS)[number];

type Prices = Record<Plan, number>;

const WEEKDAYS: Record<string, string[]> = {
  uz: ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"],
  ru: ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

function money(n: number): string {
  return n.toLocaleString("ru-RU").replace(/,/g, " ");
}

function SignupPage() {
  const { signIn } = useAuth();
  const { t, lang } = useI18n();
  const { s: skin } = useAuthSkin();
  const navigate = useNavigate();
  const { leaving, flipTo } = useCardFlip();
  const search = Route.useSearch();

  const [step, setStep] = useState<Step>("plan");
  const [plan, setPlan] = useState<Plan>(normalizePlan(search.plan));
  const [prices, setPrices] = useState<Prices | null>(null);
  const [bizKind, setBizKind] = useState<string | null>(null);
  const [bizText, setBizText] = useState("");
  const [salesReps, setSalesReps] = useState<string | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [slots, setSlots] = useState<SlotDay[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [meetingAt, setMeetingAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    biz?: string;
    reps?: string;
    tool?: string;
    fullName?: string;
    companyName?: string;
    phone?: string;
    email?: string;
    password?: string;
    passwordRepeat?: string;
    form?: string;
  }>({});
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<{ code: string; bonusDays: number } | null>(null);
  const [utm, setUtm] = useState<Record<string, string>>({});

  useEffect(() => {
    const code = storedRef();
    if (code) {
      void fetch(`/referral/check?code=${encodeURIComponent(code)}`)
        .then((r) => r.json())
        .then((j: { valid?: boolean; bonusDays?: number }) => {
          if (j.valid) setInvite({ code, bonusDays: j.bonusDays ?? 0 });
          else clearStoredRef();
        })
        .catch(() => undefined);
    }
    void fetch("/api/pricing")
      .then((r) => r.json())
      .then(
        (j: { priceStartIqUzs?: number; priceAnalystIqUzs?: number; priceMasterIqUzs?: number }) =>
          setPrices({
            start_iq: j.priceStartIqUzs ?? 0,
            analyst_iq: j.priceAnalystIqUzs ?? 0,
            master_iq: j.priceMasterIqUzs ?? 0,
          }),
      )
      .catch(() => undefined);
    const q = new URLSearchParams(window.location.search);
    const u: Record<string, string> = {};
    for (const [k, v] of q) if (/^utm_[a-z]{3,10}$/.test(k)) u[k] = v.slice(0, 120);
    setUtm(u);
  }, []);

  // The free call times, fetched when the last step opens.
  useEffect(() => {
    if (step !== "call" || slots) return;
    void fetch("/applications/slots")
      .then((r) => r.json())
      .then((j: { days?: SlotDay[] }) => {
        const days = j.days ?? [];
        setSlots(days);
        setDay(days[0]?.day ?? null);
      })
      .catch(() => setSlots([]));
  }, [step, slots]);

  const index = STEPS.indexOf(step);
  const go = (to: Step) => {
    setErrors({});
    setStep(to);
  };

  function nextFromBusiness() {
    const next: typeof errors = {};
    if (!bizKind && !bizText.trim()) next.biz = t("wiz.bizRequired");
    if (!salesReps) next.reps = t("wiz.repsRequired");
    if (!tool) next.tool = t("wiz.toolRequired");
    setErrors(next);
    if (!Object.keys(next).length) go("account");
  }

  function nextFromAccount() {
    const next: typeof errors = {};
    if (!fullName.trim()) next.fullName = t("signup.fullNameRequired");
    if (!companyName.trim()) next.companyName = t("signup.companyNameRequired");
    const digits = normalizePhone(phone).replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) next.phone = t("wiz.phoneRequired");
    if (!EMAIL_RE.test(email.trim())) next.email = t("login.invalidEmail");
    if (password.length < 8) next.password = t("login.shortPassword");
    else if (password !== passwordRepeat) next.passwordRepeat = t("login.passwordMismatch");
    setErrors(next);
    if (!Object.keys(next).length) go("call");
  }

  async function create() {
    setBusy(true);
    setErrors({});
    const kindLabel = bizKind ? t(`wiz.biz.${bizKind}`) : "";
    const business = [kindLabel, bizText.trim()].filter(Boolean).join(": ");
    try {
      const res = await fetch("/signup/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          plan,
          ref: invite?.code,
          phone: normalizePhone(phone),
          business,
          salesReps,
          currentTool: tool,
          meetingAt,
          utm,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        meetingAt?: string | null;
      };
      if (!res.ok || !json.ok) {
        setErrors({ form: json.error ?? t("signup.failed") });
        setBusy(false);
        return;
      }
      if (invite) clearStoredRef();
      if (meetingAt && !json.meetingAt) toast.message(t("wiz.slotTaken"));
      const result = await signIn(email.trim(), password);
      if (!result.ok) {
        toast.success(t("signup.createdSignInManually"));
        void navigate({ to: "/login" });
        return;
      }
      toast.success(
        json.meetingAt
          ? t("wiz.successCall", {
              day: callDay(json.meetingAt, lang),
              time: tashkentTime(json.meetingAt),
            })
          : t("signup.success"),
      );
      void navigate({ to: "/welcome/telegram", replace: true });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : t("signup.failed") });
      setBusy(false);
    }
  }

  const dayLabel = (d: string) => {
    const date = new Date(`${d}T12:00:00Z`);
    return {
      wd: (WEEKDAYS[lang] ?? WEEKDAYS["uz"]!)[date.getUTCDay()]!,
      dd: String(date.getUTCDate()),
    };
  };
  const daySlots = useMemo(() => slots?.find((d) => d.day === day)?.slots ?? [], [slots, day]);

  return (
    <AuthBackdrop>
      <GlassCard leaving={leaving}>
        <GlassHeading
          title={t(`wiz.title.${step}`)}
          sub={
            step === "plan"
              ? t("auth.signupSub", { n: SELF_SIGNUP_TRIAL_DAYS })
              : t(`wiz.sub.${step}`)
          }
        />
        <Stepper index={index} />
        {invite && step === "plan" && (
          <p className="-mt-1 mb-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-500">
            <Gift className="h-3.5 w-3.5" />
            {t("signup.invited", { n: invite.bonusDays })}
          </p>
        )}

        {step === "plan" && (
          <div className="space-y-2.5">
            {PLANS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                aria-pressed={plan === p}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-[14px] border px-4 py-3.5 text-left transition-colors",
                  plan === p
                    ? "border-primary bg-primary/10 shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_18%,transparent)]"
                    : "border-[var(--ac-line)] bg-[var(--ac-field)] hover:border-[var(--ac-field-border)]",
                )}
              >
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
                    plan === p ? "border-primary bg-primary text-white" : "border-[var(--ac-line)]",
                  )}
                >
                  {plan === p && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[16px] font-semibold text-[var(--ac-text)]">
                      {PLAN_LABELS[p]}
                    </span>
                    {prices && prices[p] > 0 && (
                      <span className="text-[13.5px] font-semibold tabular-nums text-[var(--auth-ink)]">
                        {money(prices[p])} {t("wiz.perMonth")}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--ac-muted)]">
                    {t("wiz.seats", { n: SEAT_LIMITS[p] ?? "∞" })} · {t(`wiz.plan.${p}`)}
                  </span>
                </span>
              </button>
            ))}
            <p className="pt-1 text-[12.5px] text-[var(--ac-muted)]">
              {t("wiz.trialNote", { n: SELF_SIGNUP_TRIAL_DAYS })}
            </p>
            <Nav onNext={() => go("business")} />
          </div>
        )}

        {step === "business" && (
          <div className="space-y-5">
            <Question n={1} title={t("wiz.q1")} error={errors.biz}>
              <Chips
                items={BUSINESS_KINDS.map((k) => ({ id: k, label: t(`wiz.biz.${k}`) }))}
                value={bizKind}
                onChange={setBizKind}
              />
              <input
                value={bizText}
                onChange={(e) => setBizText(e.target.value)}
                placeholder={t("wiz.q1Placeholder")}
                className="mt-2.5 h-11 w-full rounded-[12px] border border-[var(--ac-field-border)] bg-[var(--ac-field)] px-3.5 text-[16px] text-[var(--ac-text)] outline-none placeholder:text-[var(--ac-faint)] focus:border-primary"
              />
            </Question>
            <Question n={2} title={t("wiz.q2")} error={errors.reps}>
              <Chips
                items={TEAM_SIZES.map((k) => ({ id: k, label: k }))}
                value={salesReps}
                onChange={setSalesReps}
                wide
              />
            </Question>
            <Question n={3} title={t("wiz.q3")} error={errors.tool}>
              <Chips
                items={CURRENT_TOOLS.map((k) => ({ id: k, label: t(`wiz.tool.${k}`) }))}
                value={tool}
                onChange={setTool}
              />
            </Question>
            <Nav onBack={() => go("plan")} onNext={nextFromBusiness} />
          </div>
        )}

        {step === "account" && (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              nextFromAccount();
            }}
          >
            <GlassField
              label={t("signup.fullName")}
              icon={User}
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={errors.fullName}
            />
            <GlassField
              label={t("signup.companyName")}
              icon={Building2}
              autoComplete="organization"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              error={errors.companyName}
            />
            <div className="grid grid-cols-2 gap-3 phone:grid-cols-1">
              <GlassField
                label={t("wiz.phone")}
                icon={Phone}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                error={errors.phone}
              />
              <GlassField
                label={t("login.email")}
                icon={Mail}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 phone:grid-cols-1">
              <GlassField
                label={t("login.password")}
                icon={Lock}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={errors.password}
              />
              <GlassField
                label={t("auth.passwordRepeat")}
                icon={Lock}
                type="password"
                autoComplete="new-password"
                value={passwordRepeat}
                onChange={(e) => setPasswordRepeat(e.target.value)}
                error={errors.passwordRepeat}
              />
            </div>
            <Nav onBack={() => go("business")} submit />
          </form>
        )}

        {step === "call" && (
          <div className="space-y-4">
            {slots === null ? (
              <p className="flex items-center gap-2 py-6 text-sm text-[var(--ac-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
              </p>
            ) : slots.length === 0 ? (
              <p className="rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-field)] px-4 py-3 text-[13.5px] text-[var(--ac-muted)]">
                {t("wiz.noSlots")}
              </p>
            ) : (
              <>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {slots.map((d) => {
                    const l = dayLabel(d.day);
                    const on = d.day === day;
                    return (
                      <button
                        key={d.day}
                        type="button"
                        onClick={() => setDay(d.day)}
                        className={cn(
                          "flex w-[58px] shrink-0 flex-col items-center rounded-[12px] border py-2 transition-colors",
                          on
                            ? "border-primary bg-primary text-white"
                            : "border-[var(--ac-line)] bg-[var(--ac-field)] text-[var(--ac-text)] hover:border-[var(--ac-field-border)]",
                        )}
                      >
                        <span
                          className={cn(
                            "text-[11px] font-semibold uppercase",
                            on ? "text-white/80" : "text-[var(--ac-muted)]",
                          )}
                        >
                          {l.wd}
                        </span>
                        <span className="text-[18px] font-bold tabular-nums">{l.dd}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-4 gap-2 phone:grid-cols-3">
                  {daySlots.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setMeetingAt(meetingAt === s ? null : s)}
                      aria-pressed={meetingAt === s}
                      className={cn(
                        "h-10 rounded-[10px] border text-[14px] font-semibold tabular-nums transition-colors",
                        meetingAt === s
                          ? "border-primary bg-primary/15 text-[var(--auth-ink)]"
                          : "border-[var(--ac-line)] bg-[var(--ac-field)] text-[var(--ac-text)] hover:border-[var(--ac-field-border)]",
                      )}
                    >
                      {tashkentTime(s)}
                    </button>
                  ))}
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setMeetingAt(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-[12px] border px-4 py-3 text-left text-[13.5px] transition-colors",
                meetingAt === null
                  ? "border-primary bg-primary/10 text-[var(--ac-text)]"
                  : "border-[var(--ac-line)] bg-[var(--ac-field)] text-[var(--ac-muted)]",
              )}
            >
              <PhoneCall className="h-4 w-4 shrink-0" />
              {t("wiz.callMeLater")}
            </button>
            {meetingAt && (
              <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--auth-ink)]">
                <CalendarCheck2 className="h-4 w-4" />
                {t("wiz.chosen", { day: callDay(meetingAt, lang), time: tashkentTime(meetingAt) })}
              </p>
            )}
            {errors.form && <GlassError>{errors.form}</GlassError>}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
              className="flex gap-2.5"
            >
              <BackButton onClick={() => go("account")} />
              <div className="flex-1">
                <GlassSubmit busy={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy ? t("signup.submitting") : t("auth.signupSubmit")}
                  {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
                </GlassSubmit>
              </div>
            </form>
          </div>
        )}

        <p className={cn("mt-5 text-center text-[13.5px]", skin.muted)}>
          {t("signup.haveAccount")}{" "}
          <button
            type="button"
            onClick={() => flipTo("/login")}
            className={cn("font-bold hover:underline", skin.link)}
          >
            {t("signup.signIn")}
          </button>
        </p>
      </GlassCard>
    </AuthBackdrop>
  );
}

function Stepper({ index }: { index: number }) {
  const { t } = useI18n();
  return (
    <ol className="-mt-2 mb-6 grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0">
          <span
            className={cn(
              "block h-1.5 rounded-full transition-colors",
              i <= index ? "bg-primary" : "bg-[var(--ac-line)]",
            )}
          />
          <span
            className={cn(
              "mt-1.5 block truncate text-[11.5px] font-semibold",
              i === index ? "text-[var(--ac-text)]" : "text-[var(--ac-faint)]",
            )}
          >
            {i + 1}. {t(`wiz.step.${s}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Question({
  n,
  title,
  error,
  children,
}: {
  n: number;
  title: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="mb-2.5 flex items-center gap-2 text-[14.5px] font-semibold text-[var(--ac-text)]">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-[12px] font-bold text-[var(--auth-ink)]">
          {n}
        </span>
        {title}
      </p>
      {children}
      {error && <p className="mt-1.5 text-[12.5px] text-[var(--ac-err)]">{error}</p>}
    </section>
  );
}

function Chips({
  items,
  value,
  onChange,
  wide,
}: {
  items: { id: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", wide && "grid grid-cols-4")}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          aria-pressed={value === it.id}
          className={cn(
            "h-10 rounded-[10px] border px-3.5 text-[13.5px] font-medium transition-colors",
            value === it.id
              ? "border-primary bg-primary/15 text-[var(--auth-ink)]"
              : "border-[var(--ac-line)] bg-[var(--ac-field)] text-[var(--ac-text)] hover:border-[var(--ac-field-border)]",
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("common.back")}
      className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-field)] text-[var(--ac-muted)] hover:text-[var(--ac-text)]"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );
}

function Nav({
  onBack,
  onNext,
  submit,
}: {
  onBack?: () => void;
  onNext?: () => void;
  submit?: boolean;
}) {
  const { t } = useI18n();
  const { s } = useAuthSkin();
  return (
    <div className="flex gap-2.5 pt-2">
      {onBack && <BackButton onClick={onBack} />}
      <button
        type={submit ? "submit" : "button"}
        onClick={submit ? undefined : onNext}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 transition-[filter,transform] active:scale-[0.99]",
          s.submit,
        )}
      >
        {t("wiz.next")}
        <ArrowRight className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
