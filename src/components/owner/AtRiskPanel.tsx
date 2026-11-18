// Kompaniyalar -> "Xavf ostidagilar": companies that stopped using the
// platform, are about to end or have open problems (the lead card's health
// rule, /platform/at-risk), each with one-click actions: a task for the
// owner, the company card, the inbox.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  Headset,
  ListPlus,
  Loader2,
  ShieldAlert,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CompanyMark, HEALTH_DOT } from "@/components/owner/leads/shared";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { normalizePlan, PLAN_LABELS } from "@/lib/plan-gating";
import { cn } from "@/lib/utils";
import type { AtRiskCompany } from "@/lib/company-leads";

const KEY = ["owner-at-risk"] as const;
const SHOWN = 5;

function readOpen(): boolean {
  try {
    return localStorage.getItem("owner.atRisk.open") !== "0";
  } catch {
    return true;
  }
}

export function AtRiskPanel() {
  const { t } = useI18n();
  const [open, setOpen] = useState(readOpen);
  const [all, setAll] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<{ items: AtRiskCompany[] }> => {
      const res = await apiFetch("/platform/at-risk");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 60_000,
  });
  const items = data?.items ?? [];
  const risk = items.filter((i) => i.level === "risk").length;
  const watch = items.length - risk;
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem("owner.atRisk.open", v ? "0" : "1");
      } catch {
        /* private window */
      }
      return !v;
    });
  };
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/12 text-rose-700 dark:text-rose-300">
          <ShieldAlert className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-foreground">{t("risk.title")}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{t("risk.desc")}</span>
        </span>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-subtle" />
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/12 px-2 py-1 text-[12px] font-semibold text-rose-700 dark:text-rose-300">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              {risk} {t("lead.health.risk")}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/12 px-2 py-1 text-[12px] font-semibold text-amber-700 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {watch} {t("lead.health.watch")}
            </span>
          </>
        )}
        <ChevronDown
          className={cn("h-4 w-4 text-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      {open && !isLoading && (
        <div className="border-t border-border">
          {items.length ? (
            <ul className="divide-y divide-border/70">
              {shown.map((c) => (
                <AtRiskRow key={c.orgId} c={c} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-[12.5px] text-subtle">{t("risk.none")}</p>
          )}
          {items.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAll(!all)}
              className="w-full border-t border-border px-4 py-2 text-[12.5px] font-semibold text-primary hover:bg-muted/40"
            >
              {all ? t("risk.less") : t("risk.more", { n: items.length - SHOWN })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AtRiskRow({ c }: { c: AtRiskCompany }) {
  const { t } = useI18n();
  const facts = [
    t("risk.active", { a: c.activeUsers, n: c.users }),
    c.idleDays != null && c.idleDays >= 3 ? t("risk.idle", { n: c.idleDays }) : null,
    c.daysLeft == null
      ? null
      : c.daysLeft < 0
        ? t("risk.ended", { n: -c.daysLeft })
        : t("risk.daysLeft", { n: c.daysLeft }),
    c.openTasks ? t("orgcard.openTasks", { n: c.openTasks }) : null,
  ].filter(Boolean);
  const btn =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground";
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 phone:px-3">
      <CompanyMark name={c.name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", HEALTH_DOT[c.level])} />
          <span className="truncate text-[13.5px] font-semibold text-foreground">{c.name}</span>
          <span className="shrink-0 text-[11.5px] text-subtle">
            {PLAN_LABELS[normalizePlan(c.plan)]}
            {c.isTrial ? ` · ${t("lead.phase.trial")}` : ""}
          </span>
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {c.reasons.slice(0, 3).map((r) => (
            <span
              key={r}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                c.level === "risk"
                  ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                  : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              {t(`lead.why.${r}`)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1 text-[11.5px] text-subtle">
            <Users className="h-3 w-3" /> {facts.join(" · ")}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <TaskButton c={c} className={btn} />
        <Link to="/platform/organizations/$orgId" params={{ orgId: c.orgId }} className={btn}>
          <Building2 className="h-3.5 w-3.5" /> {t("risk.card")}
        </Link>
        <Link to="/platform/support" search={{ org: c.orgId }} className={btn}>
          <Headset className="h-3.5 w-3.5" /> {t("risk.inbox")}
        </Link>
      </div>
    </li>
  );
}

/** Tomorrow 10:00 Tashkent, as a datetime-local value in the browser's zone. */
function tomorrowAtTen(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function TaskButton({ c, className }: { c: AtRiskCompany; className: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/platform/at-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: c.orgId,
          title: title.trim(),
          dueAt: due ? new Date(due).toISOString() : null,
        }),
      });
      if (!res.ok)
        throw new Error(
          ((await res.json().catch(() => ({}))) as { error?: string }).error ??
            `HTTP ${res.status}`,
        );
    },
    onSuccess: () => {
      toast.success(t("risk.taskSaved"));
      setOpen(false);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setTitle(t("risk.taskTitle", { name: c.name }));
          setDue(tomorrowAtTen());
        }
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={className}>
          <ListPlus className="h-3.5 w-3.5" /> {t("risk.task")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2.5 p-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:border-primary"
        />
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          {t("risk.due")}
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-9 flex-1 rounded-lg border border-border bg-card px-2 text-[12.5px] text-foreground outline-none focus:border-primary"
          />
        </label>
        <button
          type="button"
          disabled={!title.trim() || save.isPending}
          onClick={() => save.mutate()}
          className="ctl-lit inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold"
        >
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("risk.save")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
