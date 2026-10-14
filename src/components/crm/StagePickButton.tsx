import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn, stageColorProps } from "@/lib/utils";
import type { StageRow } from "@/hooks/use-crm-data";

// A funnel's stage as a dropdown: the closed button shows the chosen stage
// with its colour and lead count, the arrow opens the funnel's stages in
// board order, each with its own colour.

export function StageDot({ stage, className }: { stage: StageRow; className?: string }) {
  const color = stage.is_won
    ? { className: "bg-success" }
    : stage.is_lost
      ? { className: "bg-destructive" }
      : stageColorProps(stage.color);
  return (
    <span
      className={cn(
        "h-2.5 w-2.5 shrink-0 rounded-full",
        color.className ?? (color.style ? "" : "bg-muted-foreground/40"),
        className,
      )}
      style={color.style}
    />
  );
}

export function StagePickButton({
  stages,
  value,
  counts,
  onChange,
  disabled,
  placeholder,
}: {
  stages: StageRow[];
  value: string | null;
  counts: Map<string, number>;
  onChange: (stageId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = stages.find((s) => s.id === value) ?? null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-11 w-full items-center gap-2.5 rounded-xl border bg-background px-3 text-left text-[14px] font-semibold transition-colors disabled:opacity-60",
            open
              ? "border-primary ring-2 ring-primary/15"
              : "border-border hover:border-primary/40",
          )}
        >
          {current ? (
            <>
              <StageDot stage={current} />
              <span className="min-w-0 flex-1 truncate text-foreground">{current.name}</span>
              <span className="shrink-0 rounded-full bg-foreground/[0.07] px-2 text-[12px] font-bold tabular-nums text-foreground">
                {counts.get(current.id) ?? 0}
              </span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate font-medium text-subtle">
              {placeholder ?? t("distrib.pickStage")}
            </span>
          )}
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-80 w-[var(--radix-popover-trigger-width)] overflow-y-auto p-1"
      >
        {stages.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onChange(s.id);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors hover:bg-accent",
              s.id === value && "bg-primary/[0.07] font-semibold",
            )}
          >
            <StageDot stage={s} />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
              {counts.get(s.id) ?? 0}
            </span>
            <Check
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-primary",
                s.id === value ? "opacity-100" : "opacity-0",
              )}
            />
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
