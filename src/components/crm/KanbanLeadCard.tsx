import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarClock,
  Clock,
  ExternalLink,
  Globe,
  Hash,
  Mail,
  Megaphone,
  MessageCircle,
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
import { ClientAvatar, chatFileLabel } from "@/components/lead/ChatParts";
import { cn } from "@/lib/utils";
import type { BoardLastMessage, CrmLeadView, KanbanCardLayout } from "@/hooks/use-crm-data";

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
  whatsapp: MessageCircle,
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

/** What the client's unanswered message was, in one word. */
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
  const titleClass =
    "min-w-0 truncate text-[17px] font-extrabold leading-[22px] tracking-[-0.01em] text-foreground";

  return (
    <>
      <div className="flex items-center justify-between gap-2 text-[12px] tabular-nums text-muted-foreground">
        <span className="font-mono font-semibold tracking-wide">#{leadNumber(l)}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {l.repeatCount > 0 && (
            <span
              title={t("guard.repeatHint")}
              className="rounded-md bg-amber-500/15 px-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400"
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
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <span title={t("amo.field.created")} className="font-medium">
            {exactDate(l.createdAtIso)}
          </span>
        </span>
      </div>

      {/* The client's Telegram photo (a blank circle until there is one) at
          the left; the owner, the client's name and the phone centred in the
          card (an empty slot on the right balances the photo). */}
      <div className="mt-2 flex min-w-0 items-center gap-2">
        {layout.showProfile && (
          <ClientAvatar
            leadId={l.id}
            name={l.contactName || l.name}
            hasPhoto={!preview && !!chat?.hasPhoto}
            blank
            className="h-11 w-11"
          />
        )}
        <div className="min-w-0 flex-1 text-center">
          {owner && (
            <p className="flex min-w-0 items-center justify-center gap-1.5 text-[13.5px] font-bold text-foreground/85">
              {(() => {
                const Icon =
                  layout.top === "owner" ? UserRound : (FIELD_ICON[layout.top] ?? UserRound);
                return <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} />;
              })()}
              <span className="truncate">{owner}</span>
            </p>
          )}
          {preview ? (
            <p className={cn(titleClass, "mt-0.5 block")}>{title}</p>
          ) : (
            <Link
              to="/crm/leads/$leadId"
              params={{ leadId: l.id }}
              search={{ from: "funnels" }}
              onClick={(e) => e.stopPropagation()}
              className={cn(titleClass, "mt-0.5 block hover:text-primary")}
            >
              {title}
            </Link>
          )}
          {line && (
            <p className="mt-0.5 flex justify-center text-[13.5px] font-medium tabular-nums text-foreground/80">
              <IconLine id={layout.line}>{line}</IconLine>
            </p>
          )}
          {second && (
            <p className="mt-0.5 flex min-w-0 items-center justify-center gap-1 text-[12px] text-muted-foreground">
              <span className="shrink-0">{cardFieldLabel(layout.second, ctx)}:</span>
              <span className="truncate font-medium text-foreground/75">{second}</span>
            </p>
          )}
        </div>
        {layout.showProfile && <span aria-hidden className="h-11 w-11 shrink-0" />}
      </div>

      {/* The first tag, "+N" for the rest (all of them are in the lead),
          and -- when the client wrote and nobody answered -- what it was. */}
      {(tags.length > 0 || waiting) && (
        <div className="mt-2 flex min-w-0 items-center gap-1">
          {tags[0] && (
            <span className="min-w-0 max-w-[60%] truncate rounded-md bg-foreground/[0.06] px-1.5 py-px text-[11px] font-semibold text-muted-foreground">
              {tags[0]}
            </span>
          )}
          {tags.length > 1 && (
            <span
              title={tags.slice(1).join(", ")}
              className="shrink-0 rounded-md bg-foreground/[0.06] px-1.5 py-px text-[11px] font-bold tabular-nums text-muted-foreground"
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
              className="ml-auto shrink-0 rounded-[10px] rounded-bl-[3px] bg-sky-600 px-2 py-px text-[11px] font-bold text-white dark:bg-sky-600/90"
            >
              {t(messageKindKey(waiting.fileKind))}
            </span>
          )}
        </div>
      )}

      {(footer || layout.showTask) && (
        <div className="mt-2 flex items-center gap-2 border-t border-foreground/[0.07] pt-2">
          {footer ? (
            <span
              className={cn(
                "min-w-0 truncate tabular-nums",
                footerIsMoney
                  ? "text-[14px] font-extrabold text-foreground"
                  : "text-[12.5px] font-medium text-muted-foreground",
              )}
            >
              {footerIsMoney ? footer : <IconLine id={layout.footer}>{footer}</IconLine>}
            </span>
          ) : (
            <span />
          )}
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
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-bold tabular-nums",
                task === "overdue"
                  ? "bg-red-500/10 text-red-700 dark:text-red-300"
                  : task === "planned"
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/12 text-amber-700 dark:text-amber-400",
              )}
            >
              {task === "none" ? (
                <Clock className="h-3.5 w-3.5" />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" />
              )}
              {task === "none" ? t("pipeline.noTasks") : stamp(l.nextFollowUpIso!, t)}
            </span>
          )}
        </div>
      )}
    </>
  );
}
