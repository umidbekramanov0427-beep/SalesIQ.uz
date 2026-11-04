import { useContext } from "react";
import { BackButton } from "@/components/layout/BackButton";
import { EmbeddedPage } from "@/components/layout/Primitives";

export { BackChip } from "@/components/layout/BackButton";

// Pages without a PageHeader (an access-denied card, the errors list) show
// the same "Orqaga" chip PageHeader renders everywhere else.
export function AdminBackLink() {
  return useContext(EmbeddedPage) ? null : <BackButton className="mb-5" />;
}
