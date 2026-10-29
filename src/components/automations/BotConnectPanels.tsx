import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Code2, Copy, ExternalLink, KeyRound, Loader2, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { SectionCard } from "@/components/layout/Primitives";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { inputCls } from "@/components/automations/ActionEditor";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { useCreateLeadSource, useLeadSources } from "@/hooks/use-crm-data";
import type { MessageChannel } from "@/lib/automation-types";
import { copyText } from "@/lib/clipboard";

function copy(text: string, done: string) {
  void copyText(text).then(
    () => toast.success(done),
    () => undefined,
  );
}

function CopyField({ value, mono = true }: { value: string; mono?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        className={cn(inputCls, "h-10", mono && "font-mono text-xs")}
      />
      <button
        type="button"
        onClick={() => copy(value, t("sb.copied"))}
        className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-accent"
      >
        <Copy className="h-4 w-4" /> {t("pc.copy")}
      </button>
    </div>
  );
}

/**
 * The bot's public Telegram link: opening it and pressing Start makes the
 * person a lead and starts the bot (telegram.webhook.ts, "/start sb_<id>").
 * The admin tests the bot with it and puts it in ads, bios and websites.
 */
export function BotSharePanel({
  botId,
  dirty,
  enabled,
  channel,
  row = false,
}: {
  botId: string | null;
  dirty: boolean;
  enabled: boolean;
  channel: MessageChannel;
  /** One line above the canvas instead of a side card. */
  row?: boolean;
}) {
  const { t } = useI18n();
  const link = useQuery({
    queryKey: ["salesbot-link", botId],
    enabled: !!botId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const res = await apiFetch(`/salesbots/link?botId=${encodeURIComponent(botId!)}`);
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        shortUrl?: string;
        error?: string;
      };
      if (!res.ok || !body.url) throw new Error(body.error ?? `HTTP ${res.status}`);
      return { url: body.url, shortUrl: body.shortUrl ?? null };
    },
  });

  const warning = !botId
    ? t("sb.share.saveFirst")
    : dirty
      ? t("sb.share.unsaved")
      : !enabled
        ? t("sb.share.off")
        : channel === "sms" || channel === "email"
          ? t("sb.share.channel")
          : null;

  const status = !botId ? null : link.isLoading ? (
    <Loader2 className="h-4 w-4 animate-spin text-subtle" />
  ) : link.error ? (
    <p className="text-xs text-destructive">
      {link.error.message === "telegram_not_configured"
        ? t("sb.share.noTelegram")
        : describeError(link.error, t("sb.share.failed"))}
    </p>
  ) : null;
  // The bot's plain link when the platform made this salesbot the one it
  // opens; the long start link keeps working either way.
  const url = link.data?.shortUrl ?? link.data?.url ?? null;
  const longUrl = link.data?.shortUrl ? link.data.url : null;
  const urlText = url && (
    <p
      className={cn(
        "rounded-lg border border-sky-500/25 bg-card px-3 py-2.5 font-mono text-xs text-foreground select-all",
        row ? "min-w-0 flex-1 truncate" : "break-all",
      )}
    >
      {url}
    </p>
  );
  const longLine = longUrl && (
    <p className="text-[11px] text-muted-foreground">
      {t("sb.share.longLink")} <span className="break-all font-mono select-all">{longUrl}</span>
    </p>
  );
  const buttons = url && (
    <div className={cn("gap-2", row ? "flex shrink-0" : "grid grid-cols-[auto_1fr]")}>
      <button
        type="button"
        onClick={() => copy(url, t("sb.copied"))}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold whitespace-nowrap text-foreground hover:bg-accent"
      >
        <Copy className="h-4 w-4" /> {t("pc.copy")}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 text-sm font-semibold whitespace-nowrap text-white hover:bg-sky-600"
      >
        <ExternalLink className="h-4 w-4" /> {t("sb.share.open")}
      </a>
    </div>
  );
  const warningLine = warning && (
    <p className="rounded-lg bg-warning/10 px-2.5 py-2 text-xs text-foreground">{warning}</p>
  );
  const icon = (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-500 text-white">
      <Send className="h-4 w-4" />
    </span>
  );

  if (row) {
    return (
      <section className="space-y-2.5 rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] p-3">
        <div className="flex flex-wrap items-center gap-3">
          {icon}
          <p className="text-sm font-semibold text-foreground">{t("sb.share.title")}</p>
          {urlText}
          {buttons}
          {status}
        </div>
        {longLine}
        {warningLine}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.07] p-4">
      <div className="flex items-start gap-3">
        {icon}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{t("sb.share.title")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("sb.share.desc")}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {status}
        {urlText}
        {buttons}
        {longLine}
        {warningLine}
        <ol className="list-decimal space-y-0.5 pl-4 text-xs text-muted-foreground">
          <li>{t("sb.share.step1")}</li>
          <li>{t("sb.share.step2")}</li>
          <li>{t("sb.share.step3")}</li>
        </ol>
      </div>
    </section>
  );
}

const LANGS = ["python", "node", "curl"] as const;
type Lang = (typeof LANGS)[number];

function snippet(lang: Lang, url: string) {
  if (lang === "python") {
    return `import requests

SALESIQ_URL = "${url}"

def send_lead(name, phone, message=None):
    """Call this when your bot has collected the client's details."""
    r = requests.post(SALESIQ_URL, json={
        "name": name,
        "phone": phone,
        "message": message,   # e.g. the course or question they chose
    }, timeout=10)
    r.raise_for_status()
    return r.json()           # {"ok": true, "leadId": "...", "duplicate": false}

# aiogram example: after the client shared their phone number
# send_lead(data["name"], message.contact.phone_number, data.get("course"))`;
  }
  if (lang === "node") {
    return `const SALESIQ_URL = "${url}";

async function sendLead({ name, phone, message }) {
  const res = await fetch(SALESIQ_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, phone, message }),
  });
  if (!res.ok) throw new Error(\`SalesIQ: \${res.status}\`);
  return res.json(); // { ok: true, leadId, duplicate }
}`;
  }
  return `curl -X POST "${url}" \\
  -H "content-type: application/json" \\
  -d '{"name": "Aziz Karimov", "phone": "+998901234567", "message": "IELTS kursi"}'`;
}

/**
 * For a bot the company wrote itself (aiogram, python-telegram-bot, Node...):
 * one HTTPS call registers the client as a lead (/leads/incoming/<token>,
 * the same lead-source address as Admin -> Lead sources).
 */
export function CodeBotPanel() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: sources, isLoading } = useLeadSources();
  const create = useCreateLeadSource();
  const [picked, setPicked] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>("python");

  const usable = (sources ?? []).filter((s) => s.source_type === "webhook" && s.active);
  const source = usable.find((s) => s.id === picked) ?? usable[0] ?? null;
  const origin = typeof window === "undefined" ? "https://salesiq.uz" : window.location.origin;
  const url = source ? `${origin}/leads/incoming/${source.webhook_token}` : "";

  async function createSource() {
    if (!user?.organizationId) return;
    try {
      const row = await create.mutateAsync({
        name: t("sb.code.sourceName"),
        source_type: "webhook",
        organization_id: user.organizationId,
        created_by: user.id,
      });
      setPicked(row.id);
      toast.success(t("sb.code.created"));
    } catch (err) {
      toast.error(describeError(err, t("dp.saveFailed")));
    }
  }

  return (
    <SectionCard
      title={t("sb.code.title")}
      description={t("sb.code.desc")}
      icon={Code2}
      tone="violet"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-subtle" />
      ) : !source ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <KeyRound className="h-5 w-5 text-violet-500" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t("sb.code.none")}</p>
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => void createSource()}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t("sb.code.create")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {usable.length > 1 && (
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              {t("sb.code.source")}
              <select
                value={source.id}
                onChange={(e) => setPicked(e.target.value)}
                className={cn(inputCls, "w-auto")}
              >
                {usable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">{t("sb.code.url")}</p>
            <CopyField value={url} />
            <p className="text-xs text-subtle">{t("sb.code.secretHint")}</p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                size="sm"
                value={lang}
                options={LANGS}
                onChange={setLang}
                render={(l) => t(`sb.code.lang.${l}`)}
              />
              <button
                type="button"
                onClick={() => copy(snippet(lang, url), t("sb.copied"))}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" /> {t("sb.code.copyCode")}
              </button>
            </div>
            <pre className="max-h-80 overflow-auto rounded-xl bg-[#0f1115] p-3.5 font-mono text-[12px] leading-relaxed text-slate-200">
              {snippet(lang, url)}
            </pre>
          </div>
          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            {(["name", "phone", "message"] as const).map((f) => (
              <p key={f} className="rounded-lg bg-surface px-2.5 py-2">
                <code className="font-semibold text-foreground">{f}</code> —{" "}
                {t(`sb.code.field.${f}`)}
              </p>
            ))}
          </div>
          <Link
            to="/admin/lead-sources"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            {t("sb.code.manage")} <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </SectionCard>
  );
}
