import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlarmClockOff, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// amoCRM's "Просроченная задача": the moment one of my tasks passes its
// deadline a card slides in at the bottom left, next to the menu, and the
// bell's count goes up. The database hands each overdue task out once
// (claim_overdue_tasks), so several open tabs don't all pop the same one.

type OverdueAlert = {
  key: string;
  taskId: string;
  title: string;
  leadId: string | null;
  leadName: string | null;
};

const CHECK_EVERY_MS = 30_000;
const SHOW_FOR_MS = 12_000;

export function OverdueTaskAlerts({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const [alerts, setAlerts] = useState<OverdueAlert[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    // Until the migration is applied the function doesn't exist; stop asking.
    let unavailable = false;
    async function check() {
      if (stopped || unavailable || document.visibilityState !== "visible") return;
      const { data, error } = await supabase.rpc("claim_overdue_tasks");
      if (error) {
        if (/claim_overdue_tasks|function|schema cache/i.test(error.message)) unavailable = true;
        return;
      }
      if (stopped || !data?.length) return;
      const now = Date.now();
      setAlerts((prev) =>
        [
          ...data.map((r) => ({
            key: `${r.task_id}-${now}`,
            taskId: r.task_id,
            title: r.title,
            leadId: r.lead_id,
            leadName: r.lead_name,
          })),
          ...prev,
        ].slice(0, 4),
      );
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    }
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, qc]);

  if (alerts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-20 left-3 z-[60] flex w-[min(340px,calc(100vw-24px))] flex-col-reverse gap-2 lg:bottom-5 lg:left-[84px]">
      {alerts.map((a) => (
        <AlertCard
          key={a.key}
          alert={a}
          onClose={() => setAlerts((prev) => prev.filter((x) => x.key !== a.key))}
        />
      ))}
    </div>
  );
}

export function AlertCard({ alert, onClose }: { alert: OverdueAlert; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [shown, setShown] = useState(false);
  const [hover, setHover] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  // Fades away on its own, but not while the pointer rests on it.
  useEffect(() => {
    if (hover) return;
    const id = setTimeout(() => {
      setShown(false);
      setTimeout(() => closeRef.current(), 250);
    }, SHOW_FOR_MS);
    return () => clearTimeout(id);
  }, [hover]);

  function open() {
    onClose();
    if (alert.leadId) {
      void navigate({ to: "/crm/leads/$leadId", params: { leadId: alert.leadId } });
    } else {
      void navigate({ to: "/funnels", search: { view: "tasks" } });
    }
  }

  return (
    <div
      role="alert"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "pointer-events-auto relative flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-popover p-3 pr-8 text-popover-foreground shadow-[0_12px_32px_rgba(0,0,0,0.28)] transition-all duration-200 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
      onClick={open}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-destructive/15 text-destructive">
        <AlarmClockOff className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-tight">{t("overdue.title")}</p>
        {alert.leadName && (
          <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight">
            {t("overdue.lead", { name: alert.leadName })}
          </p>
        )}
        <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{alert.title}</p>
      </div>
      <button
        type="button"
        aria-label={t("overdue.close")}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded text-subtle hover:bg-accent hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
