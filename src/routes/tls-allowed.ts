import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ROOT_DOMAIN, subdomainFromHost } from "@/lib/subdomain";

// Self-hosted server: Caddy issues HTTPS certificates on demand and asks
// here first (`on_demand_tls { ask http://127.0.0.1:3000/tls-allowed }`),
// so a certificate is only requested for the root domain, www, vps and a
// subdomain a company really has -- not for any name someone points at us.
// 200 = allowed, 404 = not ours.
const FIXED_HOSTS = new Set([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`, `vps.${ROOT_DOMAIN}`]);

export const Route = createFileRoute("/tls-allowed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const domain = (new URL(request.url).searchParams.get("domain") ?? "").toLowerCase();
        if (FIXED_HOSTS.has(domain)) return new Response("ok");
        const sub = subdomainFromHost(domain);
        if (!sub || domain.endsWith(".localhost")) return new Response("no", { status: 404 });
        const { data } = await supabaseAdmin
          .from("organizations")
          .select("id")
          .eq("subdomain", sub)
          .maybeSingle();
        return data ? new Response("ok") : new Response("no", { status: 404 });
      },
    },
  },
});
