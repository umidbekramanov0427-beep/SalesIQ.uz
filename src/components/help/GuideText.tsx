import type { ReactNode } from "react";

// The guides' tiny markup: **bold** for buttons and menu names, `code` for
// literal values. Nothing else.
export function GuideText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={i++} className="font-semibold text-foreground">
          {m[1]}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={i++} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
          {m[2]}
        </code>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <>{nodes}</>;
}
