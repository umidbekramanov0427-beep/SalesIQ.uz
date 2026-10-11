import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { loadTelegramWebApp } from "@/lib/telegram/web-app";
import { useI18n } from "@/lib/i18n";

// The staff Mini App: open the bot's menu button in Telegram and you are in
// SalesIQ -- no login, no password. Telegram's signed launch data is sent to
// /tma/session, which answers with a one-time sign-in token for the profile
// whose linked Telegram chat matches; the whole app then opens as usual.
export const Route = createFileRoute("/tma/app")({
  head: () => ({
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "SalesIQ" },
    ],
  }),
  component: TmaApp,
});

type State =
  | { kind: "loading" }
  | { kind: "outside" }
  | { kind: "not_linked" }
  | { kind: "error"; message: string };

function TmaApp() {
  const { t } = useI18n();
  const { user, ready, signInWithTokenHash } = useAuth();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!ready) return;
    if (user) {
      window.location.replace("/");
      return;
    }
    let cancelled = false;
    void (async () => {
      const app = await loadTelegramWebApp();
      if (cancelled) return;
      if (!app) return setState({ kind: "outside" });
      const res = await fetch("/tma/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: app.initData }),
      }).catch(() => null);
      if (cancelled) return;
      const json = (await res?.json().catch(() => ({}))) as { tokenHash?: string; error?: string };
      if (res?.status === 404 || json.error === "not_linked")
        return setState({ kind: "not_linked" });
      if (!res?.ok || !json.tokenHash) {
        return setState({ kind: "error", message: t("tma.signInError") });
      }
      const result = await signInWithTokenHash(json.tokenHash);
      if (cancelled) return;
      if (!result.ok) return setState({ kind: "error", message: result.error });
      window.location.replace("/");
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user, signInWithTokenHash]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-background px-6 text-center text-foreground">
      <Logo className="h-16 w-16" />
      {state.kind === "loading" && (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("tma.opening")}</p>
        </>
      )}
      {state.kind === "outside" && (
        <p className="max-w-xs text-[15px] text-muted-foreground">{t("tma.openFromBot")}</p>
      )}
      {state.kind === "not_linked" && (
        <div className="max-w-xs space-y-2">
          <p className="text-[17px] font-semibold">{t("tma.notLinked")}</p>
          <p className="text-[14.5px] leading-relaxed text-muted-foreground">{t("tma.linkHint")}</p>
        </div>
      )}
      {state.kind === "error" && (
        <p className="max-w-xs text-[15px] text-destructive">
          <Send className="mr-1.5 inline h-4 w-4" />
          {state.message}
        </p>
      )}
    </div>
  );
}
