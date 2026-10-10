import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import {
  DEFAULT_REPORT_HOURS,
  DEFAULT_MANAGER_REPORT_TEMPLATE,
  MANAGER_REPORT_VARIABLES,
  fillManagerReport,
} from "@/lib/manager-report";
import {
  useLinkTelegramGroup,
  useMyDailyReport,
  useOrgGeneralSettings,
  useSendReportToTelegram,
  useSetManagerReportChat,
  useSetManagerReportHours,
  useSetManagerReportTemplate,
  useTelegramBoundChats,
} from "@/hooks/use-crm-data";

// "Hisobot" inside a funnel: today's report for the signed-in manager, ready
// to copy into the team's Telegram group. Nothing is downloaded -- the text
// is shown in the middle of the screen and can still be touched up (e.g.
// "Holat") before copying. Super admins and ROPs can change the template
// everyone's report follows.

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export function ManagerReportDialog({
  open,
  onOpenChange,
  funnel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnel: string;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEditTemplate =
    user?.role === "super_admin" || user?.role === "rop" || user?.role === "platform_owner";
  const report = useMyDailyReport(funnel, open);
  const saveTemplate = useSetManagerReportTemplate();
  const saveHours = useSetManagerReportHours();
  const saveChat = useSetManagerReportChat();
  const sendToGroup = useSendReportToTelegram();
  const linkGroup = useLinkTelegramGroup();
  const { data: settings } = useOrgGeneralSettings();
  const { data: boundChats = [], refetch: refetchChats } = useTelegramBoundChats();
  // The report group: the one picked in settings, or the only bound chat.
  const pickedChatId = settings?.manager_report_chat_id ?? null;
  const reportChat = pickedChatId
    ? boundChats.find((c) => c.chat_id === pickedChatId)
    : boundChats.length === 1
      ? boundChats[0]
      : undefined;
  const [chatDraft, setChatDraft] = useState<string>("");
  const [bindCode, setBindCode] = useState<{ code: string; bot: string | null } | null>(null);
  const [sent, setSent] = useState(false);
  const data = report.data ?? null;
  const template = data?.template?.trim() ? data.template : DEFAULT_MANAGER_REPORT_TEMPLATE;

  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(template);
  const [workDayEnd, setWorkDayEnd] = useState(DEFAULT_REPORT_HOURS.workDayEnd);
  const [autoClose, setAutoClose] = useState(DEFAULT_REPORT_HOURS.autoClose);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // The sender is always whoever is signed in: their profile name, or their
  // account name / email when the profile has none.
  const senderName = data?.name?.trim() || user?.name?.trim() || user?.email?.split("@")[0] || "";
  const filled = useMemo(
    () =>
      data
        ? fillManagerReport(
            editing ? draft : template,
            {
              ...data,
              name: senderName,
              ...(editing ? { work_day_end: workDayEnd, auto_close: autoClose } : {}),
            },
            funnel,
          )
        : "",
    [data, senderName, template, draft, editing, funnel, workDayEnd, autoClose],
  );
  // A template without {name}: every report would carry the same (or no)
  // name. If it spells out the editor's own first name, offer the fix.
  const hasNameVar = /\{(full_)?name\}/.test(draft);
  const myFirstName = senderName.split(/\s+/)[0] ?? "";
  const literalName =
    !hasNameVar && myFirstName.length > 1 && draft.includes(myFirstName) ? myFirstName : null;
  // The editable report text follows the numbers until the manager types.
  useEffect(() => setText(filled), [filled]);
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setCopied(false);
      setSent(false);
      setBindCode(null);
    }
  }, [open]);

  async function copy() {
    if (await copyText(text)) {
      setCopied(true);
      toast.success(t("mreport.copied"));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t("mreport.copyFailed"));
    }
  }

  async function send() {
    try {
      await sendToGroup.mutateAsync(text);
      setSent(true);
      toast.success(t("mreport.sent", { chat: reportChat?.title || t("mreport.group") }));
    } catch (err) {
      toast.error(describeError(err, t("mreport.sendFailed")));
    }
  }

  async function newBindCode() {
    try {
      const r = await linkGroup.mutateAsync();
      setBindCode({ code: r.code, bot: r.botUsername });
    } catch (err) {
      toast.error(describeError(err, t("mreport.bindFailed")));
    }
  }

  function insertVariable(name: string) {
    const token = `{${name}}`;
    const el = draftRef.current;
    if (!el) return setDraft((d) => d + token);
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + token + draft.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function save(next: string | null) {
    if (autoClose < workDayEnd) {
      toast.error(t("mreport.hoursOrder"));
      return;
    }
    try {
      await saveHours.mutateAsync({ workDayEnd, autoClose });
      const nextChat = chatDraft ? Number(chatDraft) : null;
      if (nextChat !== pickedChatId) await saveChat.mutateAsync(nextChat);
      await saveTemplate.mutateAsync(next);
      toast.success(t("mreport.templateSaved"));
      setEditing(false);
    } catch (err) {
      toast.error(describeError(err, t("mreport.templateFailed")));
    }
  }

  const dayLabel = data?.day ? data.day.split("-").reverse().join(".") : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-xl gap-0 overflow-hidden p-0">
        <div className="flex items-start gap-3 border-b border-border px-5 pb-4 pt-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-semibold">{t("mreport.title")}</DialogTitle>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
              <span className="truncate">
                {funnel}
                {dayLabel ? ` · ${dayLabel}` : ""}
              </span>
              {data?.scope && (
                <span
                  className={cn(
                    "rounded-full px-2 py-px text-[11px] font-semibold",
                    data.scope === "team"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {t(data.scope === "team" ? "mreport.scopeTeam" : "mreport.scopeMe")}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="max-h-[62dvh] overflow-y-auto px-5 py-4">
          {report.isLoading && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("mreport.loading")}
            </div>
          )}
          {report.error && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[13px] text-destructive">
              {t("mreport.failed")}: {describeError(report.error, "")}
            </p>
          )}

          {data && editing && (
            <div className="mb-4 space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wider text-subtle">
                {t("mreport.templateTitle")}
              </p>
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={12}
                className="w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-[12.5px] leading-relaxed text-foreground outline-none focus:border-primary"
              />
              {!hasNameVar && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12.5px] text-foreground">
                  <span className="min-w-0 flex-1">
                    {literalName
                      ? t("mreport.literalName", { name: literalName })
                      : t("mreport.noNameVar")}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) =>
                        literalName
                          ? d.split(literalName).join("{name}")
                          : `#Report {name} {date}\n\n${d}`,
                      )
                    }
                    className="shrink-0 rounded-md bg-foreground/90 px-2 py-1 text-[12px] font-semibold text-background hover:bg-foreground"
                  >
                    {literalName ? t("mreport.literalNameFix") : t("mreport.addNameVar")}
                  </button>
                </div>
              )}
              <p className="text-[12px] text-muted-foreground">{t("mreport.variablesHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {MANAGER_REPORT_VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    title={t(`mreport.var.${v}`)}
                    onClick={() => insertVariable(v)}
                    className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[11.5px] text-foreground hover:border-primary/50 hover:bg-primary/5"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
              <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <label className="block text-[12.5px] text-muted-foreground">
                  {t("mreport.workDayEnd")}
                  <input
                    type="time"
                    value={workDayEnd}
                    onChange={(e) => setWorkDayEnd(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-[13.5px] text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
                  />
                </label>
                <label className="block text-[12.5px] text-muted-foreground">
                  {t("mreport.autoClose")}
                  <input
                    type="time"
                    value={autoClose}
                    onChange={(e) => setAutoClose(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-[13.5px] text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
                  />
                </label>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {t("mreport.hoursHint", { end: workDayEnd, close: autoClose })}
              </p>
              <div className="space-y-2 pt-3">
                <label className="block text-[12.5px] text-muted-foreground">
                  {t("mreport.groupLabel")}
                  <select
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-[13.5px] text-foreground outline-none [color-scheme:light] focus:border-primary dark:[color-scheme:dark]"
                  >
                    <option value="">
                      {boundChats.length === 1
                        ? t("mreport.groupOnly", { chat: boundChats[0]!.title || "Telegram" })
                        : t("mreport.groupNone")}
                    </option>
                    {boundChats.map((c) => (
                      <option key={c.id} value={String(c.chat_id)}>
                        {c.title || c.chat_id}
                      </option>
                    ))}
                  </select>
                </label>
                {bindCode ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-[12.5px] leading-relaxed text-foreground">
                    <p>
                      {t("mreport.bindStep1", {
                        bot: bindCode.bot ? `@${bindCode.bot}` : t("mreport.theBot"),
                      })}
                    </p>
                    <p className="mt-1">{t("mreport.bindStep2")}</p>
                    <code className="mt-1 block select-all rounded bg-background px-2 py-1 font-mono text-[13px]">
                      /bind{bindCode.bot ? `@${bindCode.bot}` : ""} {bindCode.code}
                    </code>
                    <button
                      type="button"
                      onClick={() => void refetchChats()}
                      className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> {t("mreport.bindRefresh")}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={linkGroup.isPending}
                    onClick={() => void newBindCode()}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline disabled:opacity-60"
                  >
                    <Link2 className="h-3.5 w-3.5" /> {t("mreport.bindNew")}
                  </button>
                )}
              </div>
              <p className="pt-2 text-[12px] font-semibold uppercase tracking-wider text-subtle">
                {t("mreport.preview")}
              </p>
            </div>
          )}

          {data && (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                readOnly={editing}
                rows={Math.min(18, Math.max(10, text.split("\n").length + 1))}
                className={cn(
                  "w-full resize-y rounded-xl border border-border bg-muted/30 p-4 text-[14px] leading-relaxed text-foreground outline-none focus:border-primary",
                  editing && "opacity-80",
                )}
              />
              {!editing && (
                <p className="mt-2 text-[12px] text-muted-foreground">
                  {reportChat
                    ? t("mreport.hintGroup", { chat: reportChat.title || t("mreport.group") })
                    : t("mreport.hint")}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-5 py-3">
          {editing ? (
            <>
              <button
                type="button"
                disabled={saveTemplate.isPending || saveHours.isPending}
                onClick={() => void save(draft)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-60"
              >
                {saveTemplate.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("mreport.saveTemplate")}
              </button>
              <button
                type="button"
                disabled={saveTemplate.isPending}
                onClick={() => setDraft(DEFAULT_MANAGER_REPORT_TEMPLATE)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {t("mreport.resetTemplate")}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="ml-auto h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              {reportChat && (
                <button
                  type="button"
                  disabled={!data || !text.trim() || sendToGroup.isPending}
                  onClick={() => void send()}
                  title={reportChat.title ?? undefined}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-semibold text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-60"
                >
                  {sendToGroup.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : sent ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  {sent ? t("mreport.sentShort") : t("mreport.send")}
                </button>
              )}
              <button
                type="button"
                disabled={!data}
                onClick={() => void copy()}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold disabled:opacity-60",
                  reportChat
                    ? "border border-border bg-background text-foreground hover:bg-accent"
                    : "bg-primary text-primary-foreground shadow-sm hover:brightness-110",
                )}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t("mreport.copied") : t("mreport.copy")}
              </button>
              <button
                type="button"
                disabled={report.isFetching}
                onClick={() => void report.refetch()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", report.isFetching && "animate-spin")} />
                {t("mreport.refresh")}
              </button>
              {canEditTemplate && data && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(template);
                    setWorkDayEnd(data.work_day_end || DEFAULT_REPORT_HOURS.workDayEnd);
                    setAutoClose(data.auto_close || DEFAULT_REPORT_HOURS.autoClose);
                    setChatDraft(pickedChatId ? String(pickedChatId) : "");
                    setEditing(true);
                  }}
                  className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" /> {t("mreport.editTemplate")}
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
