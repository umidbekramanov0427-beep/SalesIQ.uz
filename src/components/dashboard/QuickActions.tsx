import { useState } from "react";
import { Building2, CalendarPlus, Phone, Plus, Send, UserPlus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

const ACTIONS = [
  { key: "qa.createLead", icon: UserPlus },
  { key: "qa.createCompany", icon: Building2 },
  { key: "qa.createTask", icon: CalendarPlus },
  { key: "qa.createEmployee", icon: Users },
  { key: "qa.scheduleCall", icon: Phone },
  { key: "qa.sendTelegram", icon: Send },
] as const;

export function QuickActions() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
      {open && (
        <div className="animate-in fade-in slide-in-from-bottom-2 w-56 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-elevated duration-200">
          {ACTIONS.map((a) => (
            <button
              key={a.key}
              onClick={() => {
                setOpen(false);
                toast.success(t(a.key), { description: t("qa.triggered") });
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <a.icon className="h-4 w-4 text-muted-foreground" />
              {t(a.key)}
            </button>
          ))}
        </div>
      )}

      <button
        aria-label={open ? t("qa.close") : t("qa.open")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elevated transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Plus className={cn("h-6 w-6 transition-transform duration-200", open && "rotate-45")} />
        <X className="hidden" />
      </button>
    </div>
  );
}
