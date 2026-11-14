import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3, Filter, ListChecks, Pause, Phone, Play, RotateCcw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RecordingAudio } from "@/components/audio/RecordingLink";
import { DeskBlock } from "@/components/dashboard/desk/DeskParts";
import { usePhone } from "@/components/phone/PhoneProvider";
import { useI18n } from "@/lib/i18n";
import {
  EMPTY_CALL_FILTER,
  byManager,
  clock,
  filterCalls,
  type CallFilter,
  type PcCall,
  type PhoneCenterData,
} from "@/lib/phone-center";
import { cn } from "@/lib/utils";
import type { PcPeriod, PcPeriodKey } from "./PhoneCenterPage";
import { CallGlyph, OUTCOME_TONE, timeOf } from "./Sections";

// Telefon → Qo'ng'iroqlar (5TEL 4): calls and talk time by manager. The
// filter panel on the left (time, managers, talk length, status) applies on
// «Qo'llash»; the chart shows counts or durations per manager, the list
// below every matching call.

const tooltipStyle = {
  background: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 13,
};
const PERIODS: Exclude<PcPeriodKey, "custom">[] = ["today", "yesterday", "week", "month", "all"];
type ListDir = "all" | "incoming" | "outgoing";
const MAX_ROWS = 300;

const field =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-[14px] text-foreground outline-none focus:border-primary phone:text-base";
const label = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";

export function CallsSection({
  data,
  period,
  onPeriod,
}: {
  data: PhoneCenterData;
  period: PcPeriod;
  onPeriod: (p: PcPeriod) => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<CallFilter>(EMPTY_CALL_FILTER);
  const [draft, setDraft] = useState<CallFilter>(EMPTY_CALL_FILTER);
  const [draftPeriod, setDraftPeriod] = useState<PcPeriod>(period);
  const [metric, setMetric] = useState<"count" | "duration">("count");
  const [dir, setDir] = useState<ListDir>("all");
  const names = useMemo(() => new Map(data.operators.map((o) => [o.id, o.name])), [data.operators]);
  const rows = useMemo(() => filterCalls(data.calls, filter), [data.calls, filter]);
  const managers = useMemo(() => byManager(rows, names), [rows, names]);
  const list = rows.filter((c) => dir === "all" || c.direction === dir);

  const apply = () => {
    setFilter(draft);
    if (draftPeriod.key !== period.key || draftPeriod.custom !== period.custom)
      onPeriod(draftPeriod);
  };
  const reset = () => {
    setDraft(EMPTY_CALL_FILTER);
    setFilter(EMPTY_CALL_FILTER);
  };
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v) || 0));

  const chart = managers.map((m) => ({
    name: m.name,
    incoming: metric === "count" ? m.inCount : Math.round(m.inSeconds / 60),
    outgoing: metric === "count" ? m.outCount : Math.round(m.outSeconds / 60),
  }));

  return (
    <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-4 phone:grid-cols-1">
      {/* The filter panel. */}
      <aside className="surface-card h-fit space-y-4 p-4">
        <p className="flex items-center gap-2 text-[15px] font-bold text-foreground">
          <Filter className="h-4 w-4 text-primary" />
          {t("ptel.f.title")}
        </p>
        <div>
          <span className={label}>{t("ptel.f.time")}</span>
          <select
            value={draftPeriod.key}
            onChange={(e) => {
              const key = e.target.value as PcPeriodKey;
              setDraftPeriod(
                key === "custom"
                  ? { key, custom: draftPeriod.custom ?? { from: "", to: "" } }
                  : { key },
              );
            }}
            className={field}
          >
            {PERIODS.map((k) => (
              <option key={k} value={k}>
                {t(`ptel.period.${k}`)}
              </option>
            ))}
            <option value="custom">{t("ptel.period.pick")}</option>
          </select>
          {draftPeriod.key === "custom" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                type="date"
                value={draftPeriod.custom?.from ?? ""}
                onChange={(e) =>
                  setDraftPeriod({
                    key: "custom",
                    custom: { from: e.target.value, to: draftPeriod.custom?.to ?? "" },
                  })
                }
                className={field}
              />
              <input
                type="date"
                value={draftPeriod.custom?.to ?? ""}
                onChange={(e) =>
                  setDraftPeriod({
                    key: "custom",
                    custom: { from: draftPeriod.custom?.from ?? "", to: e.target.value },
                  })
                }
                className={field}
              />
            </div>
          )}
        </div>
        <div>
          <span className={label}>{t("ptel.f.managers")}</span>
          <div className="max-h-[180px] space-y-1 overflow-y-auto rounded-xl border border-border p-1.5">
            {data.operators.map((o) => {
              const on = draft.managers.includes(o.id);
              return (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setDraft((d) => ({
                        ...d,
                        managers: on ? d.managers.filter((x) => x !== o.id) : [...d.managers, o.id],
                      }))
                    }
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{o.name}</span>
                </label>
              );
            })}
          </div>
          {draft.managers.length === 0 && (
            <p className="mt-1 text-[13px] text-muted-foreground">{t("ptel.f.allManagers")}</p>
          )}
        </div>
        <div>
          <span className={label}>{t("ptel.f.duration")}</span>
          <div className="flex items-center gap-2">
            <input
              inputMode="numeric"
              placeholder={t("ptel.f.from")}
              value={draft.minSeconds ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, minSeconds: num(e.target.value) }))}
              className={field}
            />
            <span className="text-muted-foreground">—</span>
            <input
              inputMode="numeric"
              placeholder={t("ptel.f.to")}
              value={draft.maxSeconds ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, maxSeconds: num(e.target.value) }))}
              className={field}
            />
          </div>
        </div>
        <div>
          <span className={label}>{t("ptel.f.status")}</span>
          <select
            value={draft.status}
            onChange={(e) =>
              setDraft((d) => ({ ...d, status: e.target.value as CallFilter["status"] }))
            }
            className={field}
          >
            {(["all", "answered", "missed", "noAnswer"] as const).map((k) => (
              <option key={k} value={k}>
                {t(`ptel.f.st.${k}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={apply}
            className="h-11 flex-1 rounded-xl bg-primary text-[14px] font-semibold text-white hover:brightness-110"
          >
            {t("ptel.apply")}
          </button>
          <button
            type="button"
            onClick={reset}
            title={t("ptel.clear")}
            aria-label={t("ptel.clear")}
            className="ctl-soft grid h-11 w-11 place-items-center rounded-xl"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <DeskBlock
          title={t("ptel.b.byManager")}
          icon={BarChart3}
          tone="violet"
          actions={
            <div role="tablist" className="ctl-track inline-flex gap-0.5 rounded-xl p-0.5">
              {(["count", "duration"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={metric === k}
                  data-state={metric === k ? "active" : "inactive"}
                  onClick={() => setMetric(k)}
                  className="ctl-tab h-9 rounded-lg px-3 text-[13px] font-semibold"
                >
                  {t(`ptel.m.${k}`)}
                </button>
              ))}
            </div>
          }
        >
          <p className="mb-3 text-[13px] text-muted-foreground">{t("ptel.m.note")}</p>
          {chart.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-muted-foreground">
              {t("ptel.f.none")}
            </p>
          ) : (
            <div className="w-full" style={{ height: Math.max(180, chart.length * 46 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid stroke="var(--color-border)" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={12}
                    stroke="var(--color-muted-foreground)"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    tickLine={false}
                    axisLine={false}
                    fontSize={13}
                    stroke="var(--color-muted-foreground)"
                  />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--color-accent)" }} />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Bar
                    dataKey="incoming"
                    stackId="a"
                    name={`${t("ptel.dir.incoming")}${metric === "duration" ? `, ${t("ptel.m.min")}` : ""}`}
                    fill="#10b981"
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="outgoing"
                    stackId="a"
                    name={`${t("ptel.dir.outgoing")}${metric === "duration" ? `, ${t("ptel.m.min")}` : ""}`}
                    fill="#3b82f6"
                    radius={[0, 4, 4, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DeskBlock>

        <DeskBlock
          title={t("ptel.b.recentCalls")}
          icon={ListChecks}
          tone="sky"
          actions={
            <div className="flex items-center gap-3">
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {t("ptel.nCalls", { n: list.length })}
              </span>
              <div role="tablist" className="ctl-track inline-flex gap-0.5 rounded-xl p-0.5">
                {(["all", "incoming", "outgoing"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={dir === k}
                    data-state={dir === k ? "active" : "inactive"}
                    onClick={() => setDir(k)}
                    className="ctl-tab h-9 rounded-lg px-3 text-[13px] font-semibold"
                  >
                    {t(`ptel.dir.${k}`)}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <CallList calls={list.slice(0, MAX_ROWS)} names={names} />
        </DeskBlock>
      </div>
    </div>
  );
}

function CallList({ calls, names }: { calls: PcCall[]; names: Map<string, string> }) {
  const { t } = useI18n();
  const { call, live, enabled } = usePhone();
  const [playing, setPlaying] = useState<string | null>(null);
  if (calls.length === 0)
    return (
      <p className="py-10 text-center text-[14px] text-muted-foreground">{t("ptel.f.none")}</p>
    );
  return (
    <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-5">
      <table className="w-full min-w-[760px] text-[14px]">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-[13px] text-muted-foreground">
            <th className="py-3 pl-5 pr-3 font-semibold">{t("ptel.col.date")}</th>
            <th className="px-3 py-3 font-semibold">{t("ptel.col.event")}</th>
            <th className="px-3 py-3 font-semibold">{t("ptel.col.result")}</th>
            <th className="px-3 py-3 text-right font-semibold">{t("phone.col.duration")}</th>
            <th className="py-3 pl-3 pr-5" />
          </tr>
        </thead>
        <tbody>
          {calls.map((c) => {
            const isPlaying = playing === c.id;
            return (
              <Fragment key={c.id}>
                <tr className="border-b border-border/70 hover:bg-accent/40">
                  <td className="py-3 pl-5 pr-3 tabular-nums text-muted-foreground">
                    {timeOf(c.at)}
                  </td>
                  <td className="max-w-[340px] px-3 py-3">
                    <span className="flex items-center gap-2.5">
                      <CallGlyph c={c} />
                      <span className="min-w-0">
                        {c.leadId ? (
                          <Link
                            to="/crm/leads/$leadId"
                            params={{ leadId: c.leadId }}
                            className="block truncate font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {c.name || c.phone || t("phone.unknown")}
                          </Link>
                        ) : (
                          <span className="block truncate font-semibold text-foreground">
                            {c.name || c.phone || t("phone.unknown")}
                          </span>
                        )}
                        <span className="block truncate text-[13px] text-muted-foreground">
                          {t(`ptel.dir.${c.direction}`)}
                          {c.by ? ` · ${names.get(c.by) ?? "—"}` : ""}
                          {c.name && c.phone ? ` · ${c.phone}` : ""}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={cn("font-semibold", OUTCOME_TONE[c.outcome])}>
                      {t(`phone.outcome.${c.outcome}`)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{clock(c.seconds)}</td>
                  <td className="py-3 pl-3 pr-5">
                    <span className="flex items-center justify-end gap-1.5">
                      {c.recording && (
                        <button
                          type="button"
                          onClick={() => setPlaying(isPlaying ? null : c.id)}
                          title={t("phone.listen")}
                          className={cn(
                            "grid h-9 w-9 place-items-center rounded-[8px]",
                            isPlaying
                              ? "bg-primary/12 text-primary"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground",
                          )}
                        >
                          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>
                      )}
                      {c.phone && (
                        <button
                          type="button"
                          disabled={!enabled || !!live}
                          onClick={() =>
                            call(c.phone, {
                              ...(c.leadId ? { leadId: c.leadId } : {}),
                              ...(c.name ? { name: c.name } : {}),
                            })
                          }
                          title={t("phone.callBack")}
                          className="grid h-9 w-9 place-items-center rounded-[8px] bg-emerald-500/12 text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:opacity-40 dark:text-emerald-400"
                        >
                          <Phone className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
                {isPlaying && c.recording && (
                  <tr className="border-b border-border/70">
                    <td colSpan={5} className="px-5 pb-3 pt-1">
                      <RecordingAudio url={c.recording} controls autoPlay className="h-9 w-full" />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
