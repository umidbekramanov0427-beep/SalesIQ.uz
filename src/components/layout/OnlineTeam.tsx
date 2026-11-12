import { useState } from "react";
import { MapPin, Search, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n } from "@/lib/i18n";
import { cn, initialsOf } from "@/lib/utils";
import { useOnlineTeam, type OnlinePerson } from "@/hooks/use-crm-data";

// Who is in the app right now, company-wide: a green "Jonli" mark, the
// first faces and "N onlayn"; opening it lists everyone with the page they
// are on. The same list sits in the user menu (behind the avatar).

const AVATAR_BG = [
  "bg-amber-600",
  "bg-slate-500",
  "bg-rose-600",
  "bg-fuchsia-600",
  "bg-orange-700",
  "bg-sky-600",
  "bg-emerald-600",
  "bg-violet-600",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function OnlineAvatar({ p, size = 28 }: { p: OnlinePerson; size?: number }) {
  return p.avatarUrl ? (
    <img
      src={p.avatarUrl}
      alt=""
      className="shrink-0 rounded-full object-cover ring-2 ring-card"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold text-white ring-2 ring-card",
        AVATAR_BG[hash(p.id) % AVATAR_BG.length],
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {size < 24 ? initialsOf(p.name).slice(0, 1) : initialsOf(p.name)}
    </span>
  );
}

function pageLabel(t: (k: string) => string, path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("/crm/leads/")) return t("online.leadCard");
  const seg = "/" + (path.split("/")[1] ?? "");
  const key = `nav.${seg}`;
  const label = t(key);
  return label === key ? path : label;
}

const ROLE_KEY: Record<string, string> = {
  super_admin: "admin.roleAdmin",
  rop: "admin.roleRop",
  sotuv_menejeri: "admin.roleRep",
  marketolog: "admin.roleMarketolog",
};

/** The list itself (popover body and the user menu's section). */
export function OnlineList({ people, max }: { people: OnlinePerson[]; max?: number }) {
  const { t } = useI18n();
  const shown = max ? people.slice(0, max) : people;
  return (
    <ul className="space-y-0.5">
      {shown.map((p) => (
        <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
          <span className="relative">
            <OnlineAvatar p={p} size={30} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-popover" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13.5px] font-semibold text-foreground">
              {p.name}
              {p.me && (
                <span className="ml-1 font-normal text-muted-foreground">({t("online.you")})</span>
              )}
            </span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              {[p.role && ROLE_KEY[p.role] ? t(ROLE_KEY[p.role]!) : null, pageLabel(t, p.path)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </li>
      ))}
      {max && people.length > max && (
        <li className="px-1.5 pt-1 text-[12px] text-muted-foreground">
          {t("online.more", { n: people.length - max })}
        </li>
      )}
    </ul>
  );
}

/** "● Jonli  (A)(F)(I)… 8 onlayn" -- opens the full list. */
export function OnlineStack({ className }: { className?: string }) {
  const { t } = useI18n();
  const { data: people = [] } = useOnlineTeam();
  if (!people.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-10 items-center gap-2.5 rounded-xl px-2 transition-colors hover:bg-accent",
            className,
          )}
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[12.5px] font-semibold text-emerald-700 dark:text-emerald-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {t("online.live")}
          </span>
          <span className="flex -space-x-2">
            {people.slice(0, 6).map((p) => (
              <OnlineAvatar key={p.id} p={p} size={28} />
            ))}
          </span>
          <span className="whitespace-nowrap text-[13px] text-muted-foreground">
            {t("online.count", { n: people.length })}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl p-2">
        <p className="px-1.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-subtle">
          {t("online.title")} · {people.length}
        </p>
        <div className="max-h-[360px] overflow-y-auto">
          <OnlineList people={people} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

const ROLE_CHIP: Record<string, string> = {
  super_admin: "bg-amber-500/14 text-amber-800 dark:text-amber-200",
  rop: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  sotuv_menejeri: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  marketolog: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

/** The full list, beside the page (opened from the user menu's "Hozir onlayn" row). */
export function OnlineSheet({
  open,
  onOpenChange,
  people,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: OnlinePerson[];
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const shown = people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[400px]">
        <SheetHeader className="border-b border-border px-5 pb-4 pt-5 text-left">
          <SheetTitle className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <Users className="h-[18px] w-[18px]" />
            </span>
            {t("online.title")}
            <span className="ml-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[12px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {people.length}
            </span>
          </SheetTitle>
          <p className="text-[13px] text-muted-foreground">{t("online.desc")}</p>
        </SheetHeader>
        {people.length > 6 && (
          <label className="mx-5 mt-4 flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("online.search")}
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            />
          </label>
        )}
        <ul className="flex-1 space-y-1 overflow-y-auto p-3">
          {shown.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-accent"
            >
              <span className="relative">
                <OnlineAvatar p={p} size={40} />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="truncate text-[14.5px] font-semibold text-foreground">
                    {p.name}
                  </span>
                  {p.me && (
                    <span className="shrink-0 text-[12px] text-muted-foreground">
                      ({t("online.you")})
                    </span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted-foreground">
                  {p.role && ROLE_KEY[p.role] && (
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-px text-[11.5px] font-semibold",
                        ROLE_CHIP[p.role] ?? "bg-muted text-muted-foreground",
                      )}
                    >
                      {t(ROLE_KEY[p.role]!).split(" | ")[0]}
                    </span>
                  )}
                  {pageLabel(t, p.path) && (
                    <span className="flex min-w-0 items-center gap-1 truncate">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="truncate">{pageLabel(t, p.path)}</span>
                    </span>
                  )}
                </p>
              </div>
              <span
                className="shrink-0 text-[12px] tabular-nums text-subtle"
                title={t("online.since")}
              >
                {clock(p.since)}
              </span>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
