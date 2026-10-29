import { useEffect, useState } from "react";
import { Copy, Instagram, Loader2, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { SectionCard, StatusChip } from "@/components/layout/Primitives";
import {
  useConnectInstagram,
  useDisconnectInstagram,
  useInstagramAccount,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { describeError, formatDate } from "@/lib/utils";
import { copyText } from "@/lib/clipboard";

// /integrations/instagram: the company's Instagram professional account.
// Once connected, every Direct message becomes (or joins) a lead and the
// team replies from the lead card. The Meta app itself is the platform's
// (env INSTAGRAM_*); until it is set up, the platform owner sees what to
// enter in Meta and everyone else a short "coming soon".

const RESULT_KEY: Record<string, { ok: boolean; key: string }> = {
  connected: { ok: true, key: "ig.result.connected" },
  denied: { ok: false, key: "ig.result.denied" },
  expired: { ok: false, key: "ig.result.expired" },
  error: { ok: false, key: "ig.result.error" },
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">
          {value}
        </code>
        <button
          type="button"
          aria-label={t("tma.copy")}
          onClick={() => {
            void copyText(value).then(
              () => toast.success(t("tma.copied")),
              () => toast.error(t("common.copyFailed")),
            );
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function InstagramCard() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin" || user?.role === "platform_owner";
  const isOwner = user?.role === "platform_owner";
  const { data, isLoading } = useInstagramAccount();
  const connect = useConnectInstagram();
  const disconnect = useDisconnectInstagram();
  const [confirmOff, setConfirmOff] = useState(false);

  // Back from Instagram's sign-in page with ?ig=<result>.
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("ig");
    if (!result) return;
    const r = RESULT_KEY[result];
    if (r) (r.ok ? toast.success : toast.error)(t(r.key));
    url.searchParams.delete("ig");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [t]);

  async function startConnect() {
    try {
      await connect.mutateAsync();
    } catch (err) {
      toast.error(describeError(err, t("ig.result.error")));
    }
  }

  const account = data?.account ?? null;
  const state = !data ? null : account ? (account.last_error ? "warn" : "ok") : "off";

  return (
    <div className="space-y-4">
      <SectionCard
        icon={Instagram}
        tone="rose"
        title={t("ig.title")}
        description={t("ig.desc")}
        actions={
          state && (
            <StatusChip state={state}>{account ? t("ig.statusOn") : t("ig.statusOff")}</StatusChip>
          )
        }
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.ready ? (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            {t("ig.notReady")}
          </p>
        ) : account ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface p-4">
              {account.picture_url ? (
                <img
                  src={account.picture_url}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 rounded-full object-cover ring-2 ring-pink-500/40"
                />
              ) : (
                <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white">
                  <Instagram className="h-6 w-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-foreground">
                  {account.username ? `@${account.username}` : (account.name ?? "Instagram")}
                </p>
                {account.name && account.username && (
                  <p className="truncate text-sm text-muted-foreground">{account.name}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("ig.connectedAt", { date: formatDate(account.connected_at) })}
                  {" · "}
                  {account.last_event_at
                    ? t("ig.lastMessage", { date: formatDate(account.last_event_at) })
                    : t("ig.noMessagesYet")}
                </p>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void startConnect()}
                    disabled={connect.isPending}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                  >
                    <RefreshCw className="h-4 w-4" /> {t("ig.reconnect")}
                  </button>
                  {confirmOff ? (
                    <button
                      type="button"
                      onClick={() =>
                        disconnect.mutate(undefined, {
                          onSuccess: () => toast.success(t("ig.disconnected")),
                          onError: (e) => toast.error(describeError(e, t("ig.result.error"))),
                          onSettled: () => setConfirmOff(false),
                        })
                      }
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground"
                    >
                      {disconnect.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {t("ig.confirmDisconnect")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmOff(true)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" /> {t("ig.disconnect")}
                    </button>
                  )}
                </div>
              )}
            </div>
            {account.last_error && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200">
                {t("ig.lastError")}: {account.last_error}
              </p>
            )}
            <ul className="grid gap-2 text-sm sm:grid-cols-3">
              {["ig.how1", "ig.how2", "ig.how3"].map((k) => (
                <li
                  key={k}
                  className="rounded-lg border border-border bg-surface p-3 text-foreground"
                >
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        ) : !data.configured ? (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            {t("ig.notConfigured")}
          </p>
        ) : (
          <div className="space-y-4">
            <ol className="grid gap-2 text-sm sm:grid-cols-3">
              {["ig.step1", "ig.step2", "ig.step3"].map((k, i) => (
                <li
                  key={k}
                  className="flex gap-2.5 rounded-lg border border-border bg-surface p-3 text-foreground"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  {t(k)}
                </li>
              ))}
            </ol>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => void startConnect()}
                disabled={connect.isPending}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#d62976] to-[#4f5bd5] px-5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {connect.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Instagram className="h-4 w-4" />
                )}
                {t("ig.connect")}
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">{t("ig.adminOnly")}</p>
            )}
          </div>
        )}
      </SectionCard>

      {isOwner && data && (
        <SectionCard
          icon={Instagram}
          tone="slate"
          title={t("ig.metaTitle")}
          description={t("ig.metaDesc")}
        >
          <div className="space-y-3">
            <CopyRow label={t("ig.redirectUri")} value={data.redirectUri} />
            <CopyRow label={t("ig.webhookUrl")} value={data.webhookUrl} />
            <p className="rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              {t("ig.metaEnv")}
            </p>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
