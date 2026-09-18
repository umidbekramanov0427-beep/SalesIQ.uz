import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { logClientError } from "@/lib/error-log";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: Profile["role"];
  managerId: string | null;
  organizationId: string | null;
  department: string;
  position: string;
  phone: string | null;
  avatarUrl: string | null;
  dailyTarget: number | null;
  monthlyTarget: number | null;
  telegramLinked: boolean;
  // Null for a platform_owner (no org of their own). false means the
  // company's trial/subscription lapsed (see deactivate-expired-trials.ts)
  // -- AppShell shows the persistent "Obuna muzlatilgan" banner for as
  // long as this stays false, regardless of which page they're on.
  orgActive: boolean | null;
  orgTrialEndsAt: string | null;
  orgPlan: string | null;
};

type AuthResult = { ok: true } | { ok: false; error: string };

type AuthValue = {
  user: SessionUser | null;
  ready: boolean;
  // True while the session was opened by a password-recovery email link —
  // the login screen uses this to show a "set new password" form instead
  // of redirecting straight into the app like a normal sign-in would.
  recoveryMode: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signInWithTokenHash: (tokenHash: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  resetPassword: (email: string) => Promise<AuthResult>;
  updatePassword: (newPassword: string) => Promise<AuthResult>;
};

const AuthContext = createContext<AuthValue | null>(null);

function initialsOf(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

type OrgFields = { active: boolean; trial_ends_at: string | null; plan: string };

function toSessionUser(profile: Profile, org: OrgFields | null): SessionUser {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name || profile.email,
    initials: initialsOf(profile.full_name, profile.email),
    role: profile.role,
    managerId: profile.manager_id,
    organizationId: profile.organization_id,
    department: profile.department,
    position: profile.position,
    phone: profile.phone,
    avatarUrl: profile.avatar_url,
    dailyTarget: profile.daily_target,
    monthlyTarget: profile.monthly_target,
    telegramLinked: profile.telegram_chat_id != null,
    orgActive: org?.active ?? null,
    orgTrialEndsAt: org?.trial_ends_at ?? null,
    orgPlan: org?.plan ?? null,
  };
}

async function fetchProfile(userId: string): Promise<{ profile: Profile | null; error: unknown }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return { profile: null, error: error ?? "no row returned" };
  return { profile: data, error: null };
}

// Best-effort only -- the trial banner is a nice-to-have, not something
// that should ever be able to take the whole login flow down with it (see
// the fetchProfile/hydrate retry loop above, which used to embed this via
// a join and, if that join hiccuped for any reason, silently exhausted its
// retries and signed a successfully-authenticated user right back out).
async function fetchOrgFields(organizationId: string | null): Promise<OrgFields | null> {
  if (!organizationId) return null;
  const { data } = await supabase
    .from("organizations")
    .select("active, trial_ends_at, plan")
    .eq("id", organizationId)
    .maybeSingle();
  return data ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const mounted = useRef(true);
  // Tracks whose session is currently hydrated, so a re-emitted SIGNED_IN
  // for the *same* user (see the onAuthStateChange comment below) can be
  // told apart from an actual sign-in by a different one.
  const lastUserIdRef = useRef<string | null>(null);
  // Which hydrate() call is currently in flight, if any -- see hydrateOnce.
  const inFlightHydrateRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A DB trigger creates the profile row on signup; it can lag by a beat on
  // the very first sign-in, so retry briefly instead of failing outright.
  const hydrate = useCallback(async (userId: string) => {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { profile, error } = await fetchProfile(userId);
      if (profile) {
        const org = await fetchOrgFields(profile.organization_id).catch(() => null);
        if (mounted.current) setUser(toSessionUser(profile, org));
        return;
      }
      lastError = error;
      await new Promise((r) => setTimeout(r, 350));
    }
    // Reported as "refresh logs me out" -- this is the exact moment that
    // happens: every retry above failed to return a profile row for an
    // already-signed-in user, so we're about to force them back to /login.
    // Logging *why* fetchProfile kept failing (network error vs. RLS
    // returning zero rows vs. something else) here, rather than silently
    // swallowing it, is what actually lets that bug get root-caused instead
    // of guessed at again.
    logClientError(`Auth hydrate gave up after 6 retries for user ${userId}`, {
      mechanism: "auth_hydrate_exhausted",
      lastError:
        lastError && typeof lastError === "object"
          ? JSON.parse(JSON.stringify(lastError))
          : String(lastError),
    });
    if (mounted.current) setUser(null);
  }, []);

  // Both the initial supabase.auth.getSession() read AND
  // onAuthStateChange's own immediate first fire ("INITIAL_SESSION")
  // resolve for the exact same already-existing session on mount --
  // calling hydrate() independently from both used to race: whichever
  // happened to finish last could overwrite an already-correctly-hydrated
  // user with null (this is the "refresh sometimes logs me out" bug). A
  // second call for an identity that's already hydrated, or already being
  // hydrated, now joins the existing attempt instead of starting a
  // redundant, independently-racing one.
  const hydrateOnce = useCallback(
    (userId: string): Promise<void> => {
      if (inFlightHydrateRef.current?.userId === userId) {
        return inFlightHydrateRef.current.promise;
      }
      if (lastUserIdRef.current === userId && !inFlightHydrateRef.current) {
        return Promise.resolve();
      }
      lastUserIdRef.current = userId;
      const promise = hydrate(userId).finally(() => {
        if (inFlightHydrateRef.current?.userId === userId) inFlightHydrateRef.current = null;
      });
      inFlightHydrateRef.current = { userId, promise };
      return promise;
    },
    [hydrate],
  );

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        await hydrateOnce(data.session.user.id);
      }
      if (mounted.current) setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);

      const sessionUserId = session?.user?.id ?? null;
      const isNewIdentity = sessionUserId !== lastUserIdRef.current;

      // A real sign-in or sign-out changes which organization's data every
      // query is allowed to return. Without clearing the cache here, the
      // previous account's leads/deals/dashboard numbers stayed in memory
      // and rendered immediately for whoever logged in next in the same
      // tab (e.g. a platform owner creating one org, then logging into
      // it) -- query keys aren't organization-scoped, so RLS alone
      // doesn't stop React Query from serving what it already cached.
      //
      // SIGNED_IN isn't only a real login, though -- supabase-js re-emits
      // it (not just TOKEN_REFRESHED) every time the tab regains focus
      // after sitting in the background, even for the exact same session.
      // Clearing on every one of those turned "switch tabs for a few
      // seconds and come back" into every open page reloading from
      // scratch. Only a genuine identity change should blow away the
      // cache and re-fetch the profile below.
      if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && isNewIdentity)) {
        queryClient.clear();
      }

      if (session?.user) {
        void hydrateOnce(session.user.id).finally(() => {
          if (mounted.current) setReady(true);
        });
      } else {
        lastUserIdRef.current = null;
        setUser(null);
        setReady(true);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [hydrateOnce, queryClient]);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  // Redirects the whole page to Google; there's no in-page result to wait
  // for -- the browser leaves and comes back to /login with either a
  // session (handled by the onAuthStateChange listener above) or an error
  // in the URL hash (handled by the login page itself, the same way it
  // already handles an expired password-recovery link). This return value
  // only reflects whether *starting* the redirect failed (e.g. the
  // provider isn't configured in Supabase yet).
  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/login` },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  // Consumes the one-time token handed back by /telegram/login-status once
  // the visitor confirmed in Telegram (see telegram.webhook.ts, which
  // minted it via supabaseAdmin.auth.admin.generateLink). A successful
  // verify fires the same onAuthStateChange listener above as any other
  // sign-in, so there's nothing else to do here -- the login page's own
  // effect picks up the new `user` and redirects away.
  const signInWithTokenHash = useCallback(async (tokenHash: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) await hydrate(data.session.user.id);
  }, [hydrate]);

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const updatePassword = useCallback(async (newPassword: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: error.message };
    setRecoveryMode(false);
    return { ok: true };
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      recoveryMode,
      signIn,
      signInWithGoogle,
      signInWithTokenHash,
      signOut,
      refreshProfile,
      resetPassword,
      updatePassword,
    }),
    [
      user,
      ready,
      recoveryMode,
      signIn,
      signInWithGoogle,
      signInWithTokenHash,
      signOut,
      refreshProfile,
      resetPassword,
      updatePassword,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
