import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  MessageSquare,
  Mic,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Phone,
  PhoneCall,
  PhoneMissed,
  Play,
  Quote,
  RefreshCw,
  Send,
  Snowflake,
  Flame,
  Sun,
  Tag,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AnalysisPanel, CallAnalysisDetail } from "@/components/audio/CallAnalysisDetail";
import { TagEditor } from "@/components/crm/tag-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAnalyzeCall,
  useAuditTrail,
  useLeadActivities,
  usePbxCalls,
  usePipelineStagesRaw,
  useProfilesRaw,
  normalizeCallAnalysis,
  type AmoCrmCallRow,
  type CallAnalysis,
  type CallDeepAnalysis,
  type CrmLeadView,
} from "@/hooks/use-crm-data";
import type { StoredCustomerProfile } from "@/lib/ai-customer-profile";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";

// The lead page's analysis column (and its "Lid paneli" history rail): lead
// facts, what we know about the customer, why the deal ended up where it
// is, BANT qualification, and every analyzed call -- all read from the AI
// call analysis already saved on amocrm_calls (see
// audio-analytics.analyze.ts); nothing here calls AI itself.

export function asAnalysis(c: AmoCrmCallRow): CallAnalysis | null {
  return normalizeCallAnalysis(c.analysis);
}

// Newest analyzed call first -- the one the lead-level sections summarize.
export function latestAnalyzed(calls: AmoCrmCallRow[]): AmoCrmCallRow | null {
  return (
    [...calls]
      .filter((c) => !!c.ai_summary)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())[0] ??
    null
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- section heading --------------------------------------------------------

export function LeadSectionHeading({
  icon: Icon,
  title,
  tone = "primary",
  right,
}: {
  icon: LucideIcon;
  title: string;
  tone?: "primary" | "success" | "warning" | "danger";
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-3.5">
      <span
        className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", {
          "bg-primary/12 text-primary": tone === "primary",
          "bg-success/12 text-success": tone === "success",
          "bg-warning/15 text-warning": tone === "warning",
          "bg-destructive/12 text-destructive": tone === "danger",
        })}
      >
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="shrink-0 text-xl font-extrabold uppercase tracking-tight text-foreground sm:text-2xl">
        {title}
      </h2>
      <span className="h-px min-w-6 flex-1 bg-border" />
      {right}
    </div>
  );
}

// ---- small shared pieces ------------------------------------------------------

const TEMP_META: Record<
  CrmLeadView["temperature"],
  { icon: LucideIcon; key: string; className: string }
> = {
  Cold: {
    icon: Snowflake,
    key: "la.tempCold",
    className: "border-primary/30 bg-primary/10 text-primary",
  },
  Warm: {
    icon: Sun,
    key: "la.tempWarm",
    className: "border-warning/30 bg-warning/10 text-warning",
  },
  Hot: {
    icon: Flame,
    key: "la.tempHot",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  VeryHot: {
    icon: Flame,
    key: "la.tempVeryHot",
    className: "border-destructive/40 bg-destructive/15 text-destructive",
  },
};

export function TemperaturePill({
  temperature,
  size = "md",
}: {
  temperature: CrmLeadView["temperature"];
  size?: "sm" | "md";
}) {
  const { t } = useI18n();
  const meta = TEMP_META[temperature] ?? TEMP_META.Warm;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border font-semibold",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        meta.className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {t(meta.key)}
    </span>
  );
}

function MoodChip({ mood }: { mood: string }) {
  const m = mood.toLowerCase();
  const tone = /(norozi|salbiy|jahl|asab|negativ|rad)/.test(m)
    ? "danger"
    : /(ijobiy|qiziq|xursand|mamnun|samimiy|positive)/.test(m)
      ? "success"
      : "warning";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-semibold capitalize",
        {
          "bg-success/12 text-success": tone === "success",
          "bg-destructive/12 text-destructive": tone === "danger",
          "bg-warning/15 text-warning": tone === "warning",
        },
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" /> {mood}
    </span>
  );
}

function StatLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{children}</p>;
}

const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

function LeadScoreRing({ score }: { score: number }) {
  const v = Math.max(0, Math.min(100, score));
  const color =
    v >= 70
      ? "var(--color-success)"
      : v >= 40
        ? "var(--color-warning)"
        : "var(--color-destructive)";
  return (
    <div className="relative h-[104px] w-[104px] shrink-0">
      <svg width={104} height={104} viewBox="0 0 104 104" className="-rotate-90">
        <circle
          cx={52}
          cy={52}
          r={RING_R}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={8}
        />
        <circle
          cx={52}
          cy={52}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - v / 100)}
          className="transition-[stroke-dashoffset] duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold tabular-nums leading-none text-foreground">
          {v}
        </span>
        <span className="mt-1 font-mono text-[11px] text-subtle">/100</span>
      </div>
    </div>
  );
}

// BANT qualification score off the latest analyzed call: answered = 1,
// partial = 0.5 per criterion.
export function qualificationScore(q: CallDeepAnalysis["qualification"]): number | null {
  if (q.length === 0) return null;
  const pts = q.reduce(
    (s, x) => s + (x.status === "answered" ? 1 : x.status === "partial" ? 0.5 : 0),
    0,
  );
  return Math.round((pts / q.length) * 100);
}

// ---- LID HAQIDA MA'LUMOT ------------------------------------------------------

export function LeadInfoOverview({ lead, calls }: { lead: CrmLeadView; calls: AmoCrmCallRow[] }) {
  const { t } = useI18n();
  const latest = latestAnalyzed(calls);
  const ratios = calls.map((c) => c.talk_ratio).filter((r): r is number => r != null);
  const avgRatio = ratios.length
    ? Math.round(ratios.reduce((s, r) => s + r, 0) / ratios.length)
    : null;
  const answered = calls.filter((c) => c.connected).length;
  const qScore = qualificationScore(latest ? (asAnalysis(latest)?.qualification ?? []) : []);
  const contactName = lead.contactName || lead.name;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-4 bg-card p-5">
          <LeadScoreRing score={lead.score} />
          <div className="min-w-0 space-y-2">
            <StatLabel>{t("la.leadQuality")}</StatLabel>
            {latest?.mood && <MoodChip mood={latest.mood} />}
            <div>
              <TemperaturePill temperature={lead.temperature} />
            </div>
          </div>
        </div>
        <div className="bg-card p-5">
          <StatLabel>{t("la.avgTalkRatio")}</StatLabel>
          {avgRatio == null ? (
            <p className="mt-3 text-2xl font-extrabold text-subtle">—</p>
          ) : (
            <>
              <p className="mt-3 text-3xl font-extrabold tabular-nums text-foreground">
                {avgRatio}%<span className="mx-2 text-subtle">/</span>
                {100 - avgRatio}%
              </p>
              <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-primary" /> {t("la.operator")}
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-success" /> {t("la.customer")}
                </span>
              </p>
            </>
          )}
        </div>
        <div className="bg-card p-5">
          <StatLabel>{t("la.calls")}</StatLabel>
          <p className="mt-3 text-3xl font-extrabold tabular-nums text-foreground">
            {calls.length}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("la.callsBreakdown", { answered, missed: calls.length - answered })}
          </p>
        </div>
        <div className="bg-card p-5">
          <StatLabel>{t("la.stage")}</StatLabel>
          <p className="mt-3 text-lg font-bold text-foreground">{lead.stage}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("la.updated", { when: lead.updated })}
          </p>
        </div>
      </div>

      <div className="border-t border-border px-5 py-4">
        <StatLabel>{t("la.source")}</StatLabel>
        <p className="mt-1.5 text-[15px] font-medium text-foreground">{lead.source || "—"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-4">
        <StatLabel>{t("la.tags")}</StatLabel>
        <div className="min-w-0 flex-1">
          <TagEditor leadId={lead.id} tags={lead.tags} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/12 text-base font-bold text-primary">
            {(contactName[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-foreground">{contactName}</p>
            <p className="text-sm text-muted-foreground">
              {lead.phone ? lead.phone : t("la.customerRole")}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "flex items-center gap-3 rounded-xl border px-3.5 py-2",
            qScore == null
              ? "border-border bg-surface"
              : qScore >= 50
                ? "border-success/30 bg-success/8"
                : "border-destructive/30 bg-destructive/8",
          )}
        >
          <span
            className={cn(
              "grid h-8 w-8 place-items-center rounded-lg",
              qScore == null
                ? "bg-muted text-muted-foreground"
                : qScore >= 50
                  ? "bg-success text-white"
                  : "bg-destructive text-white",
            )}
          >
            {qScore != null && qScore >= 50 ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : qScore == null ? (
              <CircleDot className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
              {t("la.qualification")}
            </p>
            <p className="text-sm font-bold text-foreground">
              {qScore == null
                ? t("la.qualUnknown")
                : qScore >= 50
                  ? t("la.qualPassed")
                  : t("la.qualFailed")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- MIJOZ HAQIDA MA'LUMOT ----------------------------------------------------

function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span
          key={x}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-xs font-medium text-foreground"
        >
          {x}
        </span>
      ))}
    </div>
  );
}

export function CustomerInfoSection({ profile }: { profile: StoredCustomerProfile | null }) {
  const { t } = useI18n();
  const p = profile;
  const interest = p?.interestLevel?.value ?? null;
  const interestTone = !interest
    ? "neutral"
    : /yuqori|high|высок/i.test(interest)
      ? "success"
      : /o.?rta|medium|сред/i.test(interest)
        ? "warning"
        : "primary";
  const other = [p?.location?.value, p?.occupation?.value, p?.currentStatus?.value].filter(
    (x): x is string => !!x,
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalysisPanel
          icon={BarChart3}
          title={t("la.customerSignals")}
          tone="success"
          className="bg-surface/40"
        >
          <div className="space-y-4">
            <InfoField label={t("la.interestLevel")}>
              {interest ? (
                <span
                  className={cn(
                    "inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold capitalize",
                    {
                      "bg-success/12 text-success": interestTone === "success",
                      "bg-warning/15 text-warning": interestTone === "warning",
                      "bg-primary/12 text-primary": interestTone === "primary",
                    },
                  )}
                >
                  {interest}
                </span>
              ) : (
                <span className="text-sm text-subtle">—</span>
              )}
            </InfoField>
            {p?.budget && (
              <InfoField label={t("la.budget")}>
                <p className="text-sm font-medium text-foreground">{p.budget.value}</p>
              </InfoField>
            )}
            {(p?.needs.length ?? 0) > 0 && (
              <InfoField label={t("la.needs")}>
                <ChipList items={p!.needs.map((n) => n.text)} />
              </InfoField>
            )}
          </div>
        </AnalysisPanel>
        <AnalysisPanel
          icon={CheckCircle2}
          title={t("la.preferences")}
          tone="success"
          className="bg-surface/40"
        >
          <div className="space-y-4">
            {(p?.preferences.length ?? 0) > 0 && (
              <InfoField label={t("la.preferencesList")}>
                <ChipList items={p!.preferences.map((x) => x.text)} />
              </InfoField>
            )}
            <InfoField label={t("la.other")}>
              {other.length === 0 && !p?.otherNotes ? (
                <span className="text-sm text-subtle">—</span>
              ) : (
                <div className="space-y-1.5">
                  {other.length > 0 && <ChipList items={other} />}
                  {p?.otherNotes && (
                    <p className="whitespace-pre-wrap text-sm text-foreground">{p.otherNotes}</p>
                  )}
                </div>
              )}
            </InfoField>
          </div>
        </AnalysisPanel>
      </div>
    </div>
  );
}

// ---- NATIJA TAHLILI -----------------------------------------------------------

export function OutcomeAnalysisSection({
  lead,
  latest,
}: {
  lead: CrmLeadView;
  latest: AmoCrmCallRow | null;
}) {
  const { t } = useI18n();
  const a = latest ? asAnalysis(latest) : null;
  const oa = a?.outcomeAnalysis ?? null;
  const status = lead.stageIsWon ? "won" : lead.stageIsLost ? "lost" : "open";
  const conf = a?.analysisConfidence ?? null;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold",
            {
              "bg-success/12 text-success": status === "won",
              "bg-destructive/12 text-destructive": status === "lost",
              "bg-primary/12 text-primary": status === "open",
            },
          )}
        >
          {status === "won" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : status === "lost" ? (
            <XCircle className="h-4 w-4" />
          ) : (
            <Clock className="h-4 w-4" />
          )}
          {t(
            status === "won"
              ? "la.outcomeWon"
              : status === "lost"
                ? "la.outcomeLost"
                : "la.outcomeOpen",
          )}
        </span>
        {conf && (
          <span className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {t("la.confidence")}: {t(`la.level.${conf}`)}
          </span>
        )}
      </div>

      {!oa ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {latest ? t("la.outcomeNeedsReanalysis") : t("la.outcomeNoCalls")}
        </p>
      ) : (
        <>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-subtle">
            {t("la.whyThisOutcome")}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground">{oa.why}</p>
          {oa.keyFactors.length > 0 && (
            <>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-subtle">
                {t("la.keyFactors")}
              </p>
              <ul className="mt-2 space-y-1.5">
                {oa.keyFactors.map((f, i) => (
                  <li key={i} className="flex gap-2.5 text-[15px] text-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70" />
                    {f}
                  </li>
                ))}
              </ul>
            </>
          )}
          {oa.recontact && (
            <div
              className={cn(
                "mt-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm",
                oa.recontact.recommended
                  ? "border-success/30 bg-success/8 text-foreground"
                  : "border-border bg-surface text-muted-foreground",
              )}
            >
              {oa.recontact.recommended ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {oa.recontact.recommended ? t("la.recontactYes") : t("la.recontactNo")}
                  {oa.recontact.recommended && oa.recontact.when && ` · ${oa.recontact.when}`}
                </p>
                {oa.recontact.reason && (
                  <p className="mt-0.5 text-muted-foreground">{oa.recontact.reason}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- KVALIFIKATSIYA SAVOLLARI --------------------------------------------------

const QUAL_STYLE = {
  answered: {
    header: "bg-success text-white",
    icon: CheckCircle2,
    key: "la.qualAnswered",
  },
  partial: {
    header: "bg-warning text-warning-foreground",
    icon: AlertTriangle,
    key: "la.qualPartial",
  },
  unanswered: {
    header: "bg-destructive text-white",
    icon: XCircle,
    key: "la.qualUnanswered",
  },
} as const;

export function QualificationSection({ latest }: { latest: AmoCrmCallRow | null }) {
  const { t } = useI18n();
  const q = latest ? (asAnalysis(latest)?.qualification ?? []) : [];
  const score = qualificationScore(q);
  const counts = {
    answered: q.filter((x) => x.status === "answered").length,
    partial: q.filter((x) => x.status === "partial").length,
    unanswered: q.filter((x) => x.status === "unanswered").length,
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      {q.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {latest ? t("la.outcomeNeedsReanalysis") : t("la.outcomeNoCalls")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "text-3xl font-extrabold tabular-nums",
                  (score ?? 0) >= 70
                    ? "text-success"
                    : (score ?? 0) >= 40
                      ? "text-warning"
                      : "text-destructive",
                )}
              >
                {score}
              </span>
              <span className="text-sm text-muted-foreground">/100 · {t("la.bant")}</span>
            </p>
            <div className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  (score ?? 0) >= 70
                    ? "bg-success"
                    : (score ?? 0) >= 40
                      ? "bg-warning"
                      : "bg-destructive",
                )}
                style={{ width: `${score ?? 0}%` }}
              />
            </div>
            {(["answered", "partial", "unanswered"] as const)
              .filter((k) => counts[k] > 0)
              .map((k) => {
                const Icon = QUAL_STYLE[k].icon;
                return (
                  <span
                    key={k}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold",
                      {
                        "bg-success/12 text-success": k === "answered",
                        "bg-warning/15 text-warning": k === "partial",
                        "bg-destructive/12 text-destructive": k === "unanswered",
                      },
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {counts[k]} {t(QUAL_STYLE[k].key)}
                  </span>
                );
              })}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {q.map((item, i) => {
              const style = QUAL_STYLE[item.status];
              const Icon = style.icon;
              return (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl border border-border bg-surface/40"
                >
                  <div className={cn("flex items-center gap-2 px-4 py-2.5", style.header)}>
                    <Icon className="h-4 w-4" />
                    <span className="flex-1 text-sm font-bold">{t(style.key)}</span>
                    <span className="rounded-md bg-background/90 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                      {t(`la.bant.${item.key}`)}
                    </span>
                  </div>
                  <div className="p-4">
                    <p className="text-[15px] font-bold text-foreground">{item.question}</p>
                    {item.answer && (
                      <div className="mt-3 flex gap-2 rounded-xl bg-muted/60 px-3.5 py-2.5">
                        <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                        <p className="min-w-0 flex-1 text-sm italic text-foreground">
                          {item.answer}
                        </p>
                        {item.timestamp && (
                          <span className="shrink-0 font-mono text-[11px] text-subtle">
                            {item.timestamp}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ---- QO'NG'IROQ TAHLILI ---------------------------------------------------------

function CallCard({
  call,
  lead,
  open,
  onToggle,
  amoLink,
}: {
  call: AmoCrmCallRow;
  lead: CrmLeadView;
  open: boolean;
  onToggle: () => void;
  amoLink: string | null;
}) {
  const { t } = useI18n();
  const analyze = useAnalyzeCall();
  const a = asAnalysis(call);
  const analyzed = !!call.ai_summary;

  async function reanalyze() {
    try {
      const res = await analyze.mutateAsync(call.id);
      toast.success(t("audio.analyzed"));
      if (res.taskWarning) toast.error(res.taskWarning);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("audio.analyzeFailed"));
    }
  }

  return (
    <div
      id={`call-${call.id}`}
      className={cn(
        "scroll-mt-40 rounded-2xl border bg-card p-4 transition-colors sm:p-5",
        open ? "border-primary/30" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-subtle" />
            {formatDateTime(call.occurred_at)}
          </span>
          <span className="rounded-lg bg-warning/15 px-2 py-0.5 text-xs font-semibold text-warning">
            {lead.stage}
          </span>
          {a?.callFamily?.name && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-0.5 text-xs text-muted-foreground">
              <Tag className="h-3 w-3" /> {a.callFamily.name}
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
            <Mic className="h-3.5 w-3.5" /> {formatDuration(call.duration_seconds)}
          </span>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              analyzed
                ? "bg-success/12 text-success"
                : call.connected
                  ? "bg-warning/15 text-warning"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {analyzed ? t("la.ready") : call.connected ? t("la.pending") : t("audio.notConnected")}
          </span>
          {call.score != null && (
            <span className="font-mono text-xs font-bold text-foreground">{call.score}/100</span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 text-subtle transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        </button>
        {call.recording_url && (
          <button
            type="button"
            onClick={() => void reanalyze()}
            disabled={analyze.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-foreground px-3.5 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {analyze.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {analyzed ? t("la.reanalyze") : t("audio.analyze")}
          </button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t("la.more")}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {call.recording_url && (
              <DropdownMenuItem asChild>
                <a href={call.recording_url} download target="_blank" rel="noreferrer">
                  <Download className="mr-2 h-4 w-4" /> {t("la.downloadAudio")}
                </a>
              </DropdownMenuItem>
            )}
            {amoLink && (
              <DropdownMenuItem asChild>
                <a href={amoLink} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" /> {t("la.openInAmo")}
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                const url = `${window.location.origin}/crm/leads/${lead.id}?audio=${call.id}`;
                void navigator.clipboard
                  ?.writeText(url)
                  .then(() => toast.success(t("la.linkCopied")));
              }}
            >
              <Send className="mr-2 h-4 w-4" /> {t("la.copyCallLink")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open && (
        <div className="mt-4">
          {analyzed ? (
            <CallAnalysisDetail
              call={{
                score: call.score,
                mood: call.mood,
                talkRatio: call.talk_ratio,
                nextStep: call.next_step,
                aiSummary: call.ai_summary,
                transcript: call.transcript,
                recordingUrl: call.recording_url,
                analysis: a,
                amocrmTaskId: call.amocrm_task_id,
                aiNoteId: call.ai_note_id,
              }}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface/60 p-5 text-sm text-muted-foreground">
              {call.recording_url ? t("la.notAnalyzedYet") : t("la.noRecording")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CallAnalysisSection({
  lead,
  calls,
  openCallId,
  setOpenCallId,
  amoLink,
}: {
  lead: CrmLeadView;
  calls: AmoCrmCallRow[];
  openCallId: string | null;
  setOpenCallId: (id: string | null) => void;
  amoLink: string | null;
}) {
  const { t } = useI18n();
  const sorted = useMemo(
    () =>
      [...calls].sort(
        (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      ),
    [calls],
  );
  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">
        {t("lead.calls.empty")}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {sorted.map((c) => (
        <CallCard
          key={c.id}
          call={c}
          lead={lead}
          amoLink={amoLink}
          open={openCallId === c.id}
          onToggle={() => setOpenCallId(openCallId === c.id ? null : c.id)}
        />
      ))}
    </div>
  );
}

// ---- Lid paneli (history rail) ---------------------------------------------------

type HistoryEntry =
  | { kind: "created"; id: string; at: string }
  | { kind: "stage"; id: string; at: string; from: string; to: string; fromAmo: boolean }
  | { kind: "owner"; id: string; at: string; from: string; to: string; fromAmo: boolean }
  | {
      kind: "note";
      id: string;
      at: string;
      content: string;
      actor: string;
      isAi: boolean;
      fromAmo: boolean;
    }
  | {
      kind: "call";
      id: string;
      at: string;
      connected: boolean;
      analyzed: boolean;
      fromAmo: boolean;
    }
  | { kind: "pbx"; id: string; at: string; to: string; status: string };

function HistoryIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return (
    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl border", className)}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

function StageChip({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-md border px-2 py-0.5 text-xs",
        strong
          ? "border-border bg-surface font-semibold text-foreground"
          : "border-border/60 bg-muted/50 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function LeadHistoryPanel({
  lead,
  calls,
  onOpenCall,
  collapsed,
  onToggleCollapsed,
  maxHeight,
}: {
  lead: CrmLeadView;
  calls: AmoCrmCallRow[];
  onOpenCall: (callId: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  // The caller makes the rail sticky under its own (variable-height)
  // header and passes how tall the rail may get.
  maxHeight: string;
}) {
  const { t } = useI18n();
  const { rows: auditRows } = useAuditTrail("leads", lead.id);
  const activities = useLeadActivities(lead.id);
  const { data: pbxCalls } = usePbxCalls({ leadId: lead.id });
  const { data: stages } = usePipelineStagesRaw();
  const { data: profiles } = useProfilesRaw();
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  const stageName = useMemo(() => new Map((stages ?? []).map((s) => [s.id, s.name])), [stages]);
  const personName = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p.full_name])),
    [profiles],
  );

  const entries = useMemo<HistoryEntry[]>(() => {
    const list: HistoryEntry[] = [{ kind: "created", id: "created", at: lead.createdAtIso }];
    // An entry with no person behind it came from amoCRM's sync only on an
    // amoCRM lead; on our own leads it is SalesIQ itself (bots, reminders).
    const amoLead = lead.amocrmId != null;
    for (const row of auditRows) {
      const fromAmo = amoLead && !row.actorId;
      if (row.changedFields.includes("stage_id")) {
        const f = row.before?.["stage_id"] as string | null | undefined;
        const to = row.after?.["stage_id"] as string | null | undefined;
        list.push({
          kind: "stage",
          id: row.id,
          at: row.createdAt,
          from: (f && stageName.get(f)) || "—",
          to: (to && stageName.get(to)) || "—",
          fromAmo,
        });
      }
      if (row.changedFields.includes("owner_id")) {
        const f = row.before?.["owner_id"] as string | null | undefined;
        const to = row.after?.["owner_id"] as string | null | undefined;
        list.push({
          kind: "owner",
          id: `${row.id}-o`,
          at: row.createdAt,
          from: (f && personName.get(f)) || "—",
          to: (to && personName.get(to)) || "—",
          fromAmo,
        });
      }
    }
    for (const a of activities.data ?? []) {
      if (a.type !== "note" && a.type !== "ai_note" && a.type !== "system") continue;
      list.push({
        kind: "note",
        id: a.id,
        at: a.created_at,
        content: a.content,
        actor:
          a.type === "ai_note"
            ? t("lead.panel.aiActor")
            : (a.created_by && personName.get(a.created_by)) || "",
        isAi: a.type === "ai_note",
        fromAmo: amoLead && !a.created_by && a.type !== "ai_note",
      });
    }
    for (const c of calls) {
      list.push({
        kind: "call",
        id: c.id,
        at: c.occurred_at,
        connected: c.connected,
        analyzed: !!c.ai_summary,
        fromAmo: c.source !== "manual",
      });
    }
    for (const c of pbxCalls ?? []) {
      list.push({ kind: "pbx", id: c.id, at: c.created_at, to: c.to_number, status: c.status });
    }
    return list.sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
  }, [auditRows, activities.data, calls, pbxCalls, lead.createdAtIso, stageName, personName, t]);

  if (collapsed) {
    return (
      <aside className="flex h-fit flex-col items-center rounded-2xl border border-border bg-card p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t("la.panelOpen")}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  const AmoTag = () => <span className="font-semibold text-primary">amoCRM</span>;

  return (
    <aside
      style={{ maxHeight }}
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
    >
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <h3 className="text-lg font-bold text-foreground">{t("lead.panel.title")}</h3>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:text-foreground"
          aria-label={t("la.panelClose")}
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </header>
      <ol className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {entries.map((e) => (
          <li key={`${e.kind}-${e.id}`} className="flex gap-3">
            {e.kind === "created" && (
              <>
                <HistoryIcon
                  icon={CircleDot}
                  className="border-success/30 bg-success/10 text-success"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-foreground">
                    {t("lead.panel.created")}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">{timeAgo(e.at)}</p>
                </div>
              </>
            )}
            {(e.kind === "stage" || e.kind === "owner") && (
              <>
                <HistoryIcon
                  icon={Clock}
                  className="border-border bg-surface text-muted-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-foreground">
                    {e.kind === "stage" ? t("la.stageChanged") : t("la.ownerChanged")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <StageChip>{e.from}</StageChip>
                    <span className="text-xs text-subtle">→</span>
                    <StageChip strong>{e.to}</StageChip>
                  </div>
                  <p className="mt-1 text-xs text-subtle">
                    {timeAgo(e.at)} {e.fromAmo && <AmoTag />}
                  </p>
                </div>
              </>
            )}
            {e.kind === "note" && (
              <>
                <HistoryIcon
                  icon={MessageSquare}
                  className={
                    e.isAi
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-violet-500/30 bg-violet-500/10 text-violet-500"
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-foreground">
                    {e.isAi
                      ? t("lead.panel.aiNote")
                      : e.fromAmo
                        ? t("la.systemNote")
                        : t("la.note")}
                    {e.actor && (
                      <span className="font-normal text-muted-foreground"> · {e.actor}</span>
                    )}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground",
                      !expandedNotes.has(e.id) && "line-clamp-2",
                    )}
                  >
                    {e.content}
                  </p>
                  {e.content.length > 120 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedNotes((s) => {
                          const n = new Set(s);
                          if (n.has(e.id)) n.delete(e.id);
                          else n.add(e.id);
                          return n;
                        })
                      }
                      className="mt-1 text-sm font-semibold text-primary"
                    >
                      {expandedNotes.has(e.id) ? t("la.less") : t("la.more2")}
                    </button>
                  )}
                  <p className="mt-1 text-xs text-subtle">
                    {timeAgo(e.at)} {e.fromAmo && <AmoTag />}
                  </p>
                </div>
              </>
            )}
            {e.kind === "call" &&
              (e.connected ? (
                <>
                  <HistoryIcon
                    icon={PhoneCall}
                    className="border-success/30 bg-success/10 text-success"
                  />
                  <div className="min-w-0 flex-1 rounded-xl border border-success/40 bg-success/8 p-3">
                    <p className="text-[15px] font-semibold text-foreground">
                      {t("la.callAnswered")}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">{timeAgo(e.at)}</p>
                    {e.analyzed && (
                      <button
                        type="button"
                        onClick={() => onOpenCall(e.id)}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-success px-2.5 py-1 text-xs font-bold text-white transition-opacity hover:opacity-90"
                      >
                        <Play className="h-3 w-3 fill-current" /> {t("audio.viewAnalysis")}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <HistoryIcon
                    icon={PhoneMissed}
                    className="border-destructive/30 bg-destructive/10 text-destructive"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-muted-foreground">
                      {t("la.callMissed")}
                    </p>
                    <p className="mt-0.5 text-xs text-subtle">{timeAgo(e.at)}</p>
                  </div>
                </>
              ))}
            {e.kind === "pbx" && (
              <>
                <HistoryIcon
                  icon={Phone}
                  className="border-primary/30 bg-primary/10 text-primary"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-foreground">
                    {t("lead.panel.pbxCall")} · {e.to}
                  </p>
                  <p className="mt-0.5 text-xs text-subtle">
                    {timeAgo(e.at)} · {t(`lead.pbxCalls.status.${e.status}`)}
                  </p>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
