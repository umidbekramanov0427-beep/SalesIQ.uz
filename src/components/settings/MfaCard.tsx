import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { disableMfa, getMfaStatus, startEnrollment, verifyCode, type MfaStatus } from "@/lib/mfa";
import { copyText } from "@/lib/clipboard";

// Settings > Profile: turn two-step sign-in on (scan a QR code, enter the
// code once) or off. Recommended for everyone, required in practice for the
// platform owner, whose account can open every company.
export function MfaCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const refresh = () =>
    getMfaStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, needsCode: false, factorId: null }));

  useEffect(() => {
    void refresh();
  }, []);

  async function begin() {
    setBusy(true);
    try {
      setSetup(await startEnrollment());
      setCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    if (!setup) return;
    setBusy(true);
    try {
      await verifyCode(setup.factorId, code);
      setSetup(null);
      await refresh();
      toast.success(t("mfa.enabledToast"));
    } catch {
      toast.error(t("mfa.wrongCode"));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    if (!status?.factorId) return;
    setBusy(true);
    try {
      await disableMfa(status.factorId);
      await refresh();
      toast.success(t("mfa.disabledToast"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const owner = user?.role === "platform_owner";

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">{t("mfa.title")}</p>
          <p className="text-xs text-subtle">{t(owner ? "mfa.descOwner" : "mfa.desc")}</p>
        </div>
        {status?.enabled && (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t("mfa.on")}
          </span>
        )}
      </div>

      {!status ? null : status.enabled ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("mfa.onHint")}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmOff(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-destructive/30 bg-background px-3 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <ShieldOff className="h-4 w-4" /> {t("mfa.turnOff")}
          </button>
        </div>
      ) : setup ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
          <img
            src={setup.qr}
            alt={t("mfa.qrAlt")}
            className="h-[180px] w-[180px] rounded-xl border border-border bg-white p-2"
          />
          <div className="min-w-0 space-y-3 text-sm">
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
              <li>{t("mfa.step1")}</li>
              <li>{t("mfa.step2")}</li>
              <li>{t("mfa.step3")}</li>
            </ol>
            <button
              type="button"
              onClick={() =>
                void copyText(setup.secret).then(
                  () => toast.success(t("mfa.secretCopied")),
                  () => undefined,
                )
              }
              className="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-foreground hover:bg-accent"
              title={t("mfa.copySecret")}
            >
              <Copy className="h-3.5 w-3.5 shrink-0" /> {setup.secret}
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                aria-label={t("mfa.codeLabel")}
                className="h-10 w-36 rounded-xl border border-border bg-background text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
              />
              <button
                type="button"
                disabled={code.length !== 6 || busy}
                onClick={() => void finish()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("mfa.confirm")}
              </button>
              <button
                type="button"
                onClick={() => setSetup(null)}
                className="inline-flex h-10 items-center rounded-xl border border-border px-3 text-sm text-muted-foreground hover:bg-accent"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void begin()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {t("mfa.turnOn")}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={t("mfa.offTitle")}
        description={t("mfa.offDesc")}
        confirmLabel={t("mfa.turnOff")}
        destructive
        onConfirm={() => {
          setConfirmOff(false);
          void turnOff();
        }}
      />
    </div>
  );
}
