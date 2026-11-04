import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, LogOut, Mail, Send } from "lucide-react";
import { Logo } from "@/components/Logo";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

// Sign-in confirmation code (Platforma → Sozlamalar → Xavfsizlik): after a
// password sign-in, a 6-digit code goes to the person's email (or Telegram)
// and the app opens once it is entered. The server keeps its API closed for
// this sign-in until then (login-code.server.ts).

type Status = {
  required: boolean;
  verified: boolean;
  channel: "email" | "telegram" | null;
  to: string | null;
  wait: number;
};

export function LoginCodeGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus(null);
    void apiFetch("/account/login-code")
      .then(async (r) => (r.ok ? ((await r.json()) as Status) : null))
      .catch(() => null)
      .then((s) => {
        if (cancelled) return;
        // Any trouble asking: let the person in rather than lock them out.
        setStatus(s ?? { required: false, verified: true, channel: null, to: null, wait: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!status) return null;
  if (!status.required || status.verified) return <>{children}</>;
  return <CodeScreen status={status} onDone={() => setStatus({ ...status, verified: true })} />;
}

function CodeScreen({ status, onDone }: { status: Status; onDone: () => void }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(status.wait);
  const [sent, setSent] = useState(status.wait > 0);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);

  async function send() {
    setError(null);
    setFailed(false);
    const r = await apiFetch("/account/login-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "send" }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; wait?: number };
    if (j.ok) {
      setSent(true);
      setWait(60);
    } else if (j.error === "WAIT") {
      setSent(true);
      setWait(j.wait ?? 60);
    } else {
      setSent(false);
      setFailed(true);
      setWait(30);
    }
  }

  // The first code goes out by itself.
  useEffect(() => {
    if (asked.current || status.wait > 0) return;
    asked.current = true;
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiFetch("/account/login-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", code }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (j.ok) onDone();
      else {
        setError(t(`lcode.err.${j.error ?? "WRONG"}`));
        setCode("");
      }
    } finally {
      setBusy(false);
    }
  }

  const Icon = status.channel === "telegram" ? Send : Mail;
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-soft"
      >
        <Logo className="mx-auto h-10 w-10" />
        <span className="mx-auto mt-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-foreground">{t("lcode.title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {failed
            ? t("lcode.sendFailed")
            : sent
              ? t(status.channel === "telegram" ? "lcode.sentTg" : "lcode.sentEmail", {
                  to: status.to ?? "",
                })
              : t("lcode.sending")}
        </p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          aria-label={t("lcode.title")}
          className="mt-5 h-14 w-full rounded-xl border border-border bg-background text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("lcode.confirm")}
        </button>
        <div className="mt-4 flex items-center justify-between text-[13px]">
          <button
            type="button"
            disabled={wait > 0}
            onClick={() => void send()}
            className="font-semibold text-primary disabled:text-muted-foreground"
          >
            {wait > 0 ? t("lcode.resendIn", { s: String(wait) }) : t("lcode.resend")}
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" /> {t("lcode.signOut")}
          </button>
        </div>
      </form>
    </div>
  );
}
