import { createFileRoute } from "@tanstack/react-router";
import { Client } from "pg";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// One-off diagnostic for the persistent "Could not find the 'plan' column
// of 'organizations' in the schema cache" error, which survived both a
// re-run of every migration and an explicit schema-cache reload -- meaning
// either the raw DATABASE_URL connection (used by /admin/run-migrations)
// and the app's own SUPABASE_URL/service-role client are silently pointing
// at two different Supabase projects, or something else entirely. Reports,
// without leaking secrets: the hostname DATABASE_URL points to, what
// information_schema says organizations' columns are over that same
// connection, and whether the app's own supabaseAdmin client (the one
// /signup/create actually uses) can see the "plan" column at all.
// Visit: https://<your-domain>/admin/diag?secret=<MIGRATION_SECRET>
export const Route = createFileRoute("/admin/diag")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const secret = url.searchParams.get("secret");
        const expected = process.env["MIGRATION_SECRET"];
        if (!expected || secret !== expected) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const result: Record<string, unknown> = {};

        const databaseUrl = process.env["DATABASE_URL"];
        result["databaseUrlHost"] = databaseUrl
          ? (() => {
              try {
                return new URL(databaseUrl.replace(/^postgres(ql)?:/, "http:")).host;
              } catch {
                return "unparseable";
              }
            })()
          : "MISSING";
        result["supabaseUrl"] = process.env["SUPABASE_URL"] ?? "MISSING";

        if (databaseUrl) {
          const client = new Client({
            connectionString: databaseUrl,
            ssl: { rejectUnauthorized: false },
          });
          try {
            await client.connect();
            const dbInfo = await client.query("select current_database() as db");
            result["rawPgCurrentDatabase"] = dbInfo.rows[0]?.db;
            const cols = await client.query(
              "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'organizations' order by column_name",
            );
            result["rawPgOrganizationsColumns"] = cols.rows.map(
              (r: { column_name: string }) => r.column_name,
            );
          } catch (err) {
            result["rawPgError"] = err instanceof Error ? err.message : String(err);
          } finally {
            await client.end().catch(() => {});
          }
        }

        const viaPostgrest = await supabaseAdmin.from("organizations").select("id, plan").limit(1);
        result["postgrestSelectPlanError"] = viaPostgrest.error?.message ?? null;
        result["postgrestSelectPlanOk"] = !viaPostgrest.error;

        // All four cron jobs (amocrm sync, audio auto-analysis, daily
        // report, fines) pointed at the old lovable.app domain until
        // 20260919010000_fix_cron_job_domains.sql -- this reports each
        // job's current url and its 3 most recent runs so the fix (and
        // CRON_SECRET actually being set) can be confirmed without
        // waiting to notice the downstream symptom days later.
        const cronSecretSet = !!process.env["CRON_SECRET"];
        result["cronSecretConfigured"] = cronSecretSet;
        if (databaseUrl) {
          const client = new Client({
            connectionString: databaseUrl,
            ssl: { rejectUnauthorized: false },
          });
          try {
            await client.connect();
            const jobs = await client.query(
              "select jobname, schedule, active, command from cron.job where jobname in ('amocrm-auto-sync-5min', 'audio-analysis-auto-5min', 'telegram-daily-report-scheduler', 'fines-daily-compute-2100-tashkent') order by jobname",
            );
            result["cronJobs"] = jobs.rows.map((r: Record<string, unknown>) => ({
              jobname: r["jobname"],
              schedule: r["schedule"],
              active: r["active"],
              url: /url\s*:=\s*'([^']+)'/.exec(String(r["command"]))?.[1] ?? null,
            }));
            const runs = await client.query(
              `select j.jobname, r.status, r.return_message, r.start_time
               from cron.job_run_details r
               join cron.job j on j.jobid = r.jobid
               where j.jobname in ('amocrm-auto-sync-5min', 'audio-analysis-auto-5min', 'telegram-daily-report-scheduler', 'fines-daily-compute-2100-tashkent')
               order by r.start_time desc
               limit 12`,
            );
            result["cronRecentRuns"] = runs.rows;
          } catch (err) {
            result["cronDiagError"] = err instanceof Error ? err.message : String(err);
          } finally {
            await client.end().catch(() => {});
          }
        }

        return Response.json(result);
      },
    },
  },
});
