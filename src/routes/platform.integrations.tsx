import { createFileRoute, Navigate } from "@tanstack/react-router";

// Integrations live in each company's card now (Kompaniyalar -> company ->
// Integratsiyalar); old links land there, or on the companies list.
export const Route = createFileRoute("/platform/integrations")({
  validateSearch: (search: Record<string, unknown>): { org?: string } =>
    typeof search["org"] === "string" ? { org: search["org"] } : {},
  component: IntegrationsMoved,
});

function IntegrationsMoved() {
  const { org } = Route.useSearch();
  return org ? (
    <Navigate
      to="/platform/organizations/$orgId"
      params={{ orgId: org }}
      search={{ section: "status" }}
      replace
    />
  ) : (
    <Navigate to="/platform/companies" replace />
  );
}
