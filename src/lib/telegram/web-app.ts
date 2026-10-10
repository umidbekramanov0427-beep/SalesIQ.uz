// Client side of the Telegram Mini App: loads Telegram's own SDK script
// once and hands back window.Telegram.WebApp -- or null when the page was
// opened in a normal browser (no launch data), so callers can explain that
// instead of hanging.

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { first_name?: string } };
  colorScheme?: "light" | "dark";
  ready: () => void;
  expand: () => void;
  close: () => void;
  requestContact?: (callback?: (shared: boolean) => void) => void;
  HapticFeedback?: { notificationOccurred: (t: "success" | "error" | "warning") => void };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const SDK_URL = "https://telegram.org/js/telegram-web-app.js";
let loading: Promise<TelegramWebApp | null> | null = null;

export function loadTelegramWebApp(): Promise<TelegramWebApp | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (loading) return loading;
  loading = new Promise((resolve) => {
    const done = () => {
      const app = window.Telegram?.WebApp ?? null;
      if (app && app.initData) {
        app.ready();
        app.expand();
        resolve(app);
      } else {
        resolve(null);
      }
    };
    if (window.Telegram?.WebApp) return done();
    const script = document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.onload = done;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loading;
}
