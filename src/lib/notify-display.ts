// Where the on-screen notification cards appear (5CRM's «Ekranda qayerda
// chiqsin»: one choice per person, the same for every funnel) and the
// «Ekranda ko'rish» preview: a sample card shown only on this screen.

export type NotifyCorner = "tl" | "tr" | "bl" | "br";
export const NOTIFY_CORNERS: readonly NotifyCorner[] = ["tl", "tr", "bl", "br"];
export const DEFAULT_CORNER: NotifyCorner = "bl";

const KEY = "salesiq.notifyCorner";
const EVENT = "salesiq:notify-corner";
export const PREVIEW_EVENT = "salesiq:notify-preview";

export function readCorner(): NotifyCorner {
  try {
    const v = localStorage.getItem(KEY);
    return (NOTIFY_CORNERS as readonly string[]).includes(v ?? "")
      ? (v as NotifyCorner)
      : DEFAULT_CORNER;
  } catch {
    return DEFAULT_CORNER;
  }
}

export function saveCorner(c: NotifyCorner) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* private mode: this tab only */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: c }));
}

export function onCornerChange(cb: (c: NotifyCorner) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<NotifyCorner>).detail);
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

/** The deck's place on the screen; the rail is 72 px wide on the left. */
export function cornerClass(c: NotifyCorner): string {
  switch (c) {
    case "tl":
      return "top-20 left-3 lg:left-[92px]";
    case "tr":
      return "top-20 right-3 lg:right-6";
    case "br":
      return "bottom-24 right-3 lg:bottom-6 lg:right-24";
    default:
      return "bottom-24 left-3 lg:bottom-6 lg:left-[92px]";
  }
}

export type NotifyPreview = { type: string; title: string; body: string };

/** Shows a sample card on this screen only (nothing is sent to anyone). */
export function previewNotification(p: NotifyPreview) {
  window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: p }));
}
