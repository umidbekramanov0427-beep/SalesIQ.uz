import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BarChart3,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useCreateLesson,
  useDeleteLesson,
  useLessonProgressForLesson,
  useLessons,
  useMyLessonProgress,
  useProfilesRaw,
  useTrainingRecommendations,
  useUpdateLesson,
  useUpdateTrainingRecommendationStatus,
  useUploadLessonAsset,
  useUpsertLessonProgress,
  type LessonProgressRow,
  type LessonRow,
  type TrainingRecommendationRow,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

export const Route = createFileRoute("/training")({
  head: () => ({
    meta: [
      { title: "Training — SalesIQ" },
      {
        name: "description",
        content: "Video darsliklar va yo'qotilgan lidlar tahlilidan kelib chiqqan AI tavsiyalar.",
      },
    ],
  }),
  component: TrainingPage,
});

const CATEGORY_OPTIONS = [
  "objection_handling",
  "pricing",
  "call_to_action",
  "discovery",
  "follow_up",
  "other",
] as const;

function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function TrainingPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isManager = user?.role === "super_admin" || user?.role === "rop";
  const [tab, setTab] = useState<"recommendations" | "lessons">("recommendations");
  const [watchingLessonId, setWatchingLessonId] = useState<string | null>(null);

  return (
    <>
      <PageHeader title={t("training.title")} description={t("training.desc")} />

      <div className="mb-6 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
        <button
          type="button"
          onClick={() => setTab("recommendations")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
            tab === "recommendations"
              ? "bg-primary/10 text-primary ring-1 ring-primary/50"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <TrendingUp className="h-4 w-4" />
          {t("training.tabRecommendations")}
        </button>
        <button
          type="button"
          onClick={() => setTab("lessons")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
            tab === "lessons"
              ? "bg-primary/10 text-primary ring-1 ring-primary/50"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <GraduationCap className="h-4 w-4" />
          {t("training.tabLessons")}
        </button>
      </div>

      {tab === "recommendations" ? (
        <RecommendationsTab isManager={isManager} onWatch={setWatchingLessonId} />
      ) : (
        <LessonsTab isManager={isManager} onWatch={setWatchingLessonId} />
      )}

      <VideoPlayerModal lessonId={watchingLessonId} onClose={() => setWatchingLessonId(null)} />
    </>
  );
}

function RecommendationsTab({
  isManager,
  onWatch,
}: {
  isManager: boolean;
  onWatch: (lessonId: string) => void;
}) {
  const { t } = useI18n();
  const { data: recommendations, isLoading } = useTrainingRecommendations();
  const { data: profiles } = useProfilesRaw();
  const { data: lessons } = useLessons();
  const updateStatus = useUpdateTrainingRecommendationStatus();

  const profileById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles ?? []) map.set(p.id, p.full_name || p.email || "");
    return map;
  }, [profiles]);

  const lessonById = useMemo(() => {
    const map = new Map<string, LessonRow>();
    for (const l of lessons ?? []) map.set(l.id, l);
    return map;
  }, [lessons]);

  const ranking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recommendations ?? []) {
      counts.set(r.error_category, (counts.get(r.error_category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [recommendations]);

  async function handleStatusChange(id: string, status: "acknowledged" | "done") {
    try {
      await updateStatus.mutateAsync({ id, status });
    } catch (err) {
      toast.error(errorMessage(err, t("training.saveFailed")));
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const maxCount = ranking[0]?.[1] ?? 0;

  return (
    <div className="space-y-6">
      {ranking.length > 0 && (
        <SectionCard title={t("training.rankingTitle")} description={t("training.rankingDesc")}>
          <div className="space-y-2.5">
            {ranking.map(([category, count]) => (
              <div key={category} className="flex items-center gap-3">
                <span className="w-48 shrink-0 text-sm font-medium text-foreground">
                  {t(`training.category.${category}`)}
                </span>
                <div className="h-2.5 flex-1 rounded-full bg-accent">
                  <div
                    className="h-2.5 rounded-full bg-primary"
                    style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {t("training.timesReported", { count })}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        title={t("training.recommendationsTitle")}
        description={t("training.recommendationsDesc")}
      >
        {!recommendations || recommendations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("training.noRecommendations")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                managerName={profileById.get(rec.manager_id) ?? ""}
                showManagerName={isManager}
                lessonTitle={
                  rec.recommended_lesson_id
                    ? (lessonById.get(rec.recommended_lesson_id)?.title ?? null)
                    : null
                }
                onWatch={
                  rec.recommended_lesson_id ? () => onWatch(rec.recommended_lesson_id!) : null
                }
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function RecommendationCard({
  rec,
  managerName,
  showManagerName,
  lessonTitle,
  onWatch,
  onStatusChange,
}: {
  rec: TrainingRecommendationRow;
  managerName: string;
  showManagerName: boolean;
  lessonTitle: string | null;
  onWatch: (() => void) | null;
  onStatusChange: (id: string, status: "acknowledged" | "done") => void;
}) {
  const { t } = useI18n();
  const statusTone =
    rec.status === "done"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : rec.status === "acknowledged"
        ? "bg-blue-500/15 text-blue-600 dark:text-blue-400"
        : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  const statusLabel =
    rec.status === "done"
      ? t("training.statusDone")
      : rec.status === "acknowledged"
        ? t("training.statusAcknowledged")
        : t("training.statusNew");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {t(`training.category.${rec.error_category}`)}
        </span>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", statusTone)}>
          {statusLabel}
        </span>
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{rec.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{rec.description}</p>
      </div>
      {showManagerName && managerName && (
        <p className="text-xs text-muted-foreground">
          {managerName} · {t("training.fromLead")}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        {lessonTitle && onWatch && (
          <button
            type="button"
            onClick={onWatch}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Play className="h-3.5 w-3.5" />
            {t("training.viewLesson")}
          </button>
        )}
        {rec.status === "new" && (
          <button
            type="button"
            onClick={() => onStatusChange(rec.id, "acknowledged")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
          >
            {t("training.markAcknowledged")}
          </button>
        )}
        {rec.status !== "done" && (
          <button
            type="button"
            onClick={() => onStatusChange(rec.id, "done")}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
          >
            {t("training.markDone")}
          </button>
        )}
      </div>
    </div>
  );
}

function LessonsTab({
  isManager,
  onWatch,
}: {
  isManager: boolean;
  onWatch: (lessonId: string) => void;
}) {
  const { t } = useI18n();
  const { data: lessons, isLoading } = useLessons();
  const { data: myProgress } = useMyLessonProgress();
  const deleteLesson = useDeleteLesson();
  const [addOpen, setAddOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<LessonRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LessonRow | null>(null);
  const [statsLesson, setStatsLesson] = useState<LessonRow | null>(null);

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteLesson.mutateAsync(deleteTarget.id);
    } catch (err) {
      toast.error(errorMessage(err, t("training.saveFailed")));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <SectionCard
      title={t("training.lessonsTitle")}
      description={t("training.lessonsDesc")}
      actions={
        isManager ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("training.addLesson")}
          </button>
        ) : undefined
      }
    >
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !lessons || lessons.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("training.noLessons")}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lessons.map((lesson, i) => {
            const progress = myProgress?.[lesson.id];
            const percent =
              lesson.duration_seconds && progress
                ? Math.min(
                    100,
                    Math.round((progress.last_position_seconds / lesson.duration_seconds) * 100),
                  )
                : progress?.completed
                  ? 100
                  : 0;
            return (
              <div
                key={lesson.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft"
              >
                <button
                  type="button"
                  onClick={() => onWatch(lesson.id)}
                  className="relative block aspect-video w-full overflow-hidden bg-accent"
                >
                  {lesson.thumbnail_url ? (
                    <img
                      src={lesson.thumbnail_url}
                      alt=""
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <GraduationCap className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                  )}
                  <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
                    #{i + 1}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                    <Play className="h-9 w-9 text-white" />
                  </span>
                  {progress?.completed && (
                    <span className="absolute right-2 top-2 rounded-full bg-emerald-500 p-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                    </span>
                  )}
                </button>
                <div className="flex flex-1 flex-col gap-2 p-3.5">
                  <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                    {lesson.title}
                  </h3>
                  {lesson.description && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {lesson.description}
                    </p>
                  )}
                  <div className="mt-auto h-1.5 w-full rounded-full bg-accent">
                    <div
                      className="h-1.5 rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  {isManager && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setStatsLesson(lesson)}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        {t("training.statistics")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditLesson(lesson)}
                        aria-label={t("training.editLesson")}
                        className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(lesson)}
                        aria-label={t("training.deleteLesson")}
                        className="rounded-lg border border-border p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <LessonFormDialog open={addOpen} onOpenChange={setAddOpen} />
      <LessonFormDialog
        open={!!editLesson}
        onOpenChange={(o) => !o && setEditLesson(null)}
        lesson={editLesson}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("training.deleteConfirmTitle")}
        description={t("training.deleteConfirmDesc")}
        onConfirm={() => void confirmDelete()}
      />
      {statsLesson && (
        <LessonStatsModal lesson={statsLesson} onClose={() => setStatsLesson(null)} />
      )}
    </SectionCard>
  );
}

function LessonFormDialog({
  open,
  onOpenChange,
  lesson,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson?: LessonRow | null;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();
  const uploadAsset = useUploadLessonAsset();
  const { data: lessons } = useLessons();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // This dialog instance is reused for every row (add + each edit) instead
  // of remounting, so its fields have to be reset whenever it opens rather
  // than only once on mount.
  useEffect(() => {
    if (!open) return;
    setTitle(lesson?.title ?? "");
    setDescription(lesson?.description ?? "");
    setCategory(lesson?.category ?? "");
    setVideoFile(null);
    setThumbnailFile(null);
  }, [open, lesson]);

  function readVideoDuration(file: File): Promise<number | null> {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : null);
      };
      video.onerror = () => resolve(null);
      video.src = URL.createObjectURL(file);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (!lesson && !videoFile) {
      toast.error(t("training.lessonVideoLabel"));
      return;
    }
    setSaving(true);
    try {
      let videoUrl = lesson?.video_url;
      let durationSeconds = lesson?.duration_seconds ?? null;
      if (videoFile) {
        const [uploaded, duration] = await Promise.all([
          uploadAsset.mutateAsync(videoFile),
          readVideoDuration(videoFile),
        ]);
        videoUrl = uploaded.url;
        durationSeconds = duration;
      }
      let thumbnailUrl = lesson?.thumbnail_url ?? null;
      if (thumbnailFile) {
        const uploaded = await uploadAsset.mutateAsync(thumbnailFile);
        thumbnailUrl = uploaded.url;
      }

      if (lesson) {
        await updateLesson.mutateAsync({
          id: lesson.id,
          patch: {
            title: title.trim(),
            description: description.trim() || null,
            category: category || null,
            video_url: videoUrl!,
            thumbnail_url: thumbnailUrl,
            duration_seconds: durationSeconds,
          },
        });
      } else {
        await createLesson.mutateAsync({
          organization_id: user!.organizationId!,
          created_by: user!.id,
          title: title.trim(),
          description: description.trim() || null,
          category: category || null,
          video_url: videoUrl!,
          thumbnail_url: thumbnailUrl,
          duration_seconds: durationSeconds,
          position: lessons?.length ?? 0,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("training.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lesson ? t("training.editLesson") : t("training.addLesson")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("training.lessonTitleLabel")}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("training.lessonDescLabel")}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("training.lessonCategoryLabel")}
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="">{t("training.lessonCategoryNone")}</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`training.category.${c}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("training.lessonVideoLabel")}
            </span>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("training.lessonThumbnailLabel")}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setThumbnailFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-accent"
            >
              {t("training.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? t("training.uploading") : t("training.save")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LessonStatsModal({ lesson, onClose }: { lesson: LessonRow; onClose: () => void }) {
  const { t } = useI18n();
  const { data: progress, isLoading } = useLessonProgressForLesson(lesson.id);
  const { data: profiles } = useProfilesRaw();

  const managers = useMemo(
    () => (profiles ?? []).filter((p) => p.role === "sotuv_menejeri"),
    [profiles],
  );
  const progressByUser = useMemo(() => {
    const map = new Map<string, LessonProgressRow>();
    for (const row of progress ?? []) map.set(row.user_id, row);
    return map;
  }, [progress]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("training.statisticsTitle", { title: lesson.title })}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase text-muted-foreground">
                  <th className="py-2 pr-3">{t("training.colManager")}</th>
                  <th className="py-2 pr-3">{t("training.colPosition")}</th>
                  <th className="py-2 pr-3">{t("training.colStatus")}</th>
                  <th className="py-2 pr-3">{t("training.colLastWatched")}</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m) => {
                  const p = progressByUser.get(m.id);
                  const percent =
                    lesson.duration_seconds && p
                      ? Math.min(
                          100,
                          Math.round((p.last_position_seconds / lesson.duration_seconds) * 100),
                        )
                      : null;
                  return (
                    <tr key={m.id} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium text-foreground">
                        {m.full_name || m.email}
                      </td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {p
                          ? `${formatMmSs(p.last_position_seconds)}${percent != null ? ` (${percent}%)` : ""}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {!p ? (
                          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
                            {t("training.notWatched")}
                          </span>
                        ) : p.completed ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {t("training.completed")}
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                            {t("training.inProgress")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {p ? timeAgo(p.last_watched_at) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VideoPlayerModal({ lessonId, onClose }: { lessonId: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const { data: lessons } = useLessons();
  const { data: myProgress } = useMyLessonProgress();
  const upsertProgress = useUpsertLessonProgress();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSavedRef = useRef(0);
  const [speed, setSpeed] = useState(1);

  const lesson = lessons?.find((l) => l.id === lessonId) ?? null;
  const startPosition = lessonId ? (myProgress?.[lessonId]?.last_position_seconds ?? 0) : 0;

  useEffect(() => {
    lastSavedRef.current = 0;
    setSpeed(1);
  }, [lessonId]);

  function saveProgress(completed: boolean) {
    if (!lessonId || !videoRef.current) return;
    const position = Math.floor(videoRef.current.currentTime);
    void upsertProgress.mutateAsync({ lessonId, lastPositionSeconds: position, completed });
  }

  function handleTimeUpdate() {
    if (!videoRef.current) return;
    const now = videoRef.current.currentTime;
    if (now - lastSavedRef.current >= 5) {
      lastSavedRef.current = now;
      saveProgress(false);
    }
  }

  function handleClose() {
    saveProgress(false);
    onClose();
  }

  function setPlaybackRate(rate: number) {
    setSpeed(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }

  return (
    <Dialog open={!!lessonId} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{lesson?.title}</DialogTitle>
        </DialogHeader>
        {lesson && (
          <div className="space-y-3">
            <video
              key={lesson.id}
              ref={videoRef}
              src={lesson.video_url}
              controls
              autoPlay
              className="aspect-video w-full rounded-xl bg-black"
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => saveProgress(true)}
              onPause={() => saveProgress(false)}
              onLoadedMetadata={(e) => {
                if (startPosition > 0) e.currentTarget.currentTime = startPosition;
              }}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("training.speed")}:
              </span>
              {[1, 1.25, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setPlaybackRate(rate)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-semibold",
                    speed === rate
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {rate}x
                </button>
              ))}
            </div>
            {lesson.description && (
              <p className="text-sm text-muted-foreground">{lesson.description}</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
