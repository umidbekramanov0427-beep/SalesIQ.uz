import { useEffect, useState } from "react";

// The browser's page zoom (Cmd/Ctrl + / -), so the sidebar rail can keep
// its on-screen size while the page around it zooms. Browsers don't expose
// the zoom level; outerWidth (screen pixels) / innerWidth (CSS pixels) is
// the zoom, give or take the window's borders and a docked devtools panel
// -- so it is snapped to the levels browsers offer, and anything that isn't
// near one of them is treated as 100%.
const LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

export function readBrowserZoom(): number {
  if (typeof window === "undefined" || !window.innerWidth || !window.outerWidth) return 1;
  // Phones have their own layout and no page zoom to undo.
  if (document.documentElement.classList.contains("phone")) return 1;
  const ratio = window.outerWidth / window.innerWidth;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1;
  const near = LEVELS.reduce((a, b) => (Math.abs(b - ratio) < Math.abs(a - ratio) ? b : a));
  return Math.abs(near - ratio) <= near * 0.035 ? near : 1;
}

/** The current page zoom (1 = 100%), updated when it changes (a zoom fires resize). */
export function useBrowserZoom(): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const update = () => setZoom(readBrowserZoom());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return zoom;
}
