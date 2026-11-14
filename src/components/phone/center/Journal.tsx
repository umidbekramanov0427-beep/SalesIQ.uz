import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  BookOpenText,
  CheckCircle2,
  Download,
  ExternalLink,
  Hash,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Play,
  Search,
  Sparkles,
} from "lucide-react";
import { RecordingAudio } from "@/components/audio/RecordingLink";
import { DeskBlock, DeskKpi } from "@/components/dashboard/desk/DeskParts";
import { CardBoard, type CardBoardItem } from "@/components/dashboard/HomeBoard";
import { CallReviewDialog, type CallReviewTarget } from "@/components/phone/CallReviewDialog";
import { usePhone } from "@/components/phone/PhoneProvider";
import { useI18n } from "@/lib/i18n";
import {
  clock,
  filterJournal,
  journalOf,
  type JournalDir,
  type PcNumber,
  type PhoneCenterData,
} from "@/lib/phone-center";
import { downloadXlsx } from "@/lib/xlsx-write";
import { cn } from "@/lib/utils";
import { PeriodBar } from "./PeriodBar";
import type { PcPeriod } from "./PhoneCenterPage";
import { CallGlyph, OUTCOME_TONE, timeOf } from "./Sections";

// Telefon → Jurnal (5TEL 3): every client number of the period with all of
// its calls -- eight figures on top, search, period and direction filters,
// Excel export; each row's last call can be played, opened in AI analysis,
// called back, and its lead opened.

const DIRS: JournalDir[] = ["all", "incoming", "outgoing", "unanswered"];
const MAX_ROWS = 300;

export function JournalSection({
  data,
  period,
  onPeriod,
}: {
  data: PhoneCenterData;
  period: PcPeriod;
  onPeriod: (p: PcPeriod) => void;
}) {
  const { t } = useI18n();
  const j = data.journal;
  const items: CardBoardItem[] = (
    [
      ["numbers", Hash, "primary", j.numbers],
      ["incomingNumbers", PhoneIncoming, "emerald", j.incomingNumbers],
      ["outgoingNumbers", PhoneOutgoing, "sky", j.outgoingNumbers],
      ["unansweredNumbers", PhoneMissed, "rose", j.unansweredNumbers],
      ["ops", Activity, "violet", j.ops],
      ["incomingOps", PhoneIncoming, "emerald", j.incomingOps],
      ["outgoingOps", PhoneOutgoing, "sky", j.outgoingOps],
      ["answeredOps", CheckCircle2, "emerald", j.answeredOps],
    ] as const
  ).map(([k, icon, tone, n]): CardBoardItem => ({
    id: k,
    title: t(`ptel.j.${k}`),
    icon,
    tone,
    node: (
      <DeskKpi
        tipKey={`ptel.j.${k}`}
        label={t(`ptel.j.${k}`)}
        icon={icon}
        tone={tone}
        rawValue={n}
        value={n}
      />
    ),
  }));
  items.push({
    id: "journal",
    title: t("ptel.b.journal"),
    icon: BookOpenText,
    tone: "sky",
    span: 12,
    sizes: [8, 12],
    node: <JournalTable data={data} />,
  });
  const bar = (cls?: string) => (
    <PeriodBar
      {...(cls ? { className: cls } : {})}
      options={["today", "week", "month", "all"]}
      value={period}
      onChange={onPeriod}
    />
  );
  return (
    <div className="space-y-4">
      {bar("hidden phone:flex")}
      <CardBoard boardKey="phone.journal" items={items} toolbar={bar("mr-auto")} />
    </div>
  );
}

function JournalTable({ data }: { data: PhoneCenterData }) {
  const { t } = useI18n();
  const { call, live, enabled } = usePhone();
  const [dir, setDir] = useState<JournalDir>("all");
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [review, setReview] = useState<CallReviewTarget | null>(null);
  const names = useMemo(() => new Map(data.operators.map((o) => [o.id, o.name])), [data.operators]);
  const all = useMemo(() => journalOf(data.calls), [data.calls]);
  const rows = useMemo(() => filterJournal(all, dir, q), [all, dir, q]);
  const shown = rows.slice(0, MAX_ROWS);
  const opName = (r: PcNumber) => (r.by ? (names.get(r.by) ?? "—") : "—");

  function exportXlsx() {
    downloadXlsx(`jurnal-${new Date().toISOString().slice(0, 10)}`, [
      {
        name: t("ptel.s.log"),
        rows: [
          [
            t("ptel.col.client"),
            t("phone.col.phone"),
            t("ptel.col.operator"),
            t("ptel.col.in"),
            t("ptel.col.out"),
            t("ptel.j.answeredOps"),
            t("phone.col.status"),
            t("ptel.col.time"),
          ],
          ...rows.map((r) => [
            r.name || "",
            r.phone,
            opName(r),
            r.incoming,
            r.outgoing,
            r.answered,
            t(`phone.outcome.${r.last.outcome}`),
            new Date(r.lastAt).toLocaleString(),
          ]),
        ],
      },
    ]);
  }

  return (
    <DeskBlock
      title={t("ptel.b.journal")}
      icon={BookOpenText}
      tone="sky"
      actions={
        <button
          type="button"
          onClick={exportXlsx}
          disabled={!rows.length}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {t("ptel.export")}
        </button>
      }
    >
      <div className="-mx-4 -mt-4 mb-0 flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 sm:-mx-5 sm:-mt-5">
        <label className="flex h-10 min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-primary">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("ptel.j.search")}
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground phone:text-base"
          />
        </label>
        <div role="tablist" className="ctl-track inline-flex items-center gap-0.5 rounded-xl p-0.5">
          {DIRS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={dir === k}
              data-state={dir === k ? "active" : "inactive"}
              onClick={() => setDir(k)}
              className="ctl-tab h-9 rounded-lg px-3 text-[13px] font-semibold"
            >
              {t(`ptel.jdir.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="-mx-4 -mb-4 overflow-x-auto sm:-mx-5 sm:-mb-5">
        <table className="w-full min-w-[980px] text-[14px]">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[13px] text-muted-foreground">
              <th className="py-3 pl-5 pr-3 font-semibold">{t("ptel.col.dir")}</th>
              <th className="px-3 py-3 font-semibold">{t("ptel.col.client")}</th>
              <th className="px-3 py-3 font-semibold">{t("ptel.col.operator")}</th>
              <th className="px-3 py-3 font-semibold">{t("ptel.col.state")}</th>
              <th className="px-3 py-3 font-semibold">{t("ptel.col.time")}</th>
              <th className="px-3 py-3 font-semibold">{t("ptel.col.aiShort")}</th>
              <th className="py-3 pl-3 pr-5 text-right font-semibold">{t("ptel.col.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                  {t("ptel.noCalls")}
                </td>
              </tr>
            )}
            {shown.map((r) => {
              const key = r.last.id;
              const isPlaying = playing === key;
              return (
                <JournalRow
                  key={key}
                  r={r}
                  operator={opName(r)}
                  playing={isPlaying}
                  onPlay={() => setPlaying(isPlaying ? null : key)}
                  onReview={() =>
                    setReview({
                      id: r.last.id,
                      name: r.name || r.phone,
                      phone: r.phone,
                      at: r.last.at,
                      durationSeconds: r.last.seconds,
                    })
                  }
                  canCall={enabled && !live}
                  onCall={() =>
                    call(r.phone, {
                      ...(r.leadId ? { leadId: r.leadId } : {}),
                      ...(r.name ? { name: r.name } : {}),
                    })
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-6 text-[13px] text-muted-foreground">
        {t("ptel.j.footer", {
          n: rows.length,
          ops: rows.reduce((a, r) => a + r.total, 0),
          ok: rows.reduce((a, r) => a + r.answered, 0),
          no: rows.filter((r) => r.answered === 0).length,
        })}
        {rows.length > MAX_ROWS ? ` · ${t("ptel.j.firstN", { n: MAX_ROWS })}` : ""}
      </p>
      <CallReviewDialog call={review} onClose={() => setReview(null)} />
    </DeskBlock>
  );
}

function JournalRow({
  r,
  operator,
  playing,
  onPlay,
  onReview,
  canCall,
  onCall,
}: {
  r: PcNumber;
  operator: string;
  playing: boolean;
  onPlay: () => void;
  onReview: () => void;
  canCall: boolean;
  onCall: () => void;
}) {
  const { t } = useI18n();
  const c = r.last;
  const btn = "grid h-9 w-9 place-items-center rounded-[8px] transition-colors";
  return (
    <>
      <tr className="border-b border-border/70 hover:bg-accent/40">
        <td className="py-3 pl-5 pr-3">
          <span className="flex items-center gap-2">
            <CallGlyph c={c} />
            <span className="text-[13px] tabular-nums text-muted-foreground">
              ↓{r.incoming} · ↑{r.outgoing}
            </span>
          </span>
        </td>
        <td className="max-w-[240px] px-3 py-3">
          <span className="block truncate font-semibold text-foreground">
            {r.name || t("phone.unknown")}
          </span>
          <span className="block text-[13px] tabular-nums text-muted-foreground">
            {r.phone || "—"}
          </span>
        </td>
        <td className="max-w-[180px] truncate px-3 py-3 text-muted-foreground">{operator}</td>
        <td className="px-3 py-3">
          <span className="flex items-center gap-2">
            <span className={cn("font-semibold", OUTCOME_TONE[c.outcome])}>
              {t(`phone.outcome.${c.outcome}`)}
            </span>
            {c.seconds > 0 && (
              <span className="text-[13px] tabular-nums text-muted-foreground">
                {clock(c.seconds)}
              </span>
            )}
            {c.recording && (
              <button
                type="button"
                onClick={onPlay}
                title={t("phone.listen")}
                className={cn(
                  btn,
                  "h-8 w-8",
                  playing
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
            )}
          </span>
        </td>
        <td className="px-3 py-3 tabular-nums text-muted-foreground">{timeOf(r.lastAt)}</td>
        <td className="px-3 py-3">
          {c.outcome === "answered" ? (
            <button
              type="button"
              onClick={onReview}
              className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-violet-500/12 px-2.5 text-[13px] font-semibold text-violet-700 hover:bg-violet-500/20 dark:text-violet-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("ptel.col.aiShort")}
            </button>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="py-3 pl-3 pr-5">
          <span className="flex items-center justify-end gap-1.5">
            {r.leadId && (
              <Link
                to="/crm/leads/$leadId"
                params={{ leadId: r.leadId }}
                title={t("ptel.openLead")}
                className={cn(btn, "text-muted-foreground hover:bg-accent hover:text-foreground")}
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}
            {r.phone && (
              <button
                type="button"
                onClick={onCall}
                disabled={!canCall}
                title={t("phone.callBack")}
                className={cn(
                  btn,
                  "bg-emerald-500/12 text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:opacity-40 dark:text-emerald-400",
                )}
              >
                <Phone className="h-4 w-4" />
              </button>
            )}
          </span>
        </td>
      </tr>
      {playing && c.recording && (
        <tr className="border-b border-border/70">
          <td colSpan={7} className="px-5 pb-3 pt-1">
            <RecordingAudio url={c.recording} controls autoPlay className="h-9 w-full" />
          </td>
        </tr>
      )}
    </>
  );
}
