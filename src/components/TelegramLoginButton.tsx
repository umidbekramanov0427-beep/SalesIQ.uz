import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

type Phase = "idle" | "starting" | "waiting" | "no_profile" | "expired";

const POLL_MS = 1500;
// Matches telegram_login_requests.expires_at server-side -- this is just
// the client giving up on polling a request that's already dead rather
// than a second source of truth for when it actually expires.
const TIMEOUT_MS = 5 * 60 * 1000;

// A device-code-style sign-in: start() mints a short-lived opaque token
// server-side, opens the platform's Telegram bot with it as the /start
// payload, then polls until the bot's webhook (which is the only thing
// that can ever confirm it, by matching the visitor's real, already-linked
// Telegram chat id) marks it confirmed -- at which point the one-time
// token hash it hands back completes an ordinary Supabase sign-in via
// useAuth().signInWithTokenHash.
export function TelegramLoginButton() {
  const { signInWithTokenHash } = useAuth();
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("idle");
  const pollRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  function stopPolling() {
    if (pollRef.current !== null) window.clearInterval(pollRef.current);
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    pollRef.current = null;
    timeoutRef.current = null;
  }

  useEffect(() => stopPolling, []);

  async function start() {
    setPhase("starting");
    try {
      const res = await fetch("/telegram/login-start", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as {
        token?: string;
        botUsername?: string;
        error?: string;
      };
      if (!res.ok || !json.token || !json.botUsername) {
        toast.error(json.error ?? t("login.telegramStartFailed"));
        setPhase("idle");
        return;
      }
      const { token, botUsername } = json;
      window.open(
        `https://t.me/${botUsername}?start=login_${token}`,
        "_blank",
        "noopener,noreferrer",
      );
      setPhase("waiting");

      pollRef.current = window.setInterval(() => {
        void (async () => {
          try {
            const statusRes = await fetch(
              `/telegram/login-status?token=${encodeURIComponent(token)}`,
            );
            const statusJson = (await statusRes.json().catch(() => ({}))) as {
              status?: string;
              tokenHash?: string;
            };
            if (statusJson.status === "confirmed" && statusJson.tokenHash) {
              stopPolling();
              const result = await signInWithTokenHash(statusJson.tokenHash);
              if (!result.ok) {
                toast.error(result.error);
                setPhase("idle");
              }
              // On success onAuthStateChange fires and the login page's
              // own effect redirects away -- nothing left to do here.
            } else if (statusJson.status === "no_profile") {
              stopPolling();
              setPhase("no_profile");
            } else if (statusJson.status === "expired") {
              stopPolling();
              setPhase("expired");
            }
          } catch {
            // Transient network hiccup -- the timeout below is the real
            // backstop, so just let the next tick try again.
          }
        })();
      }, POLL_MS);

      timeoutRef.current = window.setTimeout(() => {
        stopPolling();
        setPhase((p) => (p === "waiting" ? "expired" : p));
      }, TIMEOUT_MS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("login.telegramStartFailed"));
      setPhase("idle");
    }
  }

  function cancel() {
    stopPolling();
    setPhase("idle");
  }

  if (phase === "waiting") {
    return (
      <div className="flex h-14 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        <span className="flex-1 text-left">{t("login.telegramWaiting")}</span>
        <button
          type="button"
          onClick={cancel}
          className="shrink-0 text-xs font-semibold text-white/50 hover:text-white"
        >
          {t("login.telegramCancel")}
        </button>
      </div>
    );
  }

  if (phase === "no_profile" || phase === "expired") {
    return (
      <div className="space-y-2.5">
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-200">
          {phase === "no_profile" ? t("login.telegramNoProfile") : t("login.telegramExpired")}
        </p>
        <button
          type="button"
          onClick={() => void start()}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 text-base font-semibold text-white transition-colors hover:bg-white/10"
        >
          <MessageCircle className="h-5 w-5 text-primary" />
          {t("login.telegramRetry")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={phase === "starting"}
      className="flex h-14 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 text-base font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60"
    >
      {phase === "starting" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <MessageCircle className="h-5 w-5 text-primary" />
      )}
      {t("login.telegramSignIn")}
    </button>
  );
}
