import { createFileRoute } from "@tanstack/react-router";
import { openSlots } from "@/lib/company-leads.server";

// GET /applications/slots -> { minutes, days: [{ day, slots: [ISO] }] }: the
// free times a company can book its call with SalesIQ on sign-up (public;
// only times, no names).
export const Route = createFileRoute("/applications/slots")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json(await openSlots(), {
            headers: { "cache-control": "no-store" },
          });
        } catch {
          return Response.json({ minutes: 30, days: [] });
        }
      },
    },
  },
});
