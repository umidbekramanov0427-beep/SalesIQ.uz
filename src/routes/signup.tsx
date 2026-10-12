import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Building2, Globe, Loader2, Lock, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n, LANGS, LANG_SHORT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/BrandMark";
import { LoginWaves } from "@/components/LoginWaves";
import { normalizePlan, PLAN_LABELS, type Plan } from "@/lib/plan-gating";

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
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const plan = normalizePlan(search.plan);

  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    companyName?: string;
    fullName?: string;
    email?: string;
    password?: string;
    form?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!companyName.trim()) next.companyName = t("signup.companyNameRequired");
    if (!fullName.trim()) next.fullName = t("signup.fullNameRequired");
    if (!EMAIL_RE.test(email.trim())) next.email = t("login.invalidEmail");
    if (password.length < 8) next.password = t("login.shortPassword");
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
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setErrors({ form: json.error ?? t("signup.failed") });
        setBusy(false);
        return;
      }

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
    <main className="h-screen w-full overflow-hidden bg-surface">
      <div className="auth-surface grid h-full w-full bg-gradient-to-br from-[var(--auth-from)] via-[var(--auth-via)] to-[var(--auth-to)] lg:grid-cols-2">
        <section className="relative hidden flex-col overflow-hidden p-10 lg:flex">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[var(--wave-3)]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-[var(--wave-1)]/10 blur-3xl" />

          <div className="relative flex flex-1 flex-col items-center justify-center gap-8">
            <BrandMark
              className="items-center text-center"
              iconClassName="h-24 w-24 sm:h-28 sm:w-28"
              wordmarkClassName="text-3xl sm:text-4xl"
            />
            <div className="text-center">
              <h2 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
                {t("signup.title")}
              </h2>
              <p className="mt-4 text-base font-medium tracking-wide text-indigo-300/80 sm:text-lg">
                {t("signup.tagline")}
              </p>
            </div>

            <LoginWaves className="h-72 w-full max-w-lg" />
          </div>
        </section>

        <section className="flex flex-col justify-center overflow-y-auto p-8 sm:p-10 lg:p-14">
          <div className="mb-6 flex items-center justify-end">
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1">
              <Globe className="ml-1 h-3.5 w-3.5 shrink-0 text-indigo-300" />
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    lang === l
                      ? "bg-primary text-primary-foreground"
                      : "text-white/50 hover:bg-white/10",
                  )}
                >
                  {LANG_SHORT[l]}
                </button>
              ))}
            </div>
          </div>

          {/* Pulled up 1cm on wider screens; a phone has no room above. */}
          <div className="mx-auto -mt-[1cm] w-full max-w-md phone:mt-0">
            <div className="mb-8 flex flex-col items-center text-center">
              <p className="text-3xl font-bold text-white">{t("signup.heading")}</p>
              <p className="mt-2 text-sm text-white/50">{t("signup.subheading")}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                {t("signup.selectedPlan", { plan: PLAN_LABELS[plan] })}
              </span>
            </div>

            <form onSubmit={onSubmit} noValidate className="space-y-5">
              <label className="block">
                <span className="text-[13px] font-medium text-white/60">
                  {t("signup.companyName")}
                </span>
                <span className="relative mt-2 block">
                  <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    autoComplete="organization"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder={t("signup.companyNamePlaceholder")}
                    aria-invalid={!!errors.companyName}
                    className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-3 text-base text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary/50 focus:bg-white/10"
                  />
                </span>
                {errors.companyName && (
                  <span className="mt-1.5 block text-xs text-red-300">{errors.companyName}</span>
                )}
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-white/60">
                  {t("signup.fullName")}
                </span>
                <span className="relative mt-2 block">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t("signup.fullNamePlaceholder")}
                    aria-invalid={!!errors.fullName}
                    className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-3 text-base text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary/50 focus:bg-white/10"
                  />
                </span>
                {errors.fullName && (
                  <span className="mt-1.5 block text-xs text-red-300">{errors.fullName}</span>
                )}
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-white/60">{t("login.email")}</span>
                <span className="relative mt-2 block">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="siz@kompaniya.uz"
                    aria-invalid={!!errors.email}
                    className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-3 text-base text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary/50 focus:bg-white/10"
                  />
                </span>
                {errors.email && (
                  <span className="mt-1.5 block text-xs text-red-300">{errors.email}</span>
                )}
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-white/60">{t("login.password")}</span>
                <span className="relative mt-2 block">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    aria-invalid={!!errors.password}
                    className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-3 text-base text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary/50 focus:bg-white/10"
                  />
                </span>
                {errors.password && (
                  <span className="mt-1.5 block text-xs text-red-300">{errors.password}</span>
                )}
              </label>

              {errors.form && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/30 bg-destructive/15 px-3 py-2 text-sm font-medium text-red-300"
                >
                  {errors.form}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? t("signup.submitting") : t("signup.submit")}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-white/50">
              {t("signup.haveAccount")}{" "}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                {t("signup.signIn")}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
