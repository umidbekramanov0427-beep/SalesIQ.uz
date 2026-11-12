import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DayPoint } from "@/lib/channel-analytics";

// Kanal analitikasi charts. Joined is drawn upward in green and left
// downward in red, so the direction says which is which even without color;
// hovering any bar or cell shows its exact figures.

const nf = (n: number) => n.toLocaleString("ru-RU");
const dm = (day: string) => day.slice(5).split("-").reverse().join(".");
export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

function niceMax(v: number) {
  if (v <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

function Tip({ children, align }: { children: React.ReactNode; align: number }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[12px] text-foreground shadow-md"
      style={
        align < 0.15
          ? { left: 0 }
          : align > 0.85
            ? { right: 0 }
            : { left: "50%", transform: "translate(-50%, calc(-100% - 6px))" }
      }
    >
      {children}
    </div>
  );
}

/** Joined (up) and left (down) each day, with the net change on hover. */
export function DailyFlowChart({ days }: { days: DayPoint[] }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  if (!days.length) return <Empty text={t("mkt.ca.noDays")} />;
  const top = niceMax(Math.max(1, ...days.map((d) => d.joined)));
  const bottom = niceMax(Math.max(1, ...days.map((d) => d.left)));
  const span = top + bottom;
  const zero = (top / span) * 100;
  const labelEvery = Math.max(1, Math.ceil(days.length / 8));
  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-9 shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">
          <span className="absolute right-0 top-0 -translate-y-1/2">+{nf(top)}</span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: `${zero}%` }}>
            0
          </span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">−{nf(bottom)}</span>
        </div>
        <div
          className="relative h-[220px] flex-1"
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={t("mkt.ca.flowTitle")}
        >
          <span className="absolute inset-x-0 top-0 border-t border-dashed border-border/70" />
          <span className="absolute inset-x-0 bottom-0 border-t border-dashed border-border/70" />
          <span className="absolute inset-x-0 border-t border-border" style={{ top: `${zero}%` }} />
          <div className="absolute inset-0 flex gap-[2px]">
            {days.map((d, i) => (
              <div
                key={d.day}
                className={cn(
                  "relative flex-1 rounded-sm transition-colors",
                  hover === i && "bg-foreground/[0.04]",
                )}
                onMouseEnter={() => setHover(i)}
              >
                <div
                  className="absolute inset-x-[12%] rounded-t-[3px] bg-emerald-500"
                  style={{
                    bottom: `${100 - zero}%`,
                    height: `${(d.joined / span) * 100}%`,
                    minHeight: d.joined ? 2 : 0,
                  }}
                />
                <div
                  className="absolute inset-x-[12%] rounded-b-[3px] bg-rose-500"
                  style={{
                    top: `${zero}%`,
                    height: `${(d.left / span) * 100}%`,
                    minHeight: d.left ? 2 : 0,
                  }}
                />
                {hover === i && (
                  <Tip align={i / days.length}>
                    <p className="font-semibold">{dm(d.day)}</p>
                    <p className="text-emerald-700 dark:text-emerald-300">
                      {t("mkt.ca.joined")}: +{nf(d.joined)}
                    </p>
                    <p className="text-rose-700 dark:text-rose-300">
                      {t("mkt.ca.left")}: −{nf(d.left)}
                    </p>
                    <p className="text-muted-foreground">
                      {t("mkt.ca.net")}: {d.net > 0 ? "+" : ""}
                      {nf(d.net)}
                      {d.members != null && ` · ${nf(d.members)}`}
                    </p>
                  </Tip>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-11 mt-1.5 flex gap-[2px] text-[10.5px] tabular-nums text-muted-foreground">
        {days.map((d, i) => (
          <span key={d.day} className="flex-1 text-center">
            {i % labelEvery === 0 ? dm(d.day) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Subscribers over the period: a line with a soft fill. */
export function MembersChart({ days }: { days: DayPoint[] }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const pts = days.filter((d) => d.members != null) as (DayPoint & { members: number })[];
  if (pts.length < 2) return <Empty text={t("mkt.ca.noMembers")} />;
  const lo = Math.min(...pts.map((p) => p.members));
  const hi = Math.max(...pts.map((p) => p.members));
  const pad = Math.max(5, Math.round((hi - lo) * 0.15));
  const min = Math.max(0, lo - pad);
  const max = hi + pad;
  const x = (i: number) => (i / (pts.length - 1)) * 100;
  const y = (v: number) => (1 - (v - min) / (max - min)) * 100;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.members)}`).join("");
  const h = hover != null ? pts[hover]! : null;
  return (
    <div className="flex gap-2">
      <div className="relative w-12 shrink-0 text-right text-[10.5px] tabular-nums text-muted-foreground">
        <span className="absolute right-0 top-0 -translate-y-1/2">{nf(max)}</span>
        <span className="absolute bottom-0 right-0 translate-y-1/2">{nf(min)}</span>
      </div>
      <div
        className="relative h-[180px] flex-1"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientX - r.left) / r.width;
          setHover(Math.min(pts.length - 1, Math.max(0, Math.round(f * (pts.length - 1)))));
        }}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={t("mkt.ca.membersTitle")}
      >
        <span className="absolute inset-x-0 top-0 border-t border-dashed border-border/70" />
        <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-border/50" />
        <span className="absolute inset-x-0 bottom-0 border-t border-border" />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <linearGradient id="ch-members" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line}L100,100L0,100Z`} fill="url(#ch-members)" />
          <path
            d={line}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
        {h && (
          <>
            <span
              className="absolute inset-y-0 border-l border-dashed border-primary/50"
              style={{ left: `${x(hover!)}%` }}
            />
            <span
              className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary"
              style={{ left: `${x(hover!)}%`, top: `${y(h.members)}%` }}
            />
            <div className="absolute top-0 w-0" style={{ left: `${x(hover!)}%` }}>
              <Tip align={hover! / (pts.length - 1)}>
                <span className="font-semibold">{dm(h.day)}</span> · {nf(h.members)}
              </Tip>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Joins and leaves by hour of the day, the busiest hour marked. */
export function HourBars({ joins, leaves }: { joins: number[]; leaves: number[] }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...joins, ...leaves);
  const peakJ = joins.indexOf(Math.max(...joins));
  return (
    <div>
      <div
        className="relative flex h-[170px] items-end gap-[3px] border-b border-border"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={t("mkt.ca.hoursTitle")}
      >
        {joins.map((j, h) => {
          const l = leaves[h] ?? 0;
          return (
            <div
              key={h}
              className={cn(
                "relative flex h-full flex-1 items-end justify-center gap-[1px] rounded-t-sm",
                hover === h && "bg-foreground/[0.04]",
              )}
              onMouseEnter={() => setHover(h)}
            >
              <div
                className={cn(
                  "w-[46%] rounded-t-[2px]",
                  h === peakJ && j > 0 ? "bg-emerald-600" : "bg-emerald-500/75",
                )}
                style={{ height: `${(j / max) * 100}%`, minHeight: j ? 2 : 0 }}
              />
              <div
                className="w-[46%] rounded-t-[2px] bg-rose-500/75"
                style={{ height: `${(l / max) * 100}%`, minHeight: l ? 2 : 0 }}
              />
              {hover === h && (
                <Tip align={h / 24}>
                  <p className="font-semibold">
                    {hourLabel(h)}–{hourLabel((h + 1) % 24)}
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-300">
                    {t("mkt.ca.joined")}: {nf(j)}
                  </p>
                  <p className="text-rose-700 dark:text-rose-300">
                    {t("mkt.ca.left")}: {nf(l)}
                  </p>
                </Tip>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10.5px] tabular-nums text-muted-foreground">
        {joins.map((_, h) => (
          <span key={h} className="flex-1 text-center">
            {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Weekday × hour: how many joined (or left) in each hour of each weekday. */
export function WeekHeatmap({ data, kind }: { data: number[][]; kind: "joins" | "leaves" }) {
  const { t } = useI18n();
  const [hover, setHover] = useState<{ w: number; h: number } | null>(null);
  const max = Math.max(1, ...data.flat());
  const cell = kind === "joins" ? "16 185 129" : "244 63 94";
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[34px_repeat(24,minmax(0,1fr))] gap-[3px]">
          {data.map((row, w) => (
            <div key={w} className="contents">
              <span className="self-center text-[11px] font-semibold text-muted-foreground">
                {t(`mkt.ca.wd.${w}`)}
              </span>
              {row.map((v, h) => (
                <div
                  key={h}
                  onMouseEnter={() => setHover({ w, h })}
                  onMouseLeave={() => setHover(null)}
                  className={cn(
                    "relative h-6 rounded-[4px] border border-border/60",
                    hover?.w === w && hover.h === h && "ring-2 ring-foreground/40",
                  )}
                  style={{
                    background: v ? `rgb(${cell} / ${0.12 + (v / max) * 0.88})` : undefined,
                  }}
                >
                  {hover?.w === w && hover.h === h && (
                    <Tip align={h / 24}>
                      {t(`mkt.ca.wdFull.${w}`)} {hourLabel(h)} ·{" "}
                      {kind === "joins" ? t("mkt.ca.joined") : t("mkt.ca.left")}: {nf(v)}
                    </Tip>
                  )}
                </div>
              ))}
            </div>
          ))}
          <span />
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-center text-[10px] tabular-nums text-muted-foreground">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-muted-foreground">
          {t("mkt.ca.less")}
          {[0.12, 0.35, 0.6, 0.85, 1].map((o) => (
            <span
              key={o}
              className="h-3 w-5 rounded-[3px]"
              style={{ background: `rgb(${cell} / ${o})` }}
            />
          ))}
          {t("mkt.ca.more")}
        </div>
      </div>
    </div>
  );
}

/** A ranked list with proportional bars (sources, languages, view hours). */
export function ShareBars({
  items,
  suffix = "",
  tone = "bg-primary",
}: {
  items: { name: string; value: number; sub?: string }[];
  suffix?: string;
  tone?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.name}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-foreground">{i.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {i.sub && <span className="mr-2 text-[12px]">{i.sub}</span>}
              <span className="font-semibold text-foreground">
                {nf(i.value)}
                {suffix}
              </span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", tone)}
              style={{ width: `${(i.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="grid h-[180px] place-items-center rounded-xl border border-dashed border-border px-6 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}
