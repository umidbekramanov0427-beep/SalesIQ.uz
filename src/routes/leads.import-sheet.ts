import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId } from "@/lib/auth.server";
import { googleSheetCsvUrl } from "@/lib/leads/lead-import.server";

const MAX_BYTES = 8 * 1024 * 1024;

// Fetches a Google Sheet as CSV for the lead importer (the browser can't,
// because of CORS). Only docs.google.com spreadsheet links are accepted, so
// this can't be used to fetch arbitrary URLs. The sheet must be shared as
// "Anyone with the link can view".
export const Route = createFileRoute("/leads/import-sheet")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
        const csvUrl = typeof body?.url === "string" ? googleSheetCsvUrl(body.url) : null;
        if (!csvUrl) {
          return Response.json({ error: "Not a Google Sheets link." }, { status: 400 });
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        try {
          const res = await fetch(csvUrl, { signal: controller.signal, redirect: "follow" });
          const type = res.headers.get("content-type") ?? "";
          if (!res.ok || type.includes("text/html")) {
            return Response.json({ error: "sheet_not_public" }, { status: 400 });
          }
          const text = await res.text();
          if (text.length > MAX_BYTES) {
            return Response.json({ error: "Sheet is too large." }, { status: 400 });
          }
          return Response.json({ text });
        } catch {
          return Response.json({ error: "Couldn't reach Google Sheets." }, { status: 502 });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
