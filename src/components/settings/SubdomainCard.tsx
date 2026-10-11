import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ROOT_DOMAIN, companyOrigin, normalizeSubdomain, subdomainProblem } from "@/lib/subdomain";

// Settings > Umumiy: the company's own address, <subdomain>.salesiq.uz.
// Only the company admin can change it; everyone else sees it read-only.
// The admin also sees whether the address already opens: saving attaches
// it to the Vercel project, and DNS/HTTPS take a few minutes after that.
// Changing or deleting it asks first -- the old address stops working.

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
  // With an address saved the card shows it with Change / Delete; the field
  // appears only while choosing the first one or changing it.
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"change" | "delete" | null>(null);
  const showField = canEdit && (!current || editing);

  async function save(next: string) {
    setSaving(true);
    try {
      const res = await fetch("/org/subdomain", {
        method: "POST",
        headers: { "content-type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ subdomain: next }),
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
      setEditing(false);
      await refreshProfile();
      toast.success(t(next ? "subdomain.saved" : "subdomain.deleted"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const url = current ? companyOrigin(current) : null;
  const host = (sub: string) => `${sub}.${ROOT_DOMAIN}`;

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

      {showField ? (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-xl border border-border bg-background focus-within:border-primary/40">
              <span className="pl-3 text-sm text-subtle">https://</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && normalized && dirty && !problem) {
                    if (current) setConfirm("change");
                    else void save(normalized);
                  }
                }}
                autoFocus={editing}
                placeholder="kompaniya"
                className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm font-medium text-foreground outline-none"
              />
              <span className="pr-3 text-sm text-subtle">.{ROOT_DOMAIN}</span>
            </div>
            <button
              type="button"
              disabled={!normalized || !dirty || !!problem || saving}
              onClick={() => (current ? setConfirm("change") : void save(normalized))}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("subdomain.save")}
            </button>
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setValue(current);
                }}
                className="inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-accent"
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
          {value && problem && (
            <p className="mt-2 text-xs text-destructive">
              {t(problem === "reserved" ? "subdomain.reserved" : "subdomain.format")}
            </p>
          )}
        </>
      ) : url ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold text-primary hover:underline"
            >
              {host(current)} <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
            <button
              type="button"
              title={t("subdomain.copy")}
              aria-label={t("subdomain.copy")}
              onClick={() =>
                void navigator.clipboard?.writeText(url).then(
                  () => toast.success(t("subdomain.copied")),
                  () => undefined,
                )
              }
              className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-accent"
              >
                <Pencil className="h-4 w-4" /> {t("subdomain.change")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirm("delete")}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-destructive/30 bg-background px-4 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}{" "}
                {t("subdomain.delete")}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-subtle">{t("subdomain.none")}</p>
      )}

      {url && status && !editing && (
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

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t(confirm === "delete" ? "subdomain.deleteTitle" : "subdomain.changeTitle")}
        description={
          confirm === "delete"
            ? t("subdomain.deleteDesc", { old: host(current), root: ROOT_DOMAIN })
            : t("subdomain.changeDesc", { old: host(current), next: host(normalized) })
        }
        confirmLabel={t(confirm === "delete" ? "subdomain.delete" : "subdomain.save")}
        destructive={confirm === "delete"}
        onConfirm={() => {
          const next = confirm === "delete" ? "" : normalized;
          setConfirm(null);
          void save(next);
        }}
      />
    </div>
  );
}
