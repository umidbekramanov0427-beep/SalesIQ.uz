// Installing SalesIQ as an app (PWA): registers the service worker once
// the app has loaded, and keeps the browser's install offer
// (beforeinstallprompt, Chrome/Edge/Android) so a button can show it later.
// Safari has no such offer: iPhone/iPad users add it from the Share menu.
import { useSyncExternalStore } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

let started = false;
/** Called once from the signed-in app shell. */
export function startPwa(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPrompt;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
  if ("serviceWorker" in navigator) {
    const register = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }
}

export type InstallState = "installed" | "available" | "ios" | "manual";

function snapshot(): InstallState {
  if (installed || isStandalone()) return "installed";
  if (deferred) return "available";
  return isIos() ? "ios" : "manual";
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => "manual",
  );
}

/** Shows the browser's install dialog; true when the person installed it. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const prompt = deferred;
  deferred = null;
  await prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === "accepted") installed = true;
  emit();
  return outcome === "accepted";
}
