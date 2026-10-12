import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "./i18n-en";

export const LANGS = ["uz", "ru", "en"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_LABELS: Record<Lang, string> = { uz: "O‘zbekcha", ru: "Русский", en: "English" };
export const LANG_SHORT: Record<Lang, string> = { uz: "UZ", ru: "RU", en: "EN" };
export const LANG_FLAGS: Record<Lang, string> = { uz: "🇺🇿", ru: "🇷🇺", en: "🇺🇸" };

type Dict = Record<string, string>;

// English ships in the main bundle (it's the server-rendered language and
// the fallback for any missing key); Uzbek and Russian are ~200 KB each, so
// each is fetched only when it's the chosen language.
const LOADERS: Record<Exclude<Lang, "en">, () => Promise<{ default: Dict }>> = {
  uz: () => import("./i18n-uz"),
  ru: () => import("./i18n-ru"),
};
const LOADED: Partial<Record<Lang, Dict>> = { en };

function loadDict(l: Lang): Promise<Dict> {
  const ready = LOADED[l];
  if (ready) return Promise.resolve(ready);
  return LOADERS[l as Exclude<Lang, "en">]().then((m) => (LOADED[l] = m.default));
}

const STORAGE_KEY = "salesos.lang";

type I18nValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // storage unavailable -- stay on English
    }
    if (stored && (LANGS as readonly string[]).includes(stored)) {
      const l = stored as Lang;
      void loadDict(l).then(() => setLangState(l));
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
    document.documentElement.lang = l;
    void loadDict(l).then(() => setLangState(l));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw = LOADED[lang]?.[key] ?? en[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? `{${k}}`));
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

/**
 * For the app's last-resort error screen, which can render outside the
 * provider (a crash above it): the provider's t() when there is one, else
 * the English text -- never a second crash on top of the first.
 */
export function useI18nOrEnglish(): Pick<I18nValue, "t"> {
  const ctx = useContext(I18nContext);
  return ctx ?? { t: ((key: string) => (en as Dict)[key] ?? key) as I18nValue["t"] };
}
