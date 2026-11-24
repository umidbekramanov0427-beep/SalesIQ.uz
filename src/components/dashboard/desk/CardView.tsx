import { useEffect, useRef, useState, type ReactNode } from "react";
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
 * item with its value above and its name below. Drawn in real pixels for the
 * card's width, so the text stays the same size on a wide or a narrow card.
 * Lines only, never bars; nothing to draw (all zero) says so instead.
 */
export function CategoryLine({
  items,
  format = (n) => String(n),
  color = "#0552FB",
  height = 230,
  className,
}: {
  items: { name: string; value: number; sub?: string; accent?: string }[];
  format?: (n: number) => string;
  color?: string;
  height?: number;
  className?: string;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = items.length;
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!n || max <= 0)
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-dashed border-border text-[13px] text-muted-foreground",
          className,
        )}
        style={{ height: 140 }}
      >
        {t("an.noData")}
      </div>
    );
  const H = height;
  const top = 34;
  const bottom = H - 44;
  const pad = Math.min(90, Math.max(48, W / (n * 2)));
  const x = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const pts = items.map((it, i) => [x(i), y(it.value)] as [number, number]);
  const line = smooth(pts);
  const id = `cl-${color.replace("#", "")}`;
  const room = n > 1 ? (W - 2 * pad) / (n - 1) : W;
  const maxChars = Math.max(6, Math.floor(room / 7.5));
  const cut = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);
  return (
    <div ref={ref} className={cn("w-full", className)} style={{ height: H }}>
      {W > 0 && (
        <svg
          width={W}
          height={H}
          role="img"
          aria-label={items.map((i) => `${i.name}: ${format(i.value)}`).join(", ")}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.16" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={top + (bottom - top) * f}
              y2={top + (bottom - top) * f}
              className="stroke-border"
              strokeDasharray={f === 1 ? undefined : "3 4"}
            />
          ))}
          {n > 1 && (
            <path
              d={`${line} L${f1(x(n - 1))} ${bottom} L${f1(x(0))} ${bottom} Z`}
              fill={`url(#${id})`}
            />
          )}
          {n > 1 && <path d={line} fill="none" stroke={color} strokeWidth="2.5" />}
          {items.map((it, i) => (
            <g key={`${it.name}-${i}`} fontSize="12">
              <circle
                cx={x(i)}
                cy={y(it.value)}
                r="4.5"
                fill={it.accent ?? color}
                className="stroke-card"
                strokeWidth="2.5"
              >
                <title>{`${it.name}: ${format(it.value)}`}</title>
              </circle>
              <text
                x={x(i)}
                y={y(it.value) - 11}
                textAnchor="middle"
                fontSize="12.5"
                fontWeight="700"
                className="fill-foreground"
              >
                {format(it.value)}
              </text>
              <text x={x(i)} y={H - 24} textAnchor="middle" className="fill-foreground">
                {cut(it.name)}
              </text>
              {it.sub && (
                <text
                  x={x(i)}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="11"
                  className="fill-muted-foreground"
                >
                  {cut(it.sub)}
                </text>
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
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
