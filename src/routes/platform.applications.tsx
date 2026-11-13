import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleDollarSign, Inbox, Loader2, Plus, Search, Sparkles, Trophy } from "lucide-react";
import {
  OwnerEmpty,
  OwnerHeader,
  OwnerPanel,
  OwnerSegment,
  OwnerStat,
} from "@/components/owner/OwnerPage";
import { ApplicationSheet, STATUS_LOOK, money } from "@/components/owner/ApplicationSheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APPLICATION_STATUSES, TEAM_SIZES } from "@/lib/applications";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner → Arizalar: applications from the website form (and ones added by
// hand) as a small CRM -- status, expected sum, and per application a
// timeline of notes, receipts, documents and files (ApplicationSheet).
export const Route = createFileRoute("/platform/applications")({
  head: () => ({ meta: [{ title: "Arizalar — SalesIQ Owner" }] }),
  component: ApplicationsPage,
});

type Item = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  team_size: string | null;
  message: string;
  source: string;
  status: string;
  amount: number | null;
  created_at: string;
  notes: number;
  paid: number;
};

const FILTERS = ["all", ...APPLICATION_STATUSES] as const;

function ApplicationsPage() {
  const { t } = useI18n();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["owner-applications"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ ready: boolean; items: Item[] }> => {
      const res = await apiFetch("/platform/applications-api");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const all = data?.items ?? [];
  const count = (s: string) => all.filter((a) => a.status === s).length;
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (a) =>
        (filter === "all" || a.status === filter) &&
        (!needle ||
          [a.name, a.phone, a.company, a.email].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [all, filter, q]);
  const closed = count("won") + count("lost");
  const stats = {
    fresh: count("new"),
    working: count("contacted") + count("demo"),
    won: count("won"),
    conv: closed ? Math.round((count("won") / closed) * 100) : null,
    paid: all.reduce((s, a) => s + a.paid, 0),
    pipeline: all
      .filter((a) => a.status !== "won" && a.status !== "lost")
      .reduce((s, a) => s + (a.amount ?? 0), 0),
  };

  return (
    <div className="w-full">
      <OwnerHeader
        icon={Inbox}
        title={t("apps.title")}
        desc={t("apps.desc")}
        actions={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {t("apps.addApp")}
          </button>
        }
      />

      {data && !data.ready && (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
          {t("apps.notReady")}
        </p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OwnerStat
          icon={Sparkles}
          tone="blue"
          label={t("apps.statNew")}
          tipKey="apps.statNew"
          value={stats.fresh}
          note={t("apps.statWorking", { n: String(stats.working) })}
        />
        <OwnerStat
          icon={Trophy}
          tone="green"
          label={t("apps.statWon")}
          tipKey="apps.statWon"
          value={stats.won}
          note={stats.conv == null ? "—" : t("apps.statConv", { n: String(stats.conv) })}
        />
        <OwnerStat
          icon={CircleDollarSign}
          tone="violet"
          label={t("apps.statPaid")}
          tipKey="apps.statPaid"
          value={money(stats.paid)}
          note={t("apps.statPaidNote")}
        />
        <OwnerStat
          icon={Inbox}
          tone="amber"
          label={t("apps.statPipeline")}
          tipKey="apps.statPipeline"
          value={money(stats.pipeline)}
          note={t("apps.statPipelineNote")}
        />
      </div>

      <OwnerPanel
        flush
        title={t("apps.list")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("apps.search")}
                className="h-8 w-48 rounded-lg border border-border bg-background pl-8 pr-2.5 text-[12.5px] outline-none placeholder:text-subtle focus:border-primary"
              />
            </label>
            <OwnerSegment
              value={filter}
              options={FILTERS.map((f) => ({
                value: f,
                label:
                  f === "all"
                    ? `${t("apps.fAll")} ${all.length}`
                    : `${t(`apps.st.${f}`)} ${count(f)}`,
              }))}
              onChange={(v) => setFilter(v as (typeof FILTERS)[number])}
            />
          </div>
        }
      >
        {isLoading ? (
          <div className="grid place-items-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <OwnerEmpty icon={Inbox} title={t("apps.empty")} hint={t("apps.emptyHint")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle">
                  <th className="px-4 py-2 font-semibold">{t("apps.colWho")}</th>
                  <th className="px-3 py-2 font-semibold">{t("apps.phone")}</th>
                  <th className="px-3 py-2 font-semibold">{t("apps.team")}</th>
                  <th className="px-3 py-2 font-semibold">{t("apps.colStatus")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("apps.amount")}</th>
                  <th className="px-4 py-2 text-right font-semibold">{t("apps.colDate")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {items.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => setOpenId(a.id)}
                    className="cursor-pointer transition-colors hover:bg-muted/40"
                  >
                    <td className="max-w-[300px] px-4 py-2.5">
                      <p className="truncate font-semibold text-foreground">{a.name}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {a.company || a.message || t(`apps.src.${a.source}`)}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12.5px] tabular-nums text-foreground">
                      {a.phone}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{a.team_size ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
                          STATUS_LOOK[a.status],
                        )}
                      >
                        {t(`apps.st.${a.status}`)}
                      </span>
                      {a.notes > 0 && (
                        <span className="ml-2 text-[11.5px] text-subtle">· {a.notes}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                      {a.paid > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {money(a.paid)}
                        </span>
                      ) : (
                        money(a.amount)
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12px] tabular-nums text-subtle">
                      {new Date(a.created_at).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OwnerPanel>

      <ApplicationSheet id={openId} onClose={() => setOpenId(null)} />
      <AddDialog open={adding} onClose={() => setAdding(false)} onCreated={setOpenId} />
    </div>
  );
}

function AddDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const empty = { name: "", phone: "", company: "", email: "", teamSize: "", message: "" };
  const [f, setF] = useState(empty);
  const create = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/platform/applications-api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(f),
      });
      const j = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !j.id) throw new Error(j.error ?? `HTTP ${res.status}`);
      return j.id;
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ["owner-applications"] });
      setF(empty);
      onClose();
      onCreated(id);
    },
    onError: (e: Error) => toast.error(t(`apps.err.${e.message}`)),
  });
  const field =
    "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none placeholder:text-subtle focus:border-primary";
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("apps.addApp")}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2.5">
          <input
            className={cn(field, "col-span-2")}
            placeholder={t("apps.f.name")}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
          <input
            className={field}
            placeholder={t("apps.f.phone")}
            value={f.phone}
            onChange={(e) => setF({ ...f, phone: e.target.value })}
          />
          <input
            className={field}
            placeholder={t("apps.f.company")}
            value={f.company}
            onChange={(e) => setF({ ...f, company: e.target.value })}
          />
          <input
            className={field}
            placeholder="Email"
            value={f.email}
            onChange={(e) => setF({ ...f, email: e.target.value })}
          />
          <select
            className={field}
            value={f.teamSize}
            onChange={(e) => setF({ ...f, teamSize: e.target.value })}
          >
            <option value="">{t("apps.team")}</option>
            {TEAM_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <textarea
            className={cn(field, "col-span-2 h-20 resize-none py-2")}
            placeholder={t("apps.f.message")}
            value={f.message}
            onChange={(e) => setF({ ...f, message: e.target.value })}
          />
        </div>
        <DialogFooter>
          <button
            type="button"
            disabled={!f.name.trim() || !f.phone.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground disabled:opacity-40"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("apps.save")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
