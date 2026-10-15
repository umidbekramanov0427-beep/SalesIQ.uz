import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, UserPlus, X } from "lucide-react";
import type { LiveRegistration } from "@/hooks/use-automations";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Pop-ups on the funnel board while a client registers through a salesbot:
// who it is, how many of the bot's questions they have answered, and their
// last answer -- updated every few seconds, then "registered" for a minute.

const DONE_SHOWN_MS = 60_000;

export function LiveRegistrationsPopup({ items }: { items: LiveRegistration[] }) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const now = Date.now();
  const shown = items.filter(
    (r) =>
      !closed.has(`${r.runId}:${r.done}`) &&
      (!r.done || now - new Date(r.updatedAt).getTime() < DONE_SHOWN_MS),
  );
  if (shown.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-36 z-[65] flex w-[min(340px,calc(100vw-32px))] flex-col gap-2.5">
      {shown.slice(0, 3).map((r) => (
        <RegistrationCard
          key={r.runId}
          reg={r}
          onClose={() => setClosed((prev) => new Set(prev).add(`${r.runId}:${r.done}`))}
        />
      ))}
    </div>
  );
}

function RegistrationCard({ reg, onClose }: { reg: LiveRegistration; onClose: () => void }) {
  const { t } = useI18n();
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const pct = reg.total > 0 ? Math.round((reg.answered / reg.total) * 100) : reg.done ? 100 : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-2xl border border-border bg-popover p-4 pr-10 text-popover-foreground shadow-[0_18px_44px_-12px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out motion-reduce:transition-none",
        entered ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-emerald-500" />
      <div className="flex items-center gap-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
          {!reg.done && (
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/40 motion-reduce:animate-none" />
          )}
          {reg.done ? (
            <CheckCircle2 className="relative h-5 w-5" />
          ) : (
            <UserPlus className="relative h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            {reg.done ? t("live.registered") : t("live.registering")}
          </p>
          <p className="truncate text-[15px] font-semibold leading-tight">{reg.leadName}</p>
          <p className="truncate text-[12px] text-muted-foreground">{reg.botName}</p>
        </div>
      </div>

      {reg.total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[12px] font-semibold tabular-nums">
            <span className="text-muted-foreground">{t("live.answers")}</span>
            <span>{t("live.progress", { n: reg.answered, total: reg.total })}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {(reg.lastAnswer || (!reg.done && reg.lastQuestion)) && (
        <p className="mt-2.5 line-clamp-2 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[12.5px] leading-snug">
          <span className="font-semibold text-muted-foreground">
            {reg.lastAnswer ? t("live.lastAnswer") : t("live.question")}:{" "}
          </span>
          {reg.lastAnswer ?? reg.lastQuestion}
        </p>
      )}

      <Link
        to="/crm/leads/$leadId"
        params={{ leadId: reg.leadId }}
        search={{ from: "funnels" }}
        onClick={onClose}
        className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        {t("live.openLead")}
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute right-2.5 top-3 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
