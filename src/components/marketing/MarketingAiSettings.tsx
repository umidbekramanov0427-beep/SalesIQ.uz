import { useEffect, useState } from "react";
import { BrainCircuit, ChevronDown, Gauge, KeyRound, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { marketingAiPost, useMarketingAiQuery } from "@/hooks/use-crm-data";
import type { AiSettingsView } from "@/lib/marketing-ai/types";

// Marketing -> Sozlash -> AI: the AI tahlilchi on or off, how often it
// analyses by itself, daily / monthly spend limits and what was spent this
// month. By default the platform's Gemini works with nothing to set up;
// "Qo'shimcha" lets the company use Claude or OpenAI with its own key
// (sealed on the server -- only its last 4 characters come back).

const FREQ = ["manual", "daily", "after_webinar"] as const;
const PROVIDERS = ["gemini", "anthropic", "openai"] as const;
const field =
  "h-10 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground outline-none focus:border-primary";

export function MarketingAiSettings() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useMarketingAiQuery<AiSettingsView>("settings", { action: "settings" });
  const [d, setD] = useState<AiSettingsView["settings"] | null>(null);
  const [key, setKey] = useState("");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (q.data) setD(q.data.settings);
  }, [q.data]);

  if (q.isLoading || !d)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  const v = q.data!;
  if (!v.settings.ready)
    return (
      <p className="rounded-xl bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800 dark:text-amber-200">
        {t("ai.migration")}
      </p>
    );

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await marketingAiPost({
        action: "saveSettings",
        enabled: d!.enabled,
        frequency: d!.frequency,
        dailyLimitUsd: d!.dailyLimitUsd,
        monthlyLimitUsd: d!.monthlyLimitUsd,
        provider: d!.provider,
        model: d!.model,
        ...(key.trim() ? { key: key.trim() } : {}),
        ...extra,
      });
      setKey("");
      await qc.invalidateQueries({ queryKey: ["marketing_ai_post"] });
      toast.success(t("mkt.bot.saved"));
    } catch (e) {
      toast.error(describeError(e, t("ai.failed")));
    } finally {
      setBusy(false);
    }
  }

  const u = v.usage;
  const limit = (val: number | null, set: (n: number | null) => void) => (
    <div className="flex items-center gap-1.5">
      <span className="text-[13px] text-muted-foreground">$</span>
      <input
        inputMode="decimal"
        value={val ?? ""}
        disabled={!v.editor}
        onChange={(e) => {
          const n = Number(e.target.value.replace(",", "."));
          set(e.target.value.trim() && Number.isFinite(n) ? n : null);
        }}
        placeholder={t("ai.s.noLimit")}
        className="h-9 w-28 rounded-lg border border-border bg-input px-2 text-right tabular-nums"
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <SectionCard
        icon={BrainCircuit}
        tone="violet"
        title={t("ai.s.title")}
        description={t("ai.s.desc")}
      >
        <div className="divide-y divide-border">
          <label className="flex items-center justify-between gap-3 py-2.5">
            <span>
              <span className="block text-[13.5px] font-semibold text-foreground">
                {t("ai.s.enabled")}
              </span>
              <span className="block text-[12px] text-muted-foreground">
                {t("ai.s.enabledHint")}
              </span>
            </span>
            <Switch
              checked={d.enabled}
              disabled={!v.editor}
              onCheckedChange={(x) => setD({ ...d, enabled: x })}
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <span>
              <span className="block text-[13.5px] font-semibold text-foreground">
                {t("ai.s.freq")}
              </span>
              <span className="block text-[12px] text-muted-foreground">{t("ai.s.freqHint")}</span>
            </span>
            <span className="ctl-track inline-flex rounded-xl p-0.5">
              {FREQ.map((x) => (
                <button
                  key={x}
                  type="button"
                  disabled={!v.editor}
                  aria-selected={d.frequency === x}
                  onClick={() => setD({ ...d, frequency: x })}
                  className="ctl-tab h-8 rounded-lg px-3 text-[12.5px] font-semibold"
                >
                  {t(`ai.s.freq.${x}`)}
                </button>
              ))}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[13.5px] font-semibold text-foreground">{t("ai.s.daily")}</span>
            {limit(d.dailyLimitUsd, (n) => setD({ ...d, dailyLimitUsd: n }))}
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-[13.5px] font-semibold text-foreground">{t("ai.s.monthly")}</span>
            {limit(d.monthlyLimitUsd, (n) => setD({ ...d, monthlyLimitUsd: n }))}
          </div>
        </div>
        {v.editor && (
          <div className="mt-3 flex justify-end">
            <Button onClick={() => void save()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={Gauge}
        tone="sky"
        title={t("ai.s.usage")}
        description={t("ai.s.usageDesc")}
      >
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-5">
          {[
            [t("ai.s.today"), u ? `$${u.today.toFixed(2)}` : "—"],
            [t("ai.s.month"), u ? `$${u.month.toFixed(2)}` : "—"],
            [t("ai.s.calls"), u ? String(u.calls) : "—"],
            [t("ai.s.tokens"), u ? u.tokens.toLocaleString("ru-RU") : "—"],
            [t("ai.s.errors"), u ? String(u.errors) : "—"],
          ].map(([k, val]) => (
            <div key={k} className="bg-card px-3 py-2.5">
              <dt className="text-[11.5px] text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 text-[17px] font-bold tabular-nums text-foreground">{val}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard
        icon={KeyRound}
        tone="slate"
        title={t("ai.s.more")}
        description={t("ai.s.moreDesc")}
      >
        <button
          type="button"
          onClick={() => setMore((x) => !x)}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} />
          {more ? t("ai.s.hide") : t("ai.s.show")}
        </button>
        {more && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {t("ai.s.provider")}
              </span>
              <select
                value={d.provider}
                disabled={!v.editor}
                onChange={(e) =>
                  setD({
                    ...d,
                    provider: e.target.value as AiSettingsView["settings"]["provider"],
                    model: null,
                  })
                }
                className={field}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {t(`ai.s.p.${p}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {t("ai.s.model")}
              </span>
              <input
                value={d.model ?? ""}
                disabled={!v.editor}
                onChange={(e) => setD({ ...d, model: e.target.value || null })}
                placeholder={t(`ai.s.m.${d.provider}`)}
                className={field}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {t("ai.s.key")}
              </span>
              <input
                type="password"
                value={key}
                disabled={!v.editor}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
                placeholder={d.hasKey ? `••••${d.keyLast4 ?? ""}` : t("ai.s.keyPh")}
                className={cn(field, "font-mono")}
              />
            </label>
            <p className="text-[12px] text-muted-foreground sm:col-span-3">
              {d.hasKey ? t("ai.s.ownKey") : t("ai.s.platformKey")}
            </p>
            {v.editor && (
              <div className="flex flex-wrap gap-2 sm:col-span-3">
                <Button onClick={() => void save()} disabled={busy}>
                  {t("common.save")}
                </Button>
                {d.hasKey && (
                  <Button
                    variant="outline"
                    onClick={() => void save({ clearKey: true, provider: "gemini" })}
                    disabled={busy}
                  >
                    {t("ai.s.clearKey")}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
