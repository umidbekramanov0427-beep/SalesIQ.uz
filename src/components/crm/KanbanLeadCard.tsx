import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Timer,
  Building2,
  CalendarClock,
  Clock,
  ExternalLink,
  Globe,
  Hash,
  Mail,
  Megaphone,
  Phone,
  Send,
  Thermometer,
  User,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { stamp } from "@/components/lead/amo-utils";
import { cardFieldLabel, cardFieldValue, type CardCtx } from "@/components/crm/kanban-card-fields";
import { CopyButton } from "@/components/ui/copy-button";
import { ClientAvatar, chatFileLabel } from "@/components/lead/ChatParts";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useNow } from "@/lib/use-now";
import { WATCH_HOURS, waitingBadge } from "@/lib/speed-to-lead";
import { nextPaymentState } from "@/lib/lead-payments/ledger";
import type { BoardLastMessage, CrmLeadView, KanbanCardLayout } from "@/hooks/use-crm-data";
import { TagChip } from "@/components/crm/tag-editor";

// One lead's card on the funnel board, laid out from the company's
// "Karta ko'rinishi" settings: number and created time, owner, the
// client's name, a contact line, tags, then amount and task status.

const FIELD_ICON: Record<string, LucideIcon> = {
  owner: User,
  contactName: User,
  phone: Phone,
  altPhone: Phone,
  email: Mail,
  telegram: Send,
  company: Building2,
  source: Globe,
  campaign: Megaphone,
  utm: Megaphone,
  temperature: Thermometer,
  amount: Wallet,
  budget: Wallet,
  created: CalendarClock,
  nextFollowUp: Clock,
  amocrmId: Hash,
};

// amoCRM's task marker: none planned (amber), overdue (red), upcoming (green).
function followUpState(iso: string | null): "none" | "overdue" | "planned" {
  if (!iso) return "none";
  return new Date(iso).getTime() < Date.now() ? "overdue" : "planned";
}

function IconLine({ id, children }: { id: string; children: ReactNode }) {
  const Icon = FIELD_ICON[id];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-subtle" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * The lead's number as people say and search it: the lead_number column
 * (migration 20261127000000), or until then a stable number derived from
 * the id.
 */
export function leadNumber(l: Pick<CrmLeadView, "id" | "leadNumber">): string {
  if (l.leadNumber) return String(l.leadNumber);
  return String(parseInt(l.id.replace(/-/g, "").slice(0, 8), 16) % 1_000_000).padStart(6, "0");
}

/** The exact moment the lead was made, "13.10.2026 14:05". */
function exactDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The card's date as amoCRM shows it: only the time for today's leads, else the day. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** What the client's unanswered message was, in one word. */
/**
 * Speed to lead: on a fresh open lead nobody has called or written to yet,
 * how long it has waited -- grey, amber after 5 minutes, red after 15.
 * Gone as soon as the first call or message is seen.
 */
function SpeedBadge({ lead }: { lead: CrmLeadView }) {
  const { t } = useI18n();
  const now = useNow();
  if (lead.firstContactAtIso !== null || lead.stageIsWon || lead.stageIsLost) return null;
  if ((lead.paidAmount ?? 0) > 0) return null;
  const created = new Date(lead.createdAtIso);
  if (now - created.getTime() > WATCH_HOURS * 3_600_000) return null;
  const { minutes, tone } = waitingBadge(created, new Date(now));
  const text =
    minutes < 60
      ? t("speed.minutes", { n: minutes })
      : t("speed.hours", { h: Math.floor(minutes / 60), m: minutes % 60 });
  return (
    <span
      title={t("speed.hint")}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-bold",
        tone === "late" && "animate-pulse bg-destructive/15 text-destructive",
        tone === "warn" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        tone === "calm" && "bg-foreground/[0.06] text-muted-foreground",
      )}
    >
      <Timer className="h-3 w-3" />
      {text}
    </span>
  );
}

function messageKindKey(fileKind: string | null): string {
  if (!fileKind) return "pipeline.msg.text";
  if (fileKind === "audio" || fileKind === "voice") return "pipeline.msg.audio";
  return "pipeline.msg.file";
}

export function KanbanLeadCard({
  lead: l,
  layout,
  ctx,
  amoLink,
  chat,
  preview = false,
}: {
  lead: CrmLeadView;
  layout: KanbanCardLayout;
  ctx: CardCtx;
  amoLink?: string | null;
  /** The lead's latest chat message and whether the client has a photo. */
  chat?: { last: BoardLastMessage | null; hasPhoto: boolean };
  // In the settings dialog: no links, no tag editing.
  preview?: boolean;
}) {
  const { t } = ctx;
  const val = (slot: keyof KanbanCardLayout) => {
    const id = layout[slot];
    return typeof id === "string" && id !== "none" ? cardFieldValue(l, id, ctx) : "";
  };

  // Top to bottom, every line starting at the same edge: #number and the
  // exact created time, the owner, the client's name (the biggest line),
  // the phone, tags with the "client wrote" bubble, then -- under a
  // hairline -- the amount and the task.
  const owner = val("top");
  const second = val("second");
  const title = val("title") || l.contactName || l.name;
  const line = val("line");
  const footer = val("footer");
  const task = followUpState(l.nextFollowUpIso);
  const footerIsMoney = layout.footer === "amount" || layout.footer === "budget";
  const waiting = layout.showLastMessage && chat?.last?.direction === "in" ? chat.last : null;
  const tags = layout.showTags ? l.tags : [];
  const tgRaw = (l.telegram ?? "")
    .trim()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/t\.me\//, "");
  const tgHandle = /^[A-Za-z0-9_]{3,64}$/.test(tgRaw) ? tgRaw : null;
  // Payments ledger: what the client still owes, and when the next payment is due.
  const debt =
    ctx.canViewRevenue && (l.paidAmount ?? 0) > 0 && l.budget > (l.paidAmount ?? 0)
      ? l.budget - (l.paidAmount ?? 0)
      : 0;
  const payDue = debt > 0 || !l.paidAmount ? nextPaymentState(l.nextPaymentDate, new Date()) : null;
  const titleClass = "min-w-0 truncate text-[14px] font-semibold leading-[19px] text-primary";
  const TopIcon = layout.top === "owner" ? UserRound : (FIELD_ICON[layout.top] ?? UserRound);
  const hasChips = tags.length > 0 || !!waiting || !!l.stream || debt > 0 || !!payDue;

  // amoCRM's compact card: the photo on the left; beside it the owner and
  // the created time on one line, the client's name, the phone; then one
  // line of chips; then the amount and the task marker.
  return (
    <div className="flex min-w-0 gap-2.5">
      {layout.showProfile && (
        <ClientAvatar
          leadId={l.id}
          name={l.contactName || l.name}
          hasPhoto={!preview && !!chat?.hasPhoto}
          blank
          className="h-9 w-9"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-muted-foreground">
          {owner ? (
            <span className="flex min-w-0 items-center gap-1 font-medium text-foreground/75">
              <TopIcon className="h-3 w-3 shrink-0 text-subtle" />
              <span className="truncate">{owner}</span>
            </span>
          ) : (
            <span className="font-mono">#{leadNumber(l)}</span>
          )}
          <span className="flex-1" />
          {!preview && <SpeedBadge lead={l} />}
          {l.repeatCount > 0 && (
            <span
              title={t("guard.repeatHint")}
              className="rounded bg-amber-500/15 px-1 text-[11px] font-bold text-amber-700 dark:text-amber-400"
            >
              ×{l.repeatCount + 1}
            </span>
          )}
          {amoLink && !preview && (
            <a
              href={amoLink}
              target="_blank"
              rel="noreferrer"
              title={t("leadFilter.openInAmoCrm")}
              onClick={(e) => e.stopPropagation()}
              className="hidden text-subtle hover:text-primary group-hover:inline-flex"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <span
            title={`#${leadNumber(l)} · ${exactDate(l.createdAtIso)}`}
            className="shrink-0 tabular-nums"
          >
            {shortDate(l.createdAtIso)}
          </span>
        </div>

        {preview ? (
          <p className={cn(titleClass, "mt-0.5 block")}>{title}</p>
        ) : (
          <Link
            to="/crm/leads/$leadId"
            params={{ leadId: l.id }}
            search={{ from: "funnels" }}
            onClick={(e) => e.stopPropagation()}
            className={cn(titleClass, "mt-0.5 block hover:underline")}
          >
            {title}
          </Link>
        )}
        {line && (
          <p className="flex min-w-0 items-center gap-0.5 text-[13px] leading-[18px] tabular-nums text-foreground/85">
            <span className="min-w-0 truncate">
              <IconLine id={layout.line}>{line}</IconLine>
            </span>
            {!preview && (layout.line === "phone" || layout.line === "altPhone") && (
              <CopyButton
                value={line}
                className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
              />
            )}
          </p>
        )}
        {/* The client's Telegram, when the bot or a manager saved it. */}
        {tgHandle && layout.line !== "telegram" && layout.second !== "telegram" && (
          <p className="flex min-w-0 items-center gap-1 text-[12px] leading-[17px]">
            <Send className="h-3 w-3 shrink-0 text-sky-500" />
            {preview ? (
              <span className="truncate text-sky-600 dark:text-sky-400">@{tgHandle}</span>
            ) : (
              <a
                href={`https://t.me/${tgHandle}`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="truncate text-sky-600 hover:underline dark:text-sky-400"
              >
                @{tgHandle}
              </a>
            )}
          </p>
        )}
        {second && (
          <p className="flex min-w-0 items-center gap-1 text-[12px] leading-[17px] text-muted-foreground">
            <span className="shrink-0">{cardFieldLabel(layout.second, ctx)}:</span>
            <span className="truncate text-foreground/75">{second}</span>
          </p>
        )}

        {/* Patok, payment state, the first tag (+N), and -- when the client
            wrote and nobody answered -- what it was. */}
        {hasChips && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1">
            {l.stream && (
              <span
                title={t("amo.field.stream")}
                className="shrink-0 rounded bg-primary/10 px-1.5 text-[11px] font-bold leading-[18px] text-primary"
              >
                {l.stream}
              </span>
            )}
            {debt > 0 && (
              <span
                title={t("ledger.remaining")}
                className="min-w-0 truncate rounded bg-amber-500/12 px-1.5 text-[11px] font-bold leading-[18px] tabular-nums text-amber-700 dark:text-amber-300"
              >
                {t("kanban.debt", { amount: ctx.format(debt) })}
              </span>
            )}
            {payDue && l.nextPaymentDate && (
              <span
                title={t("ledger.next")}
                className={cn(
                  "shrink-0 rounded px-1.5 text-[11px] font-bold leading-[18px] tabular-nums",
                  payDue === "overdue"
                    ? "bg-red-500/10 text-red-700 dark:text-red-300"
                    : payDue === "today"
                      ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                      : "bg-foreground/[0.06] text-muted-foreground",
                )}
              >
                {t("kanban.nextPay", {
                  date: `${l.nextPaymentDate.slice(8, 10)}.${l.nextPaymentDate.slice(5, 7)}`,
                })}
              </span>
            )}
            {tags[0] && <TagChip tag={tags[0]} size="xs" className="max-w-[60%]" />}
            {tags.length > 1 && (
              <span
                title={tags.slice(1).join(", ")}
                className="shrink-0 rounded border border-border px-1 text-[11px] font-medium leading-[16px] tabular-nums text-muted-foreground"
              >
                +{tags.length - 1}
              </span>
            )}
            {waiting && (
              <span
                title={
                  [
                    waiting.fileKind ? chatFileLabel(waiting.fileKind, waiting.fileName, t) : "",
                    waiting.text,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("pipeline.newMessage")
                }
                className="ml-auto shrink-0 rounded-[9px] rounded-bl-[3px] bg-sky-600 px-1.5 text-[11px] font-bold leading-[18px] text-white"
              >
                {t(messageKindKey(waiting.fileKind))}
              </span>
            )}
          </div>
        )}

        {(footer || layout.showTask) && (
          <div className="mt-1 flex min-w-0 items-center gap-2 text-[12px] leading-[18px]">
            {footer ? (
              <span
                className={cn(
                  "min-w-0 truncate tabular-nums",
                  footerIsMoney ? "font-semibold text-foreground/80" : "text-muted-foreground",
                )}
              >
                {footerIsMoney ? footer : <IconLine id={layout.footer}>{footer}</IconLine>}
              </span>
            ) : null}
            <span className="flex-1" />
            {layout.showTask && (
              <span
                title={
                  task === "overdue"
                    ? t("pipeline.taskOverdue")
                    : task === "planned"
                      ? t("pipeline.taskPlanned")
                      : t("pipeline.noTasks")
                }
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 font-semibold tabular-nums",
                  task === "overdue"
                    ? "text-red-600 dark:text-red-400"
                    : task === "planned"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400",
                )}
              >
                {task === "none" ? t("pipeline.noTasks") : stamp(l.nextFollowUpIso!, t)}
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    task === "overdue"
                      ? "bg-red-500"
                      : task === "planned"
                        ? "bg-emerald-500"
                        : "bg-amber-500",
                  )}
                />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
