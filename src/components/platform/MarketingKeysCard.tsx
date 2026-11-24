import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";
import { OwnerPanel } from "@/components/owner/OwnerPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Platforma -> Sozlamalar -> Marketing: the marketing panel's platform keys
// (/platform/marketing-keys). The Meta app every company connects its ad
// accounts through, YouTube's cookies for live frames, and whether the
// tg-live service (Telegram live + YouTube frames) answers. Secrets are
// sealed on the server and never come back.

type Status = {
  ready: boolean;
  meta: { source: "env" | "panel" | "instagram" | null; appId: string | null; redirectUri: string };
  youtube: { cookies: boolean };
  tglive: { configured: boolean; up: boolean };
};

const KEY = ["owner-marketing-keys"];

async function post(body: Record<string, unknown>) {
  const res = await apiFetch("/platform/marketing-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    ok?: boolean;
    image?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return (
    <span
      className={cn(
        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
        ok ? "bg-emerald-500" : warn ? "bg-amber-500" : "bg-rose-500",
      )}
    />
  );
}

function StatusLine({ ok, warn, children }: { ok: boolean; warn?: boolean; children: string }) {
  return (
    <p className="flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-[12.5px] text-muted-foreground">
      <Dot ok={ok} {...(warn ? { warn } : {})} />
      <span>{children}</span>
    </p>
  );
}

export function MarketingKeysCards() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res = await apiFetch("/platform/marketing-keys");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Status;
    },
  });
  const done = () => {
    toast.success(t("common.saved"));
    void qc.invalidateQueries({ queryKey: KEY });
  };
  const fail = (e: Error) => toast.error(e.message);

  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const saveMeta = useMutation({
    mutationFn: () => post({ action: "meta", appId: appId || data?.meta.appId || "", secret }),
    onSuccess: () => {
      setSecret("");
      done();
    },
    onError: fail,
  });
  const clearMeta = useMutation({
    mutationFn: () => post({ action: "meta-clear" }),
    onSuccess: done,
    onError: fail,
  });

  const [cookies, setCookies] = useState("");
  const saveCookies = useMutation({
    mutationFn: () => post({ action: "cookies", text: cookies }),
    onSuccess: () => {
      setCookies("");
      done();
    },
    onError: fail,
  });
  const clearCookies = useMutation({
    mutationFn: () => post({ action: "cookies-clear" }),
    onSuccess: done,
    onError: fail,
  });

  const [url, setUrl] = useState("");
  const [test, setTest] = useState<{ image?: string; error?: string } | null>(null);
  const runTest = useMutation({
    mutationFn: () => post({ action: "yt-test", url }),
    onMutate: () => setTest(null),
    onSuccess: (r) => setTest(r.ok && r.image ? { image: r.image } : { error: r.error ?? "—" }),
    onError: (e: Error) => setTest({ error: e.message }),
  });

  if (data && !data.ready)
    return (
      <OwnerPanel title={t("mk.title")}>
        <p className="text-[13px] text-amber-700 dark:text-amber-300">{t("mk.notReady")}</p>
      </OwnerPanel>
    );

  const src = data?.meta.source ?? null;
  return (
    <div className="space-y-4">
      <OwnerPanel title={t("mk.meta.title")} info={t("mk.meta.info")}>
        <div className="space-y-3">
          <StatusLine ok={!!src} warn={src === "instagram"}>
            {src === "env"
              ? t("mk.meta.env")
              : src === "panel"
                ? t("mk.meta.panel", { id: data?.meta.appId ?? "" })
                : src === "instagram"
                  ? t("mk.meta.instagram")
                  : t("mk.meta.none")}
          </StatusLine>
          <ol className="list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted-foreground">
            <li>{t("mk.meta.step1")}</li>
            <li>{t("mk.meta.step2")}</li>
            <li>
              {t("mk.meta.step3")}{" "}
              <button
                type="button"
                className="inline-flex items-center gap-1 font-mono text-[12px] text-primary hover:underline"
                onClick={() => {
                  void navigator.clipboard.writeText(data?.meta.redirectUri ?? "");
                  toast.success(t("common.copied"));
                }}
              >
                {data?.meta.redirectUri}
                <Copy className="h-3 w-3" />
              </button>
            </li>
            <li>{t("mk.meta.step4")}</li>
          </ol>
          {src !== "env" && (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                inputMode="numeric"
                placeholder={data?.meta.appId ?? "App ID"}
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
              />
              <Input
                type="password"
                autoComplete="off"
                placeholder={src === "panel" ? t("mk.meta.secretKeep") : "App Secret"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
              <Button
                disabled={saveMeta.isPending || (!appId && !secret)}
                onClick={() => saveMeta.mutate()}
              >
                {saveMeta.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </div>
          )}
          {src === "panel" && (
            <Button
              variant="outline"
              size="sm"
              disabled={clearMeta.isPending}
              onClick={() => clearMeta.mutate()}
            >
              {t("mk.meta.clear")}
            </Button>
          )}
        </div>
      </OwnerPanel>

      <OwnerPanel title={t("mk.live.title")} info={t("mk.live.info")}>
        <div className="space-y-3">
          <StatusLine ok={!!data?.tglive.up} warn={!!data?.tglive.configured && !data?.tglive.up}>
            {!data?.tglive.configured
              ? t("mk.live.notConfigured")
              : data.tglive.up
                ? t("mk.live.up")
                : t("mk.live.down")}
          </StatusLine>
          <p className="text-[12.5px] text-muted-foreground">{t("mk.live.telegram")}</p>
        </div>
      </OwnerPanel>

      <OwnerPanel title={t("mk.yt.title")} info={t("mk.yt.info")}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="https://www.youtube.com/watch?v=…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button disabled={!url || runTest.isPending} onClick={() => runTest.mutate()}>
              {runTest.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("mk.yt.test")}
            </Button>
          </div>
          {runTest.isPending && (
            <p className="text-[12.5px] text-muted-foreground">{t("mk.yt.testing")}</p>
          )}
          {test?.image && (
            <div className="space-y-2">
              <StatusLine ok>{t("mk.yt.ok")}</StatusLine>
              <img
                src={`data:image/jpeg;base64,${test.image}`}
                alt=""
                className="max-h-64 rounded-lg border border-border"
              />
            </div>
          )}
          {test?.error && (
            <StatusLine ok={false}>
              {`${t("mk.yt.failed")} ${test.error}${/sign in|bot/i.test(test.error) ? ` — ${t("mk.yt.needCookies")}` : ""}`}
            </StatusLine>
          )}
          <div className="border-t border-border pt-3">
            <StatusLine ok={!!data?.youtube.cookies} warn={!data?.youtube.cookies}>
              {data?.youtube.cookies ? t("mk.yt.cookiesOn") : t("mk.yt.cookiesOff")}
            </StatusLine>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted-foreground">
              <li>{t("mk.yt.c1")}</li>
              <li>{t("mk.yt.c2")}</li>
              <li>{t("mk.yt.c3")}</li>
            </ol>
            <textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder="# Netscape HTTP Cookie File …"
              className="mt-3 h-28 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[12px] outline-none focus:border-primary"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="ctl-soft inline-flex h-9 cursor-pointer items-center rounded-lg px-3 text-[13px] font-semibold">
                {t("mk.yt.file")}
                <input
                  type="file"
                  accept=".txt,text/plain"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) setCookies(await f.text());
                    e.target.value = "";
                  }}
                />
              </label>
              <Button
                disabled={!cookies || saveCookies.isPending}
                onClick={() => saveCookies.mutate()}
              >
                {t("common.save")}
              </Button>
              {data?.youtube.cookies && (
                <Button
                  variant="outline"
                  disabled={clearCookies.isPending}
                  onClick={() => clearCookies.mutate()}
                >
                  {t("mk.yt.cookiesClear")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </OwnerPanel>
    </div>
  );
}
