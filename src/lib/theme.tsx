import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "salesos.theme";

// "system" follows the device's light/dark setting (amoCRM's "auto").
export type ThemeMode = "light" | "dark" | "system";

type ThemeValue = {
  dark: boolean;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  setDark: (v: boolean) => void;
  toggle: () => void;
};

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

  const dark = mode === "system" ? osDark : mode === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [dark, mode]);

  const setMode = (m: ThemeMode) => setModeState(m);
  const setDark = (v: boolean) => setModeState(v ? "dark" : "light");
  const toggle = () => setModeState(dark ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ dark, mode, setMode, setDark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
