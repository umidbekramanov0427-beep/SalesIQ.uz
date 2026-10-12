import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LogoLoader } from "@/components/LogoLoader";
import { consumeHandoff } from "@/lib/subdomain-handoff";

export const Route = createFileRoute("/auth/handoff")({
  head: () => ({ meta: [{ title: "SalesIQ" }] }),
  component: HandoffPage,
});

// Arrival on a company's own address from salesiq.uz (see
// lib/subdomain-handoff.ts): signs in with the session carried in the
// fragment, then opens the page the person was going to.
function HandoffPage() {
  useEffect(() => {
    void consumeHandoff().then((next) => window.location.replace(next));
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <LogoLoader className="h-16 w-16" />
    </div>
  );
}
