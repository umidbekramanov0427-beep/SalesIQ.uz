import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/auth.server";
import { safeReturnOrigin } from "@/lib/instagram/events";
import { authorizeUrl, instagramConfigured, signState } from "@/lib/instagram/instagram.server";

// POST /integrations/instagram/connect -> { url }: Instagram's sign-in page
// for connecting the company's account. The signed state carries who asked
// and which address (the company's subdomain) to come back to.
export const Route = createFileRoute("/integrations/instagram/connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireSuperAdmin(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (!instagramConfigured()) {
          return Response.json(
            { error: "Instagram ulanishi hali platformada sozlanmagan." },
            { status: 503 },
          );
        }
        const root = (process.env["PUBLIC_APP_URL"] ?? "https://salesiq.uz")
          .replace(/^https?:\/\//, "")
          .replace(/\/.*$/, "");
        const state = signState({
          org: caller.organizationId,
          uid: caller.id,
          ret: safeReturnOrigin(request.headers.get("origin"), root),
          exp: Date.now() + 15 * 60_000,
        });
        return Response.json({ url: authorizeUrl(state) });
      },
    },
  },
});
