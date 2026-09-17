import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Globe, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n, LANGS, LANG_SHORT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";
import { BrandMark } from "@/components/BrandMark";

export const Route = createFileRoute("/login")({
  // Where AuthGate sends a logged-out (or not-yet-resolved) visitor back to
  // once they're authenticated -- only ever a same-app path, never "/login"
  // itself (which would loop).
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect:
      typeof search["redirect"] === "string" &&
      search["redirect"].startsWith("/") &&
      search["redirect"] !== "/login"
        ? search["redirect"]
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — SalesIQ CRM" },
      {
        name: "description",
        content: "Sign in to SalesIQ, the sales operating system for revenue teams.",
      },
      { property: "og:title", content: "Sign in — SalesIQ CRM" },
      { property: "og:description", content: "Secure access to your SalesIQ workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LoginPage,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Supabase error messages arrive in English regardless of app locale, so map
// the ones users actually hit to a localized string; anything unrecognized
// falls through as-is rather than being replaced by a generic "wrong
// password" message that hides the real cause (e.g. an unconfirmed email).
function signInErrorMessage(raw: string, t: (key: string) => string): string {
  if (/email not confirmed/i.test(raw)) return t("login.emailNotConfirmed");
  if (/invalid login credentials/i.test(raw)) return t("login.failed");
  return raw;
}

function LoginPage() {
  const { user, ready, recoveryMode, signIn, resetPassword, updatePassword } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  // Sends an already-authenticated visit (or a fresh sign-in) back to
  // whatever page originally sent them to /login, instead of always "/" --
  // a plain browser navigation since the target is an arbitrary runtime
  // path the router's typed `to` can't express.
  function goAfterAuth() {
    if (redirect) window.location.assign(redirect);
    else void navigate({ to: "/", replace: true });
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    form?: string;
  }>({});
  const [busy, setBusy] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [linkExpiredNotice, setLinkExpiredNotice] = useState(false);

  useEffect(() => {
    if (ready && user && !recoveryMode) goAfterAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, recoveryMode]);

  // Supabase redirects an expired/already-used recovery link back here with
  // the error encoded in the URL hash rather than delivering a session —
  // without this, the page just silently falls through to the normal
  // sign-in form and the user sees a confusing "wrong email/password".
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("error=") && hash.includes("otp_expired")) {
      setLinkExpiredNotice(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function onForgotSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!EMAIL_RE.test(forgotEmail.trim())) {
      setRecoveryError("");
      setForgotError(t("login.invalidEmail"));
      return;
    }
    setForgotBusy(true);
    setForgotError("");
    const result = await resetPassword(forgotEmail);
    setForgotBusy(false);
    if (!result.ok) {
      setForgotError(result.error);
      return;
    }
    setForgotSent(true);
  }

  async function onRecoverySubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setRecoveryError(t("login.shortPassword"));
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setRecoveryError(t("login.passwordMismatch"));
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError("");
    const result = await updatePassword(newPassword);
    setRecoveryBusy(false);
    if (!result.ok) {
      setRecoveryError(result.error);
      return;
    }
    toast.success(t("login.passwordUpdated"));
    goAfterAuth();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = t("login.invalidEmail");
    if (password.length < 8) next.password = t("login.shortPassword");
    setErrors(next);
    if (Object.keys(next).length) return;

    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);

    if (!result.ok) {
      setErrors({ form: signInErrorMessage(result.error, t) });
      return;
    }

    toast.success(t("login.success"));
    goAfterAuth();
  }

  return (
    <main className="h-screen w-full overflow-hidden bg-surface">
      <div className="grid h-full w-full lg:grid-cols-2">
        <section className="relative hidden flex-col overflow-hidden border-r border-border bg-gradient-to-br from-[#0B1120] via-[#0E1A2E] to-[#0B1120] p-10 lg:flex">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" />

          <div className="relative flex flex-1 flex-col items-center justify-center gap-8">
            <BrandMark
              className="items-center text-center"
              iconClassName="h-24 w-24 sm:h-28 sm:w-28"
              wordmarkClassName="text-3xl sm:text-4xl"
            />
            <div className="text-center">
              <h2 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
                {t("login.title")}
              </h2>
              <p className="mt-4 text-base font-medium tracking-wide text-emerald-300/80 sm:text-lg">
                {t("login.tagline")}
              </p>
            </div>

            {/* Decorative wave graphic — abstract rather than a literal
                product screenshot, grouped with the logo/headline above so
                the whole block centers together instead of sinking to the
                bottom of the panel. Each layer is a seamless tile: the same
                path is drawn twice side by side and drifted left by exactly
                one tile width in a loop, reading as a slowly flowing wave
                rather than a static image. */}
            <div className="relative h-40 w-full max-w-lg shrink-0">
              <svg
                aria-hidden="true"
                viewBox="0 0 800 260"
                preserveAspectRatio="none"
                className="pointer-events-none h-full w-full overflow-visible"
              >
                <defs>
                  <linearGradient id="loginWave1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10B981" />
                    <stop offset="100%" stopColor="#5EEAD4" />
                  </linearGradient>
                  <linearGradient id="loginWave2" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#5EEAD4" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                  <path
                    id="loginWavePath1"
                    d="M0,140 C120,100 220,180 340,150 C460,120 540,70 660,100 C720,115 760,135 800,130 L800,260 L0,260 Z"
                  />
                  <path
                    id="loginWavePath2"
                    d="M0,180 C140,160 240,210 360,185 C480,160 560,130 680,155 C730,167 770,175 800,170 L800,260 L0,260 Z"
                  />
                  <path
                    id="loginWavePath3"
                    d="M0,215 C160,200 260,235 380,217 C500,199 580,180 700,195 C740,201 770,207 800,203 L800,260 L0,260 Z"
                  />
                </defs>
                <style>
                  {`
                  @keyframes loginWaveDrift { from { transform: translateX(0); } to { transform: translateX(-800px); } }
                  .login-wave-layer { animation: loginWaveDrift linear infinite; }
                `}
                </style>
                <g className="login-wave-layer" style={{ animationDuration: "22s" }} opacity="0.12">
                  <use href="#loginWavePath1" fill="url(#loginWave1)" />
                  <use href="#loginWavePath1" fill="url(#loginWave1)" x={800} />
                </g>
                <g className="login-wave-layer" style={{ animationDuration: "16s" }} opacity="0.16">
                  <use href="#loginWavePath2" fill="url(#loginWave2)" />
                  <use href="#loginWavePath2" fill="url(#loginWave2)" x={800} />
                </g>
                <g className="login-wave-layer" style={{ animationDuration: "12s" }} opacity="0.22">
                  <use href="#loginWavePath3" fill="url(#loginWave1)" />
                  <use href="#loginWavePath3" fill="url(#loginWave1)" x={800} />
                </g>
              </svg>
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-center overflow-y-auto bg-gradient-to-br from-[#0B1120] via-[#0E1A2E] to-[#0B1120] p-8 sm:p-10 lg:p-14">
          <div className="mb-6 flex items-center justify-end">
            <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-1">
              <Globe className="ml-1 h-3.5 w-3.5 shrink-0 text-emerald-300" />
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

          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex flex-col items-center text-center">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-soft">
                <Logo className="h-11 w-11" />
              </span>
              <p className="mt-4 text-3xl font-bold text-white">SalesIQ CRM</p>
              <p className="mt-2 text-base font-bold uppercase tracking-wide text-primary">
                {t("login.subtitle")}
              </p>
            </div>

            {recoveryMode ? (
              <form onSubmit={onRecoverySubmit} noValidate className="space-y-5">
                <p className="text-center text-sm text-white/50">{t("login.setNewPasswordDesc")}</p>
                <label className="block">
                  <span className="text-[13px] font-medium text-white/60">
                    {t("login.newPassword")}
                  </span>
                  <span className="relative mt-2 block">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-3 text-base text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary/50 focus:bg-white/10"
                    />
                  </span>
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-white/60">
                    {t("login.newPasswordConfirm")}
                  </span>
                  <span className="relative mt-2 block">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-3 text-base text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary/50 focus:bg-white/10"
                    />
                  </span>
                </label>
                {recoveryError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-destructive/30 bg-destructive/15 px-3 py-2 text-sm font-medium text-red-300"
                  >
                    {recoveryError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={recoveryBusy}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {recoveryBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("login.updatePassword")}
                </button>
              </form>
            ) : forgotOpen ? (
              <div className="space-y-5">
                {forgotSent ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-center">
                    <p className="text-sm text-white">
                      {t("login.forgotSent", { email: forgotEmail })}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={onForgotSubmit} noValidate className="space-y-5">
                    <p className="text-center text-sm text-white/50">{t("login.forgotDesc")}</p>
                    <label className="block">
                      <span className="text-[13px] font-medium text-white/60">
                        {t("login.email")}
                      </span>
                      <span className="relative mt-2 block">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                        <input
                          type="email"
                          autoComplete="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder="super@admin.com"
                          className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-3 text-base text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary/50 focus:bg-white/10"
                        />
                      </span>
                    </label>
                    {forgotError && (
                      <p
                        role="alert"
                        className="rounded-xl border border-destructive/30 bg-destructive/15 px-3 py-2 text-sm font-medium text-red-300"
                      >
                        {forgotError}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={forgotBusy}
                      className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {forgotBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("login.sendResetLink")}
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setForgotOpen(false);
                    setForgotSent(false);
                    setForgotError("");
                  }}
                  className="block w-full text-center text-sm font-medium text-white/50 hover:text-white"
                >
                  {t("login.backToSignIn")}
                </button>
              </div>
            ) : (
              <>
                {linkExpiredNotice && (
                  <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200">
                    <p>{t("login.recoveryLinkExpired")}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setLinkExpiredNotice(false);
                        setForgotEmail(email);
                        setForgotOpen(true);
                        setForgotSent(false);
                        setForgotError("");
                      }}
                      className="mt-1.5 font-semibold text-primary hover:underline"
                    >
                      {t("login.forgotPassword")}
                    </button>
                  </div>
                )}
                <form onSubmit={onSubmit} noValidate className="space-y-5">
                  <label className="block">
                    <span className="text-[13px] font-medium text-white/60">
                      {t("login.email")}
                    </span>
                    <span className="relative mt-2 block">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="super@admin.com"
                        aria-invalid={!!errors.email}
                        className="h-14 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-3 text-base text-white outline-none transition-colors placeholder:text-white/25 focus:border-primary/50 focus:bg-white/10"
                      />
                    </span>
                    {errors.email && (
                      <span className="mt-1.5 block text-xs text-red-300">{errors.email}</span>
                    )}
                  </label>

                  <label className="block">
                    <span className="text-[13px] font-medium text-white/60">
                      {t("login.password")}
                    </span>
                    <span className="relative mt-2 block">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                      <input
                        type="password"
                        autoComplete="current-password"
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
                    <span className="mt-2 block text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setForgotEmail(email);
                          setForgotOpen(true);
                          setForgotSent(false);
                          setForgotError("");
                        }}
                        className="text-[13px] font-medium text-primary hover:underline"
                      >
                        {t("login.forgotPassword")}
                      </button>
                    </span>
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
                    className="mx-auto flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {busy ? t("login.signingIn") : t("login.submit")}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
