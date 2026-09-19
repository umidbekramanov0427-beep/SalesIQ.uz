import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useI18n } from "@/lib/i18n";
import type {
  CallAnalysis,
  CallKeyTopic,
  CallSalesSkills,
  CallSentimentPoint,
} from "@/hooks/use-crm-data";
import type { TranscriptLine } from "@/components/audio/CallAnalysisDetail";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  boxShadow: "var(--shadow-elevated)",
  fontSize: 12,
};

function ChartCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col gap-2 p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {desc && <p className="text-xs text-subtle">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function NoData() {
  const { t } = useI18n();
  return (
    <div className="flex h-[160px] items-center justify-center text-xs text-subtle">
      {t("audio.chart.noData")}
    </div>
  );
}

function timeToSeconds(mmss: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(mmss.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function TalkRatioDonut({ ratio }: { ratio: number }) {
  const { t } = useI18n();
  const data = [
    { name: t("audio.chart.rep"), value: ratio, color: "var(--color-primary)" },
    { name: t("audio.chart.customer"), value: 100 - ratio, color: "var(--color-mint-border)" },
  ];
  return (
    <ChartCard title={t("audio.chart.talkRatio")} desc={t("audio.chart.talkRatioDesc")}>
      <div className="flex items-center gap-4">
        <div className="h-[140px] w-[140px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={42}
                outerRadius={64}
                paddingAngle={2}
                stroke="var(--color-surface)"
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-1.5 text-xs">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-muted-foreground">{d.name}</span>
              <span className="font-semibold tabular-nums text-foreground">{d.value}%</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

// Approximated purely from the timestamped transcript (no extra AI field
// needed): for every operator line that directly follows a customer line,
// the gap between the two [mm:ss] marks is that turn's response latency.
// Only available for calls transcribed after the timestamped-transcript
// format shipped -- older transcripts fall through to the empty state.
function ResponseTimeChart({ lines }: { lines: TranscriptLine[] }) {
  const { t } = useI18n();
  const points = useMemo(() => {
    const out: { turn: number; seconds: number }[] = [];
    for (let i = 1; i < lines.length; i++) {
      const prev = lines[i - 1]!;
      const cur = lines[i]!;
      const isPrevOperator = /operator|menejer|op\b/i.test(prev.speaker);
      const isCurOperator = /operator|menejer|op\b/i.test(cur.speaker);
      if (isPrevOperator || !isCurOperator) continue;
      const t0 = timeToSeconds(prev.timestamp);
      const t1 = timeToSeconds(cur.timestamp);
      if (t0 == null || t1 == null || t1 < t0) continue;
      out.push({ turn: out.length + 1, seconds: t1 - t0 });
    }
    return out;
  }, [lines]);

  const avg =
    points.length > 0
      ? Math.round((points.reduce((s, p) => s + p.seconds, 0) / points.length) * 10) / 10
      : 0;

  return (
    <ChartCard title={t("audio.responseTime")} desc={t("audio.responseTimeDesc")}>
      {points.length < 2 ? (
        <NoData />
      ) : (
        <>
          <p className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-foreground">{avg}</span>
            <span className="text-xs text-subtle">
              {t("audio.seconds")} · {t("audio.avgResponseTimeUnit")}
            </span>
          </p>
          <div className="h-[110px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ left: -20, right: 8, top: 4 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis dataKey="turn" stroke="var(--color-subtle)" tick={{ fontSize: 10 }} />
                <YAxis
                  stroke="var(--color-subtle)"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `${v}s`}
                  width={28}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v: number) => [`${v}s`, t("audio.responseTime")]}
                  labelFormatter={() => ""}
                />
                <Line
                  type="monotone"
                  dataKey="seconds"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </ChartCard>
  );
}

function sentimentToScore(raw: string): number {
  const s = raw.toLowerCase();
  if (s.includes("ijob") || s.includes("positiv") || s.includes("yaxshi")) return 1;
  if (s.includes("salb") || s.includes("negativ") || s.includes("yomon")) return -1;
  return 0;
}

function SentimentDynamicsChart({ timeline }: { timeline: CallSentimentPoint[] }) {
  const { t } = useI18n();
  const data = useMemo(
    () => timeline.map((p) => ({ timestamp: p.timestamp, score: sentimentToScore(p.sentiment) })),
    [timeline],
  );
  return (
    <ChartCard title={t("audio.sentimentDynamics")} desc={t("audio.sentimentDynamicsDesc")}>
      {data.length === 0 ? (
        <NoData />
      ) : (
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="timestamp" stroke="var(--color-subtle)" tick={{ fontSize: 10 }} />
              <YAxis
                domain={[-1, 1]}
                ticks={[-1, 0, 1]}
                stroke="var(--color-subtle)"
                tick={{ fontSize: 10 }}
                width={36}
                tickFormatter={(v: number) =>
                  v === 1
                    ? t("audio.sentimentPositive")
                    : v === -1
                      ? t("audio.sentimentNegative")
                      : t("audio.sentimentNeutral")
                }
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [
                  v === 1
                    ? t("audio.sentimentPositive")
                    : v === -1
                      ? t("audio.sentimentNegative")
                      : t("audio.sentimentNeutral"),
                  t("audio.sentimentDynamics"),
                ]}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--color-primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

function SalesSkillsRadar({ skills }: { skills: CallSalesSkills }) {
  const { t } = useI18n();
  const data = [
    { skill: t("audio.skillContactEstablishing"), value: skills.contactEstablishing },
    { skill: t("audio.skillNeedsIdentification"), value: skills.needsIdentification },
    { skill: t("audio.skillProductKnowledge"), value: skills.productKnowledge },
    { skill: t("audio.skillCommunicationClarity"), value: skills.communicationClarity },
    { skill: t("audio.skillListening"), value: skills.listening },
    { skill: t("audio.skillDealClosing"), value: skills.dealClosing },
  ];
  const hasData = data.some((d) => d.value != null);
  return (
    <ChartCard title={t("audio.chart.skillsRadar")} desc={t("audio.chart.skillsRadarDesc")}>
      {!hasData ? (
        <NoData />
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={data.map((d) => ({ ...d, value: d.value ?? 0 }))} outerRadius={78}>
              <PolarGrid stroke="var(--color-border)" />
              <PolarAngleAxis
                dataKey="skill"
                tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
              />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                dataKey="value"
                stroke="var(--color-primary)"
                fill="var(--color-primary)"
                fillOpacity={0.25}
              />
              <Tooltip contentStyle={tooltipStyle} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

function KeywordFrequencyChart({ topics }: { topics: CallKeyTopic[] }) {
  const { t } = useI18n();
  const data = [...topics].sort((a, b) => b.count - a.count).slice(0, 5);
  return (
    <ChartCard title={t("audio.keywordFrequency")} desc={t("audio.keywordFrequencyDesc")}>
      {data.length === 0 ? (
        <NoData />
      ) : (
        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                horizontal={false}
              />
              <XAxis
                type="number"
                stroke="var(--color-subtle)"
                tick={{ fontSize: 10 }}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="topic"
                stroke="var(--color-subtle)"
                tick={{ fontSize: 11 }}
                width={80}
              />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

export default function CallAnalyticsCharts({
  talkRatio,
  transcriptLines,
  analysis,
}: {
  talkRatio: number | null;
  transcriptLines: TranscriptLine[];
  analysis: CallAnalysis;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {talkRatio != null && <TalkRatioDonut ratio={talkRatio} />}
        <ResponseTimeChart lines={transcriptLines} />
        <SentimentDynamicsChart timeline={analysis.sentimentTimeline ?? []} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SalesSkillsRadar
          skills={
            analysis.salesSkills ?? {
              contactEstablishing: null,
              needsIdentification: null,
              productKnowledge: null,
              communicationClarity: null,
              listening: null,
              dealClosing: null,
            }
          }
        />
        <KeywordFrequencyChart topics={analysis.keyTopics ?? []} />
      </div>
    </div>
  );
}
