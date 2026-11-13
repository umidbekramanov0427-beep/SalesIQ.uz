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
  { key: "bot", tiles: [{ key: "salesbot", icon: Bot, type: "start_salesbot" }] },
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
      <DialogContent className="amo-skin flex h-[86dvh] max-w-[1080px] flex-col gap-0 overflow-hidden rounded-[6px] border-border bg-background p-0 sm:max-w-[1080px] [&>button:last-child]:hidden">
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
          {groups.map((g) => (
            <section key={g.key} className="pt-5">
              <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {t(`tc.g.${g.key}`)}
              </h3>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {g.tiles.map((tile) => (
                  <button
                    key={tile.key}
                    type="button"
                    onClick={() => pick(tile)}
                    className="group flex flex-col items-center gap-3 rounded-[6px] border border-border bg-card px-3 pb-3 pt-4 text-left transition-[border-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.6)]"
                  >
                    <span
                      className={cn(
                        "grid h-12 w-12 place-items-center rounded-[10px] transition-transform duration-200 group-hover:scale-105",
                        tile.danger ? "bg-rose-500/15 text-rose-400" : "bg-primary/15 text-primary",
                      )}
                    >
                      <tile.icon className="h-[22px] w-[22px]" />
                    </span>
                    <span className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[4px] border border-border bg-background/40 px-2 text-[12px] font-semibold text-foreground transition-colors group-hover:border-primary/50 group-hover:bg-primary/10">
                      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{t(`tc.a.${tile.key}`)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {shownWidgets.length > 0 && (
            <section className="pt-6">
              <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                {t("tc.g.widgets")}
              </h3>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                {shownWidgets.map((w) => {
                  const body = (
                    <>
                      <ExternalLink className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
                      <span className="grid h-12 w-12 place-items-center rounded-[12px] bg-white/[0.06] ring-1 ring-border">
                        <w.icon className={cn("h-6 w-6", w.tone)} />
                      </span>
                      <span className="flex h-8 w-full items-center justify-center rounded-[4px] border border-border bg-background/40 px-2 text-[12px] font-semibold text-foreground transition-colors group-hover:border-primary/50 group-hover:bg-primary/10">
                        <span className="truncate">{t(`tc.w.${w.key}`)}</span>
                      </span>
                      {w.installed !== null && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                            w.installed
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {w.installed ? t("tc.installed") : t("tc.notInstalled")}
                        </span>
                      )}
                    </>
                  );
                  const cls =
                    "group relative flex flex-col items-center gap-2.5 rounded-[6px] border border-border bg-card px-3 pb-3 pt-4 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/60";
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
