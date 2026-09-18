import { createFileRoute } from "@tanstack/react-router";
import { Client } from "pg";
import { MIGRATIONS } from "@/lib/generated-migrations";

// One-off, secret-protected endpoint that applies every file in
// supabase/migrations/ directly against Postgres, in order, over a real
// DATABASE_URL connection -- for when the Supabase SQL Editor's paste box
// keeps mangling a 100+KB clipboard and there's no CLI/psql access to fall
// back to. Every migration is idempotent (create table/policy/trigger/index
// all guard against already existing), so this is safe to re-run from
// scratch as many times as needed if a later file fails.
//
// Setup (one time): in Vercel, add
//   DATABASE_URL     -- Supabase Dashboard -> Project Settings -> Database
//                        -> Connection string -> "Session pooler" (port
//                        5432, NOT the 6543 transaction pooler -- DDL needs
//                        a real session). Fill in the actual DB password.
//   MIGRATION_SECRET -- any random string you make up.
// Then just visit (in a browser, once redeployed):
//   https://<your-domain>/admin/run-migrations?secret=<MIGRATION_SECRET>
// Optional ?start=N&end=M (1-based, inclusive) to run only a slice of the
// 127 files -- useful if a single request ever hits a platform timeout.
export const Route = createFileRoute("/admin/run-migrations")({
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

        const startParam = Number(url.searchParams.get("start") ?? "1");
        const endParam = Number(url.searchParams.get("end") ?? String(MIGRATIONS.length));
        const start = Number.isFinite(startParam) ? Math.max(1, startParam) : 1;
        const end = Number.isFinite(endParam)
          ? Math.min(MIGRATIONS.length, endParam)
          : MIGRATIONS.length;
        const slice = MIGRATIONS.slice(start - 1, end);

        const client = new Client({
          connectionString: databaseUrl,
          ssl: { rejectUnauthorized: false },
        });

        const stopOnError = url.searchParams.get("stopOnError") !== "false";

        const results: { name: string; ok: boolean; error?: string }[] = [];
        try {
          await client.connect();
          for (const migration of slice) {
            try {
              await client.query(migration.sql);
              results.push({ name: migration.name, ok: true });
            } catch (err) {
              results.push({
                name: migration.name,
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              });
              // This database's migration history turned out to have scattered
              // gaps (files applied out of order across many earlier, pre-tooling
              // sessions), so a later file can fail while an even-later one
              // still succeeds independently -- stopping at the first failure
              // made recovery a one-file-at-a-time slog. Default is still to
              // stop (most failures really do block everything after them),
              // but ?stopOnError=false runs the whole requested range and
              // reports every result, which is what full-history diagnosis
              // and repair actually needs.
              if (stopOnError) break;
            }
          }
          // PostgREST caches the schema and doesn't always notice DDL run
          // over a raw `pg` connection right away -- without this, a column
          // this run just added can 404 with "Could not find the 'x' column
          // ... in the schema cache" on the very next request.
          await client.query("NOTIFY pgrst, 'reload schema'").catch(() => {});
        } catch (err) {
          return Response.json(
            {
              error: `Could not connect to the database: ${err instanceof Error ? err.message : String(err)}`,
              results,
            },
            { status: 500 },
          );
        } finally {
          await client.end().catch(() => {});
        }

        const failed = results.find((r) => !r.ok);
        return Response.json({
          ranFiles: `${start}-${end} of ${MIGRATIONS.length}`,
          appliedCount: results.filter((r) => r.ok).length,
          totalInSlice: slice.length,
          success: !failed,
          results,
        });
      },
    },
  },
});
