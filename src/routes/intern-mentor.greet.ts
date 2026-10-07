import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { loadIntern, sendGreetingIfDue } from "@/lib/intern-mentor.server";

// Called by the intern's browser when they open the platform: sends today's
// mentor greeting (with the day's Sinfxona roadmap) once per probation day,
// on the platform and in Telegram. A no-op for everyone else and for any
// later call on the same day.
export const Route = createFileRoute("/intern-mentor/greet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const intern = await loadIntern(userId);
        if (!intern?.is_intern) return Response.json({ greeted: false });
        try {
          const greeted = await sendGreetingIfDue(intern);
          return Response.json({ greeted });
        } catch (err) {
          return Response.json(
            { error: err instanceof Error ? err.message : "Greeting failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
