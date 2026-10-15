import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, UserPlus, X } from "lucide-react";
import type { LiveRegistration } from "@/hooks/use-automations";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Small see-through cards in the board's bottom-left corner while a client
// registers through a salesbot: who it is, how many of the bot's questions
// they have answered and their last answer. Each card shows for a few
// seconds and goes away; the client's next answer (or finishing) brings it
// back. A click opens the lead.

const SHOWN_MS = 6000;
const stampOf = (r: LiveRegistration) => `${r.runId}:${r.answered}:${r.done}`;

export function LiveRegistrationsPopup({ items }: { items: LiveRegistration[] }) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  // The cards sit at the content's left edge, beside the sidebar whatever
  // its width: an empty marker in the page measures where that edge is.
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [left, setLeft] = useState(16);
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const column = anchor?.parentElement;
    if (!anchor || !column) return;
    const measure = () => setLeft(Math.max(16, anchor.getBoundingClientRect().left));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(column);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // When this browser first saw each step of each registration.
  const [seen, setSeen] = useState<Record<string, number>>({});
  useEffect(() => {
    setSeen((prev) => {
      const fresh = items.filter((r) => !(stampOf(r) in prev));
      if (fresh.length === 0) return prev;
      const next = { ...prev };
      for (const r of fresh) next[stampOf(r)] = Date.now();
      return next;
    });
  }, [items]);

  const now = Date.now();
  const shown = items.filter((r) => {
    const at = seen[stampOf(r)];
    return at !== undefined && now - at < SHOWN_MS && !closed.has(stampOf(r));
  });
  // Re-render when the next card's time is up, so it goes away on time.
  const [, setTick] = useState(0);
  const nextExpiry = shown.length
    ? Math.min(...shown.map((r) => (seen[stampOf(r)] ?? now) + SHOWN_MS))
    : null;
  useEffect(() => {
    if (nextExpiry === null) return;
    const id = setTimeout(() => setTick((x) => x + 1), Math.max(50, nextExpiry - Date.now()));
    return () => clearTimeout(id);
  }, [nextExpiry]);
  return (
    <>
      <span ref={anchorRef} aria-hidden className="block h-0 w-0" />
      {shown.length > 0 && (
        <div
          className="pointer-events-none fixed bottom-5 z-[65] flex w-[min(340px,calc(100vw-32px))] flex-col-reverse gap-2"
          style={{ left }}
        >
          {shown.slice(0, 3).map((r) => (
            <RegistrationCard
              key={r.runId}
              reg={r}
              onClose={() => setClosed((prev) => new Set(prev).add(stampOf(r)))}
            />
          ))}
        </div>
      )}
    </>
  );
}

function RegistrationCard({ reg, onClose }: { reg: LiveRegistration; onClose: () => void }) {
  const { t } = useI18n();
  const [entered, setEntered] = useState(false);
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const pct = reg.total > 0 ? Math.round((reg.answered / reg.total) * 100) : reg.done ? 100 : 0;
  const line = reg.lastAnswer ?? (!reg.done ? reg.lastQuestion : null);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto relative overflow-hidden rounded-2xl border border-black/[0.06] bg-white/85 text-foreground shadow-[0_14px_34px_-12px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-200 ease-out motion-reduce:transition-none dark:border-white/[0.09] dark:bg-black/65",
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <Link
        to="/crm/leads/$leadId"
        params={{ leadId: reg.leadId }}
        search={{ from: "funnels" }}
        onClick={onClose}
        title={t("live.openLead")}
        className="flex items-center gap-3 py-2.5 pl-3 pr-9 transition-colors hover:bg-foreground/[0.04]"
      >
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400">
          {!reg.done && (
            <span className="absolute inset-0 animate-ping rounded-full bg-sky-500/25 motion-reduce:animate-none" />
          )}
          {reg.done ? (
            <CheckCircle2 className="relative h-4 w-4" />
          ) : (
            <UserPlus className="relative h-4 w-4" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
            {reg.done ? t("live.registered") : t("live.registering")}
            {reg.total > 0 && (
              <span className="tabular-nums">
                · {t("live.progress", { n: reg.answered, total: reg.total })}
              </span>
            )}
          </span>
          <span className="block truncate text-[14px] font-bold leading-tight">{reg.leadName}</span>
          {line && (
            <span className="block truncate text-[12px] text-foreground/75">
              {reg.lastAnswer ? `${t("live.lastAnswer")}: ` : `${t("live.question")}: `}
              {line}
            </span>
          )}
        </span>
      </Link>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {reg.total > 0 && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-foreground/10">
          <span
            className="block h-full bg-sky-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
    </div>
  );
}
