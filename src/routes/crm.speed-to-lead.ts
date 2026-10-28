import { createFileRoute } from "@tanstack/react-router";
import { runSpeedToLead } from "@/lib/speed-to-lead.server";

// POST /crm/speed-to-lead -- pg_cron, every minute (x-cron-secret): reminds
// managers of fresh leads nobody has contacted yet and escalates to the
// head of sales (see speed-to-lead.server.ts).
export const Route = createFileRoute("/crm/speed-to-lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["CRON_SECRET"];
        if (!expected || request.headers.get("x-cron-secret") !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        try {
          return Response.json({ ok: true, ...(await runSpeedToLead()) });
        } catch (err) {
          console.error("[speed-to-lead]", err);
          return Response.json({ error: "Speed-to-lead check failed." }, { status: 500 });
        }
      },
    },
  },
});
