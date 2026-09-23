import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseWebFormFields } from "@/lib/forms/web-form-fields";

// Public, unauthenticated -- fetched by the /f/:slug page itself (an
// anonymous visitor has no Supabase session) to render the right fields
// without exposing anything else about the form's owning organization.
export const Route = createFileRoute("/forms/$slug")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data: form } = await supabaseAdmin
          .from("web_forms")
          .select("name, fields, success_message, active")
          .eq("slug", params.slug)
          .maybeSingle();

        if (!form) {
          return Response.json({ error: "Form not found." }, { status: 404 });
        }

        return Response.json({
          name: form.name,
          fields: parseWebFormFields(form.fields),
          successMessage: form.success_message,
          active: form.active,
        });
      },
    },
  },
});
