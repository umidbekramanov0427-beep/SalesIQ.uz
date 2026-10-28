import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlignLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  GraduationCap,
  Image as ImageIcon,
  Link2,
  Loader2,
  Music2,
  Palette,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Video as VideoIcon,
  BookOpen,
  AlertTriangle,
  Lightbulb,
  PlayCircle,
  ShieldQuestion,
} from "lucide-react";
import { ObjectionLibrary } from "@/components/training/ObjectionLibrary";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OrgStructureChart } from "@/components/content-library/OrgStructureChart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useContentLibraryItems,
  useCreateContentLibraryItem,
  useCreateLesson,
  useCreateLessonSection,
  useDeleteContentLibraryItem,
  useDeleteLesson,
  useDeleteLessonSection,
  useLessonProgressForLesson,
  useLessons,
  useLessonSections,
  useMyLessonProgress,
  useProfilesRaw,
  useTrainingRecommendations,
  useUpdateContentLibraryItem,
  useUpdateLesson,
  useUpdateLessonSection,
  useUpdateTrainingRecommendationStatus,
  useUploadContentLibraryFile,
  useUploadLessonAsset,
  useUpsertLessonProgress,
  type ContentLibraryItemRow,
  type ContentLibraryItemType,
  type ContentLibrarySection,
  type LessonProgressRow,
  type LessonRow,
  type LessonSectionRow,
  type TrainingRecommendationRow,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { InternPlanPanel, InternsOverview } from "@/components/mentor/InternClassroom";
import { useI18n } from "@/lib/i18n";
import { cn, timeAgo } from "@/lib/utils";

// Supabase's PostgrestError is a plain object, not an Error instance, so
// `err instanceof Error ? err.message : fallback` always fell through to the
// generic fallback for a real DB error (e.g. a constraint violation) --
// masking exactly the detail someone would need to diagnose it.
function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

export const Route = createFileRoute("/content-library")({
  // ?lesson=<id> opens straight into that lesson (the AI mentor's roadmap
  // links here).
  validateSearch: (search: Record<string, unknown>): { lesson?: string } =>
    typeof search["lesson"] === "string" ? { lesson: search["lesson"] } : {},
  head: () => ({
    meta: [
      { title: "Hujjat va Darsliklar — SalesIQ" },
      {
        name: "description",
        content: "Kompaniya haqida ma'lumot, hujjatlar va sotuv/marketing darsliklari.",
      },
    ],
  }),
  component: ContentLibraryPage,
});

const ITEM_TYPE_ICON: Record<ContentLibraryItemType, typeof Link2> = {
  link: Link2,
  document: FileText,
  image: ImageIcon,
  video: VideoIcon,
  audio: Music2,
  file: FileIcon,
  text: AlignLeft,
};

const TYPE_OPTIONS: { value: ContentLibraryItemType; labelKey: string }[] = [
  { value: "text", labelKey: "contentLibrary.typeText" },
  { value: "link", labelKey: "contentLibrary.typeLink" },
  { value: "document", labelKey: "contentLibrary.typeDocument" },
  { value: "image", labelKey: "contentLibrary.typeImage" },
  { value: "video", labelKey: "contentLibrary.typeVideo" },
  { value: "audio", labelKey: "contentLibrary.typeAudio" },
  { value: "file", labelKey: "contentLibrary.typeFile" },
];

const TYPE_LABEL_KEY: Record<ContentLibraryItemType, string> = Object.fromEntries(
  TYPE_OPTIONS.map((o) => [o.value, o.labelKey]),
) as Record<ContentLibraryItemType, string>;

// A distinct hue per content type so a shelf of mixed links/docs/media
// reads at a glance instead of every card wearing the same primary tint.
const ITEM_TYPE_TONE: Record<ContentLibraryItemType, string> = {
  text: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  link: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  document: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  image: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  video: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  audio: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  file: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
};

// A super_admin can pick a background for any card, on top of its
// automatic per-type tint above. Deliberately pastel-only (no saturated
// or dark fills) so body text stays readable -- the point of this picker
// is a light accent, never a dark card.
const CARD_COLORS = [
  "slate",
  "blue",
  "purple",
  "pink",
  "orange",
  "teal",
  "indigo",
  "cyan",
  "amber",
] as const;
type CardColorName = (typeof CARD_COLORS)[number];

function isCardColorName(value: string | null): value is CardColorName {
  return !!value && (CARD_COLORS as readonly string[]).includes(value);
}

const CARD_COLOR_SURFACE: Record<CardColorName, string> = {
  slate: "border-slate-200/70 bg-slate-50/70 dark:border-slate-500/20 dark:bg-slate-500/[0.04]",
  blue: "border-blue-200/70 bg-blue-50/70 dark:border-blue-500/20 dark:bg-blue-500/[0.04]",
  purple:
    "border-purple-200/70 bg-purple-50/70 dark:border-purple-500/20 dark:bg-purple-500/[0.04]",
  pink: "border-pink-200/70 bg-pink-50/70 dark:border-pink-500/20 dark:bg-pink-500/[0.04]",
  orange:
    "border-orange-200/70 bg-orange-50/70 dark:border-orange-500/20 dark:bg-orange-500/[0.04]",
  teal: "border-teal-200/70 bg-teal-50/70 dark:border-teal-500/20 dark:bg-teal-500/[0.04]",
  indigo:
    "border-indigo-200/70 bg-indigo-50/70 dark:border-indigo-500/20 dark:bg-indigo-500/[0.04]",
  cyan: "border-cyan-200/70 bg-cyan-50/70 dark:border-cyan-500/20 dark:bg-cyan-500/[0.04]",
  amber: "border-amber-200/70 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/[0.04]",
};

const CARD_COLOR_SWATCH: Record<CardColorName, string> = {
  slate: "bg-slate-200",
  blue: "bg-blue-200",
  purple: "bg-purple-200",
  pink: "bg-pink-200",
  orange: "bg-orange-200",
  teal: "bg-teal-200",
  indigo: "bg-indigo-200",
  cyan: "bg-cyan-200",
  amber: "bg-amber-200",
};

function ColorSwatchPicker({
  value,
  onChange,
  ringOffsetClassName = "ring-offset-background",
}: {
  value: string | null;
  onChange: (color: string | null) => void;
  ringOffsetClassName?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-label={t("contentLibrary.defaultColor")}
        title={t("contentLibrary.defaultColor")}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border text-subtle transition-transform hover:scale-110",
          ringOffsetClassName,
          !value && "ring-2 ring-foreground",
        )}
      >
        <span className="text-[10px]">×</span>
      </button>
      {CARD_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onChange(c)}
          className={cn(
            "h-7 w-7 rounded-full transition-transform hover:scale-110",
            ringOffsetClassName,
            CARD_COLOR_SWATCH[c],
            value === c && "ring-2 ring-foreground",
          )}
        />
      ))}
    </div>
  );
}

function AddItemDialog({
  open,
  onOpenChange,
  section,
  dialogTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: ContentLibrarySection;
  dialogTitle: string;
}) {
  const { t } = useI18n();
  const createItem = useCreateContentLibraryItem();
  const uploadFile = useUploadContentLibraryFile();
  const [itemTitle, setItemTitle] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] = useState<ContentLibraryItemType>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setItemTitle("");
    setDescription("");
    setItemType("link");
    setUrl("");
    setFile(null);
    setColor(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!itemTitle.trim()) return;
    setSaving(true);
    try {
      let finalUrl: string | null = url.trim();
      let filePath: string | null = null;
      if (itemType === "text") {
        if (!description.trim()) {
          toast.error(t("contentLibrary.noTextEntered"));
          setSaving(false);
          return;
        }
        finalUrl = null;
      } else {
        if (itemType !== "link") {
          if (!file) {
            toast.error(t("contentLibrary.noFileSelected"));
            setSaving(false);
            return;
          }
          const uploaded = await uploadFile.mutateAsync(file);
          finalUrl = uploaded.url;
          filePath = uploaded.path;
        }
        if (!finalUrl) {
          toast.error(t("contentLibrary.noUrlOrFile"));
          setSaving(false);
          return;
        }
      }
      await createItem.mutateAsync({
        section,
        title: itemTitle,
        description,
        itemType,
        url: finalUrl,
        filePath,
        color,
      });
      toast.success(t("contentLibrary.added"));
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("contentLibrary.addFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("contentLibrary.fieldTitle")}
            </span>
            <input
              value={itemTitle}
              onChange={(e) => setItemTitle(e.target.value)}
              required
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {itemType === "text"
                ? t("contentLibrary.fieldText")
                : t("contentLibrary.fieldDescription")}
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required={itemType === "text"}
              rows={itemType === "text" ? 10 : 6}
              className="mt-1.5 w-full rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <div>
            <span className="text-sm font-medium text-muted-foreground">
              {t("contentLibrary.fieldType")}
            </span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setItemType(opt.value)}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                    itemType === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-sm font-medium text-muted-foreground">
              {t("contentLibrary.fieldColor")}
            </span>
            <div className="mt-1.5">
              <ColorSwatchPicker value={color} onChange={setColor} />
            </div>
          </div>

          {itemType === "text" ? null : itemType === "link" ? (
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">
                {t("contentLibrary.fieldUrl")}
              </span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">
                {t("contentLibrary.fieldFile")}
              </span>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:font-semibold file:text-foreground"
              />
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("contentLibrary.add")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditItemDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ContentLibraryItemRow | null;
}) {
  const { t } = useI18n();
  const updateItem = useUpdateContentLibraryItem();
  const [itemTitle, setItemTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isText = item?.item_type === "text";
  const isLink = item?.item_type === "link";

  useEffect(() => {
    if (!open || !item) return;
    setItemTitle(item.title);
    setDescription(item.description ?? "");
    setUrl(item.url ?? "");
    setColor(item.color ?? null);
  }, [open, item]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!item || !itemTitle.trim()) return;
    if (isText && !description.trim()) {
      toast.error(t("contentLibrary.noTextEntered"));
      return;
    }
    setSaving(true);
    try {
      await updateItem.mutateAsync({
        id: item.id,
        section: item.section as ContentLibrarySection,
        patch: {
          title: itemTitle.trim(),
          description: description.trim(),
          color,
          ...(isLink ? { url: url.trim() } : {}),
        },
      });
      toast.success(t("contentLibrary.updated"));
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("contentLibrary.updateFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("contentLibrary.editItem")}</DialogTitle>
        </DialogHeader>
        {item && (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">
                {t("contentLibrary.fieldTitle")}
              </span>
              <input
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
                required
                className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-muted-foreground">
                {isText ? t("contentLibrary.fieldText") : t("contentLibrary.fieldDescription")}
              </span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required={isText}
                rows={isText ? 10 : 6}
                className="mt-1.5 w-full rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus:border-primary/40"
              />
            </label>

            {isLink && (
              <label className="block">
                <span className="text-sm font-medium text-muted-foreground">
                  {t("contentLibrary.fieldUrl")}
                </span>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://..."
                  className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
                />
              </label>
            )}

            <div>
              <span className="text-sm font-medium text-muted-foreground">
                {t("contentLibrary.fieldColor")}
              </span>
              <div className="mt-1.5">
                <ColorSwatchPicker value={color} onChange={setColor} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemCard({
  item,
  canEdit,
  onEdit,
  onDelete,
}: {
  item: ContentLibraryItemRow;
  canEdit: boolean;
  onEdit: (item: ContentLibraryItemRow) => void;
  onDelete: (item: ContentLibraryItemRow) => void;
}) {
  const { t } = useI18n();
  const updateItem = useUpdateContentLibraryItem();
  const itemType = item.item_type as ContentLibraryItemType;
  const Icon = ITEM_TYPE_ICON[itemType] ?? FileIcon;
  const isImage = itemType === "image";
  const isText = itemType === "text";
  const isLink = itemType === "link";
  const tone = ITEM_TYPE_TONE[itemType] ?? ITEM_TYPE_TONE.file;
  const [showUrl, setShowUrl] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  const chosenColor = isCardColorName(item.color) ? item.color : null;
  const cardSurface = chosenColor
    ? CARD_COLOR_SURFACE[chosenColor]
    : isText
      ? "border-amber-200/70 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/[0.04]"
      : "border-border bg-surface";

  async function copyLink() {
    if (!item.url) return;
    try {
      await navigator.clipboard.writeText(item.url);
      toast.success(t("contentLibrary.linkCopied"));
    } catch {
      toast.error(t("contentLibrary.copyFailed"));
    }
  }

  async function setColor(color: string | null) {
    setColorPickerOpen(false);
    try {
      await updateItem.mutateAsync({
        id: item.id,
        section: item.section as ContentLibrarySection,
        patch: { color },
      });
    } catch (err) {
      toast.error(errorMessage(err, t("contentLibrary.updateFailed")));
    }
  }

  return (
    <li
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border p-4 shadow-soft transition-shadow hover:shadow-elevated",
        cardSurface,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tone)}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
          <span
            className={cn(
              "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              tone,
            )}
          >
            {t(TYPE_LABEL_KEY[itemType])}
          </span>
        </div>
      </div>

      {isImage && item.url && (
        <div className="rounded-2xl border-2 border-border bg-background p-1.5 shadow-inner">
          <img src={item.url} alt={item.title} className="h-52 w-full rounded-xl object-cover" />
        </div>
      )}

      {item.description && (
        <p
          className={cn(
            "whitespace-pre-wrap break-words text-sm leading-relaxed",
            isText ? "font-serif text-foreground" : "text-subtle",
          )}
        >
          {item.description}
        </p>
      )}

      {isLink && showUrl && item.url && (
        <p className="truncate rounded-lg bg-muted px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
          {item.url}
        </p>
      )}

      <div className="mt-auto flex items-center gap-1.5 border-t border-border/70 pt-3">
        {isLink && item.url ? (
          <>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("inbox.open")}
            </a>
            <button
              type="button"
              onClick={() => setShowUrl((v) => !v)}
              aria-label={t("contentLibrary.viewLink")}
              className={cn(
                "rounded-lg p-1.5 transition-colors hover:bg-accent hover:text-foreground",
                showUrl ? "text-foreground" : "text-subtle",
              )}
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void copyLink()}
              aria-label={t("contentLibrary.copyLink")}
              className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          !isText &&
          item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t("inbox.open")}
            </a>
          )
        )}
        {canEdit && (
          <div className="ml-auto flex items-center gap-1">
            <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t("contentLibrary.chooseColor")}
                  className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Palette className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-2">
                <p className="mb-2 text-[11px] font-medium text-subtle">
                  {t("contentLibrary.chooseColor")}
                </p>
                <ColorSwatchPicker
                  value={chosenColor}
                  onChange={(c) => void setColor(c)}
                  ringOffsetClassName="ring-offset-popover"
                />
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label={t("contentLibrary.editItem")}
              className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(item)}
              aria-label={t("contentLibrary.deleteConfirmTitle")}
              className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function ItemsShelf({
  section,
  title,
  description,
  canEdit,
}: {
  section: ContentLibrarySection;
  title: string;
  description: string;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const { data: items, isLoading } = useContentLibraryItems(section);
  const deleteItem = useDeleteContentLibraryItem();
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContentLibraryItemRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentLibraryItemRow | null>(null);

  async function confirmRemove() {
    if (!deleteTarget) return;
    try {
      await deleteItem.mutateAsync(deleteTarget.id);
      toast.success(t("contentLibrary.deleted"));
    } catch (err) {
      toast.error(errorMessage(err, t("contentLibrary.deleteFailed")));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <SectionCard
      title={title}
      description={description}
      actions={
        canEdit ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("contentLibrary.add")}
          </button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
      ) : (items ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">{t("contentLibrary.empty")}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(items ?? []).map((item) => {
            const itemType = item.item_type as ContentLibraryItemType;
            const Icon = ITEM_TYPE_ICON[itemType] ?? FileIcon;
            const isImage = itemType === "image";
            const isText = itemType === "text";
            const tone = ITEM_TYPE_TONE[itemType] ?? ITEM_TYPE_TONE.file;

            return (
              <li
                key={item.id}
                className="kpi-sheen group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft transition-shadow hover:shadow-elevated"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      tone,
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                    <span
                      className={cn(
                        "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        tone,
                      )}
                    >
                      {t(TYPE_LABEL_KEY[itemType])}
                    </span>
                  </div>
                </div>

                {isImage && item.url && (
                  <img
                    src={item.url}
                    alt={item.title}
                    className="h-36 w-full rounded-xl object-cover"
                  />
                )}

                {item.description && (
                  <p
                    className={cn(
                      "whitespace-pre-wrap break-words text-sm leading-relaxed",
                      isText ? "font-serif text-foreground" : "text-subtle",
                    )}
                  >
                    {item.description}
                  </p>
                )}

                <div className="mt-auto flex items-center gap-1.5 border-t border-border pt-3">
                  {!isText && item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t("inbox.open")}
                    </a>
                  )}
                  {canEdit && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setEditItem(item)}
                        aria-label={t("contentLibrary.editItem")}
                        className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(item)}
                        aria-label={t("contentLibrary.deleteConfirmTitle")}
                        className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        section={section}
        dialogTitle={title}
      />
      <EditItemDialog
        open={!!editItem}
        onOpenChange={(o) => !o && setEditItem(null)}
        item={editItem}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("contentLibrary.deleteConfirmTitle")}
        description={t("contentLibrary.deleteConfirmDesc")}
        onConfirm={() => void confirmRemove()}
      />
    </SectionCard>
  );
}

function AddLinkDialog({
  open,
  onOpenChange,
  section,
  dialogTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: ContentLibrarySection;
  dialogTitle: string;
}) {
  const { t } = useI18n();
  const createItem = useCreateContentLibraryItem();
  const [linkTitle, setLinkTitle] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setLinkTitle("");
    setUrl("");
    setColor(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!linkTitle.trim() || !url.trim()) return;
    setSaving(true);
    try {
      await createItem.mutateAsync({
        section,
        title: linkTitle,
        itemType: "link",
        url: url.trim(),
        color,
      });
      toast.success(t("contentLibrary.added"));
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t("contentLibrary.addFailed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("contentLibrary.fieldTitle")}
            </span>
            <input
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              placeholder={t("contentLibrary.sheetTitlePlaceholder")}
              required
              autoFocus
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-muted-foreground">
              {t("contentLibrary.fieldUrl")}
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              required
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            />
          </label>

          <div>
            <span className="text-sm font-medium text-muted-foreground">
              {t("contentLibrary.fieldColor")}
            </span>
            <div className="mt-1.5">
              <ColorSwatchPicker value={color} onChange={setColor} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("contentLibrary.add")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkRow({
  item,
  canEdit,
  onEdit,
  onDelete,
}: {
  item: ContentLibraryItemRow;
  canEdit: boolean;
  onEdit: (item: ContentLibraryItemRow) => void;
  onDelete: (item: ContentLibraryItemRow) => void;
}) {
  const { t } = useI18n();
  const updateItem = useUpdateContentLibraryItem();
  const [showUrl, setShowUrl] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const chosenColor = isCardColorName(item.color) ? item.color : null;

  async function copyLink() {
    if (!item.url) return;
    try {
      await navigator.clipboard.writeText(item.url);
      toast.success(t("contentLibrary.linkCopied"));
    } catch {
      toast.error(t("contentLibrary.copyFailed"));
    }
  }

  async function setColor(color: string | null) {
    setColorPickerOpen(false);
    try {
      await updateItem.mutateAsync({
        id: item.id,
        section: item.section as ContentLibrarySection,
        patch: { color },
      });
    } catch (err) {
      toast.error(errorMessage(err, t("contentLibrary.updateFailed")));
    }
  }

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-3.5 shadow-soft transition-shadow hover:shadow-elevated sm:flex-row sm:items-center sm:justify-between",
        chosenColor ? CARD_COLOR_SURFACE[chosenColor] : "border-border bg-surface",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
          <FileSpreadsheet className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
          {showUrl && item.url && (
            <p className="truncate font-mono text-[11px] text-muted-foreground">{item.url}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("inbox.open")}
          </a>
        )}
        <button
          type="button"
          onClick={() => setShowUrl((v) => !v)}
          aria-label={t("contentLibrary.viewLink")}
          className={cn(
            "rounded-lg p-1.5 transition-colors hover:bg-accent hover:text-foreground",
            showUrl ? "text-foreground" : "text-subtle",
          )}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          aria-label={t("contentLibrary.copyLink")}
          className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {canEdit && (
          <>
            <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={t("contentLibrary.chooseColor")}
                  className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Palette className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-2">
                <p className="mb-2 text-[11px] font-medium text-subtle">
                  {t("contentLibrary.chooseColor")}
                </p>
                <ColorSwatchPicker
                  value={chosenColor}
                  onChange={(c) => void setColor(c)}
                  ringOffsetClassName="ring-offset-popover"
                />
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label={t("contentLibrary.editItem")}
              className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(item)}
              aria-label={t("contentLibrary.deleteConfirmTitle")}
              className="rounded-lg p-1.5 text-subtle transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function LinksShelf({
  section,
  title,
  description,
  canEdit,
}: {
  section: ContentLibrarySection;
  title: string;
  description: string;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const { data: items, isLoading } = useContentLibraryItems(section);
  const deleteItem = useDeleteContentLibraryItem();
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<ContentLibraryItemRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentLibraryItemRow | null>(null);

  async function confirmRemove() {
    if (!deleteTarget) return;
    try {
      await deleteItem.mutateAsync(deleteTarget.id);
      toast.success(t("contentLibrary.deleted"));
    } catch (err) {
      toast.error(errorMessage(err, t("contentLibrary.deleteFailed")));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <SectionCard
      title={title}
      description={description}
      actions={
        canEdit ? (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-1.5 text-xs font-semibold text-subtle transition-colors hover:border-primary/40 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("contentLibrary.add")}
          </button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-subtle" />
      ) : (items ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-subtle">{t("contentLibrary.noSheetYet")}</p>
      ) : (
        <ul className="space-y-2">
          {(items ?? []).map((item) => (
            <LinkRow
              key={item.id}
              item={item}
              canEdit={canEdit}
              onEdit={setEditItem}
              onDelete={setDeleteTarget}
            />
          ))}
        </ul>
      )}
      <AddLinkDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        section={section}
        dialogTitle={title}
      />
      <EditItemDialog
        open={!!editItem}
        onOpenChange={(o) => !o && setEditItem(null)}
        item={editItem}
      />
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("contentLibrary.deleteConfirmTitle")}
        description={t("contentLibrary.deleteConfirmDesc")}
        onConfirm={() => void confirmRemove()}
      />
    </SectionCard>
  );
}

function ContentLibraryPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = user?.role === "super_admin";
  const isManager = user?.role === "super_admin" || user?.role === "rop";
  const { lesson: lessonParam } = Route.useSearch();
  // Sinfxona is an intern's main section: they land on their probation plan
  // (AI mentor + today's lessons); ROP/admins get an "Amaliyotchilar" tab.
  const isIntern = !!user?.isIntern;
  const [tab, setTab] = useState<
    "plan" | "interns" | "recommendations" | "lessons" | "objections" | "about"
  >(lessonParam ? "lessons" : isIntern ? "plan" : "recommendations");
  const [watchingLessonId, setWatchingLessonId] = useState<string | null>(lessonParam ?? null);

  return (
    <>
      <PageHeader
        icon={BookOpen}
        tone="amber"
        title={t("contentLibrary.title")}
        description={t("contentLibrary.desc")}
      />

      <div className="mb-6 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 phone-tabs shadow-soft">
        {isIntern && (
          <button
            type="button"
            onClick={() => setTab("plan")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
              tab === "plan"
                ? "bg-primary/10 text-primary ring-1 ring-primary/50"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <GraduationCap className="h-4 w-4" />
            {t("mentor.tabPlan")}
          </button>
        )}
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
          <Sparkles className="h-4 w-4" />
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
          <Play className="h-4 w-4" />
          {t("training.lessonsTitle")}
        </button>
        <button
          type="button"
          onClick={() => setTab("objections")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
            tab === "objections"
              ? "bg-primary/10 text-primary ring-1 ring-primary/50"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <ShieldQuestion className="h-4 w-4" />
          {t("objection.tab")}
        </button>
        <button
          type="button"
          onClick={() => setTab("about")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
            tab === "about"
              ? "bg-primary/10 text-primary ring-1 ring-primary/50"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Building2 className="h-4 w-4" />
          {t("contentLibrary.tabAbout")}
        </button>
        {isManager && (
          <button
            type="button"
            onClick={() => setTab("interns")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
              tab === "interns"
                ? "bg-primary/10 text-primary ring-1 ring-primary/50"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <GraduationCap className="h-4 w-4" />
            {t("mentor.tabInterns")}
          </button>
        )}
      </div>

      {tab === "plan" && user ? (
        <InternPlanPanel
          intern={{
            id: user.id,
            name: user.name,
            startDate: user.internshipStartDate,
            totalDays: user.internshipDays,
            telegramLinked: user.telegramLinked,
            groupLinked: user.internGroupLinked,
          }}
          self
          onOpenLesson={setWatchingLessonId}
        />
      ) : tab === "interns" ? (
        <InternsOverview onOpenLesson={setWatchingLessonId} />
      ) : tab === "recommendations" ? (
        <RecommendationsTab isManager={isManager} onWatch={setWatchingLessonId} />
      ) : tab === "lessons" ? (
        <LessonsTab isManager={isManager} onWatch={setWatchingLessonId} />
      ) : tab === "objections" ? (
        <ObjectionLibrary />
      ) : (
        <div className="space-y-5">
          <LinksShelf
            section="about_sheets"
            title={t("contentLibrary.aboutSheetsLabel")}
            description={t("contentLibrary.sheetsDesc")}
            canEdit={canEdit}
          />
          <ItemsShelf
            section="about_general"
            title={t("contentLibrary.generalTitle")}
            description={t("contentLibrary.generalDesc")}
            canEdit={canEdit}
          />
          <OrgStructureChart canEdit={false} editLink={canEdit} />
          <ItemsShelf
            section="about_regulation"
            title={t("contentLibrary.regulationTitle")}
            description={t("contentLibrary.regulationDesc")}
            canEdit={canEdit}
          />
        </div>
      )}

      <VideoPlayerModal lessonId={watchingLessonId} onClose={() => setWatchingLessonId(null)} />
    </>
  );
}

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

function ManagerAnalysisTab({ isManager }: { isManager: boolean }) {
  const { t } = useI18n();
  const { data: recommendations, isLoading } = useTrainingRecommendations();
  const { data: profiles } = useProfilesRaw();

  const profileById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of profiles ?? []) map.set(p.id, p.full_name || p.email || "");
    return map;
  }, [profiles]);

  const byManager = useMemo(() => {
    const map = new Map<string, TrainingRecommendationRow[]>();
    for (const r of recommendations ?? []) {
      const list = map.get(r.manager_id) ?? [];
      list.push(r);
      map.set(r.manager_id, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [recommendations]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SectionCard
      icon={Sparkles}
      tone="violet"
      title={t("training.tabAiAnalysis")}
      description={
        isManager ? t("training.managerAnalysisDesc") : t("training.managerAnalysisDescSelf")
      }
    >
      {byManager.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("training.noAnalysis")}</p>
      ) : (
        <div className="space-y-4">
          {byManager.map(([managerId, recs]) => (
            <ManagerAnalysisCard
              key={managerId}
              managerName={profileById.get(managerId) ?? ""}
              recs={recs}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ManagerAnalysisCard({
  managerName,
  recs,
}: {
  managerName: string;
  recs: TrainingRecommendationRow[];
}) {
  const { t } = useI18n();

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recs) counts.set(r.error_category, (counts.get(r.error_category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [recs]);

  const topCategory = categoryCounts[0];
  const recentFindings = useMemo(
    () =>
      [...recs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3),
    [recs],
  );

  return (
    <div className="kpi-sheen rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-foreground">{managerName}</h3>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {t("training.totalIssues", { count: recs.length })}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {categoryCounts.map(([category, count]) => (
          <span
            key={category}
            className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-foreground"
          >
            {t(`training.category.${category}`)} · {count}
          </span>
        ))}
      </div>

      {topCategory && (
        <p className="mt-3 text-sm text-muted-foreground">
          {t("training.conclusionMainIssue", {
            category: t(`training.category.${topCategory[0]}`),
            count: topCategory[1],
          })}
        </p>
      )}

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        {recentFindings.map((r) => (
          <div key={r.id}>
            <p className="text-sm font-medium text-foreground">{r.title}</p>
            <p className="text-xs text-muted-foreground">{r.description}</p>
          </div>
        ))}
      </div>
    </div>
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
    const total = recommendations?.length ?? 0;
    return [...counts.entries()]
      .map(([category, count]) => ({
        category,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [recommendations]);

  const percentByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of ranking) map.set(r.category, r.percent);
    return map;
  }, [ranking]);

  const sortedRecommendations = useMemo(
    () =>
      [...(recommendations ?? [])].sort(
        (a, b) =>
          (percentByCategory.get(b.error_category) ?? 0) -
          (percentByCategory.get(a.error_category) ?? 0),
      ),
    [recommendations, percentByCategory],
  );

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

  return (
    <div className="space-y-5">
      <ManagerAnalysisTab isManager={isManager} />
      {ranking.length > 0 && (
        <SectionCard
          icon={AlertTriangle}
          tone="rose"
          title={t("training.rankingTitle")}
          description={t("training.rankingDesc")}
        >
          <div className="space-y-2.5">
            {ranking.map(({ category, count, percent }) => (
              <div key={category} className="flex items-center gap-3">
                <span className="w-48 shrink-0 text-sm font-medium text-foreground">
                  {t(`training.category.${category}`)}
                </span>
                <div className="h-2.5 flex-1 rounded-full bg-accent">
                  <div className="h-2.5 rounded-full bg-primary" style={{ width: `${percent}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                  {percent}% ({t("training.timesReported", { count })})
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard
        icon={Lightbulb}
        tone="amber"
        title={t("training.recommendationsTitle")}
        description={t("training.recommendationsDesc")}
      >
        {!recommendations || recommendations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("training.noRecommendations")}
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sortedRecommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                managerName={profileById.get(rec.manager_id) ?? ""}
                showManagerName={isManager}
                importancePercent={percentByCategory.get(rec.error_category) ?? 0}
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
  importancePercent,
  lessonTitle,
  onWatch,
  onStatusChange,
}: {
  rec: TrainingRecommendationRow;
  managerName: string;
  showManagerName: boolean;
  importancePercent: number;
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
    <div className="kpi-sheen flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
            {t(`training.category.${rec.error_category}`)}
          </span>
          <span className="rounded-full bg-accent px-2 py-1 text-xs font-semibold text-muted-foreground">
            {importancePercent}%
          </span>
        </div>
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

function LessonCard({
  lesson,
  index,
  isManager,
  onWatch,
  progress,
  onStats,
  onEdit,
  onDelete,
}: {
  lesson: LessonRow;
  index: number;
  isManager: boolean;
  onWatch: (lessonId: string) => void;
  progress: LessonProgressRow | undefined;
  onStats: (lesson: LessonRow) => void;
  onEdit: (lesson: LessonRow) => void;
  onDelete: (lesson: LessonRow) => void;
}) {
  const { t } = useI18n();
  const percent =
    lesson.duration_seconds && progress
      ? Math.min(100, Math.round((progress.last_position_seconds / lesson.duration_seconds) * 100))
      : progress?.completed
        ? 100
        : 0;
  return (
    <div className="kpi-sheen group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
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
          #{index + 1}
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
        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">{lesson.title}</h3>
        {lesson.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">{lesson.description}</p>
        )}
        <div className="mt-auto h-1.5 w-full rounded-full bg-accent">
          <div className="h-1.5 rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        {isManager && (
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => onStats(lesson)}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              {t("training.statistics")}
            </button>
            <button
              type="button"
              onClick={() => onEdit(lesson)}
              aria-label={t("training.editLesson")}
              className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(lesson)}
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
}

// No sentinel row id: lessons with no section_id (or whose section was
// deleted, which sets it back to null) fall into this synthetic bucket
// instead of disappearing.
const UNGROUPED_SECTION_ID = "__ungrouped__";

function LessonsTab({
  isManager,
  onWatch,
}: {
  isManager: boolean;
  onWatch: (lessonId: string) => void;
}) {
  const { t } = useI18n();
  const { data: lessons, isLoading } = useLessons();
  const { data: sections } = useLessonSections();
  const { data: myProgress } = useMyLessonProgress();
  const deleteLesson = useDeleteLesson();
  const [addOpen, setAddOpen] = useState(false);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const [editLesson, setEditLesson] = useState<LessonRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LessonRow | null>(null);
  const [statsLesson, setStatsLesson] = useState<LessonRow | null>(null);

  const groups = useMemo(() => {
    const list = lessons ?? [];
    const bySection = new Map<string, LessonRow[]>();
    for (const lesson of list) {
      const key = lesson.section_id ?? UNGROUPED_SECTION_ID;
      const arr = bySection.get(key) ?? [];
      arr.push(lesson);
      bySection.set(key, arr);
    }
    const named = (sections ?? [])
      .map((s) => ({ id: s.id, title: s.title, lessons: bySection.get(s.id) ?? [] }))
      .filter((g) => g.lessons.length > 0);
    const ungrouped = bySection.get(UNGROUPED_SECTION_ID) ?? [];
    return ungrouped.length > 0
      ? [
          ...named,
          { id: UNGROUPED_SECTION_ID, title: t("training.ungroupedSection"), lessons: ungrouped },
        ]
      : named;
  }, [lessons, sections, t]);

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
      icon={PlayCircle}
      tone="sky"
      title={t("training.lessonsTitle")}
      description={t("training.lessonsDesc")}
      actions={
        isManager ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSectionsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-accent"
            >
              <FolderPlus className="h-4 w-4" />
              {t("training.manageSections")}
            </button>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              {t("training.addLesson")}
            </button>
          </div>
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
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.id}>
              <h4 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-subtle">
                {group.title}
                <span className="font-normal normal-case text-muted-foreground">
                  · {group.lessons.length}
                </span>
              </h4>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.lessons.map((lesson, i) => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    index={i}
                    isManager={isManager}
                    onWatch={onWatch}
                    progress={myProgress?.[lesson.id]}
                    onStats={setStatsLesson}
                    onEdit={setEditLesson}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <LessonFormDialog open={addOpen} onOpenChange={setAddOpen} />
      <LessonFormDialog
        open={!!editLesson}
        onOpenChange={(o) => !o && setEditLesson(null)}
        lesson={editLesson}
      />
      <SectionManagerDialog open={sectionsOpen} onOpenChange={setSectionsOpen} />
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

function SectionManagerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data: sections } = useLessonSections();
  const createSection = useCreateLessonSection();
  const updateSection = useUpdateLessonSection();
  const deleteSection = useDeleteLessonSection();
  const [newTitle, setNewTitle] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<LessonSectionRow | null>(null);
  const [saving, setSaving] = useState(false);

  async function addSection(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      await createSection.mutateAsync({
        organization_id: user!.organizationId!,
        created_by: user!.id,
        title,
        position: sections?.length ?? 0,
      });
      setNewTitle("");
    } catch (err) {
      toast.error(errorMessage(err, t("training.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function saveRename(id: string) {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    try {
      await updateSection.mutateAsync({ id, patch: { title } });
    } catch (err) {
      toast.error(errorMessage(err, t("training.saveFailed")));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteSection.mutateAsync(deleteTarget.id);
    } catch (err) {
      toast.error(errorMessage(err, t("training.saveFailed")));
    } finally {
      setDeleteTarget(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("training.manageSections")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => void addSection(e)} className="flex items-center gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t("training.sectionTitleLabel")}
            className="h-10 flex-1 rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
          />
          <button
            type="submit"
            disabled={saving || !newTitle.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {t("training.addSection")}
          </button>
        </form>

        {sections && sections.length > 0 && (
          <ul className="mt-1 divide-y divide-border">
            {sections.map((section) => (
              <li key={section.id} className="flex items-center gap-2 py-2">
                {renamingId === section.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void saveRename(section.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void saveRename(section.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="h-9 flex-1 rounded-lg border border-border bg-accent px-2 text-sm outline-none focus:border-primary/40"
                  />
                ) : (
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {section.title}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setRenamingId(section.id);
                    setRenameValue(section.title);
                  }}
                  aria-label={t("training.editSection")}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(section)}
                  aria-label={t("training.deleteSection")}
                  className="rounded-lg border border-border p-1.5 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t("training.deleteSectionConfirmTitle")}
        description={t("training.deleteSectionConfirmDesc")}
        onConfirm={() => void confirmDelete()}
      />
    </Dialog>
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
  const { data: sections } = useLessonSections();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [sectionId, setSectionId] = useState("");
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
    setSectionId(lesson?.section_id ?? "");
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
            section_id: sectionId || null,
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
          section_id: sectionId || null,
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
              {t("training.sectionTitleLabel")}
            </span>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-border bg-accent px-3 text-sm outline-none focus:border-primary/40"
            >
              <option value="">{t("training.ungroupedSection")}</option>
              {(sections ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
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
  // Furthest point this viewer has actually watched, in seconds. Dragging
  // the scrubber (or seeking via keyboard) past this is how "watched"
  // stats got gamed -- a manager could drop a video open, skip straight to
  // the end, and have it marked complete without watching a second of it.
  // Rewinding is always allowed (it can only lower a future max, never
  // raise it early), only jumping ahead of what's genuinely been played
  // is blocked.
  const maxWatchedRef = useRef(0);
  const [speed, setSpeed] = useState(1);

  const lesson = lessons?.find((l) => l.id === lessonId) ?? null;
  const startPosition = lessonId ? (myProgress?.[lessonId]?.last_position_seconds ?? 0) : 0;

  useEffect(() => {
    lastSavedRef.current = 0;
    maxWatchedRef.current = startPosition;
    setSpeed(1);
    // startPosition is derived from lessonId + myProgress; re-running this
    // whenever it changes would reset the just-built-up max mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  function saveProgress(completed: boolean) {
    if (!lessonId || !videoRef.current) return;
    const position = Math.floor(videoRef.current.currentTime);
    void upsertProgress.mutateAsync({ lessonId, lastPositionSeconds: position, completed });
  }

  // Two independent checks, not one: onSeeking/onSeeked alone turned out not
  // to be enough -- some browsers (notably mobile Safari, and Chrome's own
  // fullscreen scrubber in some versions) don't fire a "seeking" event for
  // every way a viewer can jump the playhead (dragging the native
  // fullscreen bar, OS-level skip gestures, remote-control/Cast seeks), so
  // a jump could land directly in a later timeupdate tick with no seeking
  // event ever observed. timeupdate itself fires steadily during playback
  // (multiple times a second), so checking there too is the backstop that
  // actually holds regardless of *how* the jump happened.
  function clampToWatched() {
    const video = videoRef.current;
    if (!video) return false;
    if (video.currentTime > maxWatchedRef.current + 0.5) {
      video.currentTime = maxWatchedRef.current;
      return true;
    }
    return false;
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    if (clampToWatched()) return;
    const now = video.currentTime;
    if (now > maxWatchedRef.current) maxWatchedRef.current = now;
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
              onSeeking={clampToWatched}
              onSeeked={clampToWatched}
              onPlay={clampToWatched}
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
