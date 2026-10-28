import { useMemo, useState } from "react";
import { Search, Smile } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// The chat composer's emoji picker: a search box, the person's most used
// emojis first, then tabs by kind. Each emoji carries a few words (uz, ru,
// en) so "yurak", "сердце" or "heart" all find ❤️.

type Group = { key: string; icon: string; items: [string, string][] };

const GROUPS: Group[] = [
  {
    key: "faces",
    icon: "😀",
    items: [
      ["😀", "kulish smile улыбка"],
      ["😃", "kulish smile улыбка"],
      ["😄", "kulish xursand happy радость"],
      ["😁", "tishlar grin"],
      ["😆", "kulgi laugh смех"],
      ["😅", "ter sweat"],
      ["😂", "kulgi yosh joy смех слёзы"],
      ["🤣", "kulgi rofl"],
      ["🙂", "tabassum slight"],
      ["😉", "ko'z qisish wink подмигнуть"],
      ["😊", "uyalish blush"],
      ["😇", "farishta angel ангел"],
      ["🥰", "sevgi love любовь"],
      ["😍", "sevgi love heart eyes"],
      ["🤩", "yulduz star wow"],
      ["😘", "o'pish kiss поцелуй"],
      ["😋", "mazali yum вкусно"],
      ["😜", "til tongue"],
      ["🤗", "quchoq hug обнять"],
      ["🤔", "o'ylash think думать"],
      ["🤨", "shubha doubt"],
      ["😐", "neytral neutral"],
      ["😏", "smirk ухмылка"],
      ["🙄", "ko'z aylantirish eyeroll"],
      ["😬", "grimace"],
      ["😌", "xotirjam relieved"],
      ["😔", "xafa sad грусть"],
      ["😴", "uyqu sleep сон"],
      ["😷", "kasal mask маска"],
      ["🤯", "hayrat mind blown"],
      ["🥳", "bayram party праздник"],
      ["😎", "zo'r cool крутой"],
      ["🧐", "monocle"],
      ["😕", "confused"],
      ["😮", "hayron wow"],
      ["😳", "uyalish flushed"],
      ["🥺", "iltimos pleading"],
      ["😢", "yig'i cry плакать"],
      ["😭", "yig'i sob"],
      ["😱", "qo'rquv scream"],
      ["😤", "jahl huff"],
      ["😡", "g'azab angry злость"],
    ],
  },
  {
    key: "hands",
    icon: "👍",
    items: [
      ["👍", "yaxshi ok like класс"],
      ["👎", "yomon dislike"],
      ["👌", "ok zo'r отлично"],
      ["🙏", "rahmat iltimos thanks спасибо пожалуйста"],
      ["🤝", "kelishuv deal handshake сделка"],
      ["👏", "qarsak clap аплодисменты"],
      ["👋", "salom hello привет"],
      ["✌️", "g'alaba peace victory"],
      ["🤞", "omad luck удача"],
      ["💪", "kuch strong сила"],
      ["👉", "o'ng right"],
      ["👈", "chap left"],
      ["👆", "yuqori up"],
      ["👇", "past down"],
      ["☝️", "bir one"],
      ["✊", "musht fist"],
      ["🙌", "hurray yay"],
      ["🫶", "yurak qo'l heart hands"],
    ],
  },
  {
    key: "hearts",
    icon: "❤️",
    items: [
      ["❤️", "yurak heart сердце love"],
      ["🧡", "yurak heart orange"],
      ["💛", "yurak heart yellow"],
      ["💚", "yurak heart green"],
      ["💙", "yurak heart blue"],
      ["💜", "yurak heart purple"],
      ["🖤", "yurak heart black"],
      ["🤍", "yurak heart white"],
      ["💔", "singan yurak broken"],
      ["💯", "yuz 100 hundred"],
      ["🔥", "olov fire огонь"],
      ["✨", "yulduzcha sparkles"],
      ["⭐", "yulduz star звезда"],
      ["🎉", "tabrik party congrats поздравляю"],
      ["🎁", "sovg'a gift подарок"],
      ["🌹", "atirgul rose роза"],
      ["💐", "guldasta flowers цветы"],
    ],
  },
  {
    key: "work",
    icon: "💼",
    items: [
      ["✅", "tayyor done готово check"],
      ["❌", "yo'q no нет cross"],
      ["⏰", "vaqt soat time alarm время"],
      ["📞", "qo'ng'iroq call звонок telefon"],
      ["📱", "telefon phone"],
      ["💬", "xabar chat message сообщение"],
      ["📩", "xat mail письмо"],
      ["💰", "pul money деньги"],
      ["💵", "dollar pul cash"],
      ["💳", "karta card карта to'lov"],
      ["🧾", "chek receipt чек"],
      ["📈", "o'sish growth рост"],
      ["📉", "pasayish down падение"],
      ["📊", "statistika chart"],
      ["📅", "sana kalendar calendar дата"],
      ["📌", "pin muhim important"],
      ["📎", "fayl clip файл"],
      ["📝", "yozuv note заметка"],
      ["📄", "hujjat document документ"],
      ["💼", "ish work работа"],
      ["🏢", "ofis office офис"],
      ["🎓", "ta'lim kurs education курс"],
      ["📚", "kitob books книги"],
      ["🚀", "start launch запуск"],
      ["💡", "g'oya idea идея"],
      ["🎯", "maqsad goal цель"],
      ["🏆", "g'olib winner победа"],
      ["🤖", "bot robot"],
    ],
  },
  {
    key: "symbols",
    icon: "❗",
    items: [
      ["❗", "diqqat important важно"],
      ["❓", "savol question вопрос"],
      ["⚠️", "ogohlantirish warning"],
      ["🔴", "qizil red"],
      ["🟢", "yashil green"],
      ["🟡", "sariq yellow"],
      ["🔵", "ko'k blue"],
      ["➡️", "o'ng strelka arrow"],
      ["⬅️", "chap strelka arrow"],
      ["🔝", "top"],
      ["🆕", "yangi new новый"],
      ["🆓", "bepul free бесплатно"],
      ["🔔", "eslatma bell напоминание"],
      ["🇺🇿", "o'zbekiston uzbekistan bayroq flag"],
    ],
  },
];

const RECENT_KEY = "salesiq.emoji.recent";
const RECENT_MAX = 18;

function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

function remember(e: string) {
  try {
    const next = [e, ...readRecent().filter((x) => x !== e)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage off (private window): the picker just has no history.
  }
}

export function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("recent");
  const [recent, setRecent] = useState<string[]>([]);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return GROUPS.flatMap((g) => g.items)
      .filter(([, words]) => words.includes(q))
      .map(([e]) => e);
  }, [query]);
  const shown =
    found ??
    (tab === "recent"
      ? recent.length
        ? recent
        : GROUPS[0]!.items.slice(0, RECENT_MAX).map(([e]) => e)
      : (GROUPS.find((g) => g.key === tab)?.items.map(([e]) => e) ?? []));

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          const r = readRecent();
          setRecent(r);
          setTab(r.length ? "recent" : "faces");
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("amo.emoji")}
          className="grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Smile className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="amo-skin w-[324px] p-0">
        <div className="border-b border-border p-2">
          <label className="flex h-8 items-center gap-2 rounded-lg bg-muted px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("emoji.search")}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
          </label>
        </div>
        <div className="h-[212px] overflow-y-auto p-2">
          {!found && (
            <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(`emoji.group.${tab === "recent" && !recent.length ? "faces" : tab}`)}
            </p>
          )}
          {shown.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-muted-foreground">
              {t("emoji.none")}
            </p>
          ) : (
            <div className="grid grid-cols-9 gap-0.5">
              {shown.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    remember(e);
                    onPick(e);
                  }}
                  className="grid h-8 w-8 place-items-center rounded-md text-[19px] transition-transform hover:scale-110 hover:bg-accent"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex border-t border-border p-1">
          {[{ key: "recent", icon: "🕘" }, ...GROUPS].map((g) => (
            <button
              key={g.key}
              type="button"
              title={t(`emoji.group.${g.key}`)}
              onClick={() => {
                setTab(g.key);
                setQuery("");
              }}
              className={cn(
                "grid h-8 flex-1 place-items-center rounded-md text-[16px] transition-colors",
                !found && tab === g.key
                  ? "bg-primary/12"
                  : "opacity-60 hover:bg-accent hover:opacity-100",
              )}
            >
              {g.icon}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
