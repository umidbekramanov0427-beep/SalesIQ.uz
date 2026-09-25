import { createFileRoute } from "@tanstack/react-router";
import { requireOrgMember } from "@/lib/auth.server";
import {
  createSubscriptionPaymentLink,
  type SubscriptionPaymentProvider,
} from "@/lib/subscription-billing/billing-data.server";

type Body = { provider?: unknown };

const PROVIDERS: SubscriptionPaymentProvider[] = ["payme", "click"];

// Amount and the paying org both come from server-side state (the
// platform's own price, the caller's own org) -- never from the request
// body, so an org can't pay for another org or pick its own price.
export const Route = createFileRoute("/subscription-payments/create")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const caller = await requireOrgMember(request);
        if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as Body;
        const provider = PROVIDERS.includes(body.provider as SubscriptionPaymentProvider)
          ? (body.provider as SubscriptionPaymentProvider)
          : null;
        if (!provider) return Response.json({ error: "provider is required" }, { status: 400 });

        try {
          const result = await createSubscriptionPaymentLink(
            caller.organizationId,
            caller.id,
            provider,
          );
          return Response.json(result);
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "To'lov havolasini yaratib bo'lmadi.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
