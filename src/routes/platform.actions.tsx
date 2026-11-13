import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Eye,
  History,
  Loader2,
  MousePointerClick,
  ScrollText,
  Users,
} from "lucide-react";
import {
  OwnerEmpty,
  OwnerHeader,
  OwnerPanel,
  OwnerSegment as Segment,
  OwnerStat,
} from "@/components/owner/OwnerPage";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Owner → Amallar: who of the people with owner-panel access did what, by
// name -- pages opened, owner actions (create / edit / freeze / delete a
// company, users, integrations, support answers...), failed attempts and
// audit rows. Filter by person, period and kind.
export const Route = createFileRoute("/platform/actions")({
  head: () => ({ meta: [{ title: "Amallar — SalesIQ Owner" }] }),
  component: OwnerActionsPage,
});

type Person = { id: string; name: string; email: string | null };
type Event = {
  at: string;
  userId: string | null;
  kind: string;
  label: string;
  path: string | null;
  meta: Record<string, string>;
  company: string | null;
};

const KINDS = ["all", "action", "page", "failed"] as const;
type KindFilter = (typeof KINDS)[number];
const PERIODS = [1, 7, 30] as const;

// Owner endpoints, said the way the owner would.
const ENDPOINT_KEYS: [RegExp, string][] = [
  [/^create-organization/, "oa.e.createOrg"],
  [/^delete-organization/, "oa.e.deleteOrg"],
  [/^enter-company/, "oa.e.enterCompany"],
  [/^update-user/, "oa.e.updateUser"],
  [/^delete-user/, "oa.e.deleteUser"],
  [/^add-employee/, "oa.e.addEmployee"],
  [/^integrations/, "oa.e.integrations"],
  [/^amocrm/, "oa.e.amocrm"],
  [/^support-api/, "oa.e.support"],
  [/^payment-credentials/, "oa.e.payments"],
  [/^partners-api/, "oa.e.partners"],
  [/^salesbots/, "oa.e.salesbots"],
  [/^ops-api/, "oa.e.ops"],
  [/^visits/, "oa.e.visits"],
  [/^organizations/, "oa.e.orgEdit"],
  [/^announcements/, "oa.e.announcements"],
  [/^applications/, "oa.e.applications"],
];

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

function OwnerActionsPage() {
  const { t, lang } = useI18n();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const [person, setPerson] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const { data, isLoading } = useQuery({
    queryKey: ["owner-actions", days, person],
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ people: Person[]; events: Event[] }> => {
      const qs = new URLSearchParams({ days: String(days) });
      if (person) qs.set("userId", person);
      const res = await apiFetch(`/platform/actions-api?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
  const people = data?.people ?? [];
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";
  const events = useMemo(() => {
    const list = data?.events ?? [];
    if (kind === "all") return list;
    if (kind === "action") return list.filter((e) => e.kind === "action" || e.kind === "audit");
    if (kind === "failed") return list.filter((e) => e.kind === "failed" || e.kind === "blocked");
    return list.filter((e) => e.kind === kind);
  }, [data, kind]);

  const all = data?.events ?? [];
  const stats = {
    actions: all.filter((e) => e.kind === "action" || e.kind === "audit").length,
    pages: all.filter((e) => e.kind === "page").length,
    failed: all.filter((e) => e.kind === "failed" || e.kind === "blocked").length,
    active: new Set(all.map((e) => e.userId)).size,
  };

  function describe(e: Event): string {
    if (e.kind === "page") {
      const key = `nav.${e.label}`;
      const name = t(key);
      return t("oa.opened", { page: name === key ? e.label : name });
    }
    if (e.kind === "action" && e.label === "owner_action") {
      const ep = e.meta["endpoint"] ?? "";
      const hit = ENDPOINT_KEYS.find(([re]) => re.test(ep));
      const base = hit ? t(hit[1]) : ep;
      const extra = e.meta["action"] ? ` · ${e.meta["action"]}` : "";
      return base + extra;
    }
    if (e.kind === "failed") return t("oa.failed", { what: e.label });
    if (e.kind === "blocked") return t("oa.blocked", { what: e.label });
    if (e.kind === "audit") return `${e.label}${e.meta["entity"] ? ` · ${e.meta["entity"]}` : ""}`;
    return e.label;
  }

  // Grouped by day, newest first.
  const groups = useMemo(() => {
    const m = new Map<string, Event[]>();
    for (const e of events.slice(0, 400)) {
      const d = new Date(e.at).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "long",
      });
      m.set(d, [...(m.get(d) ?? []), e]);
    }
    return [...m];
  }, [events, lang]);

  return (
    <div className="w-full">
      <OwnerHeader icon={History} title={t("oa.title")} desc={t("oa.desc")} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OwnerStat
          icon={MousePointerClick}
          tone="violet"
          label={t("oa.statActions")}
          tipKey="oa.statActions"
          value={stats.actions}
        />
        <OwnerStat
          icon={Eye}
          tone="blue"
          label={t("oa.statPages")}
          tipKey="oa.statPages"
          value={stats.pages}
        />
        <OwnerStat
          icon={AlertTriangle}
          tone="rose"
          label={t("oa.statFailed")}
          tipKey="oa.statFailed"
          value={stats.failed}
        />
        <OwnerStat
          icon={Users}
          tone="green"
          label={t("oa.statPeople")}
          tipKey="oa.statPeople"
          value={stats.active}
        />
      </div>

      <OwnerPanel
        flush
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-2.5 text-[12.5px] font-medium text-foreground outline-none focus:border-primary"
            >
              <option value="">{t("oa.everyone")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Segment
              value={String(days)}
              options={PERIODS.map((d) => ({ value: String(d), label: t(`oa.days${d}`) }))}
              onChange={(v) => setDays(Number(v) as (typeof PERIODS)[number])}
            />
            <Segment
              value={kind}
              options={KINDS.map((k) => ({ value: k, label: t(`oa.kind.${k}`) }))}
              onChange={(v) => setKind(v as KindFilter)}
            />
          </div>
        }
        title={t("oa.journal")}
      >
        {isLoading ? (
          <div className="grid place-items-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <OwnerEmpty icon={ScrollText} title={t("oa.empty")} hint={t("oa.emptyHint")} />
        ) : (
          <div className="divide-y divide-border">
            {groups.map(([day, list]) => (
              <div key={day}>
                <p className="bg-surface px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
                  {day}
                </p>
                <ul className="divide-y divide-border/70">
                  {list.map((e, i) => (
                    <li key={`${e.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-12 shrink-0 font-mono text-[11.5px] tabular-nums text-subtle">
                        {new Date(e.at).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/12 text-[10.5px] font-bold text-primary">
                        {initials(nameOf(e.userId))}
                      </span>
                      <span className="w-36 shrink-0 truncate text-[13px] font-semibold text-foreground">
                        {nameOf(e.userId)}
                      </span>
                      <KindDot kind={e.kind} />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
                        {describe(e)}
                      </span>
                      {e.company && (
                        <span className="hidden shrink-0 truncate rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground sm:inline">
                          {e.company}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </OwnerPanel>
    </div>
  );
}

function KindDot({ kind }: { kind: string }) {
  const tone =
    kind === "page"
      ? "bg-sky-500"
      : kind === "failed" || kind === "blocked"
        ? "bg-rose-500"
        : kind === "audit"
          ? "bg-amber-500"
          : "bg-violet-500";
  return <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone)} />;
}
