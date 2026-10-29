import { useState, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useUpdateLead } from "@/hooks/use-crm-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Every tag keeps one colour everywhere (lead card, kanban card, lists),
// picked from its name: a tinted chip with a solid dot, readable on the
// light and the dark lead card alike.
const TAG_TONES = [
  { chip: "bg-sky-500/12 text-sky-800 border-sky-500/35 dark:text-sky-200", dot: "bg-sky-500" },
  {
    chip: "bg-violet-500/12 text-violet-800 border-violet-500/35 dark:text-violet-200",
    dot: "bg-violet-500",
  },
  {
    chip: "bg-emerald-500/12 text-emerald-800 border-emerald-500/35 dark:text-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    chip: "bg-amber-500/15 text-amber-800 border-amber-500/40 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  {
    chip: "bg-rose-500/12 text-rose-800 border-rose-500/35 dark:text-rose-200",
    dot: "bg-rose-500",
  },
  {
    chip: "bg-teal-500/12 text-teal-800 border-teal-500/35 dark:text-teal-200",
    dot: "bg-teal-500",
  },
  {
    chip: "bg-indigo-500/12 text-indigo-800 border-indigo-500/35 dark:text-indigo-200",
    dot: "bg-indigo-500",
  },
  {
    chip: "bg-orange-500/12 text-orange-800 border-orange-500/35 dark:text-orange-200",
    dot: "bg-orange-500",
  },
] as const;

export function tagTone(tag: string) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_TONES[hash % TAG_TONES.length]!;
}

export function TagChip({
  tag,
  size = "sm",
  onRemove,
  removeLabel,
  className,
}: {
  tag: string;
  size?: "md" | "sm" | "xs";
  /** Shows an x on hover that removes the tag. */
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}) {
  const tone = tagTone(tag);
  return (
    <span
      title={tag}
      className={cn(
        "group/tag inline-flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-md border font-semibold",
        size === "md"
          ? "h-7 px-2.5 text-[12.5px]"
          : size === "sm"
            ? "h-6 px-2 text-[11.5px]"
            : "h-[18px] gap-1 px-1.5 text-[10.5px]",
        tone.chip,
        className,
      )}
    >
      <span
        className={cn("shrink-0 rounded-full", size === "xs" ? "h-1.5 w-1.5" : "h-2 w-2", tone.dot)}
      />
      <span className="truncate">{tag}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="-mr-1 hidden h-4 w-4 shrink-0 place-items-center rounded opacity-70 hover:bg-black/10 hover:opacity-100 group-hover/tag:grid dark:hover:bg-white/15"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function TagEditor({
  leadId,
  tags,
  editable = true,
  emptyLabel,
}: {
  leadId: string;
  tags: string[];
  editable?: boolean;
  emptyLabel?: string;
}) {
  const { t } = useI18n();
  const updateLead = useUpdateLead();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  async function save(next: string[]) {
    try {
      await updateLead.mutateAsync({ id: leadId, patch: { tags: next } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tags.updateFailed"));
    }
  }

  function addTag() {
    const value = draft.trim();
    if (!value) return;
    if (!tags.includes(value)) void save([...tags, value]);
    setDraft("");
    setOpen(false);
  }

  function removeTag(tag: string) {
    void save(tags.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Escape") {
      setDraft("");
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.length === 0 && !editable && (
        <p className="text-sm text-subtle">{emptyLabel ?? t("tags.noTags")}</p>
      )}
      {tags.map((tag) =>
        editable ? (
          <TagChip
            key={tag}
            tag={tag}
            onRemove={() => removeTag(tag)}
            removeLabel={t("tags.remove", { tag })}
          />
        ) : (
          <TagChip key={tag} tag={tag} />
        ),
      )}
      {editable && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-6 items-center gap-1 rounded-md border border-dashed border-border px-2 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
            >
              <Plus className="h-3 w-3" /> {t("tags.addTag")}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-56 p-2"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t("tags.newTagPlaceholder")}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary/40"
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
