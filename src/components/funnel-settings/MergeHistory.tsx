import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  GitMerge,
  History,
  Layers,
  Loader2,
  Repeat2,
  Search,
  Split,
  type LucideIcon,
} from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { useCurrency } from "@/lib/currency";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { TONE_TILE } from "@/lib/tones";
import type { CardTone } from "@/components/layout/Primitives";
import { useMergeHistory, useProfilesRaw, type LeadMergeHistoryRow } from "@/hooks/use-crm-data";

// Dublikatlar tarixi (amoCRM's duplicate history): every merge of one
// client's leads -- by a person, by the funnel merge, or automatically when
// the client registered again -- and every pair a person kept apart. The
// merged-away lead no longer exists, so each row unfolds to what it was.

type Kind = "manual" | "funnel" | "repeat" | "kept";
type Filter = "all" | Kind;

const KIND: Record<Kind, { icon: LucideIcon; tone: CardTone }> = {
  manual: { icon: GitMerge, tone: "violet" },
  funnel: { icon: Layers, tone: "sky" },
  repeat: { icon: Repeat2, tone: "emerald" },
  kept: { icon: Split, tone: "amber" },
};

const asKind = (k: string): Kind =>
  k === "manual" || k === "funnel" || k === "repeat" || k === "kept" ? k : "manual";

function dayLabel(iso: string, t: (k: string) => string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return t("mhist.today");
  if (d.toDateString() === yesterday.toDateString()) return t("mhist.yesterday");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function MergeHistorySection() {
  const { t } = useI18n();
  const { data, isLoading } = useMergeHistory();
  const { data: profiles = [] } = useProfilesRaw();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const name = (id: string | null) =>
    id ? (profiles.find((p) => p.id === id)?.full_name ?? null) : null;

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: rows.length,
      manual: 0,
      funnel: 0,
      repeat: 0,
      kept: 0,
    };
    for (const r of rows) c[asKind(r.kind)]++;
    return c;
  }, [rows]);
  const q = query.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const shown = rows.filter(
    (r) =>
      (filter === "all" || asKind(r.kind) === filter) &&
      (!q ||
        `${r.survivor_name ?? ""} ${r.merged_name ?? ""} ${r.funnel ?? ""}`
          .toLowerCase()
          .includes(q) ||
        (qDigits.length >= 3 && (r.phone ?? "").replace(/\D/g, "").includes(qDigits))),
  );
  // One heading per day.
  const days: { label: string; rows: LeadMergeHistoryRow[] }[] = [];
  for (const r of shown) {
    const label = dayLabel(r.created_at, t);
    const last = days[days.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else days.push({ label, rows: [r] });
  }

  return (
    <SectionCard
      title={t("mhist.title")}
      description={t("mhist.desc")}
      icon={History}
      tone="violet"
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div
          role="radiogroup"
          aria-label={t("mhist.title")}
          className="phone-tabs flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-input p-1 [scrollbar-width:none]"
        >
          {(["all", "manual", "funnel", "repeat", "kept"] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[12.5px] font-semibold transition-colors",
                filter === f
                  ? "bg-accent text-foreground shadow-[inset_0_0_0_1px_var(--border)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`mhist.filter.${f}`)}
              <span className="font-mono text-[11px] tabular-nums text-subtle">{counts[f]}</span>
            </button>
          ))}
        </div>
        <label className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("mhist.search")}
            className="h-10 w-full rounded-xl border border-border bg-input pl-9 pr-3 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      ) : data?.pending ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
          {t("mhist.pending")}
        </p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
          {rows.length === 0 ? t("mhist.empty") : t("hub.nothingFound")}
        </p>
      ) : (
        <div className="space-y-5">
          {days.map((d) => (
            <section key={d.label}>
              <p className="console-caption mb-2">{d.label}</p>
              <ul className="space-y-2">
                {d.rows.map((r) => (
                  <HistoryRow key={r.id} row={r} actor={name(r.actor_id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function HistoryRow({ row, actor }: { row: LeadMergeHistoryRow; actor: string | null }) {
  const { t } = useI18n();
  const { format } = useCurrency();
  const [open, setOpen] = useState(false);
  const kind = asKind(row.kind);
  const { icon: Icon, tone } = KIND[kind];
  const snap = (row.snapshot ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof snap[k] === "string" && snap[k] ? (snap[k] as string) : null);
  const survivor = row.survivor_lead_id ? (
    <Link
      to="/crm/leads/$leadId"
      params={{ leadId: row.survivor_lead_id }}
      className="font-semibold text-primary hover:underline"
    >
      {row.survivor_name ?? "—"}
    </Link>
  ) : (
    <span className="font-semibold text-foreground">{row.survivor_name ?? "—"}</span>
  );
  const merged = <span className="font-semibold text-foreground">{row.merged_name || "—"}</span>;

  const facts: [string, string | null][] =
    kind === "repeat"
      ? [
          [t("mhist.f.name"), str("name")],
          [t("mhist.f.phone"), str("phone")],
          [t("mhist.f.email"), str("email")],
          [t("mhist.f.source"), str("source")],
          [t("mhist.f.campaign"), str("campaign")],
          [t("mhist.f.utm"), str("utm")],
        ]
      : [
          [t("mhist.f.stage"), str("stage")],
          [t("mhist.f.owner"), str("owner")],
          [
            t("mhist.f.budget"),
            typeof snap["budget"] === "number" && snap["budget"] > 0
              ? format(snap["budget"])
              : null,
          ],
          [t("mhist.f.phone"), str("phone")],
          [t("mhist.f.email"), str("email")],
          [t("mhist.f.source"), str("source")],
          [
            t("mhist.f.tags"),
            Array.isArray(snap["tags"]) && snap["tags"].length
              ? (snap["tags"] as string[]).join(", ")
              : null,
          ],
          [t("mhist.f.created"), str("createdAt") ? dayLabel(str("createdAt")!, t) : null],
        ];
  const filled = facts.filter((f): f is [string, string] => !!f[1]);

  return (
    <li className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
      >
        <span
          className={cn(
            "icon-tile grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            TONE_TILE[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13.5px] leading-snug">
            {kind === "repeat" ? (
              <>
                {survivor}
                <span className="text-muted-foreground">{t("mhist.repeatText")}</span>
              </>
            ) : kind === "kept" ? (
              <>
                {survivor}
                <span className="text-muted-foreground">{t("mhist.and")}</span>
                {merged}
                <span className="text-muted-foreground">{t("mhist.keptText")}</span>
              </>
            ) : (
              <>
                {merged}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
                {survivor}
              </>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {[
              t(`mhist.kind.${kind}`),
              row.funnel,
              row.phone,
              kind === "repeat" ? row.source : (actor ?? t("mhist.auto")),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="shrink-0 pt-0.5 font-mono text-[12px] tabular-nums text-subtle">
          {timeOf(row.created_at)}
        </span>
        <ChevronDown
          className={cn(
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-3">
          <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wide text-subtle">
            {kind === "repeat" ? t("mhist.snapRepeat") : t("mhist.snap")}
          </p>
          {filled.length ? (
            <dl className="grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
              {filled.map(([k, v]) => (
                <div key={k} className="flex min-w-0 gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">{k}</dt>
                  <dd className="min-w-0 truncate font-medium text-foreground">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[13px] text-muted-foreground">—</p>
          )}
        </div>
      )}
    </li>
  );
}
