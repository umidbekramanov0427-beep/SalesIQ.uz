import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { BrandMark } from "@/components/BrandMark";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/sign/$token")({
  head: () => ({
    meta: [{ title: "Contract signing — SalesIQ" }, { name: "robots", content: "noindex" }],
  }),
  component: PublicSignPage,
});

type ContractConfig = {
  title: string;
  body: string;
  status: "draft" | "sent" | "signed";
  signerName: string | null;
  signedAt: string | null;
};

function PublicSignPage() {
  const { t } = useI18n();
  const { token } = Route.useParams();
  const [config, setConfig] = useState<ContractConfig | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justSigned, setJustSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/contracts/${token}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: ContractConfig) => {
        if (!cancelled) setConfig(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!signerName.trim() || !agreed) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/contracts/${token}/sign`, {
        method: "POST",
        body: JSON.stringify({ signerName: signerName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? t("form.error"));
      setJustSigned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("form.error"));
    } finally {
      setSubmitting(false);
    }
  }

  const signed = justSigned || config?.status === "signed";

  return (
    <div className="flex min-h-screen items-start justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-2xl">
        <BrandMark className="mb-6" />
        <div className="kpi-sheen rounded-2xl border border-border bg-background p-6 shadow-soft">
          {notFound && <p className="py-6 text-center text-sm text-subtle">{t("sign.notFound")}</p>}

          {!notFound && !config && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
            </div>
          )}

          {config && signed && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <p className="text-sm font-medium text-foreground">{t("sign.done")}</p>
              {(config.signerName || justSigned) && (
                <p className="text-xs text-subtle">
                  {justSigned ? signerName : config.signerName}
                  {config.signedAt && ` · ${new Date(config.signedAt).toLocaleString()}`}
                </p>
              )}
            </div>
          )}

          {config && !signed && (
            <div className="space-y-5">
              <h1 className="text-lg font-semibold text-foreground">{config.title}</h1>
              <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-xl border border-border bg-surface p-4 text-sm text-foreground">
                {config.body}
              </div>

              <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {t("sign.fullName")}
                  </span>
                  <input
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    required
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
                  />
                </label>

                <label className="flex items-start gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5"
                  />
                  {t("sign.agree")}
                </label>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting || !signerName.trim() || !agreed}
                  className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("sign.sign")}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
