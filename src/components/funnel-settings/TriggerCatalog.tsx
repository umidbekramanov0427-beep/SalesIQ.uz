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
};

const GROUPS: { key: string; tiles: ActionTile[] }[] = [
  {
    key: "bot",
    tiles: [
      { key: "salesbot", icon: Bot, type: "start_salesbot" },
      { key: "tgSalesbot", icon: Send, type: "start_salesbot" },
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
      { key: "previousOwner", icon: UserCheck, type: "previous_owner" },
      { key: "releaseOwner", icon: Undo2, type: "release_owner" },
    ],
  },
  {
    key: "action",
    tiles: [
      { key: "moveStage", icon: ArrowLeftRight, type: "move_stage" },
      { key: "moveFunnel", icon: Waypoints, type: "move_funnel" },
      { key: "closeWon", icon: Trophy, type: "close_won" },
      { key: "closeLost", icon: CircleX, type: "close_lost", danger: true },
      { key: "webhook", icon: Webhook, type: "webhook" },
      { key: "dedupe", icon: CopyCheck, type: "dedupe" },
    ],
  },
  {
    key: "contact",
    tiles: [
      { key: "delay", icon: Timer, type: "delay" },
      { key: "message", icon: MessageSquare, type: "send_message" },
      { key: "telegram", icon: Send, type: "send_message", patch: { channel: "telegram" } },
      { key: "sms", icon: Smartphone, type: "send_message", patch: { channel: "sms" } },
      { key: "email", icon: Mail, type: "send_message", patch: { channel: "email" } },
    ],
  },
  {
    key: "data",
    tiles: [
      { key: "setField", icon: PencilLine, type: "set_field" },
      { key: "addTag", icon: Tag, type: "add_tag" },
      { key: "removeTag", icon: Eraser, type: "remove_tag", danger: true },
      { key: "addNote", icon: StickyNote, type: "add_note" },
      { key: "detectPhone", icon: ScanSearch, type: "detect_phone" },
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
    { key: "telegramBot", icon: Send, tone: "text-sky-400", tab: "salesbots", installed: true },
    {
      key: "instagram",
      icon: Instagram,
      tone: "text-pink-400",
      to: "/integrations/instagram",
      installed: instagram ? !!instagram.account : null,
    },
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
      <DialogContent className="amo-skin flex h-[90dvh] max-w-[560px] flex-col gap-0 overflow-hidden rounded-[6px] border-border bg-background p-0 sm:max-w-[560px] [&>button:last-child]:hidden">
        <DialogTitle className="sr-only">{t("fs.addTrigger")}</DialogTitle>
        <div className="shrink-0 border-b border-border px-5 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <label className="flex h-10 flex-1 items-center gap-2.5 rounded-[4px] border border-border bg-card px-3 focus-within:border-primary">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("tc.search")}
                className="h-full flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
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
          <p className="mt-2.5 text-[12px] text-muted-foreground">
            {t("tc.when")} <b className="font-semibold text-foreground">{stageName}</b>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {/* 5CRM: one flat grid of actions, the salesbots lit first. */}
          <div className="grid grid-cols-3 gap-2.5 pt-4 phone:grid-cols-2">
            {groups.flatMap((g) =>
              g.tiles.map((tile) => (
                <button
                  key={tile.key}
                  type="button"
                  onClick={() => pick(tile)}
                  className={cn(
                    "group flex h-[82px] flex-col items-center justify-between rounded-[4px] px-2.5 pb-2 pt-3 text-white transition-[filter,transform] duration-150 hover:brightness-110",
                    g.key === "bot" ? "bg-[#4a68b8]" : "bg-[#2c4a72]",
                  )}
                >
                  <tile.icon
                    className={cn("h-6 w-6", tile.danger ? "text-rose-200" : "text-white")}
                    strokeWidth={1.6}
                  />
                  <span className="flex h-6 w-full items-center justify-center gap-1 rounded-[3px] border border-white/25 bg-black/15 px-1.5 text-[11.5px] font-medium">
                    <Plus className="h-3 w-3 shrink-0" />
                    <span className="truncate">{t(`tc.a.${tile.key}`)}</span>
                  </span>
                </button>
              )),
            )}
          </div>

          {shownWidgets.length > 0 && (
            <section className="pt-6">
              <h3 className="mb-3 text-[17px] font-medium text-foreground">{t("tc.g.widgets")}</h3>
              <div className="grid grid-cols-4 gap-3 phone:grid-cols-2">
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
