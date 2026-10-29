import { createFileRoute } from "@tanstack/react-router";
import { processDueRuns, processOutbox } from "@/lib/automations/engine.server";
import { runTaskReminders } from "@/lib/live-notifications.server";

// pg_cron calls this every minute (see 20261017000000_digital_pipeline_salesbots.sql)
// with the shared x-cron-secret: sends queued automation messages /
// webhooks / salesbot starts, advances salesbots whose wait ran out, and
// hands out task reminders (before / at / after the deadline).
export const Route = createFileRoute("/automations/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        if (!expected || request.headers.get("x-cron-secret") !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        const reminders = runTaskReminders().catch(() => 0);
        const outbox = await processOutbox();
        const bots = await processDueRuns();
        return Response.json({ outbox, botsAdvanced: bots, taskReminders: await reminders });
      },
    },
  },
});
