import { createFileRoute, redirect } from "@tanstack/react-router";

// The old Platform page listed the same companies as Kompaniyalar; creating
// a company now happens there, so old links land on it.
export const Route = createFileRoute("/platform/")({
  beforeLoad: () => {
    throw redirect({ to: "/platform/companies", replace: true });
  },
});
