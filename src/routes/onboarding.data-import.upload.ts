import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// The generic "migrate from another CRM" cutover path: instead of building
// a dedicated connector per competitor CRM (Bitrix24, HubSpot, ...), any of
// them can export to CSV, and the client (onboarding.data-import.tsx)
// already parsed + column-mapped that CSV into these plain row objects --
// this route only has to validate and bulk-insert them.
type ImportRow = {
  name: string;
  phone?: string;
  email?: string;
  companyName?: string;
  source?: string;
  budget?: number;
};

const MAX_ROWS = 2000;

export const Route = createFileRoute("/onboarding/data-import/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const admin = await requireSuperAdmin(request);
          if (!admin) {
            return Response.json({ error: "Only admins can import data." }, { status: 403 });
          }

          const body = (await request.json().catch(() => null)) as {
            sourceLabel?: string;
            rows?: ImportRow[];
          } | null;
          const sourceLabel = body?.sourceLabel?.trim() || "Import.csv";
          const rows = Array.isArray(body?.rows) ? body.rows : [];
          if (rows.length === 0) {
            return Response.json({ error: "Fayl bo'sh yoki qatorlar topilmadi." }, { status: 400 });
          }
          if (rows.length > MAX_ROWS) {
            return Response.json(
              { error: `Bir martada eng ko'pi bilan ${MAX_ROWS} qator import qilish mumkin.` },
              { status: 400 },
            );
          }

          const { data: importRow, error: importErr } = await supabaseAdmin
            .from("org_data_imports")
            .insert({
              organization_id: admin.organizationId,
              source_label: sourceLabel,
              status: "processing",
              row_count: rows.length,
              created_by: admin.id,
            })
            .select("id")
            .single();
          if (importErr || !importRow) {
            return Response.json({ error: importErr?.message ?? "Import failed" }, { status: 500 });
          }

          let importedLeads = 0;
          let importedContacts = 0;
          const errors: string[] = [];

          for (const row of rows) {
            const name = row.name?.trim();
            if (!name) continue;
            try {
              let contactId: string | null = null;
              if (row.phone?.trim() || row.email?.trim()) {
                const { data: contact, error: contactErr } = await supabaseAdmin
                  .from("contacts")
                  .insert({
                    organization_id: admin.organizationId,
                    full_name: name,
                    phone: row.phone?.trim() || null,
                    email: row.email?.trim() || null,
                  })
                  .select("id")
                  .single();
                if (contactErr) throw contactErr;
                contactId = contact.id;
                importedContacts++;
              }

              const { error: leadErr } = await supabaseAdmin.from("leads").insert({
                organization_id: admin.organizationId,
                name,
                contact_id: contactId,
                company_name: row.companyName?.trim() || "",
                source: row.source?.trim() || "Import",
                budget:
                  typeof row.budget === "number" && !Number.isNaN(row.budget) ? row.budget : 0,
                owner_id: admin.id,
              });
              if (leadErr) throw leadErr;
              importedLeads++;
            } catch (err) {
              if (errors.length < 20) {
                errors.push(err instanceof Error ? err.message : "Noma'lum xatolik");
              }
            }
          }

          await supabaseAdmin
            .from("org_data_imports")
            .update({
              status: errors.length > 0 && importedLeads === 0 ? "error" : "done",
              imported_leads: importedLeads,
              imported_contacts: importedContacts,
              error: errors.length > 0 ? errors.join("; ") : null,
              finished_at: new Date().toISOString(),
            })
            .eq("id", importRow.id);

          return Response.json({ importedLeads, importedContacts, errorCount: errors.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
