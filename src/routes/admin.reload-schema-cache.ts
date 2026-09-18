import { createFileRoute } from "@tanstack/react-router";
import { Client } from "pg";

// One-off, secret-protected endpoint to force PostgREST to notice schema
// changes (new/altered columns, tables, etc.) immediately, instead of
// waiting for its own polling interval. Needed because /admin/run-migrations
// applies DDL over a raw `pg` connection, which PostgREST doesn't always
// pick up right away -- symptom: "Could not find the 'x' column of 'y' in
// the schema cache" from supabase-js right after a migration that added
// column x. Safe to hit any time; it only sends a NOTIFY, no schema change.
// Visit: https://<your-domain>/admin/reload-schema-cache?secret=<MIGRATION_SECRET>
export const Route = createFileRoute("/admin/reload-schema-cache")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const expected = process.env["MIGRATION_SECRET"];
        if (!expected || secret !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const databaseUrl = process.env["DATABASE_URL"];
        if (!databaseUrl) {
          return Response.json(
            { error: "Missing DATABASE_URL environment variable." },
            { status: 500 },
          );
        }

        const client = new Client({
          connectionString: databaseUrl,
          ssl: { rejectUnauthorized: false },
        });
        try {
          await client.connect();
          await client.query("NOTIFY pgrst, 'reload schema'");
        } catch (err) {
          return Response.json(
            {
              error: `Could not connect to the database: ${err instanceof Error ? err.message : String(err)}`,
            },
            { status: 500 },
          );
        } finally {
          await client.end().catch(() => {});
        }

        return Response.json({ ok: true });
      },
    },
  },
});
