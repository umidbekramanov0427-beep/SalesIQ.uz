import { useEffect, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { useAuthSkin } from "@/components/auth/auth-skins";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// "Telegram orqali kirish" (telegram-login.server.ts): opens the staff bot
// with a one-time request, then waits for "Tasdiqlash" in Telegram and signs
// this page in. Only people who linked Telegram in Sozlamalar can use it.

/** Read by useRecordLoginEvent: this sign-in came through Telegram. */
export const SIGNIN_METHOD_KEY = "salesiq.signinMethod";

type Phase = "idle" | "starting" | "waiting" | "signing" | "notLinked" | "denied" | "expired";

export function TelegramLoginButton() {
  const { t } = useI18n();
  const { s } = useAuthSkin();
  const { signInWithTokenHash } = useAuth();
  const [phase, setPhase] = useState<Phase>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const secret = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const until = useRef(0);

  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  async function poll() {
    stop();
    const sec = secret.current;
    if (!sec) return;
    if (Date.now() > until.current) {
      secret.current = null;
      setPhase("expired");
      return;
    }
    const res = await fetch("/telegram/login-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: sec }),
    }).catch(() => null);
    if (secret.current !== sec) return; // cancelled meanwhile
    const json = (await res?.json().catch(() => null)) as {
      status?: string;
      tokenHash?: string;
    } | null;
    const status = json?.status ?? "pending";
    if (status === "confirmed" && json?.tokenHash) {
      secret.current = null;
      setPhase("signing");
      try {
        sessionStorage.setItem(SIGNIN_METHOD_KEY, "telegram");
      } catch {
        /* private window */
      }
      const r = await signInWithTokenHash(json.tokenHash);
      if (!r.ok) {
        setPhase("idle");
        toast.error(t("tgLogin.failed"));
        return;
      }
      toast.success(t("login.success"));
      // The page's own effect moves on once the session is there.
      return;
    }
    if (status === "not_linked" || status === "denied" || status === "expired") {
      secret.current = null;
      setPhase(status === "not_linked" ? "notLinked" : status);
      return;
    }
    if (status === "too_many") {
      secret.current = null;
      setPhase("expired");
      return;
    }
    timer.current = window.setTimeout(() => void poll(), 2000);
  }

  // Back from Telegram: ask at once instead of waiting for the next tick.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && secret.current) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    stop();
    setPhase("starting");
    // Opened right away (inside the click) so the browser doesn't block it.
    const tab = window.open("about:blank", "_blank");
    const res = await fetch("/telegram/login-start", { method: "POST" }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as {
      secret?: string;
      url?: string;
      error?: string;
    } | null;
    if (!json?.secret || !json.url) {
      tab?.close();
      setPhase("idle");
      toast.error(json?.error === "too_many" ? t("tgLogin.tooMany") : t("tgLogin.failed"));
      return;
    }
    secret.current = json.secret;
    until.current = Date.now() + 5 * 60_000;
    setUrl(json.url);
    if (tab) tab.location.href = json.url;
    else window.location.href = json.url;
    setPhase("waiting");
    timer.current = window.setTimeout(() => void poll(), 2500);
  }

  function cancel() {
    stop();
    secret.current = null;
    setPhase("idle");
  }

  const waiting = phase === "waiting" || phase === "signing";
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void (waiting ? undefined : start())}
        disabled={phase === "starting" || waiting}
        className={cn(
          "flex w-full items-center justify-center gap-2.5 text-sm font-semibold transition-colors disabled:opacity-70",
          s.google,
        )}
      >
        {phase === "starting" || waiting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-[#229ED9] text-white">
            <Send className="-ml-px h-2.5 w-2.5" />
          </span>
        )}
        {waiting ? t("tgLogin.waiting") : t("tgLogin.button")}
      </button>

      {waiting && (
        <div className="mt-2.5 flex items-start gap-2 rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-field)] px-3 py-2.5 text-[13px] text-[var(--ac-muted)]">
          <span className="min-w-0 flex-1">
            {t("tgLogin.hint")}{" "}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className={cn("font-semibold", s.link)}
              >
                {t("tgLogin.openAgain")}
              </a>
            )}
          </span>
          <button
            type="button"
            onClick={cancel}
            aria-label={t("tgLogin.cancel")}
            className="shrink-0 text-[var(--ac-faint)] hover:text-[var(--ac-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {(phase === "notLinked" || phase === "denied" || phase === "expired") && (
        <p
          role="alert"
          className={cn("mt-2.5 rounded-[10px] border px-3 py-2.5 text-[13px]", s.notice)}
        >
          {phase === "notLinked"
            ? t("tgLogin.notLinked")
            : phase === "denied"
              ? t("tgLogin.denied")
              : t("tgLogin.expired")}
        </p>
      )}
    </div>
  );
}
