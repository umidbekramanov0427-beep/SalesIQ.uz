import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Bot,
  Clock,
  Copy,
  Flag,
  GitBranch,
  Hand,
  Hourglass,
  LayoutGrid,
  Maximize2,
  MessageSquare,
  Minus,
  Play,
  Plus,
  Square,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { END_STEP, type BotStep, type BotStepType, type StepPos } from "@/lib/automation-types";

// amoCRM-style salesbot canvas. Every exit of a block ("Keyingi", "Javob
// kelsa", "Ha", a button...) is a port on its right edge:
//   * an open port shows a "+" -- click it to add the next block right there,
//     already connected; or drag it onto an existing block to connect;
//   * a connected port can be dragged onto another block to re-link, or onto
//     empty space to disconnect (= the bot ends there).
// Blocks are dragged by their header; the background pans; the wheel zooms.
// Block geometry is fixed so links can be drawn without measuring the DOM.

const NODE_W = 260;
const HEADER_H = 38;
const PREVIEW_H = 46;
const PORT_H = 30;
const FOOT_H = 6;
const START_POS: StepPos = { x: 20, y: 80 };
const START_W = 150;
const START_H = 40;
const COL_GAP = 110;
const ROW_GAP = 36;

export const STEP_ICON: Record<BotStepType, LucideIcon> = {
  message: MessageSquare,
  wait_reply: Clock,
  condition: GitBranch,
  action: Zap,
  delay: Hourglass,
  handoff: Hand,
  stop: Square,
};

/** Accent per step type: [icon chip, soft header background]. */
export const STEP_TONE: Record<BotStepType, [string, string]> = {
  message: ["bg-sky-500", "bg-sky-500/8"],
  wait_reply: ["bg-amber-500", "bg-amber-500/8"],
  condition: ["bg-violet-500", "bg-violet-500/8"],
  action: ["bg-emerald-500", "bg-emerald-500/8"],
  delay: ["bg-orange-500", "bg-orange-500/8"],
  handoff: ["bg-rose-500", "bg-rose-500/8"],
  stop: ["bg-slate-500", "bg-slate-500/8"],
};

type Port = { key: string; label: string; target: string | undefined };

function nonUrlButtons(step: Extract<BotStep, { type: "message" }>) {
  return (step.buttons ?? []).map((b, i) => ({ b, i })).filter(({ b }) => !b.url);
}

export function portsOf(step: BotStep, t: (k: string) => string): Port[] {
  switch (step.type) {
    case "message": {
      const options = nonUrlButtons(step);
      return [
        ...options.map(({ b, i }) => ({
          key: `btn:${i}`,
          label: b.label || `${t("sb.button")} ${i + 1}`,
          target: b.next,
        })),
        {
          key: "next",
          label: options.length ? t("sb.portOther") : t("sb.portNext"),
          target: step.next,
        },
      ];
    }
    case "wait_reply":
      return [
        { key: "next", label: t("sb.onReply"), target: step.next },
        ...(step.timeoutMinutes > 0
          ? [{ key: "onTimeout", label: t("sb.onTimeout"), target: step.onTimeout }]
          : []),
      ];
    case "condition":
      return [
        { key: "then", label: t("sb.ifYes"), target: step.then },
        { key: "else", label: t("sb.ifNo"), target: step.else },
      ];
    case "action":
    case "delay":
      return [{ key: "next", label: t("sb.portNext"), target: step.next }];
    default:
      return [];
  }
}

const isOpen = (target: string | undefined) => !target || target === END_STEP;

export function setPortTarget(step: BotStep, key: string, target: string): BotStep {
  if (key.startsWith("btn:") && step.type === "message") {
    const i = Number(key.slice(4));
    return {
      ...step,
      buttons: (step.buttons ?? []).map((b, j) => (j === i ? { ...b, next: target } : b)),
    };
  }
  if (key === "then" && step.type === "condition") return { ...step, then: target };
  if (key === "else" && step.type === "condition") return { ...step, else: target };
  if (key === "onTimeout" && step.type === "wait_reply") return { ...step, onTimeout: target };
  if (
    key === "next" &&
    (step.type === "message" ||
      step.type === "action" ||
      step.type === "delay" ||
      step.type === "wait_reply")
  )
    return { ...step, next: target } as BotStep;
  return step;
}

/** Makes every implicit "next in list" link explicit and gives each block a position. */
export function normalizeSteps(steps: BotStep[]): BotStep[] {
  const out = steps.map((s, i) => {
    const follow = steps[i + 1]?.id ?? END_STEP;
    switch (s.type) {
      case "message": {
        const next = s.next ?? follow;
        return {
          ...s,
          next,
          ...(s.buttons
            ? { buttons: s.buttons.map((b) => (b.url ? b : { ...b, next: b.next ?? next })) }
            : {}),
        };
      }
      case "wait_reply": {
        const next = s.next ?? follow;
        return {
          ...s,
          next,
          ...(s.timeoutMinutes > 0 ? { onTimeout: s.onTimeout ?? next } : {}),
        };
      }
      case "condition":
        return { ...s, then: s.then ?? follow, else: s.else ?? follow };
      case "action":
      case "delay":
        return { ...s, next: s.next ?? follow };
      default:
        return s;
    }
  });
  return out.some((s) => !s.pos) ? autoLayout(out) : out;
}

/** Removes a step and points every link that led to it at "end". */
export function removeStep(steps: BotStep[], id: string): BotStep[] {
  return steps
    .filter((s) => s.id !== id)
    .map((s) => {
      let out = s;
      for (const p of portsOf(s, (k) => k)) {
        if (p.target === id) out = setPortTarget(out, p.key, END_STEP);
      }
      return out;
    });
}

function nodeHeight(step: BotStep) {
  return HEADER_H + PREVIEW_H + portsOf(step, (k) => k).length * PORT_H + FOOT_H;
}

function overlaps(steps: BotStep[], pos: StepPos, h: number) {
  return steps.some((s) => {
    const p = s.pos;
    if (!p) return false;
    return (
      pos.x < p.x + NODE_W + 20 &&
      pos.x + NODE_W + 20 > p.x &&
      pos.y < p.y + nodeHeight(s) + 16 &&
      pos.y + h + 16 > p.y
    );
  });
}

/** Lays the bot out left-to-right by depth from the first step. */
export function autoLayout(steps: BotStep[]): BotStep[] {
  if (steps.length === 0) return steps;
  const byId = new Map(steps.map((s) => [s.id, s]));
  const level = new Map<string, number>();
  const order: string[] = [];
  const queue = [steps[0]!.id];
  level.set(steps[0]!.id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    const s = byId.get(id)!;
    for (const p of portsOf(s, (k) => k)) {
      if (p.target && byId.has(p.target) && !level.has(p.target)) {
        level.set(p.target, level.get(id)! + 1);
        queue.push(p.target);
      }
    }
  }
  const maxLevel = Math.max(0, ...level.values());
  for (const s of steps) {
    if (!level.has(s.id)) {
      level.set(s.id, maxLevel + 1);
      order.push(s.id);
    }
  }
  const colY = new Map<number, number>();
  const pos = new Map<string, StepPos>();
  for (const id of order) {
    const l = level.get(id)!;
    const y = colY.get(l) ?? START_POS.y;
    pos.set(id, { x: START_POS.x + START_W + COL_GAP + l * (NODE_W + COL_GAP), y });
    colY.set(l, y + nodeHeight(byId.get(id)!) + ROW_GAP);
  }
  return steps.map((s) => ({ ...s, pos: pos.get(s.id)! }));
}

/**
 * Where "the next step" goes: the first open exit of `preferId` when given,
 * otherwise of the most recently added block that still has one -- so adding
 * blocks one after another builds a chain.
 */
export function firstOpenPort(
  steps: BotStep[],
  preferId?: string | null,
): { id: string; port: string } | null {
  const open = (s: BotStep) => portsOf(s, (k) => k).find((p) => isOpen(p.target));
  if (preferId) {
    const s = steps.find((x) => x.id === preferId);
    const p = s && open(s);
    return s && p ? { id: s.id, port: p.key } : null;
  }
  for (let i = steps.length - 1; i >= 0; i--) {
    const p = open(steps[i]!);
    if (p) return { id: steps[i]!.id, port: p.key };
  }
  return null;
}

/**
 * Adds `step` to the bot. With `from`, it goes to the right of that exit and
 * the exit is connected to it; with no steps yet it becomes the first step;
 * otherwise it is placed in free space to the right.
 */
export function insertStep(
  steps: BotStep[],
  step: BotStep,
  from: { id: string; port: string } | null,
): BotStep[] {
  const h = nodeHeight(step);
  let pos: StepPos;
  const source = from ? steps.find((s) => s.id === from.id) : undefined;
  if (source?.pos) {
    const idx = Math.max(
      0,
      portsOf(source, (k) => k).findIndex((p) => p.key === from!.port),
    );
    pos = {
      x: source.pos.x + NODE_W + COL_GAP,
      y: source.pos.y + HEADER_H + PREVIEW_H + idx * PORT_H - HEADER_H / 2,
    };
  } else if (steps.length === 0) {
    pos = { x: START_POS.x + START_W + COL_GAP, y: START_POS.y };
  } else {
    const right = Math.max(...steps.map((s) => s.pos?.x ?? 0));
    pos = { x: right + NODE_W + COL_GAP, y: START_POS.y };
  }
  while (overlaps(steps, pos, h)) pos = { ...pos, y: pos.y + 40 };
  const added = { ...step, pos };
  const linked = from
    ? steps.map((s) => (s.id === from.id ? setPortTarget(s, from.port, step.id) : s))
    : steps;
  return [...linked, added];
}

/** A copy of a block (its exits cleared), placed just below it. */
export function duplicateStep(steps: BotStep[], id: string, newId: string): BotStep[] {
  const s = steps.find((x) => x.id === id);
  if (!s) return steps;
  let copy = { ...s, id: newId } as BotStep;
  for (const p of portsOf(copy, (k) => k)) copy = setPortTarget(copy, p.key, END_STEP);
  let pos = { x: (s.pos?.x ?? 0) + 30, y: (s.pos?.y ?? 0) + nodeHeight(s) + ROW_GAP };
  while (overlaps(steps, pos, nodeHeight(copy))) pos = { ...pos, y: pos.y + 40 };
  return [...steps, { ...copy, pos }];
}

export function stepPreview(
  step: BotStep,
  t: (k: string, v?: Record<string, string | number>) => string,
) {
  switch (step.type) {
    case "message":
      return step.text || t("sb.previewEmptyMessage");
    case "wait_reply":
      return step.timeoutMinutes > 0
        ? t("sb.previewWait", { min: step.timeoutMinutes })
        : t("sb.previewWaitForever");
    case "condition":
      return step.operator === "phone"
        ? t("sb.previewPhone")
        : `${step.source === "reply" ? t("sb.lastReply") : (step.field ?? "")} · ${t(`sb.op.${step.operator}`)} ${step.value}`;
    case "action":
      return t(`dp.action.${step.action.type}`);
    case "delay":
      return t("sb.previewDelay", { min: step.minutes });
    case "handoff":
      return step.text || t("sb.handoffHint");
    case "stop":
      return t("sb.stopHint");
  }
}

type Drag =
  | { mode: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { mode: "node"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | {
      mode: "link";
      from: string;
      port: string;
      x: number;
      y: number;
      sx: number;
      sy: number;
      moved: boolean;
    };

type Menu = { from: { id: string; port: string } | null; x: number; y: number };

export function BotCanvas({
  steps,
  onChange,
  selectedId,
  onSelect,
  makeStep,
  makeId,
  addOptions,
  className,
}: {
  steps: BotStep[];
  onChange: (steps: BotStep[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Creates a fresh block of a type (its exits pointing at "end"). */
  makeStep: (type: BotStepType) => BotStep;
  makeId: () => string;
  addOptions: BotStepType[];
  className?: string;
}) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.9 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const byId = useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = wrapRef.current!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - view.x) / view.zoom,
        y: (clientY - rect.top - view.y) / view.zoom,
      };
    },
    [view],
  );

  const fitTo = useCallback((list: BotStep[]) => {
    const el = wrapRef.current;
    if (!el) return;
    const xs = [START_POS.x, ...list.map((s) => s.pos?.x ?? 0)];
    const ys = [START_POS.y, ...list.map((s) => s.pos?.y ?? 0)];
    const minX = Math.min(...xs) - 30;
    const minY = Math.min(...ys) - 30;
    const maxX = Math.max(START_POS.x + START_W, ...list.map((s) => (s.pos?.x ?? 0) + NODE_W)) + 80;
    const maxY = Math.max(240, ...list.map((s) => (s.pos?.y ?? 0) + nodeHeight(s))) + 40;
    const zoom = Math.max(
      0.35,
      Math.min(1, el.clientWidth / (maxX - minX), el.clientHeight / (maxY - minY)),
    );
    setView({ zoom, x: -minX * zoom, y: -minY * zoom });
  }, []);

  // Fit once when a bot opens.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = steps[0]?.id ?? "empty";
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    fitTo(steps);
  }, [steps, fitTo]);

  // Bring the selected block into view (e.g. one just added from the panel).
  useEffect(() => {
    const el = wrapRef.current;
    const s = selectedId ? byId.get(selectedId) : undefined;
    if (!el || !s?.pos) return;
    const sx = s.pos.x * view.zoom + view.x;
    const sy = s.pos.y * view.zoom + view.y;
    const w = NODE_W * view.zoom;
    const h = nodeHeight(s) * view.zoom;
    if (sx >= 8 && sy >= 8 && sx + w <= el.clientWidth - 8 && sy + h <= el.clientHeight - 8) return;
    setView((v) => ({
      ...v,
      x: el.clientWidth / 2 - (s.pos!.x + NODE_W / 2) * v.zoom,
      y: el.clientHeight / 2 - (s.pos!.y + nodeHeight(s) / 2) * v.zoom,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the selection changes
  }, [selectedId]);

  // Wheel zoom around the cursor (non-passive so the page doesn't scroll).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      setView((v) => {
        const zoom = Math.min(1.6, Math.max(0.3, v.zoom * (1 - e.deltaY * 0.0015)));
        const k = zoom / v.zoom;
        return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function zoomBy(k: number) {
    const el = wrapRef.current;
    const cx = (el?.clientWidth ?? 800) / 2;
    const cy = (el?.clientHeight ?? 500) / 2;
    setView((v) => {
      const zoom = Math.min(1.6, Math.max(0.3, v.zoom * k));
      const r = zoom / v.zoom;
      return { zoom, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
    });
  }

  function startPan(e: PointerEvent) {
    if (e.button !== 0) return;
    setMenu(null);
    wrapRef.current?.setPointerCapture(e.pointerId);
    setDrag({ mode: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false });
  }

  function startNode(e: PointerEvent, id: string) {
    e.stopPropagation();
    if (e.button !== 0) return;
    setMenu(null);
    const pos = byId.get(id)?.pos ?? { x: 0, y: 0 };
    wrapRef.current?.setPointerCapture(e.pointerId);
    setDrag({ mode: "node", id, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false });
  }

  function startLink(e: PointerEvent, from: string, port: string) {
    e.stopPropagation();
    if (e.button !== 0) return;
    setMenu(null);
    wrapRef.current?.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    setDrag({
      mode: "link",
      from,
      port,
      x: w.x,
      y: w.y,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
    });
  }

  function onMove(e: PointerEvent) {
    if (!drag) return;
    const dist = Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy);
    if (drag.mode === "pan") {
      setView((v) => ({
        ...v,
        x: drag.ox + e.clientX - drag.sx,
        y: drag.oy + e.clientY - drag.sy,
      }));
      if (!drag.moved && dist > 3) setDrag({ ...drag, moved: true });
    } else if (drag.mode === "node") {
      if (!drag.moved && dist < 4) return;
      const dx = (e.clientX - drag.sx) / view.zoom;
      const dy = (e.clientY - drag.sy) / view.zoom;
      onChange(
        steps.map((s) =>
          s.id === drag.id
            ? { ...s, pos: { x: Math.round(drag.ox + dx), y: Math.round(drag.oy + dy) } }
            : s,
        ),
      );
      if (!drag.moved) setDrag({ ...drag, moved: true });
    } else {
      const w = toWorld(e.clientX, e.clientY);
      setDrag({ ...drag, x: w.x, y: w.y, moved: drag.moved || dist > 4 });
    }
  }

  function onUp(e: PointerEvent) {
    if (!drag) return;
    if (drag.mode === "pan" && !drag.moved) onSelect(null);
    if (drag.mode === "node" && !drag.moved) onSelect(drag.id);
    if (drag.mode === "link") {
      const from = drag.from === "__start__" ? null : { id: drag.from, port: drag.port };
      const src = from ? byId.get(from.id) : undefined;
      const current = src ? portsOf(src, t).find((p) => p.key === from!.port)?.target : undefined;
      if (!drag.moved) {
        // A click: on an open exit (or the empty start) open the "add next" menu.
        if ((drag.from === "__start__" && steps.length === 0) || (src && isOpen(current))) {
          const rect = wrapRef.current!.getBoundingClientRect();
          setMenu({ from, x: e.clientX - rect.left, y: e.clientY - rect.top });
        }
      } else {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]");
        const target = el?.getAttribute("data-node-id") ?? null;
        if (drag.from === "__start__") {
          const idx = target ? steps.findIndex((s) => s.id === target) : -1;
          if (idx > 0) onChange([steps[idx]!, ...steps.slice(0, idx), ...steps.slice(idx + 1)]);
        } else if (src) {
          const next = target && target !== drag.from ? target : END_STEP;
          onChange(steps.map((s) => (s.id === drag.from ? setPortTarget(s, drag.port, next) : s)));
        }
      }
    }
    setDrag(null);
  }

  function addFromMenu(type: BotStepType) {
    if (!menu) return;
    const step = makeStep(type);
    onChange(insertStep(steps, step, menu.from));
    onSelect(step.id);
    setMenu(null);
  }

  // Link geometry
  const portAnchor = (step: BotStep, index: number) => ({
    x: (step.pos?.x ?? 0) + NODE_W,
    y: (step.pos?.y ?? 0) + HEADER_H + PREVIEW_H + index * PORT_H + PORT_H / 2,
  });
  const inputAnchor = (step: BotStep) => ({
    x: step.pos?.x ?? 0,
    y: (step.pos?.y ?? 0) + HEADER_H / 2,
  });
  const curve = (a: StepPos, b: StepPos) => {
    const dx = Math.max(50, Math.abs(b.x - a.x) / 2);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
  };

  const edges: { key: string; d: string; active: boolean }[] = [];
  const first = steps[0];
  const startAnchor = { x: START_POS.x + START_W, y: START_POS.y + START_H / 2 };
  if (first)
    edges.push({
      key: "start",
      d: curve(startAnchor, inputAnchor(first)),
      active: selectedId === first.id,
    });
  for (const s of steps) {
    portsOf(s, t).forEach((p, i) => {
      const target = p.target ? byId.get(p.target) : undefined;
      if (target)
        edges.push({
          key: `${s.id}:${p.key}`,
          d: curve(portAnchor(s, i), inputAnchor(target)),
          active: selectedId === s.id || selectedId === target.id,
        });
    });
  }
  let draft: string | null = null;
  if (drag?.mode === "link" && drag.moved) {
    const from =
      drag.from === "__start__"
        ? startAnchor
        : (() => {
            const s = byId.get(drag.from);
            if (!s) return null;
            const i = portsOf(s, t).findIndex((p) => p.key === drag.port);
            return portAnchor(s, Math.max(0, i));
          })();
    if (from) draft = curve(from, { x: drag.x, y: drag.y });
  }

  return (
    <div
      ref={wrapRef}
      onPointerDown={startPan}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className={cn(
        "relative touch-none select-none overflow-hidden rounded-2xl border border-border bg-surface",
        drag?.mode === "pan" && drag.moved ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
      style={{
        backgroundImage: "radial-gradient(var(--color-border) 1.2px, transparent 1.2px)",
        backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <svg
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width="1"
          height="1"
        >
          <defs>
            <marker
              id="sb-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-primary)" />
            </marker>
          </defs>
          {edges.map((e) => (
            <path
              key={e.key}
              d={e.d}
              fill="none"
              stroke="var(--color-primary)"
              strokeOpacity={e.active ? 0.95 : 0.45}
              strokeWidth={e.active ? 2.5 : 2}
              markerEnd="url(#sb-arrow)"
            />
          ))}
          {draft && (
            <path
              d={draft}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
        </svg>

        {/* Start block */}
        <div
          className="absolute flex items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 text-xs font-bold text-emerald-700 shadow-sm dark:text-emerald-300"
          style={{ left: START_POS.x, top: START_POS.y, width: START_W, height: START_H }}
        >
          <Play className="h-3.5 w-3.5 fill-current" /> {t("sb.start")}
          {steps.length === 0 ? (
            <PlusPort
              onPointerDown={(e) => startLink(e, "__start__", "start")}
              title={t("sb.addFirst")}
            />
          ) : (
            <span
              onPointerDown={(e) => startLink(e, "__start__", "start")}
              className="absolute -right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-card bg-emerald-500"
            />
          )}
        </div>

        {steps.map((s, idx) => {
          const Icon = STEP_ICON[s.type];
          const [chip, soft] = STEP_TONE[s.type];
          const ports = portsOf(s, t);
          const selected = selectedId === s.id;
          return (
            <div
              key={s.id}
              data-node-id={s.id}
              className={cn(
                "group absolute rounded-2xl border bg-card shadow-sm transition-shadow",
                selected
                  ? "border-primary shadow-lg ring-2 ring-primary/25"
                  : "border-border hover:shadow-md",
              )}
              style={{ left: s.pos?.x ?? 0, top: s.pos?.y ?? 0, width: NODE_W }}
            >
              {/* input dot */}
              <span
                className="absolute -left-1.5 h-3 w-3 rounded-full border-2 border-card bg-muted-foreground/50"
                style={{ top: HEADER_H / 2 - 6 }}
              />
              <div
                onPointerDown={(e) => startNode(e, s.id)}
                className={cn(
                  "flex cursor-move items-center gap-2 rounded-t-2xl border-b border-border px-3",
                  soft,
                )}
                style={{ height: HEADER_H }}
              >
                <span className={cn("grid h-6 w-6 place-items-center rounded-lg text-white", chip)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
                  {t(`sb.step.${s.type}`)}
                </span>
                {idx === 0 && (
                  <Flag
                    className="h-3.5 w-3.5 shrink-0 text-emerald-500"
                    aria-label={t("sb.start")}
                  />
                )}
                <span className="shrink-0 rounded-md bg-background/70 px-1.5 text-[10px] font-bold tabular-nums text-subtle group-hover:hidden">
                  #{idx + 1}
                </span>
                <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      const id = makeId();
                      onChange(duplicateStep(steps, s.id, id));
                      onSelect(id);
                    }}
                    title={t("sb.duplicate")}
                    aria-label={t("sb.duplicate")}
                    className="grid h-6 w-6 place-items-center rounded-md text-subtle hover:bg-background hover:text-foreground"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => {
                      onChange(removeStep(steps, s.id));
                      if (selected) onSelect(null);
                    }}
                    title={t("sb.deleteBlock")}
                    aria-label={t("sb.deleteBlock")}
                    className="grid h-6 w-6 place-items-center rounded-md text-subtle hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(s.id)}
                className="block w-full px-3 py-2 text-left"
                style={{ height: PREVIEW_H }}
              >
                <span
                  className={cn(
                    "line-clamp-2 whitespace-pre-line text-[11.5px] leading-snug",
                    s.type === "message" && !s.text
                      ? "italic text-subtle"
                      : "text-muted-foreground",
                  )}
                >
                  {stepPreview(s, t)}
                </span>
              </button>
              {ports.map((p) => {
                const open = isOpen(p.target);
                return (
                  <div
                    key={p.key}
                    className="relative flex items-center justify-end border-t border-border/60 pl-3 pr-5 text-[11.5px]"
                    style={{ height: PORT_H }}
                  >
                    <span
                      className={cn(
                        "truncate",
                        open ? "text-subtle" : "font-medium text-foreground",
                      )}
                    >
                      {p.label}
                    </span>
                    {open ? (
                      <PlusPort
                        onPointerDown={(e) => startLink(e, s.id, p.key)}
                        title={t("sb.addHere")}
                      />
                    ) : (
                      <span
                        onPointerDown={(e) => startLink(e, s.id, p.key)}
                        title={t("sb.relinkHint")}
                        className="absolute -right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-card bg-primary"
                      />
                    )}
                  </div>
                );
              })}
              <div style={{ height: FOOT_H }} />
            </div>
          );
        })}
      </div>

      {/* "Add next" menu */}
      {menu && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-20 w-64 rounded-xl border border-border bg-popover p-1.5 shadow-xl"
          style={{
            left: Math.min(menu.x + 12, (wrapRef.current?.clientWidth ?? 800) - 270),
            top: Math.min(menu.y - 12, (wrapRef.current?.clientHeight ?? 600) - 330),
          }}
        >
          <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-subtle">
            {t("sb.addHere")}
          </p>
          {addOptions.map((type) => {
            const Icon = STEP_ICON[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => addFromMenu(type)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
              >
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white",
                    STEP_TONE[type][0],
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-semibold text-foreground">
                    {t(`sb.step.${type}`)}
                  </span>
                  <span className="block truncate text-[11px] text-subtle">
                    {t(`sb.stepDesc.${type}`)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Zoom / layout controls */}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-sm"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            const laid = autoLayout(steps);
            onChange(laid);
            fitTo(laid);
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t("sb.autoLayout")}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> {t("sb.autoLayout")}
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.2)}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          aria-label={t("misc.zoomOut")}
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-10 text-center text-[11px] tabular-nums text-subtle">
          {Math.round(view.zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomBy(1.2)}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          aria-label={t("misc.zoomIn")}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => fitTo(steps)}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          aria-label={t("sb.fit")}
          title={t("sb.fit")}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {steps.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-subtle">
          <span className="flex items-center gap-2 rounded-xl bg-card/80 px-3 py-2 shadow-sm">
            <Bot className="h-4 w-4" /> {t("sb.emptyCanvas")}
          </span>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-3 left-3 max-w-[55%] text-[11px] leading-snug text-subtle">
        {t("sb.canvasHint")}
      </p>
    </div>
  );
}

function PlusPort({
  onPointerDown,
  title,
}: {
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      title={title}
      aria-label={title}
      className="absolute -right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-md transition-transform hover:scale-110"
    >
      <Plus className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}
