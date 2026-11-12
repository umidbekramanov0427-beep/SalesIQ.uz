import { createFileRoute } from "@tanstack/react-router";
import { CORS, recordSiteLead } from "@/lib/site-tracking.server";

// Public: a form with a phone number submitted on a company's website
// (public/siq.js) -- a lead with the visit's UTM tags.
export const Route = createFileRoute("/t/lead")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: CORS }),
      POST: ({ request }) => recordSiteLead(request),
    },
  },
});
