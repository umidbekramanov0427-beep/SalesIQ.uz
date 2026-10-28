import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Globe, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n, LANGS, LANG_SHORT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { currentDeviceId } from "@/lib/device-id";
import { Logo } from "@/components/Logo";
import { BrandMark } from "@/components/BrandMark";
import { useCurrentSubdomain, useSubdomainCompany } from "@/lib/use-subdomain";

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

// Supabase's GoTrue client always returns error.message in English, no
// matter the app's own language -- shown as-is, that's a client's employee
// staring at raw English ("Email rate limit exceeded", "Failed to fetch",
// ...) on a Cyrillic/Uzbek-language product, which reads as broken rather
// than translated. This used to only cover sign-in's own two common cases
// (unconfirmed email, wrong credentials) and let everything else -- and
// the forgot-password/recovery flows entirely -- through untranslated. Now
// every auth flow on this page runs its error through this one classifier,
// and anything that doesn't match a known pattern gets a localized generic
// message instead of the raw string, so nothing shown here is ever
// unreadable English.
function authErrorMessage(raw: string, t: (key: string) => string): string {
  if (/email not confirmed/i.test(raw)) return t("login.emailNotConfirmed");
  if (/invalid login credentials/i.test(raw)) return t("login.failed");
  if (/rate limit|too many requests|only request this once|only send this once/i.test(raw)) {
    return t("login.rateLimited");
  }
  if (/failed to fetch|network|load failed|ERR_/i.test(raw)) return t("login.networkError");
  return t("login.genericError");
}

function LoginPage() {
  const {
    user,
    ready,
    recoveryMode,
    seatBlockedMessage,
    consumeSeatBlockedMessage,
    signIn,
    signInWithGoogle,
    resetPassword,
    updatePassword,
  } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const subdomain = useCurrentSubdomain();
  const company = useSubdomainCompany(subdomain);

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
  const [googleBusy, setGoogleBusy] = useState(false);

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

  // Set (and the session already signed back out) when hydrate() finds
  // this account over its org's plan seat count -- see check_seat_login
  // and auth.tsx's own comment on it. Surfaced here instead of inline
  // form state since it can also fire for a Google/magic-link sign-in,
  // which never runs through this page's own onSubmit.
  useEffect(() => {
    if (!seatBlockedMessage) return;
    const message = consumeSeatBlockedMessage();
    if (message) toast.error(message);
  }, [seatBlockedMessage, consumeSeatBlockedMessage]);

  // Supabase redirects an expired/already-used recovery link -- or a
  // rejected OAuth sign-in (e.g. a Google account with no profile an admin
  // ever provisioned, which the handle_new_user trigger refuses) -- back
  // here with the error encoded in the URL hash rather than delivering a
  // session. Without this, the page just silently falls through to the
  // normal sign-in form and the user sees a confusing "wrong
  // email/password" instead of what actually happened.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("error=")) return;
    if (hash.includes("otp_expired")) {
      setLinkExpiredNotice(true);
    } else {
      toast.error(t("login.oauthFailed"));
    }
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGoogleSignIn() {
    setGoogleBusy(true);
    const result = await signInWithGoogle();
    if (!result.ok) {
      toast.error(authErrorMessage(result.error, t));
      setGoogleBusy(false);
    }
    // On success the browser navigates away to Google, so there's nothing
    // left to do here -- the redirect back to /login is handled by the
    // effects above (either a session, via onAuthStateChange, or an error
    // in the hash).
  }

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
      setForgotError(authErrorMessage(result.error, t));
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
      setRecoveryError(authErrorMessage(result.error, t));
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
      // For the platform owner's visits report (failed sign-in attempts).
      void fetch("/account/login-failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, deviceId: currentDeviceId() }),
      }).catch(() => undefined);
      setErrors({ form: authErrorMessage(result.error, t) });
      return;
    }

    toast.success(t("login.success"));
    goAfterAuth();
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
                {t("login.title")}
              </h2>
              <p className="mt-4 text-base font-medium tracking-wide text-indigo-300/80 sm:text-lg">
                {t("login.tagline")}
              </p>
            </div>
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
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-soft">
                <Logo className="h-11 w-11" />
              </span>
              <p className="mt-4 text-3xl font-bold text-white">SalesIQ</p>
              <p className="mt-2 text-base font-bold uppercase tracking-wide text-primary">
                {t("login.subtitle")}
              </p>
              {subdomain && (company.name || company.missing) && (
                <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80">
                  <span className="truncate">
                    {company.name
                      ? t("subdomain.loginFor", { name: company.name })
                      : t("subdomain.unknown")}
                  </span>
                </p>
              )}
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

                <div className="my-5 flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-xs font-medium uppercase tracking-wide text-white/40">
                    {t("login.orContinueWith")}
                  </span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <button
                  type="button"
                  onClick={() => void onGoogleSignIn()}
                  disabled={googleBusy}
                  className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 text-base font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  {googleBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
                      <path
                        fill="#FFC107"
                        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.5z"
                      />
                      <path
                        fill="#FF3D00"
                        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l5.7-5.7C34.6 6 29.6 4 24 4c-7.6 0-14.2 4.3-17.6 10.7z"
                      />
                      <path
                        fill="#4CAF50"
                        d="M24 44c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.6 35.4 27 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.7 39.6 16.3 44 24 44z"
                      />
                      <path
                        fill="#1976D2"
                        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.5l6.6 5.4C41.8 35.6 44 30.2 44 24c0-1.3-.1-2.7-.4-3.5z"
                      />
                    </svg>
                  )}
                  {t("login.continueWithGoogle")}
                </button>

                <p className="mt-6 text-center text-sm text-white/50">
                  {t("login.noAccount")}{" "}
                  <Link to="/signup" className="font-semibold text-primary hover:underline">
                    {t("login.signUp")}
                  </Link>
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
