import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, Phone, PhoneCall } from "lucide-react";
import { usePhone } from "@/components/phone/PhoneProvider";
import { useCallQueue, useProfilesRaw } from "@/hooks/use-crm-data";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { QueueItem, QueueReason } from "@/lib/call-queue";

// "Qo'ng'iroq navbati" under Lid tahlili's "Bugun nima qilish kerak?": a
// folded button that opens who to call first, most urgent at the top, each
// with why and a one-click call through the company's PBX (or the phone's
// own dialer without one). Ranking: src/lib/call-queue.ts.

const SHOWN = 10;

const REASON_TONE: Record<QueueReason["kind"], string> = {
  new: "bg-destructive/12 text-destructive",
  unanswered: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  overdue: "bg-red-500/10 text-red-700 dark:text-red-300",
  payment: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  today: "bg-primary/10 text-primary",
  hot: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
  silent: "bg-foreground/[0.06] text-muted-foreground",
};

function useReasonText() {
  const { t } = useI18n();
  const span = (min: number) =>
    min < 60
      ? t("speed.minutes", { n: min })
      : min < 1440
        ? t("speed.hours", { h: Math.floor(min / 60), m: min % 60 })
        : t("queue.days", { n: String(Math.floor(min / 1440)) });
  return (r: QueueReason): string => {
    switch (r.kind) {
      case "new":
        return t("queue.new", { time: span(r.minutes) });
      case "unanswered":
        return t("queue.unanswered", { time: span(r.minutes) });
      case "overdue":
        return t("queue.overdue", {
          time:
            r.hours < 1
              ? span(0)
              : r.hours < 24
                ? t("queue.hours", { n: String(r.hours) })
                : t("queue.days", { n: String(Math.floor(r.hours / 24)) }),
        });
      case "payment":
        return t(r.overdue ? "queue.paymentOverdue" : "queue.paymentToday");
      case "today":
        return t("queue.today");
      case "hot":
        return r.score != null ? t("queue.hotScore", { n: String(r.score) }) : t("queue.hot");
      case "silent":
        return t("queue.silent", { n: String(r.days) });
    }
  };
}

function Row({ item, index, owner }: { item: QueueItem; index: number; owner: string | null }) {
  const { t } = useI18n();
  const phone = usePhone();
  const reasonText = useReasonText();
  const { lead } = item;
  return (
    <li className="flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-accent/40">
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-extrabold tabular-nums",
          index === 0
            ? "bg-primary text-primary-foreground"
            : "bg-foreground/[0.06] text-muted-foreground",
        )}
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to="/crm/leads/$leadId"
            params={{ leadId: lead.id }}
            search={{ from: "funnels" }}
            className="min-w-0 truncate text-[13px] font-bold text-foreground hover:text-primary"
          >
            {lead.name}
          </Link>
          {owner && (
            <span className="hidden shrink-0 truncate text-[11.5px] text-muted-foreground sm:inline">
              · {owner}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {item.reasons.slice(0, 3).map((r, i) => (
            <span
              key={i}
              className={cn("rounded px-1.5 py-px text-[10.5px] font-bold", REASON_TONE[r.kind])}
            >
              {reasonText(r)}
            </span>
          ))}
        </div>
      </div>
      {lead.phone ? (
        phone.enabled ? (
          <button
            type="button"
            disabled={!!phone.live}
            onClick={() => phone.call(lead.phone!, { leadId: lead.id, name: lead.name })}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Phone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("queue.call")}</span>
          </button>
        ) : (
          <a
            href={`tel:${lead.phone}`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
          >
            <Phone className="h-3.5 w-3.5" />
            <span className="hidden tabular-nums sm:inline">{lead.phone}</span>
          </a>
        )
      ) : (
        <Link
          to="/crm/leads/$leadId"
          params={{ leadId: lead.id }}
          search={{ from: "funnels" }}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-[12px] font-semibold text-foreground hover:bg-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t("queue.open")}</span>
        </Link>
      )}
    </li>
  );
}

export function CallQueueToggle() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { data } = useCallQueue();
  const { data: profiles } = useProfilesRaw();
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const names = useMemo(
    () => new Map((profiles ?? []).map((p) => [p.id, p.full_name])),
    [profiles],
  );
  const total = data?.total ?? 0;
  const isRep = user?.role === "sotuv_menejeri";
  const items = data ? (all ? data.items : data.items.slice(0, SHOWN)) : [];
  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={total === 0}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/40 disabled:cursor-default disabled:hover:bg-transparent"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
          <PhoneCall className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold text-foreground">{t("queue.title")}</span>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {total === 0 ? t("queue.empty") : t("queue.desc")}
          </span>
        </span>
        <span className="shrink-0 rounded-md bg-foreground/[0.06] px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-muted-foreground">
          {t("queue.total", { n: String(total) })}
        </span>
        {total > 0 && (
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>
      {open && data && data.items.length > 0 && (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {items.map((item, i) => (
              <Row
                key={item.lead.id}
                item={item}
                index={i}
                owner={!isRep && item.lead.ownerId ? (names.get(item.lead.ownerId) ?? null) : null}
              />
            ))}
          </ul>
          {data.items.length > SHOWN && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-[12px] font-semibold text-primary hover:bg-accent/40"
            >
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", all && "rotate-180")}
              />
              {all ? t("queue.less") : t("queue.more", { n: String(data.items.length - SHOWN) })}
            </button>
          )}
        </>
      )}
    </div>
  );
}
