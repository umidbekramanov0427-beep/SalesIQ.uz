import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Megaphone, Mic, Search, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { DeskBlock } from "@/components/dashboard/desk/DeskParts";
import { VoiceRecorder } from "@/components/lead/VoiceRecorder";
import {
  uploadBulkFile,
  useDialList,
  useFunnelNames,
  useLeadLookup,
  usePipelineStagesRaw,
  useSendLeadTelegramMessage,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import type { DialItem } from "@/lib/phone-center";
import { cn, describeError } from "@/lib/utils";

// Ovozli xabar: one voice message recorded in the browser and sent to the
// chosen clients' Telegram chats (as a voice note, like from the lead
// card). Recipients are picked one by one or as a funnel's stages; each
// send is saved in the lead's chat; a lead with no Telegram chat is
// reported, not skipped silently.

type Sent = { leadId: string; ok: boolean; error?: string };

export function VoiceMessage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"pick" | "stage">("pick");
  const [q, setQ] = useState("");
  const lookup = useLeadLookup(q);
  const [picked, setPicked] = useState<DialItem[]>([]);
  const { names: funnels } = useFunnelNames();
  const { data: stages = [] } = usePipelineStagesRaw();
  const [funnel, setFunnel] = useState("");
  const [stageIds, setStageIds] = useState<string[]>([]);
  const list = useDialList(
    mode === "stage" ? funnel || null : null,
    mode === "stage" ? stageIds : [],
  );
  const recipients = useMemo(
    () => (mode === "pick" ? picked : (list.data ?? [])),
    [mode, picked, list.data],
  );
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent[]>([]);
  const send = useSendLeadTelegramMessage();
  const funnelStages = stages
    .filter((s) => (s.pipeline_name ?? "") === funnel)
    .sort((a, b) => a.position - b.position);

  async function onSend(file: File, as: "voice" | "document") {
    setBusy(true);
    setSent([]);
    try {
      const path = await uploadBulkFile(file);
      const out: Sent[] = [];
      for (const r of recipients) {
        try {
          await send.mutateAsync({
            leadId: r.leadId,
            text: "",
            files: [{ name: file.name, type: file.type, path, as }],
          });
          out.push({ leadId: r.leadId, ok: true });
        } catch (e) {
          out.push({
            leadId: r.leadId,
            ok: false,
            error: describeError(e, t("ptel.voice.failed")),
          });
        }
        setSent([...out]);
      }
      const ok = out.filter((x) => x.ok).length;
      if (ok) toast.success(t("ptel.voice.done", { n: ok, total: out.length }));
      else toast.error(t("ptel.voice.noneSent"));
      setRecording(false);
    } catch (e) {
      toast.error(describeError(e, t("ptel.voice.failed")));
      throw e;
    } finally {
      setBusy(false);
    }
  }

  const select =
    "h-9 rounded-[6px] border border-border bg-background px-2.5 text-[13px] outline-none focus:border-primary";
  const resultOf = (id: string) => sent.find((s) => s.leadId === id);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <DeskBlock tipKey="ptel.b.voice" title={t("ptel.voice.to")} icon={Megaphone} tone="sky">
        <div
          role="tablist"
          className="ctl-track inline-flex items-center gap-0.5 rounded-[6px] p-0.5"
        >
          {(["pick", "stage"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              data-state={mode === m ? "active" : "inactive"}
              onClick={() => setMode(m)}
              className="ctl-tab h-8 rounded-[4px] px-3 text-[12.5px] font-semibold"
            >
              {t(`ptel.voice.mode.${m}`)}
            </button>
          ))}
        </div>

        {mode === "pick" ? (
          <div className="mt-3">
            <label className="flex h-9 items-center gap-2 rounded-[6px] border border-border bg-background px-2.5 focus-within:border-primary">
              <Search className="h-4 w-4 text-subtle" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("ptel.voice.search")}
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle phone:text-base"
              />
              {lookup.isFetching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </label>
            {(lookup.data ?? []).length > 0 && (
              <ul className="mt-1.5 divide-y divide-border rounded-[6px] border border-border">
                {(lookup.data ?? []).map((l) => {
                  const on = picked.some((p) => p.leadId === l.leadId);
                  return (
                    <li key={l.leadId}>
                      <button
                        type="button"
                        onClick={() =>
                          setPicked((p) =>
                            on ? p.filter((x) => x.leadId !== l.leadId) : [...p, l],
                          )
                        }
                        className={cn(
                          "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-accent/50",
                          on && "bg-primary/[0.07]",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {l.name || t("phone.unknown")}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{l.phone}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <select
              value={funnel}
              onChange={(e) => {
                setFunnel(e.target.value);
                setStageIds([]);
              }}
              className={cn(select, "w-full")}
            >
              <option value="">{t("ptel.auto.pickFunnel")}</option>
              {funnels.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1.5">
              {funnelStages.map((s) => {
                const on = stageIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setStageIds((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))
                    }
                    className={cn(
                      "h-8 rounded-[6px] border px-2.5 text-[12.5px] font-semibold",
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <p className="mt-4 text-[12.5px] font-semibold text-muted-foreground">
          {t("ptel.voice.recipients", { n: recipients.length })}
        </p>
        <ul className="mt-1.5 max-h-[300px] divide-y divide-border overflow-y-auto rounded-[6px] border border-border">
          {recipients.length === 0 && (
            <li className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
              {t("ptel.voice.none")}
            </li>
          )}
          {recipients.map((r) => {
            const res = resultOf(r.leadId);
            return (
              <li key={r.leadId} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                <Link
                  to="/crm/leads/$leadId"
                  params={{ leadId: r.leadId }}
                  className="min-w-0 flex-1 truncate font-medium hover:text-primary hover:underline"
                >
                  {r.name || t("phone.unknown")}
                </Link>
                {res ? (
                  res.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <span
                      className="inline-flex max-w-[220px] items-center gap-1 truncate text-[12px] text-rose-600 dark:text-rose-400"
                      title={res.error}
                    >
                      <XCircle className="h-4 w-4 shrink-0" />
                      {res.error}
                    </span>
                  )
                ) : (
                  <span className="tabular-nums text-[12px] text-muted-foreground">{r.phone}</span>
                )}
                {mode === "pick" && !busy && (
                  <button
                    type="button"
                    onClick={() => setPicked((p) => p.filter((x) => x.leadId !== r.leadId))}
                    aria-label={t("common.delete")}
                    className="grid h-6 w-6 place-items-center rounded-[4px] text-muted-foreground hover:bg-accent"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </DeskBlock>

      <DeskBlock tipKey="ptel.b.record" title={t("ptel.voice.record")} icon={Mic} tone="rose">
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("ptel.voice.what")}</p>
        <div className="mt-4">
          {recording ? (
            <div className="rounded-[8px] border border-border bg-surface">
              <VoiceRecorder
                onSend={onSend}
                onClose={() => setRecording(false)}
                sendLabel={t("ptel.voice.sendN", { n: recipients.length })}
              />
            </div>
          ) : (
            <button
              type="button"
              disabled={recipients.length === 0 || busy}
              onClick={() => setRecording(true)}
              className="inline-flex h-11 items-center gap-2 rounded-[6px] bg-rose-600 px-5 text-[13.5px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              <Mic className="h-4 w-4" />
              {t("ptel.voice.start")}
            </button>
          )}
          {busy && (
            <p className="mt-3 inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("ptel.voice.sending", { done: sent.length, total: recipients.length })}
            </p>
          )}
        </div>
      </DeskBlock>
    </div>
  );
}
