import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getMfaStatus, verifyCode, type MfaStatus } from "@/lib/mfa";
import { Logo } from "@/components/Logo";

// After the password, someone with an authenticator set up gets this screen
// instead of the app until they enter the 6-digit code. It sits inside the
// AuthGate, so a refresh with an aal1 session lands here again.
export function MfaGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getMfaStatus()
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus({ enabled: false, needsCode: false, factorId: null }));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!status) return null;
  if (!status.needsCode || !status.factorId) return <>{children}</>;
  return (
    <MfaChallenge
      factorId={status.factorId}
      onDone={() => setStatus({ ...status, needsCode: false })}
    />
  );
}

function MfaChallenge({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyCode(factorId, code);
      onDone();
    } catch {
      setError(t("mfa.wrongCode"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 text-center shadow-soft"
      >
        <Logo className="mx-auto h-10 w-10" />
        <span className="mx-auto mt-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary/12 text-primary">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-foreground">{t("mfa.challengeTitle")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("mfa.challengeDesc")}</p>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder="000000"
          aria-label={t("mfa.codeLabel")}
          className="mt-5 h-14 w-full rounded-xl border border-border bg-background text-center font-mono text-2xl tracking-[0.5em] text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          disabled={code.length !== 6 || busy}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("mfa.verify")}
        </button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> {t("mfa.useAnother")}
        </button>
      </form>
    </div>
  );
}
