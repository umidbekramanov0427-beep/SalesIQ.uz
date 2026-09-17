import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AlignLeft,
  Building2,
  Copy,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Link2,
  Loader2,
  Music2,
  Palette,
  Pencil,
  Plus,
  Trash2,
  Video as VideoIcon,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/layout/Primitives";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OrgStructureChart } from "@/components/content-library/OrgStructureChart";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useContentLibraryItems,
  useCreateContentLibraryItem,
  useDeleteContentLibraryItem,
  useUpdateContentLibraryItem,
  useUploadContentLibraryFile,
  type ContentLibraryItemRow,
  type ContentLibraryItemType,
  type ContentLibrarySection,
} from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft transition-shadow hover:shadow-elevated"
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
  const [tab, setTab] = useState<"about" | "training">("about");

  return (
    <>
      <PageHeader title={t("contentLibrary.title")} description={t("contentLibrary.desc")} />

      <div className="mb-6 inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-soft">
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
        <button
          type="button"
          onClick={() => setTab("training")}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors",
            tab === "training"
              ? "bg-primary/10 text-primary ring-1 ring-primary/50"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <GraduationCap className="h-4 w-4" />
          {t("contentLibrary.tabTraining")}
        </button>
      </div>

      {tab === "about" ? (
        <div className="space-y-6">
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
          <OrgStructureChart canEdit={canEdit} />
          <ItemsShelf
            section="about_regulation"
            title={t("contentLibrary.regulationTitle")}
            description={t("contentLibrary.regulationDesc")}
            canEdit={canEdit}
          />
        </div>
      ) : (
        <div className="space-y-6">
          <LinksShelf
            section="training_sheets"
            title={t("contentLibrary.trainingSheetsLabel")}
            description={t("contentLibrary.sheetsDesc")}
            canEdit={canEdit}
          />
          <ItemsShelf
            section="training"
            title={t("contentLibrary.trainingTitle")}
            description={t("contentLibrary.trainingDesc")}
            canEdit={canEdit}
          />
        </div>
      )}
    </>
  );
}
