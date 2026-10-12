import { BackButton } from "@/components/layout/BackButton";

export { BackChip } from "@/components/layout/BackButton";

// Pages without a PageHeader (an access-denied card, the errors list) show
// the same "Orqaga" chip PageHeader renders everywhere else.
export function AdminBackLink() {
  return <BackButton className="mb-5" />;
}
