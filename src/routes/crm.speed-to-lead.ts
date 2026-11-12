import { createFileRoute } from "@tanstack/react-router";
import { runSpeedToLead } from "@/lib/speed-to-lead.server";
import { runReminders } from "@/lib/reminders.server";
import { pollYoutubeWebinars } from "@/lib/marketing-live.server";

// POST /crm/speed-to-lead -- pg_cron, every minute (x-cron-secret): reminds
// managers of fresh leads nobody has contacted yet and escalates to the
// head of sales (see speed-to-lead.server.ts) -- and sends the Eslatmalar
// that are due (reminders.server.ts) -- and counts live YouTube webinars'
// viewers (marketing-live.server.ts).
export const Route = createFileRoute("/crm/speed-to-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        if (!expected || request.headers.get("x-cron-secret") !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          // A failed reminder pass doesn't stop the speed-to-lead check.
          const reminders = await runReminders().catch((err) => {
            console.error("[reminders]", err);
            return { sent: 0 };
          });
          // Marketing paneli: viewers of live YouTube webinars, minute by minute.
          const webinars = await pollYoutubeWebinars().catch((err) => {
            console.error("[webinars]", err);
            return 0;
          });
          return Response.json({
            ok: true,
            webinars,
            ...(await runSpeedToLead()),
            reminders: reminders.sent,
          });
        } catch (err) {
          console.error("[speed-to-lead]", err);
          return Response.json({ error: "Speed-to-lead check failed." }, { status: 500 });
        }
      },
    },
  },
});
