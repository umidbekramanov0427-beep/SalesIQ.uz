import { createFileRoute, redirect } from "@tanstack/react-router";

// Xabarlar now lives in Settings (section "messages"); the bell's
// "Hammasini ko'rish" and old links land there.
export const Route = createFileRoute("/inbox")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { section: "messages" }, replace: true });
  },
});
