import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/marketing/Landing";

// Always public, independent of auth state -- unlike "/", which only shows
// Landing while logged out (see __root.tsx's AuthGate) and otherwise
// resolves to the authenticated Reyting dashboard at the same path. A
// signed-in org still needs somewhere to see the live public pricing (the
// Billing settings tab's "Saytga o'tish" button opens this, jumping
// straight to the #narx section), so this route renders the exact same
// marketing page regardless of who's looking at it.
export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Narxlar — SalesIQ CRM" },
      {
        name: "description",
        content: "SalesIQ tariflari va narxlari.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: Landing,
});
