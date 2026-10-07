import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Bot,
  Clock,
  Flag,
  GitBranch,
  Hand,
  Maximize2,
  MessageSquare,
  Minus,
  Play,
  Plus,
  Square,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { END_STEP, type BotStep, type BotStepType, type StepPos } from "@/lib/automation-types";

// amoCRM-style salesbot canvas: steps are blocks you drag around, each exit
// ("Javob kelsa", "Ha", a button...) is a port you drag onto another block
// to connect them; dropping a link on empty space disconnects it (= the bot
// ends there). Pan by dragging the background, zoom with the wheel. Block
// geometry is fixed so links can be drawn without measuring the DOM.

const NODE_W = 250;
const HEADER_H = 34;
const PREVIEW_H = 42;
const PORT_H = 26;
const START_POS: StepPos = { x: 20, y: 60 };
const START_W = 150;

const STEP_ICON: Record<BotStepType, LucideIcon> = {
  message: MessageSquare,
  wait_reply: Clock,
  condition: GitBranch,
  action: Zap,
  delay: Clock,
  handoff: Hand,
  stop: Square,
};

const STEP_TONE: Record<BotStepType, string> = {
  message: "bg-primary",
  wait_reply: "bg-amber-500",
  condition: "bg-violet-500",
  action: "bg-emerald-500",
  delay: "bg-amber-500",
  handoff: "bg-rose-500",
  stop: "bg-slate-500",
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
  return steps.map((s, i) => {
    const follow = steps[i + 1]?.id ?? END_STEP;
    const pos = s.pos ?? { x: 230 + (i % 5) * 300, y: 60 + Math.floor(i / 5) * 280 };
    switch (s.type) {
      case "message": {
        const next = s.next ?? follow;
        return {
          ...s,
          pos,
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
          pos,
          next,
          ...(s.timeoutMinutes > 0 ? { onTimeout: s.onTimeout ?? next } : {}),
        };
      }
      case "condition":
        return { ...s, pos, then: s.then ?? follow, else: s.else ?? follow };
      case "action":
      case "delay":
        return { ...s, pos, next: s.next ?? follow };
      default:
        return { ...s, pos };
    }
  });
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

function preview(step: BotStep, t: (k: string, v?: Record<string, string | number>) => string) {
  switch (step.type) {
    case "message":
      return step.text || "…";
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

function nodeHeight(step: BotStep, t: (k: string) => string) {
  return HEADER_H + PREVIEW_H + portsOf(step, t).length * PORT_H + 8;
}

type Drag =
  | { mode: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { mode: "node"; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { mode: "link"; from: string; port: string; x: number; y: number };

export function BotCanvas({
  steps,
  onChange,
  selectedId,
  onSelect,
  onAdd,
  addOptions,
}: {
  steps: BotStep[];
  onChange: (steps: BotStep[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (type: BotStepType, pos: StepPos) => void;
  addOptions: BotStepType[];
}) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.85 });
  const [drag, setDrag] = useState<Drag | null>(null);
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

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const xs = [START_POS.x, ...steps.map((s) => s.pos?.x ?? 0)];
    const ys = [START_POS.y, ...steps.map((s) => s.pos?.y ?? 0)];
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX =
      Math.max(...steps.map((s) => (s.pos?.x ?? 0) + NODE_W), START_POS.x + START_W) + 40;
    const maxY = Math.max(...steps.map((s) => (s.pos?.y ?? 0) + nodeHeight(s, t)), 200) + 40;
    const zoom = Math.min(1, el.clientWidth / (maxX - minX), el.clientHeight / (maxY - minY));
    setView({ zoom, x: -minX * zoom, y: -minY * zoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps.length]);

  // Fit once when a bot opens.
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = steps[0]?.id ?? "empty";
    if (fittedFor.current === key) return;
    fittedFor.current = key;
    fit();
  }, [steps, fit]);

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
        const zoom = Math.min(1.6, Math.max(0.25, v.zoom * (1 - e.deltaY * 0.0015)));
        const k = zoom / v.zoom;
        return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function startPan(e: PointerEvent) {
    if (e.button !== 0) return;
    wrapRef.current?.setPointerCapture(e.pointerId);
    setDrag({ mode: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false });
  }

  function startNode(e: PointerEvent, id: string) {
    e.stopPropagation();
    if (e.button !== 0) return;
    const pos = byId.get(id)?.pos ?? { x: 0, y: 0 };
    wrapRef.current?.setPointerCapture(e.pointerId);
    setDrag({ mode: "node", id, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false });
  }

  function startLink(e: PointerEvent, from: string, port: string) {
    e.stopPropagation();
    wrapRef.current?.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    setDrag({ mode: "link", from, port, x: w.x, y: w.y });
  }

  function onMove(e: PointerEvent) {
    if (!drag) return;
    if (drag.mode === "pan") {
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      setView((v) => ({ ...v, x: drag.ox + dx, y: drag.oy + dy }));
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) setDrag({ ...drag, moved: true });
    } else if (drag.mode === "node") {
      const dx = (e.clientX - drag.sx) / view.zoom;
      const dy = (e.clientY - drag.sy) / view.zoom;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
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
      setDrag({ ...drag, x: w.x, y: w.y });
    }
  }

  function onUp(e: PointerEvent) {
    if (!drag) return;
    if (drag.mode === "pan" && !drag.moved) onSelect(null);
    if (drag.mode === "node" && !drag.moved) onSelect(drag.id);
    if (drag.mode === "link") {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-node-id]");
      const target = el?.getAttribute("data-node-id") ?? null;
      if (drag.from === "__start__") {
        if (target) {
          const idx = steps.findIndex((s) => s.id === target);
          if (idx > 0) onChange([steps[idx]!, ...steps.slice(0, idx), ...steps.slice(idx + 1)]);
        }
      } else {
        const source = byId.get(drag.from);
        if (source) {
          const next = target && target !== drag.from ? target : END_STEP;
          onChange(steps.map((s) => (s.id === drag.from ? setPortTarget(s, drag.port, next) : s)));
        }
      }
    }
    setDrag(null);
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

  const edges: { key: string; d: string }[] = [];
  const first = steps[0];
  const startAnchor = { x: START_POS.x + START_W, y: START_POS.y + 18 };
  if (first) edges.push({ key: "start", d: curve(startAnchor, inputAnchor(first)) });
  for (const s of steps) {
    portsOf(s, t).forEach((p, i) => {
      const target = p.target ? byId.get(p.target) : undefined;
      if (target)
        edges.push({ key: `${s.id}:${p.key}`, d: curve(portAnchor(s, i), inputAnchor(target)) });
    });
  }
  let draft: string | null = null;
  if (drag?.mode === "link") {
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

  function addAtCenter(type: BotStepType) {
    const el = wrapRef.current;
    const cx = el ? el.clientWidth / 2 : 400;
    const cy = el ? el.clientHeight / 2 : 300;
    onAdd(type, {
      x: Math.round((cx - view.x) / view.zoom - NODE_W / 2),
      y: Math.round((cy - view.y) / view.zoom - 60),
    });
  }

  return (
    <div
      ref={wrapRef}
      onPointerDown={startPan}
      onPointerMove={onMove}
      onPointerUp={onUp}
      className={cn(
        "relative h-[620px] touch-none select-none overflow-hidden rounded-2xl border border-border bg-surface",
        drag?.mode === "pan" ? "cursor-grabbing" : "cursor-grab",
      )}
      style={{
        backgroundImage: "radial-gradient(var(--color-border) 1px, transparent 1px)",
        backgroundSize: `${22 * view.zoom}px ${22 * view.zoom}px`,
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
          {edges.map((e) => (
            <path
              key={e.key}
              d={e.d}
              fill="none"
              stroke="var(--color-primary)"
              strokeOpacity={0.55}
              strokeWidth={2}
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
          className="absolute flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-card px-3 py-2 text-xs font-semibold text-emerald-600 shadow-sm dark:text-emerald-400"
          style={{ left: START_POS.x, top: START_POS.y, width: START_W }}
        >
          <Play className="h-3.5 w-3.5" /> {t("sb.start")}
          <span
            onPointerDown={(e) => startLink(e, "__start__", "start")}
            className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-card bg-emerald-500"
          />
        </div>

        {steps.map((s, idx) => {
          const Icon = STEP_ICON[s.type];
          const ports = portsOf(s, t);
          return (
            <div
              key={s.id}
              data-node-id={s.id}
              className={cn(
                "absolute rounded-xl border bg-card shadow-sm",
                selectedId === s.id ? "border-primary ring-2 ring-primary/30" : "border-border",
              )}
              style={{ left: s.pos?.x ?? 0, top: s.pos?.y ?? 0, width: NODE_W }}
            >
              <div
                onPointerDown={(e) => startNode(e, s.id)}
                className="relative flex cursor-move items-center gap-2 border-b border-border px-3"
                style={{ height: HEADER_H }}
              >
                <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-card bg-muted-foreground/60" />
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-md text-white",
                    STEP_TONE[s.type],
                  )}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                  {idx + 1}. {t(`sb.step.${s.type}`)}
                </span>
                {idx === 0 && <Flag className="h-3 w-3 text-emerald-500" />}
              </div>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onSelect(s.id)}
                className="block w-full px-3 py-1.5 text-left"
                style={{ height: PREVIEW_H }}
              >
                <span className="line-clamp-2 whitespace-pre-line text-[11px] leading-snug text-muted-foreground">
                  {preview(s, t)}
                </span>
              </button>
              {ports.map((p) => (
                <div
                  key={p.key}
                  className="relative flex items-center justify-end border-t border-border/60 pl-3 pr-4 text-[11px] text-foreground"
                  style={{ height: PORT_H }}
                >
                  <span className="truncate">{p.label}</span>
                  <span
                    onPointerDown={(e) => startLink(e, s.id, p.key)}
                    className={cn(
                      "absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-card",
                      p.target && p.target !== END_STEP ? "bg-primary" : "bg-muted-foreground/40",
                    )}
                  />
                </div>
              ))}
              <div style={{ height: 8 }} />
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div
        className="absolute right-3 top-3 flex items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <select
          value=""
          onChange={(e) => e.target.value && addAtCenter(e.target.value as BotStepType)}
          className="h-8 rounded-lg bg-primary px-2 text-xs font-semibold text-primary-foreground outline-none"
        >
          <option value="">+ {t("sb.addStep")}</option>
          {addOptions.map((st) => (
            <option key={st} value={st}>
              {t(`sb.step.${st}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, zoom: Math.min(1.6, v.zoom * 1.2) }))}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          aria-label="zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, zoom: Math.max(0.25, v.zoom / 1.2) }))}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          aria-label="zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={fit}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent"
          aria-label={t("sb.fit")}
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {steps.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-subtle">
          <span className="flex items-center gap-2">
            <Bot className="h-4 w-4" /> {t("sb.emptyCanvas")}
          </span>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-subtle">
        {t("sb.canvasHint")}
      </p>
    </div>
  );
}
