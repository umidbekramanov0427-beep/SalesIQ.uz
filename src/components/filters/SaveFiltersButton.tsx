import { BookmarkCheck, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The filter bar's "Saqlash": shows once the filters differ from what is
// saved (or from the defaults); with the saved filters in use it turns
// into a small "Saqlangan" chip whose x forgets them. See useSavedFilters.
export function SaveFiltersButton({
  changed,
  saved,
  onSave,
  onForget,
  className,
}: {
  changed: boolean;
  saved: boolean;
  onSave: () => void;
  onForget: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const base =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold transition-colors sm:h-11 sm:px-4 sm:text-[13px] phone:h-[54px] phone:flex-1 phone:basis-[calc(50%-8px)] phone:rounded-2xl phone:text-sm";
  if (changed) {
    return (
      <button
        type="button"
        onClick={() => {
          onSave();
          toast.success(t("filters.savedToast"));
        }}
        className={cn(base, "bg-primary text-primary-foreground hover:opacity-90", className)}
      >
        <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        {t("filters.save")}
      </button>
    );
  }
  if (!saved) return null;
  return (
    <span
      className={cn(
        base,
        "border border-success/30 bg-success/10 pr-1.5 text-success sm:pr-2",
        className,
      )}
    >
      <BookmarkCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      {t("filters.saved")}
      <button
        type="button"
        onClick={onForget}
        title={t("filters.forget")}
        aria-label={t("filters.forget")}
        className="ml-0.5 grid h-6 w-6 place-items-center rounded-lg hover:bg-success/15"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
