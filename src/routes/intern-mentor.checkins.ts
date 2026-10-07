import { createFileRoute } from "@tanstack/react-router";
import { checkInIfDue, loadActiveInterns } from "@/lib/intern-mentor.server";

// pg_cron calls this every 15 minutes (see 20261016000000_intern_mentor.sql)
// with the shared x-cron-secret, like the other scheduled routes. Each
// intern's own pacing (work hours, ~45 min apart, slower when unanswered)
// lives in checkInIfDue, so the schedule itself can stay dumb.
const BATCH_LIMIT = 25;

export const Route = createFileRoute("/intern-mentor/checkins")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        if (!expected || request.headers.get("x-cron-secret") !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const interns = await loadActiveInterns();
        // Longest-waiting first, so a big org can't starve the rest.
        interns.sort(
          (a, b) =>
            Date.parse(a.mentor_last_checkin_at ?? "1970-01-01") -
            Date.parse(b.mentor_last_checkin_at ?? "1970-01-01"),
        );
        const results = await Promise.allSettled(
          interns.slice(0, BATCH_LIMIT).map((intern) => checkInIfDue(intern)),
        );
        const count = (v: string) =>
          results.filter((r) => r.status === "fulfilled" && r.value === v).length;
        return Response.json({
          interns: interns.length,
          greeted: count("greeted"),
          checked: count("checked"),
          failed: results.filter((r) => r.status === "rejected").length,
        });
      },
    },
  },
});
