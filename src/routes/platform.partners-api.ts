import { createFileRoute } from "@tanstack/react-router";
import { requirePlatformOwner } from "@/lib/auth.server";
import {
  createPartner,
  loadPartnersOverview,
  markPaidOut,
  rewardManually,
  updatePartner,
} from "@/lib/referral.server";

// Platforma → Hamkorlar (platform owner only):
//   GET                                       partners, referrals, totals
//   POST { action: "create", name, phone?, code?, commissionPct, note? }
//   POST { action: "update", id, active?, commissionPct? }
//   POST { action: "paid-out", id }           commission handed over
//   POST { action: "reward", id }             reward a referral paid by hand
export const Route = createFileRoute("/platform/partners-api")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!(await requirePlatformOwner(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        }
        try {
          return Response.json(await loadPartnersOverview());
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed";
          return Response.json(
            { error: message },
            { status: message === "MIGRATION_PENDING" ? 503 : 500 },
          );
        }
      },
      POST: async ({ request }) => {
        if (!(await requirePlatformOwner(request))) {
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        }
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const id = typeof body["id"] === "string" ? body["id"] : "";
        switch (body["action"]) {
          case "create": {
            const r = await createPartner({
              name: String(body["name"] ?? ""),
              phone: typeof body["phone"] === "string" ? body["phone"] : null,
              code: typeof body["code"] === "string" && body["code"] ? body["code"] : null,
              commissionPct: Number(body["commissionPct"] ?? 20),
              note: typeof body["note"] === "string" ? body["note"] : null,
            });
            return r.ok
              ? Response.json({ ok: true })
              : Response.json({ error: r.error }, { status: 400 });
          }
          case "update":
            if (!id) return Response.json({ error: "id required" }, { status: 400 });
            await updatePartner(id, {
              ...(typeof body["active"] === "boolean" ? { active: body["active"] } : {}),
              ...(typeof body["commissionPct"] === "number"
                ? { commissionPct: body["commissionPct"] }
                : {}),
            });
            return Response.json({ ok: true });
          case "paid-out":
            if (!id) return Response.json({ error: "id required" }, { status: 400 });
            await markPaidOut(id);
            return Response.json({ ok: true });
          case "reward":
            if (!id) return Response.json({ error: "id required" }, { status: 400 });
            return (await rewardManually(id))
              ? Response.json({ ok: true })
              : Response.json({ error: "ALREADY_REWARDED" }, { status: 400 });
          default:
            return Response.json({ error: "Unknown action" }, { status: 400 });
        }
      },
    },
  },
});
