// Sample Telefon figures for the dev preview page (/dev/phone): a week of
// believable calls for five operators, summed with the same pure functions
// the server uses. Never shown to a company.
import {
  dailyOf,
  daysBetween,
  heatmapOf,
  hourlyOf,
  journalOf,
  journalTotalsOf,
  operatorsOf,
  splitOf,
  totalsOf,
  type PcCall,
  type PcOutcome,
  type PhoneCenterData,
} from "@/lib/phone-center";

const PEOPLE = [
  { id: "op1", name: "Dilnoza Karimova", role: "sotuv_menejeri", ext: "101" },
  { id: "op2", name: "Jasur Toshmatov", role: "sotuv_menejeri", ext: "102" },
  { id: "op3", name: "Madina Rahimova", role: "sotuv_menejeri", ext: "103" },
  { id: "op4", name: "Bekzod Aliyev", role: "rop", ext: "104" },
  { id: "op5", name: "Sardor Yusupov", role: "sotuv_menejeri", ext: null },
];
const CLIENTS = [
  "Akmal Nurmatov",
  "Gulnora Saidova",
  "Otabek Ergashev",
  "Nilufar Qodirova",
  "Rustam Xolmatov",
  "Shahnoza Mirzayeva",
  "",
  "Ulug'bek Sobirov",
  "Feruza Aminova",
  "",
];

export function samplePhoneCenter(
  range: { from: string; to: string },
  now = new Date(),
): PhoneCenterData {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const calls: PcCall[] = [];
  for (let back = 0; back < 30; back++) {
    const n = back === 0 ? 46 : 30 + Math.floor(rnd() * 30);
    for (let i = 0; i < n; i++) {
      // Busier late morning and afternoon, Tashkent time.
      const hour = Math.min(20, Math.max(8, Math.round(9 + rnd() * 5 + rnd() * 5)));
      const min = Math.floor(rnd() * 60);
      const day = new Date(now.getTime() - back * 86_400_000);
      const at = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour - 5, min),
      );
      if (at > now) continue;
      const incoming = rnd() < 0.42;
      const r = rnd();
      const outcome: PcOutcome = incoming
        ? r < 0.78
          ? "answered"
          : "missed"
        : r < 0.62
          ? "answered"
          : r < 0.95
            ? "noAnswer"
            : "failed";
      const p = PEOPLE[Math.floor(rnd() * 4)]!;
      const ci = Math.floor(rnd() * 40);
      calls.push({
        id: `s${back}-${i}`,
        at: at.toISOString(),
        direction: incoming ? "incoming" : "outgoing",
        outcome,
        seconds: outcome === "answered" ? 20 + Math.floor(rnd() * 400) : 0,
        by: p.id,
        phone: `+99890${String(1000000 + ci * 37311).slice(0, 7)}`,
        name: CLIENTS[ci % CLIENTS.length]!,
        leadId: ci % 3 === 0 ? null : `lead-${ci}`,
        recording: outcome === "answered" ? "https://example.invalid/rec.mp3" : null,
        error: null,
      });
    }
  }
  calls.sort((a, b) => (a.at < b.at ? 1 : -1));
  const from = Date.parse(`${range.from}T00:00:00+05:00`);
  const to = Date.parse(`${range.to}T00:00:00+05:00`) + 86_400_000;
  const inRange = calls.filter((c) => {
    const t = Date.parse(c.at);
    return t >= from && t < to;
  });
  const links = PEOPLE.filter((p) => p.ext).map((p) => ({ code: p.ext!, profileId: p.id }));
  return {
    provider: {
      id: "onlinepbx",
      connected: true,
      connectedAt: null,
      lastEventAt: now.toISOString(),
    },
    myExtension: "101",
    totals: totalsOf(inRange),
    operators: operatorsOf(inRange, [], PEOPLE, links),
    calls: inRange,
    scores: [],
    hourly: hourlyOf(inRange),
    heat: heatmapOf(inRange),
    daily: dailyOf(inRange, daysBetween(range.from, range.to)),
    journal: journalTotalsOf(journalOf(inRange)),
    split: splitOf(inRange),
    live: {
      onCall: ["op2"],
      seenAt: {
        op1: now.toISOString(),
        op2: now.toISOString(),
        op3: new Date(now.getTime() - 3600_000).toISOString(),
        op4: now.toISOString(),
      },
    },
  };
}
