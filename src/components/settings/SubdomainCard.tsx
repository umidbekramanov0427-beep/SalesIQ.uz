import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, ExternalLink, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ROOT_DOMAIN, companyOrigin, normalizeSubdomain, subdomainProblem } from "@/lib/subdomain";

// Settings > Umumiy: the company's own address, <subdomain>.salesiq.uz.
// Only the company admin can change it; everyone else sees it read-only.
// The admin also sees whether the address already opens: saving attaches
// it to the Vercel project, and DNS/HTTPS take a few minutes after that.

type DomainStatus = "active" | "pending" | "missing" | "unconfigured" | "error";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}
export function SubdomainCard() {
  const { t } = useI18n();
  const { user, refreshProfile } = useAuth();
  const canEdit = user?.role === "super_admin" || user?.role === "platform_owner";
  const current = user?.orgSubdomain ?? "";
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<DomainStatus | null>(null);

  useEffect(() => setValue(current), [current]);

  // Re-checked while the address is still being set up.
  useEffect(() => {
    if (!current || !canEdit) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const check = async () => {
      const res = await fetch("/org/subdomain?status=1", { headers: await authHeader() }).catch(
        () => null,
      );
      const json = (await res?.json().catch(() => ({}))) as { status?: DomainStatus | null };
      if (cancelled) return;
      setStatus(json?.status ?? "error");
      if (json?.status === "pending") timer = window.setTimeout(() => void check(), 20_000);
    };
    void check();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [current, canEdit]);

  const normalized = normalizeSubdomain(value);
  const problem = normalized ? subdomainProblem(normalized) : null;
  const dirty = normalized !== current;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/org/subdomain", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ subdomain: normalized }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: DomainStatus | null;
      };
      if (!res.ok) {
        const key =
          json.error === "taken"
            ? "subdomain.taken"
            : json.error === "reserved"
              ? "subdomain.reserved"
              : json.error === "format"
                ? "subdomain.format"
                : null;
        throw new Error(key ? t(key) : (json.error ?? `HTTP ${res.status}`));
      }
      setStatus(json.status ?? null);
      await refreshProfile();
      toast.success(t("subdomain.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const url = current ? companyOrigin(current) : null;

  return (
    <div className="mt-5 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Globe className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-foreground">{t("subdomain.title")}</p>
          <p className="text-xs text-subtle">{t("subdomain.desc")}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-border bg-background focus-within:border-primary/40">
          <span className="pl-3 text-sm text-subtle">https://</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={!canEdit}
            placeholder="kompaniya"
            className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm font-medium text-foreground outline-none disabled:text-muted-foreground"
          />
          <span className="pr-3 text-sm text-subtle">.{ROOT_DOMAIN}</span>
        </div>
        {canEdit && (
          <button
            type="button"
            disabled={!dirty || !!problem || saving}
            onClick={() => void save()}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("subdomain.save")}
          </button>
        )}
      </div>
      {value && problem && (
        <p className="mt-2 text-xs text-destructive">
          {t(problem === "reserved" ? "subdomain.reserved" : "subdomain.format")}
        </p>
      )}
      {url && status && (
        <p
          className={cn(
            "mt-3 flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs",
            status === "active"
              ? "bg-success/10 text-success"
              : "bg-warning/10 text-warning-foreground",
          )}
        >
          {status === "active" ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : (
            <Clock3 className="mt-px h-3.5 w-3.5 shrink-0" />
          )}
          {t(
            status === "active"
              ? "subdomain.statusActive"
              : status === "pending"
                ? "subdomain.statusPending"
                : "subdomain.statusSetup",
          )}
        </p>
      )}
      {url && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            {url.replace("https://", "")} <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard?.writeText(url).then(
                () => toast.success(t("subdomain.copied")),
                () => undefined,
              )
            }
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <Copy className="h-3 w-3" /> {t("subdomain.copy")}
          </button>
        </div>
      )}
    </div>
  );
}
