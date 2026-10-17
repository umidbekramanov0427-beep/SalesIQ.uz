import { createFileRoute } from "@tanstack/react-router";
import { getConnection, upsertSingleAmoLead } from "@/lib/amocrm/client.server";

// AmoCRM posts form-encoded fields like leads[add][0][id], leads[update][0][name] ...
const FIELD_PATTERN =
  /^leads\[(?:add|update)\]\[(\d+)\]\[(id|name|price|status_id|responsible_user_id|pipeline_id)\]$/;

// AmoCRM's classic webhook only tells us about lead field changes (this
// endpoint's org routing comes from a caller-supplied ?org= query param, not
// from anything AmoCRM signs), so a stranger who guesses an organization_id
// could otherwise post fake lead data into another company's account. Every
// webhook payload carries account[subdomain] -- reject anything that
// doesn't match the org's own connected AmoCRM account before touching data.
function verifiesConnectedAccount(form: FormData, subdomain: string): boolean {
  const posted = form.get("account[subdomain]");
  if (typeof posted !== "string" || !posted) return false;
  // amoCRM posts the bare name ("acme"); the connection stores the host
  // ("acme.amocrm.ru").
  const host = subdomain.toLowerCase();
  const name = posted.toLowerCase();
  return name === host || name === host.split(".")[0];
}

// Leads written straight from one webhook (see the loop below).
const WEBHOOK_INLINE_LIMIT = 50;

export const Route = createFileRoute("/integrations/amocrm/webhook")({
  server: {
    handlers: {
      // AmoCRM expects a fast 200 regardless of outcome, or it retries
      // aggressively. The URL AmoCRM posts to must include ?org=<id> — set
      // when connecting (see the "webhook URL" shown after Connect) — since
      // this endpoint no longer belongs to a single workspace.
      POST: async ({ request }) => {
        try {
          const organizationId = new URL(request.url).searchParams.get("org");
          if (!organizationId) return new Response("ok", { status: 200 });
          const conn = await getConnection(organizationId);
          if (!conn) return new Response("ok", { status: 200 });

          const form = await request.formData();
          if (!verifiesConnectedAccount(form, conn.subdomain)) {
            console.error(
              `AmoCRM webhook: account mismatch for org ${organizationId} (expected ${conn.subdomain})`,
            );
            return new Response("ok", { status: 200 });
          }

          type Entry = {
            id?: string;
            name?: string;
            price?: string;
            status_id?: string;
            responsible_user_id?: string;
            pipeline_id?: string;
          };
          const byIndex = new Map<string, Entry>();

          for (const [key, value] of form.entries()) {
            const match = FIELD_PATTERN.exec(key);
            if (!match) continue;
            const index = match[1]!;
            const field = match[2] as keyof Entry;
            const entry = byIndex.get(index) ?? {};
            entry[field] = String(value);
            byIndex.set(index, entry);
          }

          // A bulk edit can post hundreds of leads at once; the first ones
          // are written now, the rest come with the 5-minute sync.
          let written = 0;
          for (const entry of byIndex.values()) {
            if (!entry.id) continue;
            if (++written > WEBHOOK_INLINE_LIMIT) break;
            await upsertSingleAmoLead(
              organizationId,
              Number(entry.id),
              entry.name ?? null,
              entry.price ? Number(entry.price) : null,
              entry.status_id ? Number(entry.status_id) : null,
              entry.responsible_user_id ? Number(entry.responsible_user_id) : null,
              entry.pipeline_id ? Number(entry.pipeline_id) : null,
            );
          }

          // No full sync here any more: it ran inside amoCRM's request (up to
          // ~95 s, and a whole backfill before the first sync finished), and
          // amoCRM turns off a webhook that keeps answering slowly. The
          // changed leads above are written right away; calls, tasks and
          // contacts follow with the 5-minute sync.
        } catch (err) {
          console.error("AmoCRM webhook error", err);
        }
        return new Response("ok", { status: 200 });
      },
    },
  },
});
