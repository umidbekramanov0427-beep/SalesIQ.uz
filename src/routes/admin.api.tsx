import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api";
import { API_SCOPES, type ApiScope } from "@/lib/api-keys";
import { useAuth } from "@/lib/auth";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";
import { cn, describeError, formatDate, timeAgo } from "@/lib/utils";

// Admin → API kalitlari: keys for the company's own systems to work with
// SalesIQ through /api/v1 (leads, notes, tasks, funnels). A key is shown
// once when made; the list shows only its first characters. Super admin.

export const Route = createFileRoute("/admin/api")({
  head: () => ({ meta: [{ title: "API kalitlari — SalesIQ" }] }),
  component: ApiKeysPage,
});

type KeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  createdAt: string;
  createdBy: string | null;
  lastUsedAt: string | null;
};

const QK = ["api-keys"] as const;

function ApiKeysPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  if (user && user.role !== "super_admin" && user.role !== "platform_owner") {
    return (
      <>
        <AdminBackLink />
        <SectionCard
          icon={ShieldAlert}
          tone="rose"
          title={t("admin.restrictedTitle")}
          description={t("admin.restrictedDesc")}
        >
          <p className="text-sm text-muted-foreground">{t("admin.restrictedHint")}</p>
        </SectionCard>
      </>
    );
  }
  return (
    <>
      <PageHeader
        title={t("apik.title")}
        description={t("apik.desc")}
        icon={KeyRound}
        tone="slate"
      />
      <div className="space-y-5">
        <KeysCard />
        <DocsCard />
      </div>
    </>
  );
}

function ScopeChip({ scope }: { scope: ApiScope }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
        scope.endsWith(":read")
          ? "bg-sky-500/12 text-sky-700 dark:text-sky-300"
          : "bg-amber-500/12 text-amber-700 dark:text-amber-300",
      )}
    >
      {t(`apik.scope.${scope}`)}
    </span>
  );
}

function KeysCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [...QK, user?.organizationId],
    enabled: !!user?.organizationId,
    queryFn: async (): Promise<{ keys: KeyRow[]; pending?: boolean }> => {
      const res = await apiFetch("/admin/api-keys");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { keys: KeyRow[]; pending?: boolean };
    },
  });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["leads:read"]);
  const [made, setMade] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoke, setRevoke] = useState<KeyRow | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/admin/api-keys", {
        method: "POST",
        body: JSON.stringify({ name, scopes }),
      });
      const json = (await res.json().catch(() => ({}))) as { key?: string; error?: string };
      if (!res.ok || !json.key)
        throw new Error(
          json.error === "MIGRATION_PENDING" ? t("apik.pending") : (json.error ?? t("apik.failed")),
        );
      return json.key;
    },
    onSuccess: (key) => {
      setMade({ name, key });
      setCopied(false);
      setCreating(false);
      setName("");
      setScopes(["leads:read"]);
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(describeError(e, t("apik.failed"))),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/admin/api-keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(t("apik.failed"));
    },
    onSuccess: () => {
      toast.success(t("apik.revoked"));
      void qc.invalidateQueries({ queryKey: QK });
    },
    onError: (e) => toast.error(describeError(e, t("apik.failed"))),
  });

  const keys = q.data?.keys ?? [];

  return (
    <SectionCard
      icon={KeyRound}
      tone="slate"
      title={t("apik.listTitle")}
      description={t("apik.listDesc")}
      actions={
        !creating && !q.data?.pending ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("apik.new")}
          </button>
        ) : undefined
      }
    >
      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          className="mb-4 rounded-xl border border-primary/30 bg-primary/[0.04] p-4"
        >
          <label className="block text-[12.5px] font-semibold text-muted-foreground">
            {t("apik.name")}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={t("apik.namePh")}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-foreground outline-none focus:border-primary/60"
            />
          </label>
          <p className="mt-3.5 text-[12.5px] font-semibold text-muted-foreground">
            {t("apik.scopes")}
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {API_SCOPES.map((s) => {
              const on = scopes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setScopes((cur) =>
                      on ? (cur.length > 1 ? cur.filter((x) => x !== s) : cur) : [...cur, s],
                    )
                  }
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    on ? "border-primary/60 bg-primary/[0.07]" : "border-border hover:bg-accent/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-foreground">
                      {t(`apik.scope.${s}`)}
                    </span>
                    <span className="block text-[11.5px] leading-snug text-muted-foreground">
                      {t(`apik.scopeDesc.${s}`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={!name.trim() || create.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("apik.create")}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="h-9 rounded-lg border border-border px-4 text-[13px] font-semibold hover:bg-accent"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : q.data?.pending ? (
        <p className="rounded-xl bg-surface py-8 text-center text-sm text-muted-foreground">
          {t("apik.pending")}
        </p>
      ) : keys.length === 0 ? (
        <p className="rounded-xl bg-surface py-8 text-center text-sm text-muted-foreground">
          {t("apik.empty")}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                <KeyRound className="h-4 w-4" />
              </span>
              <span className="min-w-[180px] flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-foreground">
                  {k.name}
                </span>
                <span className="block font-mono text-[12px] text-muted-foreground">
                  {k.prefix}…
                </span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {k.scopes.map((s) => (
                  <ScopeChip key={s} scope={s} />
                ))}
              </span>
              <span className="w-[170px] text-[12.5px] text-muted-foreground">
                {t("apik.created", { at: formatDate(k.createdAt) })}
                <span className="block text-[12px] text-subtle">
                  {k.lastUsedAt
                    ? t("apik.used", { ago: timeAgo(k.lastUsedAt) })
                    : t("apik.neverUsed")}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setRevoke(k)}
                aria-label={t("apik.revoke")}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-semibold text-destructive hover:border-destructive/40 hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("apik.revoke")}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!made} onOpenChange={(o) => !o && setMade(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("apik.madeTitle", { name: made?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("apik.madeDesc")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-foreground">
              {made?.key}
            </code>
            <button
              type="button"
              onClick={() =>
                made &&
                void copyText(made.key).then(
                  () => setCopied(true),
                  () => toast.error(t("common.copyFailed")),
                )
              }
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-[12.5px] font-semibold hover:bg-accent"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? t("apik.copied") : t("cabl.copy")}
            </button>
          </div>
          <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {t("apik.onceWarn")}
          </p>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!revoke}
        onOpenChange={(o) => !o && setRevoke(null)}
        title={t("apik.revokeTitle", { name: revoke?.name ?? "" })}
        description={t("apik.revokeDesc")}
        confirmLabel={t("apik.revoke")}
        destructive
        onConfirm={() => {
          if (revoke) remove.mutate(revoke.id);
          setRevoke(null);
        }}
      />
    </SectionCard>
  );
}

const ENDPOINTS: { method: string; path: string; scope: ApiScope; key: string }[] = [
  { method: "GET", path: "/api/v1/leads", scope: "leads:read", key: "list" },
  { method: "GET", path: "/api/v1/leads/{id}", scope: "leads:read", key: "get" },
  { method: "POST", path: "/api/v1/leads", scope: "leads:write", key: "create" },
  { method: "PATCH", path: "/api/v1/leads/{id}", scope: "leads:write", key: "update" },
  { method: "POST", path: "/api/v1/leads/{id}/notes", scope: "leads:write", key: "note" },
  { method: "POST", path: "/api/v1/tasks", scope: "tasks:write", key: "task" },
  { method: "GET", path: "/api/v1/pipelines", scope: "leads:read", key: "pipelines" },
];

const METHOD_TONE: Record<string, string> = {
  GET: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  POST: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  PATCH: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
};

function DocsCard() {
  const { t } = useI18n();
  const base = typeof window === "undefined" ? "https://salesiq.uz" : window.location.origin;
  const example = `curl -X POST ${base}/api/v1/leads \\
  -H "Authorization: Bearer sq_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Aziz","phone":"+998901234567","source":"Sayt"}'`;
  return (
    <SectionCard
      icon={BookOpen}
      tone="sky"
      title={t("apik.docsTitle")}
      description={t("apik.docsDesc")}
    >
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left">
          <tbody>
            {ENDPOINTS.map((e) => (
              <tr key={e.method + e.path} className="border-b border-border last:border-b-0">
                <td className="w-[86px] px-4 py-2.5">
                  <span
                    className={cn(
                      "rounded-md px-2 py-0.5 font-mono text-[11.5px] font-bold",
                      METHOD_TONE[e.method],
                    )}
                  >
                    {e.method}
                  </span>
                </td>
                <td className="px-2 py-2.5 font-mono text-[12.5px] text-foreground">{e.path}</td>
                <td className="px-4 py-2.5 text-[12.5px] text-muted-foreground">
                  {t(`apik.ep.${e.key}`)}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <ScopeChip scope={e.scope} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-[12.5px] font-semibold text-muted-foreground">{t("apik.example")}</p>
      <pre className="mt-1.5 overflow-x-auto rounded-xl border border-border bg-surface px-4 py-3 font-mono text-[12px] leading-relaxed text-foreground">
        {example}
      </pre>
      <p className="mt-3 text-[12px] text-subtle">{t("apik.limits")}</p>
    </SectionCard>
  );
}
