import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import {
  EVENT_COLOR,
  countedEvents,
  peaks,
  type TimelinePoint,
  type WebinarEvent,
} from "@/lib/webinar-timeline";

// A webinar's viewers minute by minute: YouTube and Telegram as two thin
// lines and their sum ("Jami") as the main line with a soft fill. The
// stream's events (lesson start, SMS, timer 2...) stand as dashed lines
// with their name; the peak carries a star. Hovering shows every line's
// count at that minute.

const W = 1000;
const H = 300;
const PAD = { l: 44, r: 14, t: 52, b: 28 };

export const SERIES = {
  total: "var(--primary)",
  youtube: "#ef4444",
  telegram: "#0ea5e9",
} as const;

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function eventName(
  t: (k: string, v?: Record<string, string | number>) => string,
  e: Pick<WebinarEvent, "kind" | "seq" | "label">,
): string {
  if (e.label) return e.label;
  const base = t(`mkt.ev.${e.kind}`);
  return e.seq != null ? `${base} ${e.seq}` : base;
}

export function WebinarChart({
  points,
  events,
}: {
  points: TimelinePoint[];
  events: WebinarEvent[];
}) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const evs = useMemo(() => countedEvents(events), [events]);
  const hasYt = points.some((p) => p.youtube != null);
  const hasTg = points.some((p) => p.telegram != null);
  const both = hasYt && hasTg;
  if (points.length < 2) {
    return (
      <div className="grid h-[220px] place-items-center rounded-xl border border-dashed border-border text-[13px] text-muted-foreground">
        {t("mkt.wb.noChart")}
      </div>
    );
  }
  const t0 = new Date(points[0]!.at).getTime();
  const t1 = Math.max(t0 + 60_000, new Date(points[points.length - 1]!.at).getTime());
  const max = Math.max(10, ...points.map((p) => p.total));
  const mag = 10 ** Math.floor(Math.log10(max));
  const niceMax = Math.ceil(max / mag) * mag;
  const x = (iso: string) =>
    PAD.l + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / niceMax) * (H - PAD.t - PAD.b);
  const path = (get: (p: TimelinePoint) => number | null) => {
    let d = "";
    let pen = false;
    for (const p of points) {
      const v = get(p);
      if (v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${x(p.at).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const totalLine = path((p) => p.total);
  const area = `${totalLine}L${x(points[points.length - 1]!.at).toFixed(1)},${y(0)}L${x(points[0]!.at).toFixed(1)},${y(0)}Z`;
  const pk = peaks(points).total;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));
  const timeTicks = Array.from({ length: 6 }, (_, i) =>
    new Date(t0 + ((t1 - t0) * i) / 5).toISOString(),
  );
  const h = hover != null ? points[hover] : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <Legend color={SERIES.total} label={t("mkt.wb.total")} thick />
        {hasYt && <Legend color={SERIES.youtube} label="YouTube" />}
        {hasTg && <Legend color={SERIES.telegram} label="Telegram" />}
        {pk && (
          <span className="ml-auto">
            ★ {t("mkt.wb.peak")}:{" "}
            <b className="tabular-nums text-foreground">{pk.viewers.toLocaleString("ru-RU")}</b> ·{" "}
            {hm(pk.at)}
          </span>
        )}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[300px] w-full"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            let gap = Infinity;
            points.forEach((p, i) => {
              const g = Math.abs(x(p.at) - px);
              if (g < gap) {
                gap = g;
                best = i;
              }
            });
            setHover(best);
          }}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={t("mkt.wb.chartTitle")}
        >
          <defs>
            <linearGradient id="wb-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.l}
                x2={W - PAD.r}
                y1={y(v)}
                y2={y(v)}
                stroke="var(--border)"
                strokeWidth="1"
              />
              <text
                x={PAD.l - 8}
                y={y(v) + 4}
                textAnchor="end"
                fontSize="11"
                fill="var(--muted-foreground)"
              >
                {v}
              </text>
            </g>
          ))}
          {timeTicks.map((iso) => (
            <text
              key={iso}
              x={x(iso)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted-foreground)"
            >
              {hm(iso)}
            </text>
          ))}
          {evs.map((e, i) => {
            const mx = x(e.at);
            if (mx < PAD.l - 1 || mx > W - PAD.r + 1) return null;
            const c = EVENT_COLOR[e.kind];
            // Three label rows so neighbouring events don't overwrite each other.
            const row = i % 3;
            return (
              <g key={e.id}>
                <line
                  x1={mx}
                  x2={mx}
                  y1={PAD.t - 40 + row * 14}
                  y2={y(0)}
                  stroke={c}
                  strokeWidth="1.25"
                  strokeDasharray="4 4"
                  opacity="0.8"
                />
                <text x={mx + 4} y={PAD.t - 32 + row * 14} fontSize="11" fontWeight="600" fill={c}>
                  {eventName(t, e)}
                </text>
              </g>
            );
          })}
          <path d={area} fill="url(#wb-fill)" />
          {both && (
            <>
              <path
                d={path((p) => p.youtube)}
                fill="none"
                stroke={SERIES.youtube}
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
              <path
                d={path((p) => p.telegram)}
                fill="none"
                stroke={SERIES.telegram}
                strokeWidth="1.75"
                strokeLinejoin="round"
              />
            </>
          )}
          <path
            d={totalLine}
            fill="none"
            stroke={SERIES.total}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          {pk && (
            <text
              x={x(pk.at)}
              y={y(pk.viewers) - 8}
              textAnchor="middle"
              fontSize="15"
              fill="#f59e0b"
              stroke="var(--card)"
              strokeWidth="3"
              paintOrder="stroke"
            >
              ★
            </text>
          )}
          {h && (
            <g>
              <line
                x1={x(h.at)}
                x2={x(h.at)}
                y1={PAD.t}
                y2={y(0)}
                stroke="var(--foreground)"
                strokeOpacity="0.25"
              />
              {both && h.youtube != null && (
                <circle
                  cx={x(h.at)}
                  cy={y(h.youtube)}
                  r="4"
                  fill={SERIES.youtube}
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              )}
              {both && h.telegram != null && (
                <circle
                  cx={x(h.at)}
                  cy={y(h.telegram)}
                  r="4"
                  fill={SERIES.telegram}
                  stroke="var(--card)"
                  strokeWidth="2"
                />
              )}
              <circle
                cx={x(h.at)}
                cy={y(h.total)}
                r="4.5"
                fill="var(--primary)"
                stroke="var(--card)"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-12 min-w-[140px] rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[12px] shadow-sm"
            style={{ left: `${Math.min(80, Math.max(4, (x(h.at) / W) * 100 + 1))}%` }}
          >
            <p className="font-semibold text-muted-foreground">{hm(h.at)}</p>
            <p className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("mkt.wb.total")}</span>
              <b className="tabular-nums text-foreground">{h.total}</b>
            </p>
            {h.youtube != null && (
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">YouTube</span>
                <b className="tabular-nums text-foreground">{h.youtube}</b>
              </p>
            )}
            {h.telegram != null && (
              <p className="flex justify-between gap-3">
                <span className="text-muted-foreground">Telegram</span>
                <b className="tabular-nums text-foreground">{h.telegram}</b>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ color, label, thick }: { color: string; label: string; thick?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-4 rounded-full"
        style={{ background: color, height: thick ? 3 : 2 }}
      />
      {label}
    </span>
  );
}
