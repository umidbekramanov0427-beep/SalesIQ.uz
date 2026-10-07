// Shared by the mentor UI and the mentor server routes: which day of the
// probation an intern is on, and which Sinfxona lessons belong to each day.
// Pure functions only, so the browser and the server always agree on what
// "today's lessons" means.

export type RoadmapLesson = {
  id: string;
  title: string;
  section_id?: string | null;
  position: number;
  intern_day?: number | null;
  duration_seconds?: number | null;
};

export type RoadmapSection = { id: string; position: number };

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Today's date in Tashkent, as YYYY-MM-DD. */
export function tashkentToday(now: number = Date.now()): string {
  return new Date(now + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Day number of the probation (day 1 = the start date); null before it starts. */
export function internDay(startDate: string | null | undefined, now: number = Date.now()) {
  if (!startDate) return null;
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const today = Date.parse(`${tashkentToday(now)}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const day = Math.floor((today - start) / 86_400_000) + 1;
  return day >= 1 ? day : null;
}

/**
 * Lessons per day. Lessons pinned with intern_day go to that day; the rest
 * keep Sinfxona's order (section, then position) and are spread evenly over
 * the days, front-loaded so day 1 is never empty.
 */
export function buildRoadmap<L extends RoadmapLesson>(
  lessons: L[],
  sections: RoadmapSection[],
  totalDays: number,
): L[][] {
  const days = Math.max(1, totalDays);
  const plan: L[][] = Array.from({ length: days }, () => []);
  const sectionPos = new Map(sections.map((s) => [s.id, s.position]));
  const ordered = [...lessons].sort((a, b) => {
    const sa = a.section_id ? (sectionPos.get(a.section_id) ?? 1e6) : -1;
    const sb = b.section_id ? (sectionPos.get(b.section_id) ?? 1e6) : -1;
    return sa - sb || a.position - b.position;
  });
  const free: L[] = [];
  for (const lesson of ordered) {
    const pinned = lesson.intern_day;
    if (pinned && pinned >= 1) plan[Math.min(pinned, days) - 1]!.push(lesson);
    else free.push(lesson);
  }
  const perDay = Math.ceil(free.length / days);
  free.forEach((lesson, i) => {
    plan[Math.min(days - 1, Math.floor(i / Math.max(1, perDay)))]!.push(lesson);
  });
  return plan;
}

export function lessonsForDay<L extends RoadmapLesson>(
  lessons: L[],
  sections: RoadmapSection[],
  totalDays: number,
  day: number | null,
): L[] {
  if (!day) return [];
  const plan = buildRoadmap(lessons, sections, totalDays);
  return plan[Math.min(day, plan.length) - 1] ?? [];
}
