import { useState, type MouseEvent } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * A small icon button that copies `value`: a tick for a moment and a
 * "Nusxalandi" toast. Stops the click so it works inside clickable cards
 * (a funnel card opens its lead otherwise).
 */
export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  function copy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void navigator.clipboard?.writeText(value).then(
      () => {
        setDone(true);
        toast.success(t("amo.copied"));
        setTimeout(() => setDone(false), 1200);
      },
      () => undefined,
    );
  }
  const text = label ?? t("amo.phone.copy");
  return (
    <button
      type="button"
      onClick={copy}
      onPointerDown={(e) => e.stopPropagation()}
      title={text}
      aria-label={text}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary",
        className,
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
