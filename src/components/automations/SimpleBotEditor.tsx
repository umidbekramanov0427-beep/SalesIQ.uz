import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ListChecks,
  MessageCircle,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { SectionCard } from "@/components/layout/Primitives";
import { Switch } from "@/components/ui/switch";
import { inputCls } from "@/components/automations/ActionEditor";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { SimpleBot, SimpleQuestion, SimpleSaveTo } from "@/lib/salesbots/simple-bot";

// "Simple setup" of a salesbot: the conversation as a form, top to bottom
// in the order the client sees it (see lib/salesbots/simple-bot.ts).

const SAVE_TO: SimpleSaveTo[] = ["name", "phone", "email", "note", "none"];
const areaCls = cn(inputCls, "h-auto min-h-[64px] resize-y py-2 leading-relaxed");

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

  return (
    <div className="space-y-3">
      <SectionCard
        title={t("sb.simple.greeting")}
        description={t("sb.simple.greetingDesc")}
        icon={MessageCircle}
        tone="sky"
      >
        <textarea
          value={value.greeting}
          onChange={(e) => set({ greeting: e.target.value })}
          placeholder={t("sb.tpl.greeting")}
          className={areaCls}
        />
      </SectionCard>

      <SectionCard
        title={t("sb.simple.questions")}
        description={t("sb.simple.questionsDesc")}
        icon={ListChecks}
        tone="violet"
      >
        <ol className="space-y-2.5">
          {value.questions.map((q, i) => (
            <li key={i} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start gap-2.5">
                <span className="mt-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-500/12 text-xs font-bold text-violet-600 tabular-nums dark:text-violet-400">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <textarea
                    value={q.text}
                    onChange={(e) => setQuestion(i, { text: e.target.value })}
                    placeholder={t("sb.simple.questionPh")}
                    className={cn(areaCls, "min-h-[44px]")}
                    rows={1}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      {t("sb.simple.saveTo")}
                      <select
                        value={q.saveTo}
                        onChange={(e) => setQuestion(i, { saveTo: e.target.value as SimpleSaveTo })}
                        className={cn(inputCls, "h-8 w-auto text-xs")}
                      >
                        {SAVE_TO.map((s) => (
                          <option key={s} value={s}>
                            {t(`sb.simple.save.${s}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {t("sb.simple.withOptions")}
                      <Switch
                        checked={q.options.length > 0}
                        onCheckedChange={(on) => setQuestion(i, { options: on ? ["", ""] : [] })}
                      />
                    </label>
                  </div>
                  {q.options.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {q.options.map((o, k) => (
                        <span
                          key={k}
                          className="inline-flex h-8 items-center rounded-lg border border-border bg-background pl-2"
                        >
                          <span className="text-[11px] font-semibold text-subtle tabular-nums">
                            {k + 1}.
                          </span>
                          <input
                            value={o}
                            onChange={(e) =>
                              setQuestion(i, {
                                options: q.options.map((x, m) => (m === k ? e.target.value : x)),
                              })
                            }
                            placeholder={t("sb.simple.optionPh")}
                            className="h-full w-28 bg-transparent px-1.5 text-sm outline-none"
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
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <IconBtn label={t("sb.simple.up")} disabled={i === 0} onClick={() => move(i, -1)}>
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
                    onClick={() => set({ questions: value.questions.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconBtn>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() =>
            set({ questions: [...value.questions, { text: "", saveTo: "note", options: [] }] })
          }
          className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-sm font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-4 w-4" /> {t("sb.simple.addQuestion")}
        </button>
      </SectionCard>

      <SectionCard
        title={t("sb.simple.finish")}
        description={t("sb.simple.finishDesc")}
        icon={CheckCircle2}
        tone="emerald"
      >
        <textarea
          value={value.finish}
          onChange={(e) => set({ finish: e.target.value })}
          placeholder={t("sb.tpl.finish")}
          className={areaCls}
        />
      </SectionCard>

      <SectionCard
        title={t("sb.simple.after")}
        description={t("sb.simple.afterDesc")}
        icon={Zap}
        tone="amber"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
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
          <label className="space-y-1.5">
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
          <div className="space-y-1.5 sm:col-span-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Switch
                checked={value.task !== null}
                onCheckedChange={(on) => set({ task: on ? t("sb.tpl.task") : null })}
              />
              {t("sb.simple.task")}
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
      </SectionCard>
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
