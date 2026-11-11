import { useRouterState } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "salesos.theme";

// "system" follows the device's light/dark setting (amoCRM's "auto").
export type ThemeMode = "light" | "dark" | "system";

type ThemeValue = {
  /** What the page shows: the user's theme, or dark inside the admin console. */
  dark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  setDark: (v: boolean) => void;
  toggle: () => void;
  /** An admin console page is open (forced dark navy look). */
  console: boolean;
};

/** Admin console paths, also read by the boot script below. */
export const CONSOLE_PATH_RE = /^\/(admin|integrations)(\/|$)/;

const ThemeContext = createContext<ThemeValue | null>(null);

function readInitial(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "dark" || v === "system" ? v : "light";
}

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readInitial);
  const [osDark, setOsDark] = useState(systemDark);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setOsDark(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  // The admin panel and integrations are the admin console: a dark navy
  // workspace whatever theme the person picked, back to their own theme
  // when they leave. CONSOLE_BOOT_SCRIPT paints it before the first frame.
  const pathname = useRouterState({ select: (st) => st.location.pathname });
  const consoleOn = CONSOLE_PATH_RE.test(pathname);
  const chosenDark = mode === "system" ? osDark : mode === "dark";
  const dark = chosenDark || consoleOn;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.classList.toggle("admin-console", consoleOn);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [dark, mode, consoleOn]);

  const setMode = (m: ThemeMode) => setModeState(m);
  const setDark = (v: boolean) => setModeState(v ? "dark" : "light");
  const toggle = () => setModeState(chosenDark ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ dark, mode, setMode, setDark, toggle, console: consoleOn }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

// Runs in <head> before first paint (see __root.tsx): opening an admin page
// directly shows the console at once instead of flashing the light theme.
export const CONSOLE_BOOT_SCRIPT = `(function(){try{if(${CONSOLE_PATH_RE.toString()}.test(location.pathname)){var c=document.documentElement.classList;c.add("dark");c.add("admin-console")}}catch(e){}})();`;
