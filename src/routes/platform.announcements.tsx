import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Loader2, Megaphone, Plus, Radio, Send, Trash2 } from "lucide-react";
import {
  OwnerEmpty,
  OwnerHeader,
  OwnerPanel,
  OwnerSegment,
  OwnerStat,
} from "@/components/owner/OwnerPage";
import { AnnouncementStrip, KIND_LOOK } from "@/components/announcements/AnnouncementBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import { ANNOUNCEMENT_KINDS, AUDIENCES } from "@/lib/announcements";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner → E'lonlar: write an announcement (an update, a late payment, news,
// a reminder, a warning), pick who sees it (every company, those on trial /
// paid / expired, or chosen ones) and until when, optionally also send it to
// the company owners' Telegram. It shows as a strip at the top of their app.
export const Route = createFileRoute("/platform/announcements")({
  head: () => ({ meta: [{ title: "E'lonlar — SalesIQ Owner" }] }),
  component: AnnouncementsPage,
});

type Row = {
  id: string;
  title: string;
  body: string;
  kind: string;
  audience: string;
  org_ids: string[];
  link_url: string | null;
  link_label: string | null;
  dismissible: boolean;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  telegram_sent_count: number;
  telegram_sent_at: string | null;
  created_at: string;
  dismissed: number;
};
type Data = { ready: boolean; items: Row[]; companies: { id: string; name: string }[] };

const EMPTY = {
  title: "",
  body: "",
  kind: "update",
  audience: "all",
  orgIds: [] as string[],
  linkUrl: "",
  linkLabel: "",
  endsAt: "",
  dismissible: true,
  telegram: false,
};

const field =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary";

function AnnouncementsPage() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState<"live" | "all">("live");
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [companyQuery, setCompanyQuery] = useState("");
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ["owner-announcements"],
    queryFn: async (): Promise<Data> => {
      const res = await apiFetch("/platform/announcements-api");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const items = data?.items ?? [];
  const companies = data?.companies ?? [];
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? "—";
  const isLive = (a: Row) =>
    a.active &&
    new Date(a.starts_at).getTime() <= Date.now() &&
    (!a.ends_at || new Date(a.ends_at).getTime() > Date.now());
  const shown = filter === "live" ? items.filter(isLive) : items;
  const stats = {
    live: items.filter(isLive).length,
    total: items.length,
    telegram: items.reduce((n, a) => n + (a.telegram_sent_count ?? 0), 0),
    closed: items.reduce((n, a) => n + a.dismissed, 0),
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["owner-announcements"] });
  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/platform/announcements-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:00`).toISOString() : null,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; telegramSent?: number };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      return j;
    },
    onSuccess: (j) => {
      toast.success(
        form.telegram ? t("ann.sentTg", { n: String(j.telegramSent ?? 0) }) : t("ann.published"),
      );
      setForm(EMPTY);
      void refresh();
    },
    onError: (e: Error) =>
      toast.error(e.message === "PICK_COMPANIES" ? t("ann.pickCompanies") : e.message),
  });
  const toggle = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => {
      const res = await apiFetch("/platform/announcements-api", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onMutate: (v) =>
      qc.setQueryData<Data>(["owner-announcements"], (old) =>
        old
          ? {
              ...old,
              items: old.items.map((a) => (a.id === v.id ? { ...a, active: v.active } : a)),
            }
          : old,
      ),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/platform/announcements-api?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      toast.success(t("ann.deleted"));
      void refresh();
    },
  });

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    return q ? companies.filter((c) => c.name.toLowerCase().includes(q)) : companies;
  }, [companies, companyQuery]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
      day: "numeric",
      month: "short",
    });
  const audienceText = (a: Row) =>
    a.audience === "orgs"
      ? a.org_ids.length === 1
        ? companyName(a.org_ids[0]!)
        : t("ann.nCompanies", { n: String(a.org_ids.length) })
      : t(`ann.aud.${a.audience}`);

  const canSend = form.title.trim() && (form.audience !== "orgs" || form.orgIds.length > 0);

  return (
    <div className="w-full">
      <OwnerHeader icon={Megaphone} title={t("ann.title")} desc={t("ann.desc")} />

      {data && !data.ready && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
          {t("ann.notReady")}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OwnerStat icon={Radio} tone="green" label={t("ann.statLive")} value={stats.live} />
        <OwnerStat icon={Megaphone} tone="blue" label={t("ann.statTotal")} value={stats.total} />
        <OwnerStat icon={Send} tone="violet" label={t("ann.statTg")} value={stats.telegram} />
        <OwnerStat icon={Eye} tone="slate" label={t("ann.statClosed")} value={stats.closed} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <OwnerPanel
          flush
          title={t("ann.list")}
          actions={
            <OwnerSegment
              value={filter}
              options={[
                { value: "live", label: t("ann.fLive") },
                { value: "all", label: t("ann.fAll") },
              ]}
              onChange={(v) => setFilter(v as "live" | "all")}
            />
          }
        >
          {isLoading ? (
            <div className="grid place-items-center p-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : shown.length === 0 ? (
            <OwnerEmpty icon={Megaphone} title={t("ann.empty")} hint={t("ann.emptyHint")} />
          ) : (
            <ul className="divide-y divide-border">
              {shown.map((a) => {
                const look = KIND_LOOK[a.kind] ?? KIND_LOOK["news"]!;
                const Icon = look.icon;
                const live = isLive(a);
                return (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-3.5">
                    <span
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg",
                        look.chip,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13.5px] font-semibold text-foreground">
                          {a.title}
                        </p>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-px text-[10.5px] font-semibold",
                            live
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {live
                            ? t("ann.live")
                            : a.active && a.ends_at
                              ? t("ann.ended")
                              : t("ann.off")}
                        </span>
                      </div>
                      {a.body && (
                        <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted-foreground">
                          {a.body}
                        </p>
                      )}
                      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-subtle">
                        <span>{t(`ann.kind.${a.kind}`)}</span>
                        <span>· {audienceText(a)}</span>
                        <span>
                          · {fmt(a.starts_at)}
                          {a.ends_at ? ` – ${fmt(a.ends_at)}` : ""}
                        </span>
                        {a.telegram_sent_at && (
                          <span>· {t("ann.tgCount", { n: String(a.telegram_sent_count) })}</span>
                        )}
                        {a.dismissed > 0 && (
                          <span>· {t("ann.closedCount", { n: String(a.dismissed) })}</span>
                        )}
                      </p>
                    </div>
                    <Switch
                      checked={a.active}
                      onCheckedChange={(v) => toggle.mutate({ id: a.id, active: v })}
                      aria-label={t("ann.toggle")}
                    />
                    <button
                      type="button"
                      onClick={() => setToDelete(a)}
                      aria-label={t("common.delete")}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </OwnerPanel>

        <OwnerPanel title={t("ann.new")} info={t("ann.newInfo")} className="lg:sticky lg:top-0">
          <div className="space-y-3.5">
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-muted-foreground">
                {t("ann.kindLabel")}
              </p>
              <div className="grid grid-cols-5 gap-1.5">
                {ANNOUNCEMENT_KINDS.map((k) => {
                  const look = KIND_LOOK[k]!;
                  const Icon = look.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set("kind", k)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[10.5px] font-semibold transition-colors",
                        form.kind === k
                          ? "border-primary bg-primary/8 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className={cn("grid h-6 w-6 place-items-center rounded-md", look.chip)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="w-full truncate text-center">{t(`ann.kind.${k}`)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <input
              className={field}
              value={form.title}
              maxLength={160}
              onChange={(e) => set("title", e.target.value)}
              placeholder={t("ann.titlePh")}
            />
            <textarea
              className={cn(field, "h-auto min-h-[84px] resize-y py-2 leading-snug")}
              value={form.body}
              maxLength={2000}
              onChange={(e) => set("body", e.target.value)}
              placeholder={t("ann.bodyPh")}
            />

            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-muted-foreground">
                {t("ann.audience")}
              </p>
              <select
                className={field}
                value={form.audience}
                onChange={(e) => set("audience", e.target.value)}
              >
                {AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {t(`ann.aud.${a}`)}
                  </option>
                ))}
              </select>
              {form.audience === "orgs" && (
                <div className="mt-2 rounded-lg border border-border">
                  <input
                    className="h-8 w-full border-b border-border bg-transparent px-3 text-[12.5px] outline-none placeholder:text-subtle"
                    placeholder={t("ann.searchCompany")}
                    value={companyQuery}
                    onChange={(e) => setCompanyQuery(e.target.value)}
                  />
                  <div className="max-h-40 overflow-y-auto py-1">
                    {filteredCompanies.map((c) => {
                      const on = form.orgIds.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-muted/60"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              set(
                                "orgIds",
                                on ? form.orgIds.filter((x) => x !== c.id) : [...form.orgIds, c.id],
                              )
                            }
                            className="accent-[var(--primary)]"
                          />
                          <span className="truncate">{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="border-t border-border px-3 py-1.5 text-[11.5px] text-subtle">
                    {t("ann.nCompanies", { n: String(form.orgIds.length) })}
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                className={field}
                value={form.linkUrl}
                onChange={(e) => set("linkUrl", e.target.value)}
                placeholder="https://…"
              />
              <input
                className={field}
                value={form.linkLabel}
                maxLength={60}
                onChange={(e) => set("linkLabel", e.target.value)}
                placeholder={t("ann.linkLabelPh")}
              />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <span className="shrink-0">{t("ann.until")}</span>
              <input
                type="date"
                className={cn(field, "h-8")}
                value={form.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
              />
            </label>

            <div className="divide-y divide-border rounded-lg border border-border">
              <label className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 text-[12.5px]">
                  <span className="block font-semibold text-foreground">
                    {t("ann.dismissible")}
                  </span>
                  <span className="text-subtle">{t("ann.dismissibleHint")}</span>
                </span>
                <Switch checked={form.dismissible} onCheckedChange={(v) => set("dismissible", v)} />
              </label>
              <label className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1 text-[12.5px]">
                  <span className="block font-semibold text-foreground">{t("ann.telegram")}</span>
                  <span className="text-subtle">{t("ann.telegramHint")}</span>
                </span>
                <Switch checked={form.telegram} onCheckedChange={(v) => set("telegram", v)} />
              </label>
            </div>

            {form.title.trim() && (
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-muted-foreground">
                  {t("ann.preview")}
                </p>
                <div className="overflow-hidden rounded-lg border border-border">
                  <AnnouncementStrip
                    a={{
                      id: "preview",
                      title: form.title,
                      body: form.body,
                      kind: form.kind,
                      linkUrl: /^https?:\/\//.test(form.linkUrl) ? form.linkUrl : null,
                      linkLabel: form.linkLabel || null,
                      dismissible: form.dismissible,
                    }}
                    onClose={() => {}}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!canSend || create.isPending}
              onClick={() => create.mutate()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {form.telegram ? t("ann.publishTg") : t("ann.publish")}
            </button>
          </div>
        </OwnerPanel>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("ann.deleteTitle")}
        description={toDelete?.title ?? ""}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (toDelete) remove.mutate(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}
