import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

// A column whose width the person drags with the mouse, like amoCRM's
// imBox list and lead card: the width is remembered in this browser,
// double-clicking the handle puts it back. Desktop only -- phones stack
// the panes.

const STORAGE_PREFIX = "salesiq.width.";

function readWidth(key: string, fallback: number, min: number, max: number): number {
  try {
    const v = Number(window.localStorage.getItem(STORAGE_PREFIX + key));
    return Number.isFinite(v) && v >= min && v <= max ? v : fallback;
  } catch {
    return fallback;
  }
}

export function useResizableWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);
  // Read after mount: the server render has no localStorage.
  useEffect(() => setWidth(readWidth(key, initial, min, max)), [key, initial, min, max]);
  const save = useCallback(
    (w: number) => {
      try {
        window.localStorage.setItem(STORAGE_PREFIX + key, String(Math.round(w)));
      } catch {
        // Storage blocked: the width still applies until the page reloads.
      }
    },
    [key],
  );
  const drag = useRef<{ x: number; w: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    drag.current = { x: e.clientX, w: width };
    let last = width;
    const move = (ev: globalThis.PointerEvent) => {
      if (!drag.current) return;
      last = Math.min(max, Math.max(min, drag.current.w + ev.clientX - drag.current.x));
      setWidth(last);
    };
    const up = () => {
      drag.current = null;
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      save(last);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const reset = () => {
    setWidth(initial);
    save(initial);
  };

  return { width, handle: { onPointerDown, onDoubleClick: reset } };
}

/** The drag strip between two columns (put it right after the left one). */
export function ResizeHandle({
  label,
  className,
  ...handle
}: {
  label: string;
  className?: string;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
}) {
  return (
    <div className={cn("relative hidden w-0 shrink-0 lg:block phone:hidden", className)}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        title={label}
        {...handle}
        className="group absolute inset-y-0 -left-[5px] z-20 w-[10px] cursor-col-resize"
      >
        <span className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-transparent transition-colors group-hover:bg-primary/50 group-active:bg-primary" />
      </div>
    </div>
  );
}
