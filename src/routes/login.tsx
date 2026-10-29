import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { currentDeviceId } from "@/lib/device-id";
import {
  AuthBackdrop,
  GlassCard,
  GlassDivider,
  GlassError,
  GlassField,
  GlassHeading,
  GlassSubmit,
  useCardFlip,
} from "@/components/auth/AuthGlass";
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
  const { t } = useI18n();
  const navigate = useNavigate();
  const { leaving, flipTo } = useCardFlip();
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

  const forgotLink = (
    <button
      type="button"
      onClick={() => {
        setForgotEmail(email);
        setForgotOpen(true);
        setForgotSent(false);
        setForgotError("");
      }}
      className="text-[13px] font-semibold text-[#6f9bff] hover:underline"
    >
      {t("login.forgotPassword")}
    </button>
  );

  return (
    <AuthBackdrop>
      <GlassCard leaving={leaving}>
        {subdomain && (company.name || company.missing) && (
          <p className="-mt-2 mb-4 inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white/80">
            <span className="truncate">
              {company.name
                ? t("subdomain.loginFor", { name: company.name })
                : t("subdomain.unknown")}
            </span>
          </p>
        )}

        {recoveryMode ? (
          <form onSubmit={onRecoverySubmit} noValidate className="space-y-4">
            <GlassHeading title={t("login.updatePassword")} sub={t("login.setNewPasswordDesc")} />
            <GlassField
              label={t("login.newPassword")}
              icon={Lock}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
            <GlassField
              label={t("login.newPasswordConfirm")}
              icon={Lock}
              type="password"
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              placeholder="••••••••"
            />
            {recoveryError && <GlassError>{recoveryError}</GlassError>}
            <GlassSubmit busy={recoveryBusy}>
              {recoveryBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("login.updatePassword")}
            </GlassSubmit>
          </form>
        ) : forgotOpen ? (
          <div className="space-y-4">
            <GlassHeading title={t("login.forgotPassword")} sub={t("login.forgotDesc")} />
            {forgotSent ? (
              <div className="rounded-xl border border-[#4d86ff]/30 bg-[#4d86ff]/10 p-4 text-center text-sm">
                {t("login.forgotSent", { email: forgotEmail })}
              </div>
            ) : (
              <form onSubmit={onForgotSubmit} noValidate className="space-y-4">
                <GlassField
                  label={t("login.email")}
                  icon={Mail}
                  type="email"
                  autoComplete="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="siz@kompaniya.uz"
                />
                {forgotError && <GlassError>{forgotError}</GlassError>}
                <GlassSubmit busy={forgotBusy}>
                  {forgotBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("login.sendResetLink")}
                </GlassSubmit>
              </form>
            )}
            <button
              type="button"
              onClick={() => {
                setForgotOpen(false);
                setForgotSent(false);
                setForgotError("");
              }}
              className="block w-full text-center text-sm font-medium text-[#9aa6bd] hover:text-white"
            >
              {t("login.backToSignIn")}
            </button>
          </div>
        ) : (
          <>
            <GlassHeading
              title={t("auth.welcome")}
              accent={t("auth.welcomeAccent")}
              sub={t("auth.welcomeSub")}
            />
            {linkExpiredNotice && (
              <div className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-sm text-amber-200">
                <p>{t("login.recoveryLinkExpired")}</p>
                <span className="mt-1.5 inline-block">{forgotLink}</span>
              </div>
            )}
            <form onSubmit={onSubmit} noValidate className="space-y-4">
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
              <GlassField
                label={t("login.password")}
                icon={Lock}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                error={errors.password}
              />
              <div className="-mt-1 flex justify-end">{forgotLink}</div>
              {errors.form && <GlassError>{errors.form}</GlassError>}
              <GlassSubmit busy={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? t("login.signingIn") : t("login.submit")}
                {!busy && <ArrowRight className="h-[18px] w-[18px]" />}
              </GlassSubmit>
            </form>

            <GlassDivider label={t("login.orContinueWith")} />

            <button
              type="button"
              onClick={() => void onGoogleSignIn()}
              disabled={googleBusy}
              className="flex h-[46px] w-full items-center justify-center gap-2.5 rounded-xl border border-[rgba(120,160,230,.2)] bg-white/[0.03] text-sm font-semibold transition-colors hover:bg-white/[0.07] disabled:opacity-60"
            >
              {googleBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
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

            <p className="mt-5 text-center text-[13.5px] text-[#9aa6bd]">
              {t("login.noAccount")}{" "}
              <button
                type="button"
                onClick={() => flipTo("/signup")}
                className="font-bold text-[#6f9bff] hover:underline"
              >
                {t("auth.signUpLink")}
              </button>
            </p>
          </>
        )}
      </GlassCard>
    </AuthBackdrop>
  );
}
