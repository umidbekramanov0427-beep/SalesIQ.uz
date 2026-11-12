import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { Mark, Sample } from "@/lib/webinars";

// Live viewers over the webinar as one line with a soft fill; the host's
// marks (intro, lesson, price...) as dashed lines with their name, and the
// peak as a dot. Hovering shows the time and count under the pointer.

const W = 1000;
const H = 260;
const PAD = { l: 44, r: 14, t: 26, b: 28 };

const MARK_COLOR: Record<string, string> = {
  intro: "#0ea5e9",
  lesson: "#8b5cf6",
  price: "#e11d48",
  offer: "#f59e0b",
  qa: "#10b981",
  custom: "#64748b",
};

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function ViewersChart({ samples, marks }: { samples: Sample[]; marks: Mark[] }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const pts = useMemo(() => [...samples].sort((a, b) => a.at.localeCompare(b.at)), [samples]);
  if (pts.length < 2) {
    return (
      <div className="grid h-[200px] place-items-center rounded-xl border border-dashed border-border text-[13px] text-muted-foreground">
        {t("mkt.wb.noChart")}
      </div>
    );
  }
  const t0 = new Date(pts[0]!.at).getTime();
  const t1 = Math.max(t0 + 60_000, new Date(pts[pts.length - 1]!.at).getTime());
  const max = Math.max(10, ...pts.map((p) => p.viewers));
  const niceMax =
    Math.ceil(max / 10 ** Math.floor(Math.log10(max))) * 10 ** Math.floor(Math.log10(max));
  const x = (iso: string) =>
    PAD.l + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / niceMax) * (H - PAD.t - PAD.b);
  const line = pts
    .map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.viewers).toFixed(1)}`)
    .join("");
  const area = `${line}L${x(pts[pts.length - 1]!.at).toFixed(1)},${y(0)}L${x(pts[0]!.at).toFixed(1)},${y(0)}Z`;
  const peak = pts.reduce((b, p) => (p.viewers > b.viewers ? p : b), pts[0]!);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));
  const timeTicks = Array.from({ length: 6 }, (_, i) =>
    new Date(t0 + ((t1 - t0) * i) / 5).toISOString(),
  );
  const h = hover != null ? pts[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[260px] w-full"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          let gap = Infinity;
          pts.forEach((p, i) => {
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
          <linearGradient id="vw-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
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
        <path d={area} fill="url(#vw-fill)" />
        <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" />
        {marks.map((m) => {
          const mx = x(m.at);
          if (mx < PAD.l || mx > W - PAD.r) return null;
          const c = MARK_COLOR[m.kind] ?? MARK_COLOR["custom"];
          return (
            <g key={m.id}>
              <line
                x1={mx}
                x2={mx}
                y1={PAD.t - 8}
                y2={y(0)}
                stroke={c}
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <text x={mx + 4} y={PAD.t - 12} fontSize="11" fontWeight="600" fill={c}>
                {m.label || t(`mkt.wb.mark.${m.kind}`)}
              </text>
            </g>
          );
        })}
        <circle
          cx={x(peak.at)}
          cy={y(peak.viewers)}
          r="5"
          fill="var(--primary)"
          stroke="var(--card)"
          strokeWidth="2"
        />
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
            <circle
              cx={x(h.at)}
              cy={y(h.viewers)}
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
          className="pointer-events-none absolute top-2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[12px] shadow-sm"
          style={{ left: `${Math.min(85, (x(h.at) / W) * 100)}%` }}
        >
          <b className="font-mono tabular-nums text-foreground">{h.viewers}</b>{" "}
          <span className="text-muted-foreground">
            {t("mkt.wb.viewersShort")} · {hm(h.at)}
          </span>
        </div>
      )}
    </div>
  );
}

export { MARK_COLOR };
