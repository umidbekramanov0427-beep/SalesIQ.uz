import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  Bot,
  Briefcase,
  Check,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock,
  Keyboard,
  Loader2,
  Mic,
  Paperclip,
  Phone,
  RefreshCw,
  Save,
  Send,
  Smile,
  ThumbsUp,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/lib/auth";
import { useCrmEnabled } from "@/lib/use-org-access";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { CARD, QUIET, dayWord, hhmm, pad } from "@/components/lead/amo-utils";
import { readFile } from "@/components/crm/bulk-message-shared";
import { VoiceRecorder } from "@/components/lead/VoiceRecorder";

/** Telegram takes files from a bot up to 50 MB; Storage uploads cap at 20 MB. */
const CHAT_MAX_FILE = 20 * 1024 * 1024;
/** Up to this much in total the files go inline with the request. */
const CHAT_INLINE_BYTES = 3 * 1024 * 1024;
import { useSalesbots, useStartSalesbot } from "@/hooks/use-automations";
import {
  useCreateLeadActivity,
  useCreateTask,
  useDeleteLeadTask,
  useLeadTasksView,
  usePermission,
  useProfilesRaw,
  useSendLeadTelegramMessage,
  uploadBulkFile,
  type BulkFileInput,
  useUpdateTask,
  useUploadLeadFile,
  type CrmLeadView,
} from "@/hooks/use-crm-data";

// The composer under the lead feed and the open-task rows above it, built
// the way amoCRM's work: one line until clicked, then Chat / Note / Task
// with the target, date, time, assignee and task type picked inline in the
// sentence itself ("Task on Today 21:05-21:35 for Umidjon: Contact: ...").

export type ComposeMode = "chat" | "note" | "task";
type TaskView = ReturnType<typeof useLeadTasksView>["rows"][number];

/* ------------------------------------------------------------------ */
/* Task types                                                          */
/* ------------------------------------------------------------------ */

const TASK_TYPES: { key: string; icon: LucideIcon; color: string }[] = [
  { key: "contact", icon: RefreshCw, color: "text-emerald-500" },
  { key: "meeting", icon: Briefcase, color: "text-amber-700 dark:text-amber-500" },
  { key: "call", icon: Phone, color: "text-sky-500" },
  { key: "payment", icon: CircleDollarSign, color: "text-yellow-500" },
  { key: "urgent", icon: AlarmClock, color: "text-red-500" },
  { key: "check", icon: ThumbsUp, color: "text-blue-500" },
  { key: "send", icon: Send, color: "text-green-500" },
];

// Task type isn't a column: it's the "Type: " prefix of the title, so the
// type is read back by matching that prefix against the labels.
function splitTitle(title: string, t: (k: string) => string): { type: string; text: string } {
  for (const tt of TASK_TYPES) {
    const label = t(`amo.taskType.${tt.key}`);
    if (title === label) return { type: tt.key, text: "" };
    if (title.startsWith(`${label}: `))
      return { type: tt.key, text: title.slice(label.length + 2) };
  }
  return { type: "contact", text: title };
}

function TypeIcon({ type, className }: { type: string; className?: string }) {
  const tt = TASK_TYPES.find((x) => x.key === type) ?? TASK_TYPES[0]!;
  return <tt.icon className={cn("inline h-3.5 w-3.5 shrink-0", tt.color, className)} />;
}

export function TypePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded px-1 font-semibold text-foreground hover:bg-accent"
        >
          <TypeIcon type={value} />
          {t(`amo.taskType.${value}`)}:
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="amo-skin w-56 p-1">
        {TASK_TYPES.map((tt) => (
          <button
            key={tt.key}
            type="button"
            onClick={() => {
              onChange(tt.key);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded px-2 py-2 text-left text-[13px] text-foreground hover:bg-accent"
          >
            <Check className={cn("h-3.5 w-3.5", value === tt.key ? "opacity-100" : "opacity-0")} />
            <tt.icon className={cn("h-4 w-4", tt.color)} />
            {t(`amo.taskType.${tt.key}`)}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Date / time / people pickers                                        */
/* ------------------------------------------------------------------ */

export function DatePick({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date, time?: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const plus = (mins: number) => () => new Date(Date.now() + mins * 60_000);
  const inDays = (days: number) => () => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  };
  const presets: { label: string; at: () => Date; withTime?: boolean }[] = [
    { label: t("amo.when.15m"), at: plus(15), withTime: true },
    { label: t("amo.when.30m"), at: plus(30), withTime: true },
    { label: t("amo.when.1h"), at: plus(60), withTime: true },
    { label: t("amo.when.today"), at: inDays(0) },
    { label: t("amo.when.tomorrow"), at: inDays(1) },
    {
      label: t("amo.when.weekEnd"),
      at: () => {
        const d = new Date();
        d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
        return d;
      },
    },
    { label: t("amo.when.week"), at: inDays(7) },
    { label: t("amo.when.month"), at: inDays(30) },
    { label: t("amo.when.year"), at: inDays(365) },
  ];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 min-w-[84px] rounded-lg border border-[var(--amo-quiet-line)] bg-background px-2 text-left text-foreground hover:border-primary/50"
        >
          {dayWord(value, t)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="amo-skin flex w-auto p-0">
        <div className="w-44 border-r border-border p-1">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const d = p.at();
                onChange(d, p.withTime ? roundTime(d) : undefined);
                setOpen(false);
              }}
              className="block w-full rounded px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            if (d) {
              onChange(d);
              setOpen(false);
            }
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

export function roundTime(d: Date) {
  const m = Math.ceil(d.getMinutes() / 5) * 5;
  const r = new Date(d);
  r.setMinutes(m, 0, 0);
  return hhmm(r);
}

function addMin(time: string, mins: number) {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return hhmm(new Date(2000, 0, 1, h, m + mins));
}

export function TimePick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const slots = useMemo(() => {
    const out = new Set<string>([value]);
    for (let h = 0; h < 24; h++) for (const m of [0, 30]) out.add(`${pad(h)}:${pad(m)}`);
    return [...out].sort();
  }, [value]);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      listRef.current?.querySelector("[data-active]")?.scrollIntoView({ block: "center" }),
    );
  }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 rounded-lg border border-[var(--amo-quiet-line)] bg-background px-2 tabular-nums text-foreground hover:border-primary/50"
        >
          {value} - {addMin(value, 30)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="amo-skin w-40 p-1">
        <div ref={listRef} className="max-h-60 overflow-y-auto">
          {slots.map((s) => (
            <button
              key={s}
              type="button"
              {...(s === value ? { "data-active": "" } : {})}
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={cn(
                "block w-full rounded px-2.5 py-1.5 text-left text-[13px] tabular-nums hover:bg-accent",
                s === value ? "bg-primary/10 font-semibold text-primary" : "text-foreground",
              )}
            >
              {s} - {addMin(s, 30)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function GroupHead({
  tone,
  children,
  right,
}: {
  tone: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide",
        tone,
      )}
    >
      {children}
      {right}
    </div>
  );
}

function PersonPick({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useI18n();
  const { data: profiles = [] } = useProfilesRaw();
  const [open, setOpen] = useState(false);
  const current = profiles.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="max-w-[220px] truncate text-primary underline underline-offset-2"
        >
          {current?.full_name || current?.email || t("lead.info.unassigned")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="amo-skin w-72 overflow-hidden p-0">
        <GroupHead tone="bg-primary/20 text-foreground">{t("amo.team")}</GroupHead>
        <div className="max-h-64 overflow-y-auto py-1">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.id);
                setOpen(false);
              }}
              className={cn(
                "block w-full truncate px-3 py-2 text-left text-[13px] hover:bg-accent",
                p.id === value ? "font-semibold text-primary" : "text-foreground",
              )}
            >
              {p.full_name || p.email}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Emoji, shortcuts, templates                                         */
/* ------------------------------------------------------------------ */

const EMOJI = (
  "👍 👌 🙏 🤝 👏 🔥 ✅ ❌ ⏰ 📞 💬 📩 💰 💳 🎉 ❤️ " +
  "😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😜 🤗 🤔 🤨 😐 😑 😶 😏 😒 🙄 😬 😌 😔 😴 😷 🤒 🤯 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😢 😭 😱 😤 😡 " +
  "👋 ✋ 🤚 🖐 ✌️ 🤞 🤟 🤘 👈 👉 👆 👇 ☝️ 👊 ✊ 💪 📌 📎 📝 📅 📈 📉 🗂 🎓 🚀 ⭐ 💡"
).split(" ");

function EmojiPick({ onPick }: { onPick: (e: string) => void }) {
  const { t } = useI18n();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("amo.emoji")}
          className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="amo-skin w-[308px] p-2">
        <div className="grid grid-cols-9 gap-0.5">
          {EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => onPick(e)}
              className="grid h-8 w-8 place-items-center rounded text-[18px] hover:bg-accent"
            >
              {e}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Shortcuts({ mode }: { mode: ComposeMode }) {
  const { t } = useI18n();
  const rows: [string, string][] = [
    ...(mode === "chat"
      ? ([
          ["Enter", t("amo.kb.send")],
          ["Shift + Enter", t("amo.kb.newLine")],
          ["/", t("amo.kb.slash")],
        ] as [string, string][])
      : ([["Ctrl + Enter", t("amo.kb.submit")]] as [string, string][])),
    ["Esc", t("amo.kb.cancel")],
  ];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("amo.kb.title")}
          className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="amo-skin w-64 p-3">
        <p className="mb-2 text-[12px] font-semibold text-foreground">{t("amo.kb.title")}</p>
        <div className="space-y-1.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <kbd className="rounded border border-border bg-muted px-1.5 py-px font-mono text-[11px] text-foreground">
                {k}
              </kbd>
              — {v}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Reply templates live in this browser per company (there is no shared
// templates table yet).
function useTemplates(orgId: string | null | undefined) {
  const key = `salesiq.chatTemplates.${orgId ?? "x"}`;
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    try {
      setList(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
    } catch {
      setList([]);
    }
  }, [key]);
  const save = (next: string[]) => {
    setList(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // storage unavailable -- templates just won't persist
    }
  };
  return {
    list,
    add: (text: string) => save([text, ...list.filter((x) => x !== text)].slice(0, 50)),
    remove: (text: string) => save(list.filter((x) => x !== text)),
  };
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */

type ChatTarget =
  | { kind: "telegram" }
  | { kind: "bot"; id: string; name: string }
  | { kind: "team"; id: string | null; name: string };

export function Composer({
  lead,
  mode,
  setMode,
  channel,
  focusKey,
  onOpenTelegramLink,
}: {
  lead: CrmLeadView;
  mode: ComposeMode;
  setMode: (m: ComposeMode) => void;
  channel: "telegram";
  focusKey: number;
  onOpenTelegramLink: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const crmEnabled = useCrmEnabled();
  const canCreateTasks = usePermission("Create tasks");
  const { data: profiles = [] } = useProfilesRaw();
  const { data: bots = [] } = useSalesbots();
  const enabledBots = bots.filter((b) => b.enabled);
  const startBot = useStartSalesbot();
  const createActivity = useCreateLeadActivity();
  const createTask = useCreateTask();
  const sendTg = useSendLeadTelegramMessage();
  const upload = useUploadLeadFile();
  const templates = useTemplates(user?.organizationId);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<ChatTarget>({ kind: channel });
  const [targetOpen, setTargetOpen] = useState(false);
  const [taskDate, setTaskDate] = useState<Date>(() => new Date());
  const [taskTime, setTaskTime] = useState(() => roundTime(new Date(Date.now() + 15 * 60_000)));
  const [taskType, setTaskType] = useState("contact");
  const [assignee, setAssignee] = useState(lead.ownerId || user?.id || "");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Files waiting to go to the client with the next chat message.
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  // The voice message panel (chat with the client) and whether it is
  // recording right now (red frame, as in amoCRM).
  const [voice, setVoice] = useState(false);
  const [voiceLive, setVoiceLive] = useState(false);

  useEffect(() => setTarget({ kind: channel }), [channel]);
  useEffect(() => {
    if (focusKey === 0) return;
    setOpen(true);
    requestAnimationFrame(() => areaRef.current?.focus());
  }, [focusKey]);

  const effectiveMode: ComposeMode = !crmEnabled && mode === "chat" ? "note" : mode;
  const contactName = lead.contactName || lead.name;
  const busy =
    createActivity.isPending ||
    createTask.isPending ||
    sendTg.isPending ||
    startBot.isPending ||
    uploading;
  // In a chat with the client, files go to them; elsewhere they are
  // attached to the lead (Fayllar).
  const chatFiles = effectiveMode === "chat" && target.kind === "telegram";

  function addFiles(list: File[]) {
    const ok: File[] = [];
    for (const raw of list) {
      if (raw.size > CHAT_MAX_FILE) {
        toast.error(t("smsg.fileTooBig", { name: raw.name }));
        continue;
      }
      ok.push(
        raw.name === "image.png" || !raw.name
          ? new File(
              [raw],
              `screenshot-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}.png`,
              { type: raw.type || "image/png" },
            )
          : raw,
      );
    }
    setFiles((prev) => [...prev, ...ok].slice(0, 10));
    focusArea();
  }

  // "/" at the start of a chat message opens the salesbot + template list.
  const slash =
    effectiveMode === "chat" && text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const slashBots =
    slash === null ? [] : enabledBots.filter((b) => b.name.toLowerCase().includes(slash));
  const slashTemplates =
    slash === null ? [] : templates.list.filter((x) => x.toLowerCase().includes(slash));

  function focusArea() {
    setOpen(true);
    requestAnimationFrame(() => areaRef.current?.focus());
  }

  async function sendVoice(file: File) {
    try {
      setUploading(true);
      const payload: BulkFileInput =
        file.size <= CHAT_INLINE_BYTES
          ? await readFile(file).then((a) => ({ name: a.name, type: a.type, base64: a.base64 }))
          : { name: file.name, type: file.type, path: await uploadBulkFile(file) };
      await sendTg.mutateAsync({ leadId: lead.id, text: "", files: [payload] });
    } catch (err) {
      toast.error(describeError(err, t("amo.sendFailed")));
      throw err;
    } finally {
      setUploading(false);
    }
  }

  function reset() {
    setText("");
    setFiles([]);
    setOpen(false);
    if (target.kind === "bot") setTarget({ kind: channel });
    areaRef.current?.blur();
  }

  function insert(s: string) {
    const el = areaRef.current;
    if (!el) return setText((v) => v + s);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + s + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + s.length, start + s.length);
    });
  }

  async function submit() {
    const body = text.trim();
    try {
      if (effectiveMode === "note") {
        if (!body) return;
        await createActivity.mutateAsync({
          lead_id: lead.id,
          type: "note",
          content: body,
          created_by: user?.id ?? null,
        });
        void qc.invalidateQueries({ queryKey: ["lead_activities", lead.id] });
      } else if (effectiveMode === "task") {
        const [h = 9, m = 0] = taskTime.split(":").map(Number);
        const due = new Date(taskDate);
        due.setHours(h, m, 0, 0);
        const label = t(`amo.taskType.${taskType}`);
        await createTask.mutateAsync({
          title: body ? `${label}: ${body}` : label,
          description: body || null,
          lead_id: lead.id,
          due_date: due.toISOString(),
          assignee_id: assignee || null,
          created_by: user?.id ?? null,
          organization_id: user!.organizationId!,
        });
        void qc.invalidateQueries({ queryKey: ["tasks", "lead", lead.id] });
        toast.success(t("amo.task.created"));
      } else if (target.kind === "bot") {
        await startBot.mutateAsync({ botId: target.id, leadId: lead.id });
        toast.success(t("sb.started"));
      } else if (target.kind === "team") {
        if (!body) return;
        await createActivity.mutateAsync({
          lead_id: lead.id,
          type: "note",
          content: `→ ${target.name}: ${body}`,
          created_by: user?.id ?? null,
        });
        void qc.invalidateQueries({ queryKey: ["lead_activities", lead.id] });
      } else {
        if (!body && files.length === 0) return;
        if (target.kind === "telegram") {
          // Small files ride inline; bigger ones go to Storage first.
          const total = files.reduce((n, f) => n + f.size, 0);
          let payload: BulkFileInput[] = [];
          if (files.length > 0) {
            setUploading(true);
            try {
              payload =
                total <= CHAT_INLINE_BYTES
                  ? await Promise.all(
                      files.map(async (f) => {
                        const a = await readFile(f);
                        return { name: a.name, type: a.type, base64: a.base64 };
                      }),
                    )
                  : await Promise.all(
                      files.map(async (f) => ({
                        name: f.name,
                        type: f.type || "application/octet-stream",
                        path: await uploadBulkFile(f),
                      })),
                    );
            } finally {
              setUploading(false);
            }
          }
          await sendTg.mutateAsync({
            leadId: lead.id,
            text: body,
            ...(payload.length ? { files: payload } : {}),
          });
        }
      }
      reset();
    } catch (err) {
      const msg = describeError(err, t("amo.sendFailed"));
      toast.error(msg);
      if (
        target.kind === "telegram" &&
        effectiveMode === "chat" &&
        /link|ulan|bog|привяз/i.test(msg)
      ) {
        onOpenTelegramLink();
      }
    }
  }

  const modes: ComposeMode[] = [
    ...(crmEnabled ? (["chat"] as const) : []),
    "note",
    ...(canCreateTasks ? (["task"] as const) : []),
  ];

  const targetLabel =
    target.kind === "telegram" ? contactName : target.kind === "bot" ? target.name : target.name;

  const submitLabel =
    effectiveMode === "task"
      ? t("amo.setTask")
      : effectiveMode === "note"
        ? t("amo.addNote")
        : target.kind === "bot"
          ? t("amo.runBot")
          : t("amo.send");

  return (
    <div className="relative mx-4 mb-4">
      {/* "/" list: salesbots and saved replies */}
      {open && slash !== null && (
        <div
          className={cn(
            "absolute bottom-full left-0 z-20 mb-1 w-80 overflow-hidden rounded-md",
            CARD,
          )}
        >
          <GroupHead tone="bg-muted text-muted-foreground">Salesbot</GroupHead>
          {slashBots.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-subtle">{t("amo.noBots")}</p>
          )}
          {slashBots.map((b) => (
            <button
              key={b.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTarget({ kind: "bot", id: b.id, name: b.name });
                setText(`/${b.name}`);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-accent"
            >
              <Bot className="h-3.5 w-3.5 text-primary" /> /{b.name}
            </button>
          ))}
          <GroupHead tone="bg-muted text-muted-foreground">{t("amo.templates")}</GroupHead>
          {slashTemplates.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-subtle">{t("amo.noTemplates")}</p>
          )}
          <div className="max-h-48 overflow-y-auto">
            {slashTemplates.map((tpl) => (
              <div key={tpl} className="group flex items-center hover:bg-accent">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setText(tpl)}
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[13px] text-foreground"
                >
                  {tpl}
                </button>
                <button
                  type="button"
                  title={t("amo.deleteTemplate")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => templates.remove(tpl)}
                  className="mr-2 hidden text-subtle hover:text-destructive group-hover:block"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        onClick={() => !open && focusArea()}
        onDragOver={(e) => {
          if (chatFiles) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!chatFiles || e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          addFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "rounded-xl transition-colors",
          QUIET,
          open && "!border-primary/60",
          voiceLive && "!border-red-500/70",
          !open && "cursor-text",
        )}
      >
        <div className="flex flex-wrap items-start gap-x-1.5 gap-y-1 px-4 pt-3 text-[13.5px] leading-7">
          {/* Mode: Chat / Note / Task */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="text-primary underline underline-offset-2"
              >
                {t(`amo.mode.${effectiveMode}`)}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="top" className="amo-skin w-44 p-1">
              {modes.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    focusArea();
                  }}
                  className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-accent"
                >
                  {t(`amo.mode.${m}`)}
                  {m === effectiveMode && <Check className="h-3.5 w-3.5" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          {effectiveMode === "chat" && (
            <>
              <span className="text-muted-foreground">{t("amo.for")}</span>
              <Popover open={targetOpen} onOpenChange={setTargetOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex max-w-[260px] items-center gap-1 text-primary"
                  >
                    {target.kind === "telegram" && <Send className="h-3.5 w-3.5 text-sky-500" />}
                    {target.kind === "bot" && <Bot className="h-3.5 w-3.5" />}
                    <span className="truncate underline underline-offset-2">{targetLabel}</span>
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  side="top"
                  className="amo-skin w-80 overflow-hidden p-0"
                >
                  <GroupHead tone="bg-primary text-primary-foreground">
                    {t("amo.contacts")}
                  </GroupHead>
                  <TargetRow
                    icon={<Send className="h-3.5 w-3.5 text-sky-500" />}
                    label={contactName}
                    sub="Telegram"
                    active={target.kind === "telegram"}
                    onClick={() => {
                      setTarget({ kind: "telegram" });
                      setTargetOpen(false);
                      focusArea();
                    }}
                  />
                  {enabledBots.length > 0 && (
                    <>
                      <GroupHead tone="bg-sky-200 text-sky-900 dark:bg-sky-500/25 dark:text-sky-100">
                        {t("amo.bots")}
                      </GroupHead>
                      <div className="max-h-40 overflow-y-auto">
                        {enabledBots.map((b) => (
                          <TargetRow
                            key={b.id}
                            icon={<Bot className="h-3.5 w-3.5 text-primary" />}
                            label={b.name}
                            active={target.kind === "bot" && target.id === b.id}
                            onClick={() => {
                              setTarget({ kind: "bot", id: b.id, name: b.name });
                              setText(`/${b.name}`);
                              setTargetOpen(false);
                              focusArea();
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}
                  <GroupHead
                    tone="bg-yellow-200 text-yellow-950 dark:bg-yellow-400/25 dark:text-yellow-100"
                    right={
                      <button
                        type="button"
                        onClick={() => {
                          setTarget({ kind: "team", id: null, name: t("amo.wholeTeam") });
                          setTargetOpen(false);
                          focusArea();
                        }}
                        className="rounded border border-current px-1.5 text-[10px] font-semibold"
                      >
                        {t("amo.wholeTeam")}
                      </button>
                    }
                  >
                    {t("amo.team")}
                  </GroupHead>
                  <div className="max-h-48 overflow-y-auto">
                    {profiles
                      .filter((p) => p.id !== user?.id)
                      .map((p) => (
                        <TargetRow
                          key={p.id}
                          label={p.full_name || p.email}
                          active={target.kind === "team" && target.id === p.id}
                          onClick={() => {
                            setTarget({ kind: "team", id: p.id, name: p.full_name || p.email });
                            setTargetOpen(false);
                            focusArea();
                          }}
                        />
                      ))}
                  </div>
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">:</span>
            </>
          )}

          {effectiveMode === "note" && <span className="-ml-1 text-muted-foreground">:</span>}

          {effectiveMode === "task" && (
            <>
              <span className="text-muted-foreground">{t("amo.on")}</span>
              <DatePick
                value={taskDate}
                onChange={(d, time) => {
                  setTaskDate(d);
                  if (time) setTaskTime(time);
                }}
              />
              <TimePick value={taskTime} onChange={setTaskTime} />
              <span className="text-muted-foreground">{t("amo.for")}</span>
              <PersonPick value={assignee} onChange={setAssignee} />
              <span className="text-muted-foreground">:</span>
              <TypePicker value={taskType} onChange={setTaskType} />
            </>
          )}

          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (target.kind === "bot" && !e.target.value.startsWith("/"))
                setTarget({ kind: channel });
            }}
            onFocus={() => setOpen(true)}
            onPaste={(e) => {
              // A screenshot or a copied file (Cmd+V) goes to the client.
              const pasted = Array.from(e.clipboardData.files);
              if (!chatFiles || pasted.length === 0) return;
              e.preventDefault();
              addFiles(pasted);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") return reset();
              const send =
                e.key === "Enter" &&
                ((effectiveMode === "chat" && !e.shiftKey) || e.metaKey || e.ctrlKey);
              if (send) {
                e.preventDefault();
                if (slash === null || target.kind === "bot") void submit();
              }
            }}
            rows={1}
            placeholder={t("amo.typeHere")}
            className={cn(
              "min-w-[200px] flex-1 resize-none bg-transparent leading-7 text-foreground outline-none placeholder:text-subtle",
              open ? "min-h-[84px]" : "min-h-[48px]",
              voice && "hidden",
            )}
          />
          {effectiveMode === "chat" && (
            <span className="ml-auto text-[12px] text-success">{t("amo.newConversation")}</span>
          )}
        </div>

        {chatFiles && !voice && files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pb-1 pt-2">
            {files.map((f, i) => (
              <PendingFile
                key={`${f.name}-${i}`}
                file={f}
                onRemove={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}
        {voice ? (
          <VoiceRecorder
            onSend={sendVoice}
            onClose={() => {
              setVoice(false);
              setVoiceLive(false);
            }}
            onRecordingChange={setVoiceLive}
          />
        ) : open ? (
          <div className="flex items-center gap-3 px-4 pb-3 pt-1">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={
                busy ||
                (effectiveMode !== "task" &&
                  target.kind !== "bot" &&
                  ((!text.trim() && !(chatFiles && files.length > 0)) || slash !== null))
              }
              className="inline-flex h-9 min-w-[104px] items-center justify-center gap-1.5 rounded-lg bg-primary shadow-sm px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {submitLabel}
            </button>
            {chatFiles && (
              <button
                type="button"
                title={t("chat.voice.record")}
                aria-label={t("chat.voice.record")}
                disabled={busy}
                onClick={() => setVoice(true)}
                className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background/40 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t("amo.cancel")}
            </button>
            <div className="ml-auto flex items-center gap-0.5">
              {effectiveMode === "chat" && text.trim() && !text.startsWith("/") && (
                <button
                  type="button"
                  title={t("amo.saveTemplate")}
                  onClick={() => {
                    templates.add(text.trim());
                    toast.success(t("amo.templateSaved"));
                  }}
                  className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Save className="h-4 w-4" />
                </button>
              )}
              <Shortcuts mode={effectiveMode} />
              {effectiveMode !== "task" && <EmojiPick onPick={insert} />}
              {effectiveMode !== "task" && (
                <button
                  type="button"
                  title={chatFiles ? t("chat.attachToClient") : t("lead.files.uploadButton")}
                  onClick={() => fileRef.current?.click()}
                  className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {upload.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                multiple={chatFiles}
                className="hidden"
                onChange={(e) => {
                  const list = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (list.length === 0) return;
                  if (chatFiles) return addFiles(list);
                  upload.mutate(
                    { leadId: lead.id, file: list[0]! },
                    {
                      onSuccess: () => toast.success(t("amo.fileAttached")),
                      onError: (err) =>
                        toast.error(describeError(err, t("lead.files.uploadFailed"))),
                    },
                  );
                }}
              />
            </div>
          </div>
        ) : (
          <div className="h-3" />
        )}
      </div>
    </div>
  );
}

/** A file waiting in the composer: a thumbnail for pictures, else its name. */
function PendingFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file.type.startsWith("image/")) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const size =
    file.size >= 1024 * 1024
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return (
    <span className="relative flex max-w-[220px] items-center gap-2 rounded-lg border border-[var(--amo-quiet-line)] bg-card p-1.5 pr-7">
      {url ? (
        <img src={url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-[16px]">
          {file.type.startsWith("audio/") ? "🎵" : file.type.startsWith("video/") ? "🎬" : "📎"}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold text-foreground">
          {file.name}
        </span>
        <span className="block text-[11px] text-muted-foreground">{size}</span>
      </span>
      <button
        type="button"
        aria-label={t("smsg.removeFile")}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function TargetRow({
  icon,
  label,
  sub,
  active,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-accent",
        active ? "font-semibold text-primary" : "text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {sub && <span className="shrink-0 text-[11px] text-subtle">{sub}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Open task row                                                       */
/* ------------------------------------------------------------------ */

// An open task pinned above the composer. Click its text to complete it
// (with a result, and optionally the next task), click its date line to
// edit when / who / what.
// Where a task stands: overdue (red), due today (green, amoCRM's colour
// for "on today's list") or later.
function taskTone(due: Date | null): "overdue" | "today" | "later" {
  if (!due) return "later";
  if (due.getTime() < Date.now()) return "overdue";
  return new Date().toDateString() === due.toDateString() ? "today" : "later";
}

const TONE_TEXT = {
  overdue: "text-destructive",
  today: "text-success",
  later: "text-muted-foreground",
} as const;

// Open tasks sit pinned right above the composer, like amoCRM's: one task
// shows in full; several fold into one-line rows, and the row you click
// opens in place to complete or edit it.
export function OpenTasksDock({
  tasks,
  leadId,
  participants,
}: {
  tasks: TaskView[];
  leadId: string;
  participants: number;
}) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  if (tasks.length === 0) return null;
  return (
    <div className="mx-4 mb-2 shrink-0">
      <p className="mb-1.5 text-right text-[12px] text-[var(--amo-label)]">
        {t("amo.participants", { count: participants })}
      </p>
      <div className="max-h-[40vh] overflow-y-auto">
        {tasks.length === 1 ? (
          <OpenTaskItem task={tasks[0]!} leadId={leadId} />
        ) : (
          <div className={cn("overflow-hidden rounded-xl py-1", QUIET)}>
            {tasks.map((tk) =>
              openId === tk.id ? (
                <OpenTaskItem
                  key={tk.id}
                  task={tk}
                  leadId={leadId}
                  onCollapse={() => setOpenId(null)}
                />
              ) : (
                <OpenTaskLine key={tk.id} task={tk} onOpen={() => setOpenId(tk.id)} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OpenTaskLine({ task, onOpen }: { task: TaskView; onOpen: () => void }) {
  const { t } = useI18n();
  const parsed = splitTitle(task.title, t);
  const due = task.dueRaw ? new Date(task.dueRaw) : null;
  const tone = taskTone(due);
  return (
    <button
      type="button"
      onClick={onOpen}
      title={t("amo.task.complete")}
      className={cn(
        "flex w-full min-w-0 items-center gap-2.5 px-4 py-[7px] text-left text-[13px] transition-colors hover:bg-accent/70",
        TONE_TEXT[tone],
      )}
    >
      <span className="flex shrink-0 items-center opacity-80">
        <span className="h-px w-3 bg-current" />
        <Clock className="h-4 w-4" />
        <span className="h-px w-3 bg-current" />
      </span>
      <span className="shrink-0">
        {due ? `${dayWord(due, t)} ${hhmm(due)}-${addMin(hhmm(due), 30)}` : t("amo.task.noDate")}{" "}
        {t("amo.task.for")} {task.assignee || "—"}
      </span>
      <span className="flex min-w-0 items-center gap-1">
        <TypeIcon type={parsed.type} />
        <span className="shrink-0 font-semibold">{t(`amo.taskType.${parsed.type}`)}</span>
        {parsed.text && <span className="truncate opacity-90">— {parsed.text}</span>}
      </span>
    </button>
  );
}

export function OpenTaskItem({
  task,
  leadId,
  onCollapse,
}: {
  task: TaskView;
  leadId: string;
  // Set when the task is one row of the dock's list: it then draws no box
  // of its own and can fold back into its one-line row.
  onCollapse?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const deleteTask = useDeleteLeadTask();
  const createActivity = useCreateLeadActivity();
  const parsed = splitTitle(task.title, t);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const due = task.dueRaw ? new Date(task.dueRaw) : null;
  const [mode, setMode] = useState<"view" | "complete" | "edit">("view");
  const [result, setResult] = useState("");
  const [followUp, setFollowUp] = useState(false);
  const [nextType, setNextType] = useState(parsed.type);
  // The follow-up's date and time: tomorrow at this task's hour by default.
  const [nextDate, setNextDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [nextTime, setNextTime] = useState(() => (due ? hhmm(due) : "10:00"));
  const [editDate, setEditDate] = useState<Date>(() => due ?? new Date());
  const [editTime, setEditTime] = useState(() => (due ? hhmm(due) : "10:00"));
  const [editAssignee, setEditAssignee] = useState(task.assigneeId);
  const [editType, setEditType] = useState(parsed.type);
  const [editText, setEditText] = useState(parsed.text || task.description);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["tasks", "lead", leadId] });
    void qc.invalidateQueries({ queryKey: ["lead_activities", leadId] });
  }

  async function complete() {
    try {
      await updateTask.mutateAsync({ id: task.id, patch: { status: "Done", progress: 100 } });
      const label = t(`amo.taskType.${parsed.type}`);
      await createActivity.mutateAsync({
        lead_id: leadId,
        type: "note",
        content: `✓ ${t("amo.task.doneNote")}: ${label}${parsed.text ? ` — ${parsed.text}` : ""}${
          result.trim() ? `\n${t("amo.task.result")}: ${result.trim()}` : ""
        }`,
        created_by: user?.id ?? null,
      });
      if (followUp) {
        const next = new Date(nextDate);
        const [h = 10, m = 0] = nextTime.split(":").map(Number);
        next.setHours(h, m, 0, 0);
        await createTask.mutateAsync({
          title: t(`amo.taskType.${nextType}`),
          lead_id: leadId,
          due_date: next.toISOString(),
          assignee_id: task.assigneeId || user?.id || null,
          created_by: user?.id ?? null,
          organization_id: user!.organizationId!,
        });
      }
      toast.success(t("amo.task.done"));
      refresh();
    } catch (err) {
      toast.error(describeError(err, t("amo.saveFailed")));
    }
  }

  // Deleting leaves a line in the lead's feed, so the history still shows
  // the task existed.
  async function removeTask() {
    try {
      await deleteTask.mutateAsync(task.id);
      const label = t(`amo.taskType.${parsed.type}`);
      await createActivity.mutateAsync({
        lead_id: leadId,
        type: "note",
        content: `✕ ${t("amo.task.deletedNote")}: ${label}${parsed.text ? ` — ${parsed.text}` : ""}`,
        created_by: user?.id ?? null,
      });
      toast.success(t("amo.task.deleted"));
      refresh();
    } catch (err) {
      setConfirmDelete(false);
      toast.error(
        err instanceof Error && err.message === "not_allowed"
          ? t("amo.task.deleteNotAllowed")
          : describeError(err, t("amo.saveFailed")),
      );
    }
  }

  async function saveEdit() {
    const [h = 9, m = 0] = editTime.split(":").map(Number);
    const d = new Date(editDate);
    d.setHours(h, m, 0, 0);
    const label = t(`amo.taskType.${editType}`);
    try {
      await updateTask.mutateAsync({
        id: task.id,
        patch: {
          due_date: d.toISOString(),
          assignee_id: editAssignee || null,
          title: editText.trim() ? `${label}: ${editText.trim()}` : label,
          description: editText.trim() || null,
        },
      });
      setMode("view");
      refresh();
    } catch (err) {
      toast.error(describeError(err, t("amo.saveFailed")));
    }
  }

  const busy = updateTask.isPending || createTask.isPending || createActivity.isPending;
  const timeRange = due ? `${hhmm(due)}-${addMin(hhmm(due), 30)}` : "";

  const tone = taskTone(due);

  return (
    <div
      className={cn(
        "relative flex gap-3 px-4 py-3",
        onCollapse
          ? "border-y border-[var(--amo-quiet-line)] bg-[var(--amo-box)] first:border-t-0 last:border-b-0"
          : cn(
              "rounded-xl",
              QUIET,
              tone === "overdue" && "!border-destructive/60",
              tone === "today" && "!border-success/55",
            ),
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border",
          tone === "overdue"
            ? "border-destructive/50 text-destructive"
            : tone === "today"
              ? "border-success/50 text-success"
              : "border-[var(--amo-quiet-line)] text-muted-foreground",
        )}
      >
        <Clock className="h-4 w-4" />
      </span>
      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          aria-label={t("amo.task.collapse")}
          title={t("amo.task.collapse")}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-subtle transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      )}

      {mode === "edit" ? (
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-[13.5px] leading-7">
            <DatePick
              value={editDate}
              onChange={(d, time) => {
                setEditDate(d);
                if (time) setEditTime(time);
              }}
            />
            <TimePick value={editTime} onChange={setEditTime} />
            <span className="text-muted-foreground">{t("amo.for")}</span>
            <PersonPick value={editAssignee} onChange={setEditAssignee} />
            <span className="text-muted-foreground">:</span>
            <TypePicker value={editType} onChange={setEditType} />
            <input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveEdit();
                if (e.key === "Escape") setMode("view");
              }}
              className="h-7 min-w-[180px] flex-1 bg-transparent text-foreground outline-none"
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveEdit()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary shadow-sm px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("amo.change")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("view");
                setConfirmDelete(false);
              }}
              className="h-9 rounded-lg px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {t("amo.cancel")}
            </button>
            <span className="flex-1" />
            {confirmDelete ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[12.5px] text-muted-foreground">
                  {t("amo.task.confirmDelete")}
                </span>
                <button
                  type="button"
                  disabled={deleteTask.isPending}
                  onClick={() => void removeTask()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-destructive px-3 text-[12.5px] font-semibold text-destructive-foreground shadow-sm transition-[filter] hover:brightness-110 disabled:opacity-60"
                >
                  {deleteTask.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("amo.task.deleteYes")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="h-8 rounded-lg px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("amo.no")}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("amo.task.delete")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className={cn("min-w-0 flex-1", onCollapse && "pr-8")}>
          <button
            type="button"
            onClick={() => setMode("edit")}
            title={t("amo.task.edit")}
            className="text-left text-[12px] text-muted-foreground hover:text-foreground"
          >
            <span className={cn("font-medium", TONE_TEXT[tone])}>
              {due ? `${dayWord(due, t)} ${timeRange}` : t("amo.task.noDate")}
            </span>{" "}
            {t("amo.task.for")} {task.assignee || "—"}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "complete" ? "view" : "complete")}
            title={t("amo.task.complete")}
            className="mt-0.5 block text-left text-[14px] text-foreground"
          >
            <TypeIcon type={parsed.type} className="mr-1 -mt-0.5" />
            <span className="font-semibold">{t(`amo.taskType.${parsed.type}`)}</span>
            {parsed.text && <> — {parsed.text}</>}
          </button>

          {mode === "complete" && (
            <div className="mt-2.5 space-y-2.5">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void complete();
                    if (e.key === "Escape") setMode("view");
                  }}
                  placeholder={t("amo.task.resultPlaceholder")}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--amo-quiet-line)] bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/50"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void complete()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary shadow-sm px-4 text-[13px] font-semibold text-primary-foreground transition-[filter] hover:brightness-110 disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {t("amo.task.do")}
                </button>
              </div>
              {/* Next task right away: tick, pick its type and when -- a
                  quick "tomorrow / in a week / in a month", or any date and
                  time from the picker. */}
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={followUp}
                  onChange={(e) => setFollowUp(e.target.checked)}
                  title={t("amo.task.followUp")}
                  className="h-4 w-4 accent-[var(--color-primary)]"
                />
                <span
                  onClickCapture={() => setFollowUp(true)}
                  className={cn("contents", !followUp && "[&>*]:opacity-80")}
                >
                  <TypePicker value={nextType} onChange={setNextType} />
                </span>
                {followUp ? (
                  <>
                    <DatePick
                      value={nextDate}
                      onChange={(d, time) => {
                        setNextDate(d);
                        if (time) setNextTime(time);
                      }}
                    />
                    <TimePick value={nextTime} onChange={setNextTime} />
                  </>
                ) : (
                  (
                    [
                      [1, t("amo.when.tomorrow")],
                      [7, t("amo.when.week")],
                      [30, t("amo.when.month")],
                    ] as const
                  ).map(([days, label]) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + days);
                        setNextDate(d);
                        setFollowUp(true);
                      }}
                      className="h-7 rounded-lg border border-transparent px-2 text-muted-foreground transition-colors hover:border-[var(--amo-quiet-line)] hover:text-foreground"
                    >
                      {label}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
