import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  Bell,
  Bot,
  CalendarPlus,
  CheckCheck,
  CircleX,
  CopyCheck,
  Eraser,
  ExternalLink,
  Globe,
  Instagram,
  ListChecks,
  Mail,
  MessageSquare,
  MessageSquareReply,
  MessagesSquare,
  PencilLine,
  Phone,
  Plus,
  Search,
  Send,
  Shuffle,
  Smartphone,
  StickyNote,
  Tag,
  Timer,
  Trophy,
  UserCog,
  Waypoints,
  Webhook,
  X,
  type LucideIcon,
  Undo2,
  ScanSearch,
  UserCheck,
  BadgeCheck,
  Braces,
  Contact,
  Crown,
  Facebook,
  LayoutTemplate,
  MessageCircle,
  PartyPopper,
  Puzzle,
  Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { blankAction } from "@/components/automations/ActionEditor";
import type { AutomationAction, AutomationActionType } from "@/lib/automation-types";
import {
  useChatTemplates,
  useInstagramAccount,
  useSmsStatus,
  useTelephonyStatus,
  useWebForms,
} from "@/hooks/use-crm-data";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// "Trigger qo'shish": everything a lead entering a stage can set off, in
// groups (Bot, Ish, Taqsimlash, Amal, Aloqa, Ma'lumot) with a search on top,
// and below them the channels and tools a trigger works with (Vidjetlar),
// each saying whether it is set up. Picking an action opens the trigger's
// settings with that action already in it.

type ActionTile = {
  key: string;
  icon: LucideIcon;
  type: AutomationActionType;
  /** Fields set on top of the blank action (the message channel). */
  patch?: Record<string, unknown>;
  danger?: boolean;
  /** Shown but not pickable yet: why (an i18n key under tc.off.*). */
  off?: string;
};

// The 27 triggers in the order and with the names of 5CRM's «Voronka
// triggerlari qo'llanmasi», then the ones only SalesIQ has.
const GROUPS: { key: string; tiles: ActionTile[] }[] = [
  {
    key: "bot",
    tiles: [
      { key: "salesbot", icon: Bot, type: "start_salesbot" },
      { key: "tgSalesbot", icon: Send, type: "start_salesbot" },
      { key: "autoChat", icon: MessagesSquare, type: "auto_chat" },
    ],
  },
  {
    key: "work",
    tiles: [
      { key: "createTask", icon: CalendarPlus, type: "create_task" },
      { key: "closeTasks", icon: CheckCheck, type: "close_tasks" },
    ],
  },
  {
    key: "distribution",
    tiles: [
      { key: "distribute", icon: Shuffle, type: "distribute" },
      { key: "assignOwner", icon: UserCog, type: "assign_owner" },
      { key: "leadOwner", icon: Crown, type: "lead_owner" },
      { key: "releaseOwner", icon: Undo2, type: "release_owner" },
    ],
  },
  {
    key: "phone",
    tiles: [
      { key: "tgPhone", icon: Contact, type: "detect_phone" },
      { key: "detectPhone", icon: ScanSearch, type: "detect_phone" },
    ],
  },
  {
    key: "action",
    tiles: [
      { key: "moveStage", icon: ArrowLeftRight, type: "move_stage" },
      { key: "moveFunnel", icon: Waypoints, type: "move_funnel" },
      { key: "delay", icon: Timer, type: "delay" },
    ],
  },
  {
    key: "contact",
    tiles: [
      { key: "message", icon: MessageSquare, type: "send_message" },
      { key: "igReply", icon: MessageCircle, type: "send_message", off: "igComments" },
      { key: "card", icon: LayoutTemplate, type: "send_card" },
      { key: "tgChat", icon: Send, type: "tg_chat_message" },
      { key: "sms", icon: Smartphone, type: "send_message", patch: { channel: "sms", once: true } },
      { key: "saleCongrats", icon: PartyPopper, type: "sale_congrats" },
    ],
  },
  {
    key: "data",
    tiles: [
      { key: "setField", icon: PencilLine, type: "set_field" },
      { key: "addTag", icon: Tag, type: "add_tag" },
      { key: "removeTag", icon: Eraser, type: "remove_tag", danger: true },
      { key: "quality", icon: BadgeCheck, type: "quality_check" },
      { key: "addNote", icon: StickyNote, type: "add_note" },
    ],
  },
  {
    key: "external",
    tiles: [
      { key: "webhook", icon: Webhook, type: "webhook" },
      { key: "api", icon: Braces, type: "api_post" },
    ],
  },
  {
    key: "extra",
    tiles: [
      { key: "previousOwner", icon: UserCheck, type: "previous_owner" },
      { key: "closeWon", icon: Trophy, type: "close_won" },
      { key: "closeLost", icon: CircleX, type: "close_lost", danger: true },
      { key: "dedupe", icon: CopyCheck, type: "dedupe" },
      { key: "telegram", icon: Send, type: "send_message", patch: { channel: "telegram" } },
      { key: "email", icon: Mail, type: "send_message", patch: { channel: "email" } },
    ],
  },
];

export type SettingsTabKey =
  | "automations"
  | "salesbots"
  | "forms"
  | "sources"
  | "duplicates"
  | "tasks"
  | "followups"
  | "autoreplies"
  | "templates";

type Widget = {
  key: string;
  icon: LucideIcon;
  tone: string;
  /** Opens one of the funnel settings' own pages… */
  tab?: SettingsTabKey;
  /** …or an integration page. */
  to?: string;
  installed: boolean | null;
};

// Each group's icons in their own colour, so the grid reads at a glance.
const GROUP_ICON: Record<string, string> = {
  bot: "text-white",
  work: "text-emerald-300",
  distribution: "text-amber-300",
  action: "text-sky-300",
  contact: "text-pink-300",
  data: "text-violet-300",
  phone: "text-teal-300",
  external: "text-orange-300",
  extra: "text-slate-200",
};

export function TriggerCatalog({
  open,
  onOpenChange,
  stageName,
  onPick,
  onOpenTab,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stageName: string;
  onPick: (actions: AutomationAction[]) => void;
  onOpenTab: (tab: SettingsTabKey) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const { data: forms = [] } = useWebForms();
  const { data: templates = [] } = useChatTemplates();
  const { data: sms } = useSmsStatus();
  const { data: telephony } = useTelephonyStatus();
  const { data: instagram } = useInstagramAccount(open);

  const widgets: Widget[] = [
    { key: "fbLeads", icon: Facebook, tone: "text-blue-500", installed: false },
    {
      key: "instagram",
      icon: Instagram,
      tone: "text-pink-400",
      to: "/integrations/instagram",
      installed: instagram ? !!instagram.account : null,
    },
    { key: "telegramBot", icon: Send, tone: "text-sky-400", tab: "salesbots", installed: true },
    { key: "whatsapp", icon: MessageCircle, tone: "text-emerald-500", installed: false },
    { key: "messenger", icon: MessagesSquare, tone: "text-blue-400", installed: false },
    { key: "siqBot", icon: Sparkles, tone: "text-primary", to: "/settings", installed: null },
    {
      key: "telephony",
      icon: Phone,
      tone: "text-emerald-400",
      to: "/admin/telephony",
      installed: telephony ? Object.keys(telephony).length > 0 : null,
    },
    {
      key: "sms",
      icon: Smartphone,
      tone: "text-amber-400",
      to: "/integrations/sms",
      installed: sms ? sms.connected : null,
    },
    {
      key: "webForm",
      icon: Globe,
      tone: "text-primary",
      tab: "forms",
      installed: forms.length > 0,
    },
    {
      key: "templates",
      icon: MessagesSquare,
      tone: "text-primary",
      tab: "templates",
      installed: templates.length > 0,
    },
    {
      key: "autoreplies",
      icon: MessageSquareReply,
      tone: "text-primary",
      tab: "autoreplies",
      installed: null,
    },
    { key: "followups", icon: Bell, tone: "text-primary", tab: "followups", installed: null },
    { key: "taskControl", icon: ListChecks, tone: "text-primary", tab: "tasks", installed: null },
    { key: "api", icon: Webhook, tone: "text-primary", tab: "sources", installed: null },
    { key: "custom", icon: Puzzle, tone: "text-primary", tab: "sources", installed: null },
  ];

  const needle = q.trim().toLowerCase();
  const match = (label: string) => !needle || label.toLowerCase().includes(needle);
  const groups = useMemo(
    () =>
      GROUPS.map((g) => ({
        ...g,
        tiles: g.tiles.filter((x) => match(t(`tc.a.${x.key}`))),
      })).filter((g) => g.tiles.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needle, t],
  );
  const shownWidgets = widgets.filter((w) => match(t(`tc.w.${w.key}`)));

  function pick(tile: ActionTile) {
    const action = { ...blankAction(tile.type), ...(tile.patch ?? {}) } as AutomationAction;
    onPick([action]);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setQ("");
        onOpenChange(v);
      }}
    >
      <DialogContent className="amo-skin flex h-[92dvh] max-w-[960px] flex-col gap-0 overflow-hidden rounded-[8px] border-border bg-background p-0 sm:max-w-[960px] [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">{t("fs.addTrigger")}</DialogTitle>
        <div className="shrink-0 border-b border-border px-7 pb-4 pt-6">
          <div className="flex items-center gap-3">
            <label className="flex h-12 flex-1 items-center gap-3 rounded-[6px] border border-border bg-card px-4 focus-within:border-primary">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("tc.search")}
                className="h-full flex-1 bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t("fs.cancel")}
              className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-3 text-[14px] text-muted-foreground">
            {t("tc.when")} <b className="font-semibold text-foreground">{stageName}</b>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-8">
          {/* 5CRM: one flat grid of actions, the salesbots lit first. */}
          <div className="grid grid-cols-4 gap-3 pt-5 phone:grid-cols-2">
            {groups.flatMap((g) =>
              g.tiles.map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  disabled={!!tile.off}
                  title={tile.off ? t(`tc.off.${tile.off}`) : undefined}
                  onClick={() => pick(tile)}
                  className={cn(
                    "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:brightness-100",
                    "group relative flex h-[124px] flex-col items-center justify-between overflow-hidden rounded-[6px] px-3 pb-3 pt-4 text-white shadow-[0_1px_0_rgba(255,255,255,0.06)_inset] transition-[filter,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-10px_rgba(0,0,0,0.6)] hover:brightness-110 active:translate-y-0 motion-reduce:transform-none",
                    g.key === "bot"
                      ? "bg-[linear-gradient(160deg,#5b7bd0,#4462b0)]"
                      : "bg-[linear-gradient(160deg,#33557f,#2a4669)]",
                  )}
                >
                  {/* The guide's one-line description replaces the icon on hover. */}
                  <span className="pointer-events-none absolute inset-x-2 top-2.5 line-clamp-4 text-center text-[11.5px] leading-snug text-white/90 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-disabled:opacity-0">
                    {t(`tc.d.${tile.key}`)}
                  </span>
                  <span
                    className={cn(
                      "grid h-12 w-12 place-items-center rounded-full bg-white/10 ring-1 ring-white/15 transition-[transform,opacity] duration-200 group-hover:scale-90 group-hover:opacity-0 group-disabled:opacity-100",
                      GROUP_ICON[g.key] ?? "text-white",
                    )}
                  >
                    <tile.icon
                      className={cn("h-6 w-6", tile.danger && "text-rose-300")}
                      strokeWidth={1.7}
                    />
                  </span>
                  <span className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[4px] border border-white/20 bg-black/15 px-2 text-[13px] font-medium transition-colors group-hover:bg-black/25">
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t(`tc.a.${tile.key}`)}</span>
                    {tile.off && <span className="sr-only">{t(`tc.off.${tile.off}`)}</span>}
                  </span>
                </button>
              )),
            )}
          </div>

          {shownWidgets.length > 0 && (
            <section className="pt-6">
              <h3 className="mb-3 text-[18px] font-medium text-foreground">{t("tc.g.widgets")}</h3>
              <div className="grid grid-cols-5 gap-3 phone:grid-cols-2">
                {shownWidgets.map((w) => {
                  const body = (
                    <>
                      <span className="grid h-14 w-full place-items-center rounded-[3px] bg-white/95 ring-1 ring-black/5">
                        <w.icon className={cn("h-7 w-7", w.tone)} />
                      </span>
                      <span className="w-full truncate text-left text-[12px] font-semibold text-foreground">
                        {t(`tc.w.${w.key}`)}
                      </span>
                      {w.installed !== null && (
                        <span
                          className={cn(
                            "self-start rounded-[3px] border px-2 py-0.5 text-[11px]",
                            w.installed
                              ? "border-emerald-500/50 text-emerald-400"
                              : "border-border text-muted-foreground",
                          )}
                        >
                          {w.installed ? t("tc.installed") : t("tc.notInstalled")}
                        </span>
                      )}
                    </>
                  );
                  const cls =
                    "group flex flex-col items-stretch gap-1.5 transition-opacity hover:opacity-90";
                  if (!w.to && !w.tab)
                    return (
                      <div
                        key={w.key}
                        className={cn(cls, "cursor-default opacity-70")}
                        title={t("tc.soon")}
                      >
                        {body}
                      </div>
                    );
                  return w.to ? (
                    <Link key={w.key} to={w.to} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <button
                      key={w.key}
                      type="button"
                      className={cls}
                      onClick={() => {
                        onOpenChange(false);
                        onOpenTab(w.tab!);
                      }}
                    >
                      {body}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {groups.length === 0 && shownWidgets.length === 0 && (
            <p className="pt-10 text-center text-sm text-muted-foreground">{t("tc.nothing")}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
