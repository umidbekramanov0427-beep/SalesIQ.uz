// The setup cards the AI assistant shows in the chat (lib/ai/setup-cards.ts):
// the admin checks what the assistant filled in, types any secret here (a
// bot token never goes to the model) and presses the button. Each card runs
// through the same endpoints and hooks as the settings page it stands for,
// then reports one line back so the assistant can lead on to the next step.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  Building2,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  Send,
  UserPlus,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { copyText } from "@/lib/clipboard";
import { cn, describeError } from "@/lib/utils";
import { buildSimpleSteps } from "@/lib/salesbots/simple-bot";
import { DEFAULT_FUNNEL_STAGES, createStageRows, defaultStageRows } from "@/lib/funnel-defaults";
import type { SetupCardSpec, SetupQuestion } from "@/lib/ai/setup-cards";
import { useSaveSalesbot } from "@/hooks/use-automations";
import {
  useCreatePipeline,
  useCreateStage,
  usePipelines,
  useUpdateBusinessProfile,
} from "@/hooks/use-crm-data";

/** What a finished card shows, and the line the assistant is told. */
export type SetupCardResult = { summary: string; done: ReactNode };

const field =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-[13px] text-foreground outline-none focus:border-primary";
const area = cn(field, "h-auto min-h-[56px] resize-y py-1.5 leading-snug");

const META: Record<SetupCardSpec["kind"], { icon: LucideIcon; tone: string }> = {
  client_bot: { icon: Send, tone: "bg-sky-500/12 text-sky-600 dark:text-sky-400" },
  my_telegram: { icon: KeyRound, tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  salesbot: { icon: Bot, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  employee: { icon: UserPlus, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  funnel: { icon: Workflow, tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  business_profile: { icon: Building2, tone: "bg-primary/10 text-primary" },
};

export function SetupCard({
  card,
  token,
  finished,
  onFinished,
}: {
  card: SetupCardSpec;
  /** A bot token the admin typed into the chat, moved into the card's own field. */
  token?: string | undefined;
  /** Set once the card ran; the card then shows its result only. */
  finished?: string | undefined;
  onFinished: (summary: string) => void;
}) {
  const { t } = useI18n();
  const { icon: Icon, tone } = META[card.kind];
  const [done, setDone] = useState<ReactNode>(null);
  const finish = (r: SetupCardResult) => {
    setDone(r.done);
    onFinished(r.summary);
  };
  const body = (() => {
    switch (card.kind) {
      case "client_bot":
        return <ClientBotForm initialToken={token} onDone={finish} />;
      case "my_telegram":
        return <MyTelegramForm onDone={finish} />;
      case "salesbot":
        return <SalesbotForm card={card} onDone={finish} />;
      case "employee":
        return <EmployeeForm card={card} onDone={finish} />;
      case "funnel":
        return <FunnelForm card={card} onDone={finish} />;
      case "business_profile":
        return <BusinessForm card={card} onDone={finish} />;
    }
  })();
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card text-left">
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", tone)}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-foreground">{t(`aic.${card.kind}.title`)}</p>
          <p className="text-[11.5px] leading-snug text-muted-foreground">
            {t(`aic.${card.kind}.desc`)}
          </p>
        </div>
      </div>
      <div className="space-y-2.5 px-3 py-3">
        {done ?? (finished ? <Done text={finished} /> : body)}
      </div>
    </div>
  );
}

function Done({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="flex items-start gap-1.5 text-[13px] font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {text}
      </p>
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11.5px] font-semibold text-muted-foreground">{children}</span>
  );
}

function Run({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      className="ctl-lit inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <p className="text-[12px] text-destructive">{error}</p> : null;
}

function OpenButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ctl-soft inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold"
    >
      <ExternalLink className="h-3.5 w-3.5" /> {children}
    </a>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void copyText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => undefined,
        )
      }
      className="ctl-soft inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold"
    >
      <Copy className="h-3.5 w-3.5" /> {copied ? t("sb.copied") : label}
    </button>
  );
}

async function post(path: string, body: unknown) {
  const res = await apiFetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok)
    throw new Error(typeof j["error"] === "string" ? (j["error"] as string) : `HTTP ${res.status}`);
  return j;
}

/* ------------------------- the company's client bot ------------------------- */

function ClientBotForm({
  initialToken,
  onDone,
}: {
  initialToken?: string | undefined;
  onDone: (r: SetupCardResult) => void;
}) {
  const { t } = useI18n();
  const [token, setToken] = useState(initialToken ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const r = await post("/org-bot", { action: "connect", token: token.trim() });
      const username = String(r["username"] ?? "");
      onDone({
        summary: t("aic.client_bot.summary", { bot: `@${username}` }),
        done: (
          <Done text={t("aic.client_bot.done", { bot: `@${username}` })}>
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              {t("aic.client_bot.test")}
            </p>
            <OpenButton href={`https://t.me/${username}`}>{t("aic.openTelegram")}</OpenButton>
          </Done>
        ),
      });
    } catch (e) {
      setError(describeError(e, t("aic.failed")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ol className="list-decimal space-y-0.5 pl-4 text-[12.5px] leading-snug text-muted-foreground">
        <li>
          {t("aic.client_bot.s1")}{" "}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary"
          >
            @BotFather
          </a>
        </li>
        <li>{t("aic.client_bot.s2")}</li>
        <li>{t("aic.client_bot.s3")}</li>
      </ol>
      <label className="block">
        <Label>{t("aic.client_bot.token")}</Label>
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="123456789:AA…"
          className={cn(field, "font-mono")}
        />
      </label>
      <p className="text-[11px] text-subtle">{t("aic.secretNote")}</p>
      <ErrorLine error={error} />
      <Run busy={busy} disabled={!token.trim()} onClick={() => void connect()}>
        {t("aic.client_bot.run")}
      </Run>
    </>
  );
}

/* ----------------------- the admin's own Telegram link ----------------------- */

function MyTelegramForm({ onDone }: { onDone: (r: SetupCardResult) => void }) {
  const { t } = useI18n();
  const { user, refreshProfile } = useAuth();
  const [link, setLink] = useState<{ code: string; bot: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reported = useRef(false);
  const alreadyLinked = !!user?.telegramLinked && !link;

  // Waits for the bot to receive the code: the profile then has a chat.
  useEffect(() => {
    if (!link) return;
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > 10 * 60_000) clearInterval(id);
      void refreshProfile();
    }, 4000);
    return () => clearInterval(id);
  }, [link, refreshProfile]);
  useEffect(() => {
    if (!link || !user?.telegramLinked || reported.current) return;
    reported.current = true;
    onDone({
      summary: t("aic.my_telegram.summary"),
      done: <Done text={t("aic.my_telegram.done")} />,
    });
  }, [link, user?.telegramLinked, onDone, t]);

  async function getCode() {
    setBusy(true);
    setError(null);
    try {
      const r = await post("/telegram/link", {});
      setLink({ code: String(r["code"] ?? ""), bot: (r["botUsername"] as string | null) ?? null });
    } catch (e) {
      setError(describeError(e, t("aic.failed")));
    } finally {
      setBusy(false);
    }
  }

  if (link)
    return (
      <>
        <p className="text-[12.5px] leading-snug text-foreground">
          {link.bot
            ? t("aic.my_telegram.open", { bot: `@${link.bot}` })
            : t("aic.my_telegram.noBot")}
        </p>
        <div className="rounded-lg border border-dashed border-primary/50 bg-background py-2 text-center font-mono text-[20px] font-bold tracking-[0.25em] text-foreground">
          {link.code}
        </div>
        <div className="flex flex-wrap gap-2">
          {link.bot && (
            <OpenButton href={`https://t.me/${link.bot}?start=${link.code}`}>
              {t("aic.openTelegram")}
            </OpenButton>
          )}
          <CopyButton text={link.code} label={t("aic.copyCode")} />
        </div>
        <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("aic.my_telegram.waiting")}
        </p>
      </>
    );
  return (
    <>
      {alreadyLinked && (
        <p className="flex items-start gap-1.5 text-[12.5px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {t("aic.my_telegram.already")}
        </p>
      )}
      <p className="text-[12.5px] leading-snug text-muted-foreground">{t("aic.my_telegram.how")}</p>
      <ErrorLine error={error} />
      <Run busy={busy} onClick={() => void getCode()}>
        {alreadyLinked ? t("aic.my_telegram.relink") : t("aic.my_telegram.run")}
      </Run>
    </>
  );
}

/* --------------------------------- salesbot --------------------------------- */

const SAVE_TO: SetupQuestion["saveTo"][] = ["name", "phone", "email", "note", "none"];

function SalesbotForm({
  card,
  onDone,
}: {
  card: SetupCardSpec;
  onDone: (r: SetupCardResult) => void;
}) {
  const { t } = useI18n();
  const save = useSaveSalesbot();
  const p = card.prefill;
  const [name, setName] = useState(p.name ?? t("sb.tpl.name"));
  const [greeting, setGreeting] = useState(p.greeting ?? t("sb.tpl.greeting"));
  const [questions, setQuestions] = useState<SetupQuestion[]>(
    p.questions?.length
      ? p.questions
      : [
          { text: t("sb.tpl.qName"), saveTo: "name" },
          { text: t("sb.tpl.qPhone"), saveTo: "phone" },
        ],
  );
  const [finishText, setFinish] = useState(p.finish ?? t("sb.tpl.finish"));
  const [tag, setTag] = useState(p.tag ?? "");
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      const qs = questions.filter((q) => q.text.trim());
      const id = await save.mutateAsync({
        input: {
          name: name.trim(),
          description: "",
          kind: "builtin",
          channel: "auto",
          steps: buildSimpleSteps({
            greeting: greeting.trim(),
            questions: qs.map((q) => ({ text: q.text.trim(), saveTo: q.saveTo, options: [] })),
            finish: finishText.trim(),
            stageId: "",
            tag: tag.trim(),
            task: t("sb.tpl.task"),
          }),
          enabled: true,
          test_mode: false,
          trigger: "manual",
          trigger_stage_id: null,
          trigger_time: null,
        },
      });
      onDone({
        summary: t("aic.salesbot.summary", { name: name.trim(), n: qs.length }),
        done: (
          <Done text={t("aic.salesbot.done", { name: name.trim() })}>
            <BotLink botId={id} />
          </Done>
        ),
      });
    } catch (e) {
      setError(describeError(e, t("aic.failed")));
    }
  }

  return (
    <>
      <label className="block">
        <Label>{t("sb.name")}</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <label className="block">
        <Label>{t("sb.simple.greeting")}</Label>
        <textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} className={area} />
      </label>
      <div>
        <Label>{t("sb.simple.questions")}</Label>
        <div className="space-y-1.5">
          {questions.map((q, i) => (
            <div key={i} className="rounded-lg border border-border bg-background p-1.5">
              <div className="flex items-start gap-1">
                <input
                  value={q.text}
                  onChange={(e) =>
                    setQuestions((qs) =>
                      qs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)),
                    )
                  }
                  placeholder={t("sb.simple.questionPh")}
                  className="h-7 min-w-0 flex-1 bg-transparent px-1 text-[13px] text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                  aria-label={t("common.delete")}
                  className="grid h-7 w-7 place-items-center rounded-md text-subtle hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <select
                value={q.saveTo}
                onChange={(e) =>
                  setQuestions((qs) =>
                    qs.map((x, j) =>
                      j === i ? { ...x, saveTo: e.target.value as SetupQuestion["saveTo"] } : x,
                    ),
                  )
                }
                className="mt-1 h-7 rounded-md border border-border bg-card px-1.5 text-[12px] text-muted-foreground outline-none"
              >
                {SAVE_TO.map((v) => (
                  <option key={v} value={v}>
                    {t("sb.simple.answerTo")} {t(`sb.simple.save.${v}`)}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setQuestions((qs) => [...qs, { text: "", saveTo: "note" }])}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" /> {t("sb.simple.addQuestion")}
          </button>
        </div>
      </div>
      <label className="block">
        <Label>{t("sb.simple.finish")}</Label>
        <textarea value={finishText} onChange={(e) => setFinish(e.target.value)} className={area} />
      </label>
      <label className="block">
        <Label>{t("sb.simple.tag")}</Label>
        <input value={tag} onChange={(e) => setTag(e.target.value)} className={field} />
      </label>
      <ErrorLine error={error} />
      <Run
        busy={save.isPending}
        disabled={!name.trim() || !questions.some((q) => q.text.trim())}
        onClick={() => void create()}
      >
        {t("aic.salesbot.run")}
      </Run>
    </>
  );
}

/** The new salesbot's page and its Telegram link. */
function BotLink({ botId }: { botId: string }) {
  const { t } = useI18n();
  const link = useQuery({
    queryKey: ["salesbot-link", botId],
    staleTime: 10 * 60_000,
    retry: false,
    queryFn: async () => {
      const res = await apiFetch(`/salesbots/link?botId=${encodeURIComponent(botId)}`);
      const body = (await res.json().catch(() => ({}))) as { url?: string; shortUrl?: string };
      return body.shortUrl ?? body.url ?? null;
    },
  });
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        to="/bots"
        search={{ tab: "salesbots", bot: botId }}
        className="ctl-soft inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold"
      >
        <Bot className="h-3.5 w-3.5" /> {t("aic.salesbot.open")}
      </Link>
      {link.data && <OpenButton href={link.data}>{t("aic.salesbot.test")}</OpenButton>}
    </div>
  );
}

/* --------------------------------- employee --------------------------------- */

function newPassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `Siq-${body}7`;
}

function EmployeeForm({
  card,
  onDone,
}: {
  card: SetupCardSpec;
  onDone: (r: SetupCardResult) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(card.prefill.full_name ?? "");
  const [email, setEmail] = useState(card.prefill.email ?? "");
  const [password, setPassword] = useState(newPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add() {
    setBusy(true);
    setError(null);
    try {
      await post("/admin/create-employee", {
        full_name: name.trim(),
        email: email.trim(),
        password,
      });
      const login = `${window.location.origin}/login\n${t("aic.employee.login")}: ${email.trim()}\n${t("aic.employee.password")}: ${password}`;
      onDone({
        summary: t("aic.employee.summary", { name: name.trim() || email.trim() }),
        done: (
          <Done text={t("aic.employee.done", { name: name.trim() || email.trim() })}>
            <pre className="rounded-lg bg-surface p-2 font-mono text-[12px] whitespace-pre-wrap text-foreground">
              {login}
            </pre>
            <CopyButton text={login} label={t("aic.employee.copy")} />
          </Done>
        ),
      });
    } catch (e) {
      setError(describeError(e, t("aic.failed")));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <label className="block">
        <Label>{t("aic.employee.name")}</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
      </label>
      <label className="block">
        <Label>{t("aic.employee.email")}</Label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ism@kompaniya.uz"
          className={field}
        />
      </label>
      <label className="block">
        <Label>{t("aic.employee.password")}</Label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={cn(field, "font-mono")}
        />
      </label>
      <p className="text-[11px] text-subtle">{t("aic.secretNote")}</p>
      <ErrorLine error={error} />
      <Run
        busy={busy}
        disabled={!/\S+@\S+\.\S+/.test(email) || password.length < 8}
        onClick={() => void add()}
      >
        {t("aic.employee.run")}
      </Run>
    </>
  );
}

/* ---------------------------------- funnel ---------------------------------- */

const STAGE_COLORS = [
  "#64748b",
  "#3b82f6",
  "#06b6d4",
  "#8b5cf6",
  "#f59e0b",
  "#ec4899",
  "#14b8a6",
  "#6366f1",
];

function FunnelForm({
  card,
  onDone,
}: {
  card: SetupCardSpec;
  onDone: (r: SetupCardResult) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: pipelines } = usePipelines();
  const createPipeline = useCreatePipeline();
  const createStage = useCreateStage();
  const [name, setName] = useState(card.prefill.name ?? "");
  const [stages, setStages] = useState<string[]>(
    card.prefill.stages?.length
      ? card.prefill.stages
      : [t("fs.def.unsorted"), t("fs.def.firstContact")],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taken = useMemo(
    () => (pipelines ?? []).some((p) => p.name.toLowerCase() === name.trim().toLowerCase()),
    [pipelines, name],
  );

  async function create() {
    if (!user?.organizationId) return;
    setBusy(true);
    setError(null);
    try {
      const funnelName = name.trim();
      const work = stages.map((s) => s.trim()).filter(Boolean);
      const created = await createPipeline.mutateAsync({
        name: funnelName,
        organization_id: user.organizationId,
        position: (pipelines ?? []).length,
      });
      const at = {
        organization_id: user.organizationId,
        pipeline_id: created.id,
        pipeline_name: funnelName,
      };
      const workRows = work.map((s, i) => ({
        ...at,
        name: s,
        key: `custom-${crypto.randomUUID()}`,
        color: STAGE_COLORS[i % STAGE_COLORS.length]!,
        probability: Math.min(80, 10 + i * 15),
        position: i,
        is_won: false,
        is_lost: false,
        stage_value: i === 0 ? "new" : i === work.length - 1 ? "expected" : "in_work",
      }));
      const closing = defaultStageRows(
        DEFAULT_FUNNEL_STAGES.filter((d) => d.is_won || d.is_lost),
        t,
        { ...at, from: work.length },
      );
      await createStageRows([...workRows, ...closing], (row) =>
        createStage.mutateAsync(row as never),
      );
      onDone({
        summary: t("aic.funnel.summary", { name: funnelName, n: work.length + closing.length }),
        done: (
          <Done text={t("aic.funnel.done", { name: funnelName })}>
            <Link
              to="/funnels/settings"
              search={{ funnel: funnelName } as never}
              className="ctl-soft inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold"
            >
              <Workflow className="h-3.5 w-3.5" /> {t("aic.funnel.open")}
            </Link>
          </Done>
        ),
      });
    } catch (e) {
      setError(describeError(e, t("aic.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className="block">
        <Label>{t("aic.funnel.name")}</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
        {taken && (
          <span className="mt-1 block text-[11.5px] text-warning">{t("salesp.nameTaken")}</span>
        )}
      </label>
      <div>
        <Label>{t("aic.funnel.stages")}</Label>
        <div className="space-y-1">
          {stages.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: STAGE_COLORS[i % STAGE_COLORS.length] }}
              />
              <input
                value={s}
                onChange={(e) =>
                  setStages((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))
                }
                className={cn(field, "h-8")}
              />
              <button
                type="button"
                onClick={() => setStages((xs) => xs.filter((_, j) => j !== i))}
                aria-label={t("common.delete")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-subtle hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setStages((xs) => [...xs, ""])}
            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-semibold text-primary hover:bg-primary/10"
          >
            <Plus className="h-3.5 w-3.5" /> {t("aic.funnel.addStage")}
          </button>
          <p className="text-[11px] text-subtle">{t("aic.funnel.closing")}</p>
        </div>
      </div>
      <ErrorLine error={error} />
      <Run
        busy={busy}
        disabled={!name.trim() || taken || !stages.some((s) => s.trim())}
        onClick={() => void create()}
      >
        {t("aic.funnel.run")}
      </Run>
    </>
  );
}

/* ----------------------------- business profile ----------------------------- */

function BusinessForm({
  card,
  onDone,
}: {
  card: SetupCardSpec;
  onDone: (r: SetupCardResult) => void;
}) {
  const { t } = useI18n();
  const update = useUpdateBusinessProfile();
  const p = card.prefill;
  const [v, setV] = useState({
    company_name: p.company_name ?? "",
    description: p.description ?? "",
    target_customer: p.target_customer ?? "",
    value_proposition: p.value_proposition ?? "",
    tone: p.tone ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  async function saveIt() {
    setError(null);
    try {
      const patch = Object.fromEntries(
        Object.entries(v)
          .map(([k, x]) => [k, x.trim()])
          .filter(([, x]) => x),
      );
      await update.mutateAsync(patch);
      onDone({
        summary: t("aic.business_profile.summary"),
        done: (
          <Done text={t("aic.business_profile.done")}>
            <Link
              to="/settings"
              search={{ section: "business" } as never}
              className="ctl-soft inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-semibold"
            >
              <Building2 className="h-3.5 w-3.5" /> {t("aic.business_profile.open")}
            </Link>
          </Done>
        ),
      });
    } catch (e) {
      setError(describeError(e, t("aic.failed")));
    }
  }
  const row = (k: keyof typeof v, multi = false) => (
    <label key={k} className="block">
      <Label>{t(`aic.bp.${k}`)}</Label>
      {multi ? (
        <textarea
          value={v[k]}
          onChange={(e) => setV({ ...v, [k]: e.target.value })}
          className={area}
        />
      ) : (
        <input
          value={v[k]}
          onChange={(e) => setV({ ...v, [k]: e.target.value })}
          className={field}
        />
      )}
    </label>
  );
  return (
    <>
      {row("company_name")}
      {row("description", true)}
      {row("target_customer", true)}
      {row("value_proposition", true)}
      {row("tone")}
      <ErrorLine error={error} />
      <Run busy={update.isPending} disabled={!v.description.trim()} onClick={() => void saveIt()}>
        {t("aic.business_profile.run")}
      </Run>
    </>
  );
}
