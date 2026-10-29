import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, Gift, Loader2, Lock, Mail, User } from "lucide-react";
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
import { normalizePlan, PLAN_LABELS, type Plan } from "@/lib/plan-gating";
import { clearStoredRef, storedRef } from "@/lib/referral";

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

function SignupPage() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { leaving, flipTo } = useCardFlip();
  const search = Route.useSearch();
  const plan = normalizePlan(search.plan);

  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [errors, setErrors] = useState<{
    companyName?: string;
    fullName?: string;
    email?: string;
    password?: string;
    passwordRepeat?: string;
    form?: string;
  }>({});
  const [busy, setBusy] = useState(false);
  // Came through a company's or partner's invitation link: a longer trial.
  const [invite, setInvite] = useState<{ code: string; bonusDays: number } | null>(null);
  useEffect(() => {
    const code = storedRef();
    if (!code) return;
    void fetch(`/referral/check?code=${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((j: { valid?: boolean; bonusDays?: number }) => {
        if (j.valid) setInvite({ code, bonusDays: j.bonusDays ?? 0 });
        else clearStoredRef();
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!companyName.trim()) next.companyName = t("signup.companyNameRequired");
    if (!fullName.trim()) next.fullName = t("signup.fullNameRequired");
    if (!EMAIL_RE.test(email.trim())) next.email = t("login.invalidEmail");
    if (password.length < 8) next.password = t("login.shortPassword");
    else if (password !== passwordRepeat) next.passwordRepeat = t("login.passwordMismatch");
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
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
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setErrors({ form: json.error ?? t("signup.failed") });
        setBusy(false);
        return;
      }

      if (invite) clearStoredRef();
      const result = await signIn(email.trim(), password);
      if (!result.ok) {
        // Account was created but the immediate sign-in failed for some
        // reason -- send them to /login instead of stranding them here
        // with no path forward.
        toast.success(t("signup.createdSignInManually"));
        void navigate({ to: "/login" });
        return;
      }
      toast.success(t("signup.success"));
      // Next step: link the Telegram bot and verify the phone there.
      void navigate({ to: "/welcome/telegram", replace: true });
    } catch (err) {
      setErrors({ form: err instanceof Error ? err.message : t("signup.failed") });
      setBusy(false);
    }
  }

  return (
    <AuthBackdrop>
      <GlassCard leaving={leaving}>
        <GlassHeading
          title={t("auth.signupTitle")}
          accent={t("auth.signupAccent")}
          sub={t("auth.signupSub", { n: SELF_SIGNUP_TRIAL_DAYS })}
        />
        <div className="-mt-3 mb-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-[#4d86ff]/15 px-3 py-1 text-xs font-semibold text-[#8fb2ff]">
            {t("signup.selectedPlan", { plan: PLAN_LABELS[plan] })}
          </span>
          {invite && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              <Gift className="h-3.5 w-3.5" />
              {t("signup.invited", { n: invite.bonusDays })}
            </span>
          )}
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <GlassField
            label={t("signup.fullName")}
            icon={User}
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t("signup.fullNamePlaceholder")}
            error={errors.fullName}
          />
          <GlassField
            label={t("signup.companyName")}
            icon={Building2}
            autoComplete="organization"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t("signup.companyNamePlaceholder")}
            error={errors.companyName}
          />
          <GlassField
            label={t("login.email")}
            icon={Mail}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="siz@kompaniya.uz"
            error={errors.email}
          />
          <div className="grid grid-cols-2 gap-3 phone:grid-cols-1">
            <GlassField
              label={t("login.password")}
              icon={Lock}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              error={errors.password}
            />
            <GlassField
              label={t("auth.passwordRepeat")}
              icon={Lock}
              type="password"
              autoComplete="new-password"
              value={passwordRepeat}
              onChange={(e) => setPasswordRepeat(e.target.value)}
              placeholder="••••••••"
              error={errors.passwordRepeat}
            />
          </div>
          {errors.form && <GlassError>{errors.form}</GlassError>}
          <GlassSubmit busy={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? t("signup.submitting") : t("auth.signupSubmit")}
            {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
          </GlassSubmit>
        </form>

        <p className="mt-5 text-center text-[13.5px] text-[#9aa6bd]">
          {t("signup.haveAccount")}{" "}
          <button
            type="button"
            onClick={() => flipTo("/login")}
            className="font-bold text-[#6f9bff] hover:underline"
          >
            {t("signup.signIn")}
          </button>
        </p>
      </GlassCard>
    </AuthBackdrop>
  );
}
