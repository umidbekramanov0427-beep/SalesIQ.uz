import { useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// A list card (managers, sources, channels, results) can be read as a list
// or as a line chart; each person picks it with the card's ⚙ and the
// choice is kept in this browser (never shared, never stored on the server).

export type CardView = "list" | "chart";

const KEY = (id: string) => `card-view.${id}`;

function read(id: string, fallback: CardView): CardView {
  try {
    const v = localStorage.getItem(KEY(id));
    return v === "list" || v === "chart" ? v : fallback;
  } catch {
    return fallback;
  }
}

export function useCardView(id: string, fallback: CardView = "list") {
  const [view, setView] = useState<CardView>(() =>
    typeof window === "undefined" ? fallback : read(id, fallback),
  );
  const set = (v: CardView) => {
    setView(v);
    try {
      localStorage.setItem(KEY(id), v);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  };
  return [view, set] as const;
}

/** The card's ⚙: «Ro'yxat» or «Grafik». */
export function CardViewToggle({
  view,
  onChange,
}: {
  view: CardView;
  onChange: (v: CardView) => void;
}) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-2">
      <span className="rounded-md bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">
        {view === "chart" ? t("cardView.chart") : t("cardView.list")}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t("cardView.settings")}
            title={t("cardView.settings")}
            className="ctl-soft inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-primary"
          >
            <Settings className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-3">
          <p className="mb-2 text-[12.5px] font-semibold text-foreground">{t("cardView.title")}</p>
          <div role="tablist" className="ctl-track flex gap-0.5 rounded-lg p-0.5">
            {(["list", "chart"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                data-state={view === v ? "active" : "inactive"}
                onClick={() => onChange(v)}
                className="ctl-tab h-8 flex-1 rounded-md text-[12.5px] font-semibold"
              >
                {v === "chart" ? t("cardView.chart") : t("cardView.list")}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
            {t("cardView.hint")}
          </p>
        </PopoverContent>
      </Popover>
    </span>
  );
}

const f1 = (n: number) => n.toFixed(1);

/** A smooth line through points (Catmull-Rom as cubic Béziers). */
function smooth(p: [number, number][]) {
  if (!p.length) return "";
  let d = `M${f1(p[0]![0])} ${f1(p[0]![1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i]!;
    const b = p[i]!;
    const c = p[i + 1]!;
    const e = p[i + 2] ?? c;
    d += ` C${f1(b[0] + (c[0] - a[0]) / 6)} ${f1(b[1] + (c[1] - a[1]) / 6)} ${f1(c[0] - (e[0] - b[0]) / 6)} ${f1(c[1] - (e[1] - b[1]) / 6)} ${f1(c[0])} ${f1(c[1])}`;
  }
  return d;
}

/**
 * A line chart over named items (stages, sources, managers): one point per
 * item with its value above and its name below. Lines only, never bars.
 */
export function CategoryLine({
  items,
  format = (n) => String(n),
  color = "#0552FB",
  height = 220,
  className,
}: {
  items: { name: string; value: number; sub?: string; accent?: string }[];
  format?: (n: number) => string;
  color?: string;
  height?: number;
  className?: string;
}) {
  const W = 640;
  const H = height;
  const top = 38;
  const bottom = H - 34;
  const n = items.length;
  const max = Math.max(1, ...items.map((i) => i.value));
  const x = (i: number) => (n <= 1 ? W / 2 : 50 + (i * (W - 100)) / (n - 1));
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const pts = items.map((it, i) => [x(i), y(it.value)] as [number, number]);
  const line = smooth(pts);
  const id = `cl-${color.replace("#", "")}`;
  if (!n) return null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label={items.map((i) => `${i.name}: ${format(i.value)}`).join(", ")}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.16" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="20" x2={W - 20} y1={bottom} y2={bottom} className="stroke-border" />
      {n > 1 && (
        <path
          d={`${line} L${f1(x(n - 1))} ${bottom} L${f1(x(0))} ${bottom} Z`}
          fill={`url(#${id})`}
        />
      )}
      {n > 1 && <path d={line} fill="none" stroke={color} strokeWidth="2.75" />}
      {items.map((it, i) => (
        <g key={`${it.name}-${i}`}>
          <circle
            cx={x(i)}
            cy={y(it.value)}
            r="5"
            fill={it.accent ?? color}
            className="stroke-card"
            strokeWidth="2.5"
          >
            <title>{`${it.name}: ${format(it.value)}`}</title>
          </circle>
          <text
            x={x(i)}
            y={y(it.value) - 12}
            textAnchor="middle"
            className="fill-foreground text-[13px] font-bold"
          >
            {format(it.value)}
          </text>
          <text
            x={x(i)}
            y={H - 14}
            textAnchor="middle"
            className="fill-muted-foreground text-[11.5px]"
          >
            {it.name.length > 16 ? `${it.name.slice(0, 15)}…` : it.name}
          </text>
          {it.sub && (
            <text
              x={x(i)}
              y={H - 1}
              textAnchor="middle"
              className="fill-muted-foreground text-[10.5px]"
            >
              {it.sub}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/** A card's header extra: the toggle next to whatever the card already shows. */
export function WithToggle({ children, toggle }: { children?: ReactNode; toggle: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-3">
      {children}
      {toggle}
    </span>
  );
}
