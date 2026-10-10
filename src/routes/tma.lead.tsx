import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Phone } from "lucide-react";
import { Logo } from "@/components/Logo";
import { loadTelegramWebApp, type TelegramWebApp } from "@/lib/telegram/web-app";

// The client Mini App a business shares with its customers
// (t.me/<bot>/<app>?startapp=<orgId>, or this page with ?org=<orgId>): one
// button, "Send my number". Telegram asks the client to confirm, sends the
// verified contact to the bot, and the bot creates the lead in that
// business's CRM (telegram.webhook.ts). No form to type, no fake numbers.
export const Route = createFileRoute("/tma/lead")({
  validateSearch: (search: Record<string, unknown>): { org?: string | undefined } => ({
    org: typeof search["org"] === "string" ? search["org"] : undefined,
  }),
  head: () => ({
    meta: [
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Ariza qoldirish" },
    ],
  }),
  component: TmaLead,
});

type Step = "loading" | "outside" | "no_org" | "ready" | "waiting" | "done" | "error";

function TmaLead() {
  const { org } = Route.useSearch();
  const [step, setStep] = useState<Step>("loading");
  const [orgName, setOrgName] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const app = useRef<TelegramWebApp | null>(null);
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const tg = await loadTelegramWebApp();
      if (cancelled) return;
      if (!tg) return setStep("outside");
      app.current = tg;
      const res = await fetch("/tma/lead-start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData, org }),
      }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as {
        requestId?: string;
        orgName?: string;
        error?: string;
      };
      if (cancelled) return;
      if (json.error === "no_org") return setStep("no_org");
      if (!res?.ok || !json.requestId) return setStep("error");
      requestId.current = json.requestId;
      setOrgName(json.orgName ?? "");
      setStep("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [org]);

  async function waitForLead() {
    const tg = app.current;
    if (!tg || !requestId.current) return;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch("/tma/lead-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: tg.initData, requestId: requestId.current }),
      }).catch(() => null);
      const json = (await res?.json().catch(() => ({}))) as {
        status?: string;
        duplicate?: boolean;
      };
      if (json.status === "done") {
        setDuplicate(!!json.duplicate);
        setStep("done");
        tg.HapticFeedback?.notificationOccurred("success");
        return;
      }
    }
    setStep("error");
  }

  function share() {
    const tg = app.current;
    if (!tg?.requestContact) return setStep("error");
    tg.requestContact((shared) => {
      if (!shared) return;
      setStep("waiting");
      void waitForLead();
    });
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background px-6 pb-8 pt-14 text-foreground">
      <div className="flex flex-1 flex-col items-center text-center">
        <Logo className="h-14 w-14" />
        {orgName && (
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {orgName}
          </p>
        )}

        {step === "loading" && <Loader2 className="mt-10 h-6 w-6 animate-spin text-primary" />}

        {(step === "ready" || step === "waiting") && (
          <>
            <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight">
              Ariza qoldiring
            </h1>
            <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
              Raqamingizni bir tugma bilan yuboring — menejerimiz siz bilan tez orada bog'lanadi.
            </p>
          </>
        )}

        {step === "done" && (
          <>
            <CheckCircle2 className="mt-8 h-14 w-14 text-success" />
            <h1 className="mt-4 text-[24px] font-bold tracking-tight">Arizangiz qabul qilindi</h1>
            <p className="mt-2 max-w-xs text-[15px] text-muted-foreground">
              {duplicate
                ? "Sizning arizangiz bizda allaqachon bor — menejer albatta bog'lanadi."
                : "Menejerimiz tez orada siz bilan bog'lanadi."}
            </p>
          </>
        )}

        {step === "outside" && (
          <p className="mt-8 max-w-xs text-[15px] text-muted-foreground">
            Bu sahifa Telegram ichida ochiladi.
          </p>
        )}
        {step === "no_org" && (
          <p className="mt-8 max-w-xs text-[15px] text-muted-foreground">
            Havola noto'g'ri. Kompaniyadan yangi havola so'rang.
          </p>
        )}
        {step === "error" && (
          <p className="mt-8 max-w-xs text-[15px] text-destructive">
            Xatolik yuz berdi. Oynani yopib, qaytadan oching.
          </p>
        )}
      </div>

      {(step === "ready" || step === "waiting") && (
        <button
          type="button"
          onClick={share}
          disabled={step === "waiting"}
          className="flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-primary text-[16px] font-semibold text-primary-foreground shadow-[0_14px_30px_-12px_var(--primary)] disabled:opacity-70"
        >
          {step === "waiting" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Phone className="h-5 w-5" />
          )}
          {step === "waiting" ? "Yuborilmoqda…" : "Raqamimni yuborish"}
        </button>
      )}
    </div>
  );
}
