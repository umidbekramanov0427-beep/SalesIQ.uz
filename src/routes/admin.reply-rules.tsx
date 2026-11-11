import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlarmClock, CreditCard, ShieldAlert, Timer, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { AdminBackLink } from "@/components/admin/AdminBackLink";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { findCardNumbers, parseReplyRules, type ReplyRules } from "@/lib/reply-rules";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { useReplyRules, useUpdateOrgGeneralSettings } from "@/hooks/use-crm-data";
import type { Json } from "@/integrations/supabase/types";

// Admin -> Javob qoidalari: how long a new lead or a client's message may
// wait for an answer (amber and a reminder to the manager, then red and the
// head of sales), and the bank-card guard on messages to clients
// (src/lib/reply-rules.ts). 5 / 15 minutes and the guard on until set.

export const Route = createFileRoute("/admin/reply-rules")({
  head: () => ({ meta: [{ title: "Javob qoidalari — SalesIQ" }] }),
  component: ReplyRulesPage,
});

const PRESETS = [
  { warn: 3, escalate: 10 },
  { warn: 5, escalate: 15 },
  { warn: 10, escalate: 30 },
  { warn: 30, escalate: 120 },
];

function ReplyRulesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const saved = useReplyRules();
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<ReplyRules>(saved);
  useEffect(() => setDraft(JSON.parse(savedKey) as ReplyRules), [savedKey]);
  const clean = parseReplyRules(draft);
  const dirty = JSON.stringify(clean) !== savedKey;
  const update = useUpdateOrgGeneralSettings();

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

  async function save() {
    try {
      await update.mutateAsync({ reply_rules: clean as unknown as Json });
      toast.success(t("reply.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error && /reply_rules/.test(err.message)
          ? t("reply.migrationPending")
          : describeError(err, t("reply.saveFailed")),
      );
    }
  }

  const minutesInput = (key: "warnMinutes" | "escalateMinutes") => (
    <input
      type="number"
      min={1}
      max={1440}
      inputMode="numeric"
      value={draft[key]}
      onChange={(e) => setDraft((d) => ({ ...d, [key]: Number(e.target.value) || 0 }))}
      className="h-11 w-24 rounded-xl border border-border bg-input px-3 text-center font-mono text-[18px] font-semibold tabular-nums text-foreground outline-none transition-colors focus:border-primary"
    />
  );

  return (
    <>
      <PageHeader
        title={t("reply.title")}
        description={t("reply.desc")}
        icon={Timer}
        tone="amber"
        actions={
          <>
            {dirty && (
              <Button variant="outline" onClick={() => setDraft(saved)}>
                {t("common.cancel")}
              </Button>
            )}
            <Button onClick={() => void save()} disabled={!dirty || update.isPending}>
              {t("common.save")}
            </Button>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          icon={AlarmClock}
          tone="amber"
          title={t("reply.limitsTitle")}
          description={t("reply.limitsDesc")}
        >
          <div className="space-y-4">
            <LimitRow
              tone="amber"
              icon={UserRound}
              title={t("reply.warn")}
              hint={t("reply.warnHint")}
              input={minutesInput("warnMinutes")}
            />
            <LimitRow
              tone="red"
              icon={Users}
              title={t("reply.escalate")}
              hint={t("reply.escalateHint")}
              input={minutesInput("escalateMinutes")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] text-muted-foreground">{t("reply.presets")}</span>
              {PRESETS.map((p) => {
                const on = clean.warnMinutes === p.warn && clean.escalateMinutes === p.escalate;
                return (
                  <button
                    key={p.warn}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({ ...d, warnMinutes: p.warn, escalateMinutes: p.escalate }))
                    }
                    className={cn(
                      "h-8 rounded-lg border px-3 font-mono text-[12.5px] font-semibold tabular-nums transition-colors",
                      on
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {p.warn} / {p.escalate}
                  </button>
                );
              })}
            </div>
            <Timeline rules={clean} />
          </div>
        </SectionCard>

        <SectionCard
          icon={CreditCard}
          tone="rose"
          title={t("reply.cardTitle")}
          description={t("reply.cardDesc")}
        >
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border px-3.5 py-3">
            <span className="text-[13.5px] font-semibold text-foreground">{t("reply.cardOn")}</span>
            <Switch
              checked={draft.cardWarning}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, cardWarning: v }))}
            />
          </label>
          <CardTester />
        </SectionCard>
      </div>
    </>
  );
}

function LimitRow({
  tone,
  icon: Icon,
  title,
  hint,
  input,
}: {
  tone: "amber" | "red";
  icon: typeof Timer;
  title: string;
  hint: string;
  input: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border px-3.5 py-3">
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
          tone === "amber"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-red-500/15 text-red-700 dark:text-red-300",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">{title}</p>
        <p className="text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {input}
        <span className="text-[13px] text-muted-foreground">{t("reply.min")}</span>
      </div>
    </div>
  );
}

// The limits on a line: calm, amber from the first, red from the second.
function Timeline({ rules }: { rules: ReplyRules }) {
  const { t } = useI18n();
  const end = Math.max(rules.escalateMinutes * 1.5, rules.escalateMinutes + 5);
  const pct = (m: number) => `${Math.min(100, (m / end) * 100)}%`;
  return (
    <div className="pt-1">
      <div className="relative h-3 overflow-hidden rounded-full bg-sky-500/25">
        <div
          className="absolute inset-y-0 bg-amber-400"
          style={{ left: pct(rules.warnMinutes), right: 0 }}
        />
        <div
          className="absolute inset-y-0 bg-red-500"
          style={{ left: pct(rules.escalateMinutes), right: 0 }}
        />
      </div>
      <div className="relative mt-1.5 h-8 text-[11.5px] text-muted-foreground">
        <span className="absolute left-0">0</span>
        <span
          className="absolute -translate-x-1/2 text-center"
          style={{ left: pct(rules.warnMinutes) }}
        >
          <b className="block font-mono text-amber-700 dark:text-amber-300">
            {rules.warnMinutes} {t("reply.min")}
          </b>
          {t("reply.lineWarn")}
        </span>
        <span
          className="absolute -translate-x-1/2 text-center"
          style={{ left: pct(rules.escalateMinutes) }}
        >
          <b className="block font-mono text-red-700 dark:text-red-300">
            {rules.escalateMinutes} {t("reply.min")}
          </b>
          {t("reply.lineEscalate")}
        </span>
      </div>
    </div>
  );
}

function CardTester() {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const hits = findCardNumbers(text);
  return (
    <div className="mt-4">
      <p className="console-caption mb-2">{t("reply.cardTest")}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder={t("reply.cardTestPh")}
        className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-[13.5px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary"
      />
      {text.trim() && (
        <p
          className={cn(
            "mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] font-medium",
            hits.length
              ? "bg-amber-500/10 text-amber-800 dark:text-amber-200"
              : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
          )}
        >
          <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
          {hits.length
            ? t("reply.cardFound", { cards: hits.map((h) => `${h.brand} ${h.masked}`).join(", ") })
            : t("reply.cardNone")}
        </p>
      )}
    </div>
  );
}
