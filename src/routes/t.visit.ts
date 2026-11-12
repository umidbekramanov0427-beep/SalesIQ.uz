import { createFileRoute } from "@tanstack/react-router";
import { CORS, recordVisit } from "@/lib/site-tracking.server";

// Public: a page view from a company's website (public/siq.js).
export const Route = createFileRoute("/t/visit")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: ({ request }) => recordVisit(request),
    },
  },
});
