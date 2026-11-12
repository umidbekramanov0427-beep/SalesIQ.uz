import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
      {initialsOf(p.name)}
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
