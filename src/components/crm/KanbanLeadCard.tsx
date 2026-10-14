import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Building2,
  CalendarClock,
  CalendarDays,
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
import {
  cardFieldLabel,
  cardFieldValue,
  shortDate,
  type CardCtx,
} from "@/components/crm/kanban-card-fields";
import { TagEditor } from "@/components/crm/tag-editor";
import { ClientAvatar, chatFileLabel } from "@/components/lead/ChatParts";
import { cn } from "@/lib/utils";
import type { BoardLastMessage, CrmLeadView, KanbanCardLayout } from "@/hooks/use-crm-data";

// One lead's card on the funnel board, laid out from the company's
// "Karta ko'rinishi" settings: owner on top, one chosen field, the
// client's name, a contact line, then amount and task status.

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

  const top = val("top");
  const second = val("second");
  const title = val("title") || l.company || l.name;
  const line = val("line");
  const footer = val("footer");
  const task = followUpState(l.nextFollowUpIso);
  const date = layout.showDate ? shortDate(l.createdAtIso, t) : "";
  const footerIsMoney = layout.footer === "amount" || layout.footer === "budget";

  const ownerTop = layout.top === "owner";
  // Same anatomy as the funnel's task cards: name + ID on top, one quiet
  // line under it, a meta row (contact, owner, created), then amount and
  // the task chip.
  const titleClass = "min-w-0 flex-1 truncate text-[14.5px] font-bold leading-5 text-foreground";

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        {layout.showProfile && (
          <ClientAvatar
            leadId={l.id}
            name={l.contactName || l.name}
            hasPhoto={!preview && !!chat?.hasPhoto}
            className="-my-0.5 h-8 w-8 text-[12px]"
          />
        )}
        {preview ? (
          <p className={titleClass}>{title}</p>
        ) : (
          <Link
            to="/crm/leads/$leadId"
            params={{ leadId: l.id }}
            search={{ from: "funnels" }}
            onClick={(e) => e.stopPropagation()}
            className={cn(titleClass, "hover:text-primary")}
          >
            {title}
          </Link>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {l.repeatCount > 0 && (
            <span
              title={t("guard.repeatHint")}
              className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-amber-700 dark:text-amber-400"
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
              className="hidden rounded-md p-0.5 text-subtle hover:text-primary group-hover:inline-flex"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
            ID {l.id.slice(0, 8)}
          </span>
        </span>
      </div>

      {second && (
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px]">
          <span className="shrink-0 text-muted-foreground">
            {cardFieldLabel(layout.second, ctx)}:
          </span>
          <span className="truncate font-semibold text-foreground/85">{second}</span>
        </p>
      )}

      {(line || top || date) && (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums text-muted-foreground">
          {line && (
            <span className="min-w-0 max-w-full">
              <IconLine id={layout.line}>{line}</IconLine>
            </span>
          )}
          {top && (
            <span className="min-w-0 max-w-full">
              {ownerTop ? (
                <span className="flex min-w-0 items-center gap-1">
                  <UserRound className="h-3.5 w-3.5 shrink-0 text-subtle" />
                  <span className="truncate">{top}</span>
                </span>
              ) : (
                <IconLine id={layout.top}>{top}</IconLine>
              )}
            </span>
          )}
          {date && (
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-subtle" />
              {date}
            </span>
          )}
        </div>
      )}

      {layout.showTags &&
        (preview ? (
          l.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {l.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2 text-[11px] leading-5 text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )
        ) : (
          // Tags are edited right on the card. Clicks (also from the add-tag
          // popover, which React bubbles through the portal) stop here so
          // they don't open the lead.
          <div
            className="mt-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <TagEditor leadId={l.id} tags={l.tags} />
          </div>
        ))}

      {/* The client wrote and nobody has answered yet (amoCRM's bubble). */}
      {layout.showLastMessage && chat?.last?.direction === "in" && (
        <div className="mt-2.5 flex items-end gap-1.5">
          <ClientAvatar
            leadId={l.id}
            name={l.contactName || l.name}
            hasPhoto={!!chat.hasPhoto}
            className="h-6 w-6 text-[10px]"
          />
          <p
            title={chat.last.text || undefined}
            className="line-clamp-2 min-w-0 rounded-2xl rounded-bl-md bg-sky-600 px-2.5 py-1 text-[12.5px] font-medium leading-[17px] text-white dark:bg-sky-500/80"
          >
            {chat.last.fileKind && (
              <span className="font-semibold">
                {chatFileLabel(chat.last.fileKind, chat.last.fileName, t)}
                {chat.last.text ? " · " : ""}
              </span>
            )}
            {chat.last.text}
          </p>
          <span
            title={t("pipeline.newMessage")}
            className="mb-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400"
          />
        </div>
      )}

      {(footer || layout.showTask) && (
        <div className="mt-2.5 flex items-center gap-2">
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
