import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Big card values (sums, counts, percentages) used to either spill out of
// their card or get cut off with "…" once the number grew long -- e.g.
// "UZS 1 250 000 000" in a narrow stat tile. This keeps the value on one
// line and scales its font down just enough to fit the space it actually
// has (re-measured whenever that space or the text changes). Only if even
// `minScale` of the original size still doesn't fit does it fall back to
// wrapping, so the full value is always visible and never leaves the card.
export function FitText({
  children,
  className,
  minScale = 0.45,
}: {
  children: ReactNode;
  className?: string;
  minScale?: number;
}) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  const [wrap, setWrap] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;

    const fit = () => {
      // Measure at full size with no wrapping, then scale against the box.
      text.style.fontSize = "1em";
      text.style.whiteSpace = "nowrap";
      const available = box.clientWidth;
      const natural = text.scrollWidth;
      let next = 1;
      if (available > 0 && natural > available) next = available / natural;
      const tooLong = next < minScale;
      const clamped = Math.max(minScale, next * 0.98);
      text.style.fontSize = `${clamped}em`;
      text.style.whiteSpace = tooLong ? "normal" : "nowrap";
      setScale(clamped);
      setWrap(tooLong);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    // Count-up animations and live data change the text without re-rendering
    // this component, so watch the content itself too.
    const mutations = new MutationObserver(fit);
    mutations.observe(text, { characterData: true, childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [children, minScale]);

  return (
    <span ref={boxRef} className={cn("block w-full min-w-0 max-w-full", className)}>
      <span
        ref={textRef}
        className={cn("inline-block max-w-full", wrap && "[overflow-wrap:anywhere]")}
        style={{ fontSize: `${scale}em`, whiteSpace: wrap ? "normal" : "nowrap" }}
      >
        {children}
      </span>
    </span>
  );
}
