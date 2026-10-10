import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
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
  hhmmss,
  normalizeReportHeading,
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

// "Hisobot" inside a funnel. The Report tab: today's report text for the
// signed-in user (their own numbers; the whole team's for a super admin /
// ROP), ready to send to the team's Telegram group or copy. The Settings tab
// (super admin / ROP): the shared template with a live preview, the working
// hours, and which Telegram group reports go to -- including connecting a
// new group with a one-time code.

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

const FIELD =
  "h-10 w-full rounded-lg border border-border bg-background px-3 text-[14px] text-foreground outline-none transition-colors [color-scheme:light] focus:border-primary focus:ring-2 focus:ring-primary/15 dark:[color-scheme:dark]";

function Section({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
          {desc && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{desc}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-subtle">{label}</p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums leading-tight text-foreground">
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

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
  const canEdit =
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

  const data = report.data ?? null;
  const template = data?.template?.trim() ? data.template : DEFAULT_MANAGER_REPORT_TEMPLATE;

  const [tab, setTab] = useState<"report" | "settings">("report");
  const editing = tab === "settings";
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const [draft, setDraft] = useState(template);
  const [workDayEnd, setWorkDayEnd] = useState(DEFAULT_REPORT_HOURS.workDayEnd);
  const [autoClose, setAutoClose] = useState(DEFAULT_REPORT_HOURS.autoClose);
  const [chatDraft, setChatDraft] = useState("");
  const draftRef = useRef<HTMLTextAreaElement>(null);

  // Connecting a group: the one-time code, when it expires, and which chats
  // were already bound when it was issued (to spot the new one).
  const [bind, setBind] = useState<{
    code: string;
    bot: string | null;
    expiresAt: number;
    known: Set<number>;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [justBound, setJustBound] = useState<string | null>(null);

  // The sender is always whoever is signed in: their profile name, or their
  // account name / email when the profile has none.
  const senderName = data?.name?.trim() || user?.name?.trim() || user?.email?.split("@")[0] || "";
  // A heading typed out by hand ("#Report Umidbek 10.10") still gets today's
  // date and the sender's name -- see normalizeReportHeading.
  const nameForms = useMemo(() => [senderName, senderName.split(/\s+/)[0] ?? ""], [senderName]);
  const filled = useMemo(
    () =>
      data
        ? fillManagerReport(
            normalizeReportHeading(editing ? draft : template, nameForms),
            {
              ...data,
              name: senderName,
              ...(editing ? { work_day_end: workDayEnd, auto_close: autoClose } : {}),
            },
            funnel,
          )
        : "",
    [data, senderName, nameForms, template, draft, editing, funnel, workDayEnd, autoClose],
  );
  // The report text follows the numbers until the manager types in it.
  useEffect(() => setText(filled), [filled]);

  // A heading with the name or date typed out: say the platform fills them
  // in itself, and offer to show it in the template. No name at all: offer
  // the standard heading.
  const fixedDraft = normalizeReportHeading(draft, nameForms);
  const headingFixable = fixedDraft !== draft;
  const hasNameVar = /\{(full_)?name\}/.test(fixedDraft);

  useEffect(() => {
    if (!open) {
      setTab("report");
      setCopied(false);
      setSent(false);
      setBind(null);
      setJustBound(null);
    }
  }, [open]);

  // While a code is live: tick the countdown and look for the new group.
  const bindLive = !!bind && now < bind.expiresAt;
  useEffect(() => {
    if (!bind) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => void refetchChats(), 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [bind, refetchChats]);
  useEffect(() => {
    if (!bind) return;
    const fresh = boundChats.find((c) => !bind.known.has(c.chat_id));
    if (fresh) {
      setJustBound(fresh.title || String(fresh.chat_id));
      setChatDraft(String(fresh.chat_id));
      setBind(null);
    }
  }, [boundChats, bind]);

  function openSettings() {
    setDraft(template);
    setWorkDayEnd(data?.work_day_end || DEFAULT_REPORT_HOURS.workDayEnd);
    setAutoClose(data?.auto_close || DEFAULT_REPORT_HOURS.autoClose);
    setChatDraft(pickedChatId ? String(pickedChatId) : "");
    setTab("settings");
  }

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
      setJustBound(null);
      setNow(Date.now());
      setBind({
        code: r.code,
        bot: r.botUsername,
        expiresAt: r.expiresAt ? new Date(r.expiresAt).getTime() : Date.now() + 15 * 60_000,
        known: new Set(boundChats.map((c) => c.chat_id)),
      });
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

  const saving = saveTemplate.isPending || saveHours.isPending || saveChat.isPending;
  async function save() {
    if (autoClose < workDayEnd) {
      toast.error(t("mreport.hoursOrder"));
      return;
    }
    try {
      await saveHours.mutateAsync({ workDayEnd, autoClose });
      const nextChat = chatDraft ? Number(chatDraft) : null;
      if (nextChat !== pickedChatId) await saveChat.mutateAsync(nextChat);
      await saveTemplate.mutateAsync(normalizeReportHeading(draft, nameForms));
      toast.success(t("mreport.templateSaved"));
      setTab("report");
    } catch (err) {
      toast.error(describeError(err, t("mreport.templateFailed")));
    }
  }

  const dayLabel = data?.day ? data.day.split("-").reverse().join(".") : "";
  const filledForStats = data
    ? fillManagerReport("{work_start}|{work_end}", { ...data, name: senderName }, funnel).split("|")
    : ["—", "—"];
  const command = bind ? `/bind${bind.bot ? `@${bind.bot}` : ""} ${bind.code}` : "";
  const left = bind ? bind.expiresAt - now : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(90dvh,860px)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        {/* Header: what this is, for which funnel and day, and the two tabs */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-6 py-4 pr-14">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[17px] font-semibold">{t("mreport.title")}</DialogTitle>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
              <span className="truncate">
                {funnel}
                {dayLabel ? ` · ${dayLabel}` : ""}
              </span>
              {data?.scope && (
                <span
                  className={cn(
                    "rounded-full px-2 py-px text-[11.5px] font-semibold",
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
          {canEdit && data && (
            <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1">
              {(["report", "settings"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => (k === "settings" ? openSettings() : setTab("report"))}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors",
                    tab === k
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {k === "report" ? (
                    <FileText className="h-3.5 w-3.5" />
                  ) : (
                    <Settings2 className="h-3.5 w-3.5" />
                  )}
                  {t(k === "report" ? "mreport.tabReport" : "mreport.tabSettings")}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-6 py-5">
          {report.isLoading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("mreport.loading")}
            </div>
          )}
          {report.error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-[13.5px] text-destructive">
              {t("mreport.failed")}: {describeError(report.error, "")}
            </p>
          )}

          {data && !editing && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex flex-col">
                <label className="mb-2 text-[12.5px] font-semibold text-muted-foreground">
                  {t("mreport.textLabel")}
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  // Tall enough for the whole report -- no scrolling inside it.
                  style={{ minHeight: Math.max(380, (text.split("\n").length + 1) * 28 + 40) }}
                  className="w-full flex-1 resize-y rounded-2xl border border-border bg-card p-5 text-[15px] leading-7 text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  {reportChat
                    ? t("mreport.hintGroup", { chat: reportChat.title || t("mreport.group") })
                    : t("mreport.hint")}
                </p>
              </div>

              <aside className="space-y-4">
                <div>
                  <p className="mb-2 text-[12.5px] font-semibold text-muted-foreground">
                    {t("mreport.statsTitle")}
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Stat label={t("mreport.stat.callTime")} value={hhmmss(data.talk_seconds)} />
                    <Stat
                      label={t("mreport.stat.conversation")}
                      value={`${data.people_talked}/${data.people_called}`}
                    />
                    <Stat label={t("mreport.stat.leads")} value={String(data.leads_total)} />
                    <Stat
                      label={t("mreport.stat.sales")}
                      value={`${data.sales_today}/${data.sales_total}`}
                    />
                    <Stat label={t("mreport.stat.start")} value={filledForStats[0] ?? "—"} />
                    <Stat label={t("mreport.stat.end")} value={filledForStats[1] ?? "—"} />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-[11.5px] font-medium uppercase tracking-wide text-subtle">
                    {t("mreport.sendTo")}
                  </p>
                  {reportChat ? (
                    <p className="mt-1.5 flex items-center gap-2 text-[14px] font-semibold text-foreground">
                      <Send className="h-4 w-4 text-[#229ED9]" />
                      <span className="truncate">{reportChat.title || reportChat.chat_id}</span>
                    </p>
                  ) : (
                    <div className="mt-1.5 text-[13px] text-muted-foreground">
                      <p>{t("mreport.noGroup")}</p>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={openSettings}
                          className="mt-1 font-semibold text-primary hover:underline"
                        >
                          {t("mreport.noGroupAdmin")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}

          {data && editing && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-5">
                <Section
                  title={t("mreport.sec.template")}
                  desc={t("mreport.sec.templateDesc")}
                  action={
                    <button
                      type="button"
                      onClick={() => setDraft(DEFAULT_MANAGER_REPORT_TEMPLATE)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("mreport.resetTemplate")}
                    </button>
                  }
                >
                  <textarea
                    ref={draftRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={Math.max(14, draft.split("\n").length + 1)}
                    className="w-full resize-y rounded-xl border border-border bg-background p-4 font-mono text-[13px] leading-6 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                  />
                  {headingFixable ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-[13px] text-foreground">
                      <Info className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">{t("mreport.headingAuto")}</span>
                      <button
                        type="button"
                        onClick={() => setDraft(fixedDraft)}
                        className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-[12.5px] font-semibold text-background hover:opacity-90"
                      >
                        {t("mreport.headingAutoFix")}
                      </button>
                    </div>
                  ) : (
                    !hasNameVar && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-foreground">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="min-w-0 flex-1">{t("mreport.noNameVar")}</span>
                        <button
                          type="button"
                          onClick={() => setDraft((d) => `#Report {name} {date}\n\n${d}`)}
                          className="shrink-0 rounded-lg bg-foreground px-3 py-1.5 text-[12.5px] font-semibold text-background hover:opacity-90"
                        >
                          {t("mreport.addNameVar")}
                        </button>
                      </div>
                    )
                  )}
                  <p className="mb-2 mt-4 text-[12.5px] text-muted-foreground">
                    {t("mreport.variablesHint")}
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {MANAGER_REPORT_VARIABLES.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-left hover:border-primary/50 hover:bg-primary/5"
                      >
                        <code className="shrink-0 font-mono text-[12px] font-semibold text-primary">{`{${v}}`}</code>
                        <span className="truncate text-[12px] text-muted-foreground">
                          {t(`mreport.var.${v}`)}
                        </span>
                      </button>
                    ))}
                  </div>
                </Section>
              </div>

              <div className="space-y-5">
                <Section title={t("mreport.sec.preview")}>
                  <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-muted/30 p-4 font-sans text-[13.5px] leading-6 text-foreground">
                    {filled}
                  </pre>
                </Section>

                <Section title={t("mreport.sec.hours")} desc={t("mreport.sec.hoursDesc")}>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-[12.5px] font-medium text-muted-foreground">
                      {t("mreport.workDayEnd")}
                      <input
                        type="time"
                        value={workDayEnd}
                        onChange={(e) => setWorkDayEnd(e.target.value)}
                        className={cn(FIELD, "mt-1.5 tabular-nums")}
                      />
                    </label>
                    <label className="block text-[12.5px] font-medium text-muted-foreground">
                      {t("mreport.autoClose")}
                      <input
                        type="time"
                        value={autoClose}
                        onChange={(e) => setAutoClose(e.target.value)}
                        className={cn(FIELD, "mt-1.5 tabular-nums")}
                      />
                    </label>
                  </div>
                  <p className="mt-3 flex gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t("mreport.hoursHint", { end: workDayEnd, close: autoClose })}
                  </p>
                </Section>

                <Section title={t("mreport.sec.group")} desc={t("mreport.sec.groupDesc")}>
                  <select
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    className={FIELD}
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

                  {justBound && (
                    <p className="mt-3 flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-[13px] font-medium text-foreground">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      {t("mreport.bindConnected", { chat: justBound })}
                    </p>
                  )}

                  {bind && bindLive ? (
                    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("mreport.bindWaiting")}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 font-mono text-[12.5px] font-semibold tabular-nums",
                            left < 60_000
                              ? "bg-destructive/15 text-destructive"
                              : "bg-background text-foreground",
                          )}
                          title={t("mreport.bindExpiresTitle")}
                        >
                          {mmss(left)}
                        </span>
                      </div>
                      <ol className="space-y-2 text-[13px] leading-relaxed text-foreground">
                        <li>
                          {t("mreport.bindStep1", {
                            bot: bind.bot ? `@${bind.bot}` : t("mreport.theBot"),
                          })}
                        </li>
                        <li>{t("mreport.bindStep2")}</li>
                      </ol>
                      <div className="mt-2 flex items-stretch gap-2">
                        <code className="min-w-0 flex-1 select-all truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-[13px]">
                          {command}
                        </code>
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(command).then((ok) =>
                              ok ? toast.success(t("mreport.copied")) : undefined,
                            )
                          }
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12.5px] font-medium hover:bg-accent"
                        >
                          <Copy className="h-3.5 w-3.5" /> {t("mreport.copy")}
                        </button>
                      </div>
                      <p className="mt-3 text-[12.5px] text-muted-foreground">
                        {t("mreport.bindStep3")}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {bind && !bindLive && (
                        <span className="text-[12.5px] text-destructive">
                          {t("mreport.bindExpired")}
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={linkGroup.isPending}
                        onClick={() => void newBindCode()}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-foreground hover:bg-accent disabled:opacity-60"
                      >
                        {linkGroup.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Link2 className="h-3.5 w-3.5" />
                        )}
                        {bind ? t("mreport.bindNewCode") : t("mreport.bindNew")}
                      </button>
                    </div>
                  )}
                </Section>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-background px-6 py-3.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setTab("report")}
                className="h-10 rounded-lg px-4 text-[13.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("mreport.saveSettings")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={report.isFetching}
                onClick={() => void report.refetch()}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-[13.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
              >
                <RefreshCw className={cn("h-4 w-4", report.isFetching && "animate-spin")} />
                {t("mreport.refresh")}
              </button>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!data}
                  onClick={() => void copy()}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[13.5px] font-semibold disabled:opacity-60",
                    reportChat
                      ? "border border-border bg-background text-foreground hover:bg-accent"
                      : "bg-primary text-primary-foreground shadow-sm hover:brightness-110",
                  )}
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? t("mreport.copied") : t("mreport.copy")}
                </button>
                {reportChat && (
                  <button
                    type="button"
                    disabled={!data || !text.trim() || sendToGroup.isPending}
                    onClick={() => void send()}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-[13.5px] font-semibold text-primary-foreground shadow-sm hover:brightness-110 disabled:opacity-60"
                  >
                    {sendToGroup.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : sent ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {sent ? t("mreport.sentShort") : t("mreport.send")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
