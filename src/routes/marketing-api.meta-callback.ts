import { createFileRoute } from "@tanstack/react-router";
import { metaFinish, readState } from "@/lib/meta-ads.server";

// GET /marketing-api/meta-callback?code=&state= -- Facebook sends the person
// back here after they allowed ads_read; the token is saved for the company
// named in the (sealed) state and the browser returns to the panel's
// Sozlash -> Manbalar with ?meta=ok / ?meta=error. One fixed address, so the
// Meta app needs only this redirect URI whatever the company's own address.
export const Route = createFileRoute("/marketing-api/meta-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const state = readState(url.searchParams.get("state"));
        if (!state) return new Response("Bad state", { status: 400 });
        const back = new URL(state.back);
        const code = url.searchParams.get("code");
        try {
          if (!code) throw new Error(url.searchParams.get("error_description") ?? "no code");
          await metaFinish(state.orgId, state.userId, code);
          back.searchParams.set("meta", "ok");
        } catch (err) {
          console.error("[meta] connect failed", err);
          back.searchParams.set("meta", "error");
        }
        return Response.redirect(back.toString(), 302);
      },
    },
  },
});
