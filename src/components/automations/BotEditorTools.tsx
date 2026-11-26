// The salesbot editor's top-bar tools (5CRM): «Ishga tushish sharti» (what
// starts the bot), the `</>` JSON window (copy the bot, or paste one from
// another CRM) and «Bot ko'rinishi» (the chat the client would see along the
// "yes" path, lib/salesbots/simulate.ts).
import { useMemo, useState } from "react";
import { Bot, Check, Copy, Eye, FileJson, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputCls } from "@/components/automations/ActionEditor";
import { STEP_ICON, stepPreview } from "@/components/automations/BotCanvas";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { simulateBot } from "@/lib/salesbots/simulate";
import type { BotStep } from "@/lib/automation-types";
import type { SalesbotTrigger } from "@/hooks/use-automations";

export const CHAT_TRIGGERS: SalesbotTrigger[] = ["manual", "message", "stage_enter", "button"];
export const TG_TRIGGERS: SalesbotTrigger[] = ["tg_start", "tg_button", "tg_message", "tg_daily"];

/** «Ishga tushish sharti»: the trigger, with its stage or daily time. */
export function TriggerPicker({
  trigger,
  stageId,
  time,
  stages,
  onChange,
}: {
  trigger: SalesbotTrigger;
  stageId: string | null;
  time: string | null;
  stages: { id: string; name: string }[];
  onChange: (p: {
    trigger?: SalesbotTrigger;
    trigger_stage_id?: string | null;
    trigger_time?: string | null;
  }) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{t("sb.trigger")}</span>
      <select
        value={trigger}
        onChange={(e) => {
          const v = e.target.value as SalesbotTrigger;
          onChange({
            trigger: v,
            ...(v === "tg_daily" && !time ? { trigger_time: "09:00" } : {}),
          });
        }}
        className={cn(inputCls, "h-9 w-auto min-w-[210px]")}
      >
        <optgroup label={t("sb.trigger.groupChat")}>
          {CHAT_TRIGGERS.map((k) => (
            <option key={k} value={k}>
              {t(`sb.trigger.${k}`)}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("sb.trigger.groupTg")}>
          {TG_TRIGGERS.map((k) => (
            <option key={k} value={k}>
              {t(`sb.trigger.${k}`)}
            </option>
          ))}
        </optgroup>
      </select>
      {trigger === "stage_enter" && (
        <select
          value={stageId ?? ""}
          onChange={(e) => onChange({ trigger_stage_id: e.target.value || null })}
          className={cn(inputCls, "h-9 w-auto max-w-[260px]", !stageId && "border-warning")}
        >
          <option value="">{t("sb.trigger.pickStage")}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {trigger === "tg_daily" && (
        <input
          type="time"
          value={time ?? "09:00"}
          onChange={(e) => onChange({ trigger_time: e.target.value || "09:00" })}
          className={cn(inputCls, "h-9 w-[130px]")}
          aria-label={t("sb.trigger.time")}
        />
      )}
    </div>
  );
}

/** What a bot exports as: enough to rebuild it in another company. */
export type BotJson = { name: string; channel?: string; trigger?: string; steps: BotStep[] };

/** Reads pasted JSON: our own export, a bare step list, or null (not ours). */
export function parseBotJson(text: string): BotJson | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  const isSteps = (x: unknown): x is BotStep[] =>
    Array.isArray(x) && x.every((s) => !!s && typeof s === "object" && "id" in s && "type" in s);
  if (isSteps(v)) return { name: "", steps: v };
  if (v && typeof v === "object" && isSteps((v as BotJson).steps)) {
    const o = v as BotJson;
    return {
      name: typeof o.name === "string" ? o.name : "",
      steps: o.steps,
      ...(typeof o.channel === "string" ? { channel: o.channel } : {}),
      ...(typeof o.trigger === "string" ? { trigger: o.trigger } : {}),
    };
  }
  return null;
}

/** The `</>` window: the bot as JSON (copy) and «Boshqa CRM'dan import» (paste). */
export function BotJsonDialog({
  open,
  onOpenChange,
  value,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: BotJson;
  /** Gets the pasted text; returns an error message, or null when it was loaded. */
  onImport: (text: string) => string | null;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"export" | "import">("export");
  const [paste, setPaste] = useState("");
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => JSON.stringify(value, null, 2), [value]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-4 w-4" /> {t("sb.json.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="ctl-track inline-flex w-fit">
          {(["export", "import"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className="ctl-tab px-3 py-1.5 text-xs font-semibold"
            >
              {t(`sb.json.${k}`)}
            </button>
          ))}
        </div>
        {tab === "export" ? (
          <div className="space-y-2">
            <pre className="max-h-[50vh] overflow-auto rounded-xl bg-surface p-3 font-mono text-[11px] leading-relaxed text-foreground">
              {json}
            </pre>
            <button
              type="button"
              onClick={() =>
                void copyText(json).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  },
                  () => toast.error(t("common.copyFailed")),
                )
              }
              className="ctl-soft inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t("sb.copied") : t("pc.copy")}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("sb.json.importHint")}</p>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={12}
              spellCheck={false}
              placeholder='{ "name": "…", "steps": [ … ] }'
              className={cn(inputCls, "h-auto py-2 font-mono text-[11px]")}
            />
            <button
              type="button"
              disabled={!paste.trim()}
              onClick={() => {
                const err = onImport(paste);
                if (err) toast.error(err);
                else {
                  setPaste("");
                  onOpenChange(false);
                }
              }}
              className="ctl-lit inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> {t("sb.json.load")}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** «Bot ko'rinishi»: the client's chat along the yes path. */
export function BotPreviewDialog({
  open,
  onOpenChange,
  steps,
  name,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  steps: BotStep[];
  name: string;
}) {
  const { t } = useI18n();
  const bubbles = useMemo(() => simulateBot(steps), [steps]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Eye className="h-4 w-4" /> {t("sb.botView")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/12 text-primary">
            <Bot className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-foreground">
              {name || t("sb.name")}
            </span>
            <span className="block text-[11px] text-subtle">{t("sb.preview.yesPath")}</span>
          </span>
        </div>
        <div className="max-h-[60vh] space-y-2 overflow-y-auto bg-surface px-4 py-4">
          {bubbles.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("sb.preview.empty")}
            </p>
          )}
          {bubbles.map((b, i) => {
            if (b.kind === "event") {
              const Icon = STEP_ICON[b.step.type];
              return (
                <div
                  key={i}
                  className="flex items-center justify-center gap-1.5 text-[11px] text-subtle"
                >
                  <Icon className="h-3 w-3" />
                  <span className="truncate">
                    {t(`sb.step.${b.step.type}`)} · {stepPreview(b.step, t)}
                  </span>
                </div>
              );
            }
            if (b.kind === "client")
              return (
                <div key={i} className="flex justify-end">
                  <span className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {b.text}
                  </span>
                </div>
              );
            return (
              <div key={i} className="flex flex-col items-start gap-1">
                <span className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-sm text-foreground">
                  {b.media && (
                    <span className="mb-1 block text-[11px] font-semibold text-subtle">
                      📎 {t(`sb.mediaKind.${b.media.kind}`)}
                    </span>
                  )}
                  {b.text || t("sb.previewEmptyMessage")}
                </span>
                {b.buttons.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap gap-1">
                    {b.buttons.map((l, j) => (
                      <span
                        key={j}
                        className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-primary"
                      >
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
