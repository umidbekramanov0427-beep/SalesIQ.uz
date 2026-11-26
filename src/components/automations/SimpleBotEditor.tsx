import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CornerDownRight,
  MessageCircle,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { inputCls } from "@/components/automations/ActionEditor";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { SimpleBot, SimpleQuestion, SimpleSaveTo } from "@/lib/salesbots/simple-bot";

// "Simple setup" of a salesbot: the conversation as a form, top to bottom
// in the order the client sees it (see lib/salesbots/simple-bot.ts).

const SAVE_TO: SimpleSaveTo[] = ["name", "phone", "email", "note", "none"];

export function SimpleBotEditor({
  value,
  onChange,
  stages,
}: {
  value: SimpleBot;
  onChange: (next: SimpleBot) => void;
  stages: { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const set = (patch: Partial<SimpleBot>) => onChange({ ...value, ...patch });
  const setQuestion = (i: number, patch: Partial<SimpleQuestion>) =>
    set({ questions: value.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const move = (i: number, by: -1 | 1) => {
    const qs = [...value.questions];
    const [q] = qs.splice(i, 1);
    qs.splice(i + by, 0, q!);
    set({ questions: qs });
  };
  const insertAt = (i: number) => {
    const qs = [...value.questions];
    qs.splice(i, 0, { text: "", saveTo: "note", options: [] });
    set({ questions: qs });
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* The conversation, top to bottom as the client sees it. */}
      <section className="rounded-2xl border border-border bg-card px-5 py-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h3 className="text-[15px] font-bold text-foreground">{t("sb.simple.lane")}</h3>
          <p className="text-xs text-muted-foreground">{t("sb.simple.laneHint")}</p>
        </div>
        <div className="relative space-y-1 before:absolute before:top-4 before:bottom-4 before:left-[15px] before:w-px before:bg-border">
          <Node mark={<MessageCircle className="h-4 w-4" />} tone="bot">
            <Bubble label={t("sb.simple.greeting")}>
              <textarea
                value={value.greeting}
                onChange={(e) => set({ greeting: e.target.value })}
                placeholder={t("sb.tpl.greeting")}
                className={bubbleArea}
              />
            </Bubble>
          </Node>
          <AddBetween onClick={() => insertAt(0)} label={t("sb.simple.addQuestion")} />

          {value.questions.map((q, i) => (
            <div key={i}>
              <Node
                mark={<span className="text-[12px] font-bold tabular-nums">{i + 1}</span>}
                tone="q"
              >
                <Bubble
                  label={t("sb.simple.questionN", { n: i + 1 })}
                  tools={
                    <>
                      <IconBtn
                        label={t("sb.simple.up")}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        label={t("sb.simple.down")}
                        disabled={i === value.questions.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </IconBtn>
                      <IconBtn
                        label={t("common.delete")}
                        danger
                        onClick={() =>
                          set({ questions: value.questions.filter((_, j) => j !== i) })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconBtn>
                    </>
                  }
                >
                  <textarea
                    value={q.text}
                    onChange={(e) => setQuestion(i, { text: e.target.value })}
                    placeholder={t("sb.simple.questionPh")}
                    className={bubbleArea}
                  />
                  {q.options.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {q.options.map((o, k) => (
                        <span
                          key={k}
                          className="inline-flex h-8 items-center rounded-lg border border-primary/40 bg-card pl-2"
                        >
                          <input
                            value={o}
                            onChange={(e) =>
                              setQuestion(i, {
                                options: q.options.map((x, m) => (m === k ? e.target.value : x)),
                              })
                            }
                            placeholder={t("sb.simple.optionPh")}
                            className="h-full w-28 bg-transparent px-1 text-[13px] font-medium text-primary outline-none placeholder:text-subtle"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setQuestion(i, { options: q.options.filter((_, m) => m !== k) })
                            }
                            className="grid h-full w-7 place-items-center text-subtle hover:text-destructive"
                            aria-label={t("common.delete")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => setQuestion(i, { options: [...q.options, ""] })}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-border px-2.5 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      >
                        <Plus className="h-3.5 w-3.5" /> {t("sb.simple.addOption")}
                      </button>
                    </div>
                  )}
                </Bubble>
                {/* What the client answers and where it goes. */}
                <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={q.options.length > 0}
                      onCheckedChange={(on) => setQuestion(i, { options: on ? ["", ""] : [] })}
                    />
                    {t("sb.simple.withOptions")}
                  </label>
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background pr-1 pl-3 text-xs text-muted-foreground">
                    <CornerDownRight className="h-3.5 w-3.5" />
                    {t("sb.simple.answerTo")}
                    <select
                      value={q.saveTo}
                      onChange={(e) => setQuestion(i, { saveTo: e.target.value as SimpleSaveTo })}
                      className="h-6 rounded-full border-0 bg-surface px-2 text-xs font-semibold text-foreground outline-none"
                    >
                      {SAVE_TO.map((v) => (
                        <option key={v} value={v}>
                          {t(`sb.simple.save.${v}`)}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
              </Node>
              <AddBetween onClick={() => insertAt(i + 1)} label={t("sb.simple.addQuestion")} />
            </div>
          ))}

          <Node mark={<CheckCircle2 className="h-4 w-4" />} tone="done">
            <Bubble label={t("sb.simple.finish")}>
              <textarea
                value={value.finish}
                onChange={(e) => set({ finish: e.target.value })}
                placeholder={t("sb.tpl.finish")}
                className={bubbleArea}
              />
            </Bubble>
          </Node>
        </div>
      </section>

      <aside className="space-y-4 xl:sticky xl:top-4">
        <PhoneFrame>
          <ChatPreview value={value} />
        </PhoneFrame>

        <section className="rounded-2xl border border-border bg-card px-5 py-4">
          <h3 className="inline-flex items-center gap-2 text-[15px] font-bold text-foreground">
            <Zap className="h-4 w-4 text-amber-500" /> {t("sb.simple.after")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("sb.simple.afterDesc")}</p>
          <div className="mt-3 space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("sb.simple.stage")}
              </span>
              <select
                value={value.stageId}
                onChange={(e) => set({ stageId: e.target.value })}
                className={inputCls}
              >
                <option value="">{t("sb.simple.stageKeep")}</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("sb.simple.tag")}
              </span>
              <input
                value={value.tag}
                onChange={(e) => set({ tag: e.target.value })}
                placeholder={t("sb.simple.tagPh")}
                className={inputCls}
              />
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                {t("sb.simple.task")}
                <Switch
                  checked={value.task !== null}
                  onCheckedChange={(on) => set({ task: on ? t("sb.tpl.task") : null })}
                />
              </label>
              {value.task !== null && (
                <input
                  value={value.task}
                  onChange={(e) => set({ task: e.target.value })}
                  className={inputCls}
                />
              )}
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}

const bubbleArea =
  "block w-full resize-none bg-transparent text-[14px] leading-relaxed text-foreground outline-none placeholder:text-subtle [field-sizing:content] min-h-[44px]";

function Node({
  mark,
  tone,
  children,
}: {
  mark: React.ReactNode;
  tone: "bot" | "q" | "done";
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex gap-3">
      <span
        className={cn(
          "relative z-[1] mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-card",
          tone === "bot" && "bg-sky-500 text-white",
          tone === "q" && "bg-primary text-primary-foreground",
          tone === "done" && "bg-emerald-500 text-white",
        )}
      >
        {mark}
      </span>
      <div className="min-w-0 flex-1 pb-1">{children}</div>
    </div>
  );
}

function Bubble({
  label,
  tools,
  children,
}: {
  label: string;
  tools?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="group max-w-[620px] rounded-2xl rounded-tl-md border border-border bg-surface px-4 pt-2 pb-3 focus-within:border-primary/60">
      <div className="flex h-7 items-center justify-between gap-2">
        <span className="text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {tools && <span className="flex items-center gap-0.5">{tools}</span>}
      </div>
      {children}
    </div>
  );
}

function AddBetween({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div className="relative flex h-7 items-center pl-[44px]">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[12px] font-semibold text-subtle opacity-60 transition hover:bg-primary/10 hover:text-primary hover:opacity-100 focus-visible:opacity-100"
      >
        <Plus className="h-3.5 w-3.5" /> {label}
      </button>
    </div>
  );
}

/** The live preview inside a phone outline. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-[30px] border border-border bg-card p-2 shadow-soft">
      <div className="mx-auto mb-1.5 h-1.5 w-16 rounded-full bg-border" />
      <div className="overflow-hidden rounded-[22px]">{children}</div>
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid h-7 w-7 place-items-center rounded-md text-subtle disabled:opacity-30",
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

/** How the conversation looks in Telegram, updated as the form is edited. */
export function ChatPreview({ value }: { value: SimpleBot }) {
  const { t } = useI18n();
  const bubbles: { from: "bot" | "client"; text: string }[] = [];
  if (value.greeting) bubbles.push({ from: "bot", text: value.greeting });
  for (const q of value.questions) {
    const options = q.options.map((o, k) => `${k + 1}. ${o || "…"}`).join("\n");
    bubbles.push({ from: "bot", text: [q.text || "…", options].filter(Boolean).join("\n\n") });
    bubbles.push({ from: "client", text: q.options[0] || t(`sb.preview.answer.${q.saveTo}`) });
  }
  if (value.finish) bubbles.push({ from: "bot", text: value.finish });

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-sky-500 text-xs font-bold text-white">
          IQ
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{t("sb.preview.title")}</p>
          <p className="text-[11px] text-subtle">{t("sb.preview.subtitle")}</p>
        </div>
      </div>
      <div className="max-h-[460px] space-y-2 overflow-y-auto bg-sky-500/[0.06] p-3">
        {bubbles.length === 0 ? (
          <p className="py-8 text-center text-xs text-subtle">{t("sb.preview.empty")}</p>
        ) : (
          bubbles.map((b, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap shadow-sm [overflow-wrap:anywhere]",
                b.from === "bot"
                  ? "rounded-bl-md bg-card text-foreground"
                  : "ml-auto rounded-br-md bg-sky-500 text-white",
              )}
            >
              {b.text.replace(/\{\{\s*name\s*\}\}/g, t("sb.preview.sampleName"))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
