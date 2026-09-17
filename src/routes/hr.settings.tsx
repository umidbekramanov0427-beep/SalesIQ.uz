import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Switch } from "@/components/ui/switch";
import {
  useHrVacancies,
  useCreateHrVacancy,
  useUpdateHrVacancy,
  useDeleteHrVacancy,
  useHrQuestions,
  useCreateHrQuestion,
  useUpdateHrQuestion,
  useDeleteHrQuestion,
  useHrSettings,
  useUpdateHrSettings,
  type HrQuestionRow,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/hr/settings")({
  head: () => ({
    meta: [{ title: "Vakansiyalar va savollar — Kadrlar bo'limi — SalesIQ" }],
  }),
  component: HrSettingsPage,
});

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

function copyValue(value: string) {
  void navigator.clipboard.writeText(value).then(() => toast.success("Havola nusxalandi."));
}

function BotUsernameEditor() {
  const { data: settings } = useHrSettings();
  const updateSettings = useUpdateHrSettings();
  const [username, setUsername] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settings === undefined || hydrated) return;
    setUsername(settings?.telegram_bot_username ?? "");
    setHydrated(true);
  }, [settings, hydrated]);

  async function save() {
    try {
      await updateSettings.mutateAsync({
        telegram_bot_username: username.trim().replace(/^@/, "") || null,
      });
      toast.success("Saqlandi.");
    } catch (err) {
      toast.error(errorMessage(err, "Saqlashda xatolik yuz berdi."));
    }
  }

  return (
    <div className="mb-4 rounded-xl bg-accent p-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-subtle">
        Kadrlar bo'limi boti (username, @ belgisiz)
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="kadrlar_uchun_bot"
          className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary/40"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={updateSettings.isPending}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Saqlash
        </button>
      </div>
      <p className="mt-1.5 text-xs text-subtle">
        Bu — kunlik hisobot yuboradigan botdan alohida, faqat kadrlar bo'limi uchun yaratilgan bot.
      </p>
    </div>
  );
}

function VacanciesCard() {
  const { data: vacancies } = useHrVacancies();
  const { data: settings } = useHrSettings();
  const botUsername = settings?.telegram_bot_username ?? undefined;
  const createVacancy = useCreateHrVacancy();
  const updateVacancy = useUpdateHrVacancy();
  const deleteVacancy = useDeleteHrVacancy();
  const [title, setTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await createVacancy.mutateAsync({ title: title.trim() });
      setTitle("");
      toast.success("Vakansiya qo'shildi.");
    } catch (err) {
      toast.error(errorMessage(err, "Vakansiya qo'shib bo'lmadi."));
    }
  }

  return (
    <SectionCard
      title="Vakansiyalar"
      description="Har birining o'ziga xos bot havolasi bor — shu havolani vakansiya e'loniga qo'ying."
    >
      <BotUsernameEditor />

      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Vakansiya nomi, masalan: Sotuv menejeri"
          className="h-11 flex-1 rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
        />
        <button
          type="submit"
          disabled={createVacancy.isPending || !title.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {createVacancy.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Qo'shish
        </button>
      </form>

      <div className="space-y-3">
        {(vacancies ?? []).map((v) => {
          const link = botUsername
            ? `https://t.me/${botUsername}?start=${v.telegram_start_token}`
            : null;
          return (
            <div key={v.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-foreground">{v.title}</p>
                <div className="flex items-center gap-2.5">
                  <Switch
                    checked={v.active}
                    onCheckedChange={(checked) =>
                      void updateVacancy.mutateAsync({ id: v.id, patch: { active: checked } })
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {v.active ? "Faol" : "Faol emas"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(v.id)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {link && (
                <button
                  type="button"
                  onClick={() => copyValue(link)}
                  className="mt-2.5 flex w-full items-center gap-2 rounded-lg bg-accent px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
                  title="Nusxalash"
                >
                  <span className="truncate font-mono">{link}</span>
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
            </div>
          );
        })}
        {(vacancies ?? []).length === 0 && (
          <p className="py-4 text-center text-sm text-subtle">Hali vakansiya qo'shilmagan.</p>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDeleteId}
        onOpenChange={(v) => !v && setConfirmDeleteId(null)}
        title="Vakansiyani o'chirish"
        description="Bu vakansiyaga tegishli barcha nomzodlar ma'lumoti ham o'chib ketadi. Davom etasizmi?"
        onConfirm={() => {
          if (confirmDeleteId) void deleteVacancy.mutateAsync(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </SectionCard>
  );
}

function QuestionRow({
  question,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  question: HrQuestionRow;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const updateQuestion = useUpdateHrQuestion();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(question.question);

  async function save() {
    if (!text.trim()) return;
    try {
      await updateQuestion.mutateAsync({ id: question.id, patch: { question: text.trim() } });
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Savolni saqlab bo'lmadi."));
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-border p-3">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              className="h-10 flex-1 rounded-lg border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
            <button
              type="button"
              onClick={() => void save()}
              className="rounded-lg p-1.5 text-success hover:bg-success/10"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setText(question.question);
              setEditing(true);
            }}
            className="w-full text-left text-sm text-foreground hover:text-primary"
          >
            {question.question}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function QuestionsCard() {
  const { data: questions } = useHrQuestions();
  const createQuestion = useCreateHrQuestion();
  const updateQuestion = useUpdateHrQuestion();
  const deleteQuestion = useDeleteHrQuestion();
  const [text, setText] = useState("");

  const list = questions ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      const nextPosition = list.length > 0 ? Math.max(...list.map((q) => q.position)) + 1 : 0;
      await createQuestion.mutateAsync({ question: text.trim(), position: nextPosition });
      setText("");
    } catch (err) {
      toast.error(errorMessage(err, "Savol qo'shib bo'lmadi."));
    }
  }

  async function swap(a: HrQuestionRow, b: HrQuestionRow) {
    try {
      await Promise.all([
        updateQuestion.mutateAsync({ id: a.id, patch: { position: b.position } }),
        updateQuestion.mutateAsync({ id: b.id, patch: { position: a.position } }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err, "Tartibni o'zgartirib bo'lmadi."));
    }
  }

  async function remove(id: string) {
    try {
      await deleteQuestion.mutateAsync(id);
    } catch (err) {
      toast.error(errorMessage(err, "Savolni o'chirib bo'lmadi."));
    }
  }

  return (
    <SectionCard
      title="Savollar"
      description="Bot har bir nomzodga shu savollarni tartib bo'yicha beradi."
    >
      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Yangi savol matni..."
          className="h-11 flex-1 rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
        />
        <button
          type="submit"
          disabled={createQuestion.isPending || !text.trim()}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {createQuestion.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Qo'shish
        </button>
      </form>

      <div className="space-y-2.5">
        {list.map((q, i) => (
          <QuestionRow
            key={q.id}
            question={q}
            isFirst={i === 0}
            isLast={i === list.length - 1}
            onMoveUp={() => i > 0 && void swap(q, list[i - 1]!)}
            onMoveDown={() => i < list.length - 1 && void swap(q, list[i + 1]!)}
            onDelete={() => void remove(q.id)}
          />
        ))}
        {list.length === 0 && (
          <p className="py-4 text-center text-sm text-subtle">Hali savol qo'shilmagan.</p>
        )}
      </div>
    </SectionCard>
  );
}

function AcademyLinkCard() {
  const { data: settings } = useHrSettings();
  const updateSettings = useUpdateHrSettings();
  const [link, setLink] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (settings === undefined || hydrated) return;
    setLink(settings?.academy_channel_invite_link ?? "");
    setHydrated(true);
  }, [settings, hydrated]);

  async function save() {
    try {
      await updateSettings.mutateAsync({ academy_channel_invite_link: link.trim() || null });
      toast.success("Saqlandi.");
    } catch (err) {
      toast.error(errorMessage(err, "Saqlashda xatolik yuz berdi."));
    }
  }

  return (
    <SectionCard
      title="TOP kadrlar akademiyasi"
      description="Nomzod barcha savollarga javob berib bo'lgach, shu kanal havolasi yuboriladi."
    >
      <div className="flex gap-2">
        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://t.me/+..."
          className="h-11 flex-1 rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={updateSettings.isPending}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {updateSettings.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Saqlash
        </button>
      </div>
    </SectionCard>
  );
}

function HrSettingsPage() {
  return (
    <>
      <Link
        to="/hr"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-subtle transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Kadrlar bo'limiga qaytish
      </Link>
      <PageHeader
        title="Vakansiyalar va savollar"
        description="Vakansiyalarni, bot savollarini va akademiya kanali havolasini shu yerdan boshqaring."
      />
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <VacanciesCard />
        <div className="grid gap-6">
          <QuestionsCard />
          <AcademyLinkCard />
        </div>
      </div>
    </>
  );
}
