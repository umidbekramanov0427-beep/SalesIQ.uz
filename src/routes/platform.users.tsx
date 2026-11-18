import { createFileRoute, Navigate } from "@tanstack/react-router";

// The owner's people live in each company's card (Kompaniyalar -> company ->
// Foydalanuvchilar); old links land on the companies list.
export const Route = createFileRoute("/platform/users")({
  component: () => <Navigate to="/platform/companies" replace />,
});
