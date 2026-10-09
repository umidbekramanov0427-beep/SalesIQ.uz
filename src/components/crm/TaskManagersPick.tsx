import { Check, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useProfilesRaw } from "@/hooks/use-crm-data";

/** Who the "task required" rule applies to: everyone, or the chosen managers. */
export function TaskManagersPick({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useI18n();
  const { data: profiles = [] } = useProfilesRaw();
  const people = profiles
    .filter((p) => ["sotuv_menejeri", "rop", "super_admin", "intern"].includes(p.role))
    .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
  const chosen = new Set(value);
  const label =
    value.length === 0 ? t("guard.rule.everyone") : t("guard.rule.some", { count: value.length });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:border-primary/50"
        >
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          {t("guard.rule.for")}: {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <button
          type="button"
          onClick={() => onChange([])}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent"
        >
          <Check className={cn("h-3.5 w-3.5", value.length === 0 ? "opacity-100" : "opacity-0")} />
          {t("guard.rule.everyone")}
        </button>
        <div className="my-1 h-px bg-border" />
        <div className="max-h-64 overflow-y-auto">
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                const next = new Set(chosen);
                if (next.has(p.id)) next.delete(p.id);
                else next.add(p.id);
                onChange([...next]);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-accent"
            >
              <Check
                className={cn("h-3.5 w-3.5", chosen.has(p.id) ? "opacity-100" : "opacity-0")}
              />
              <span className="truncate">{p.full_name || p.email}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
