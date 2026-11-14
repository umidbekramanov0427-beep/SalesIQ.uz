import { createFileRoute } from "@tanstack/react-router";
import { CrmGate } from "@/components/CrmGate";
import { PlanGate } from "@/components/PlanGate";
import {
  PC_SECTIONS,
  PhoneCenterPage,
  type PcSection,
} from "@/components/phone/center/PhoneCenterPage";

// /phone -- Telefon: every phone tool on one page (?s=<section>).
export const Route = createFileRoute("/phone")({
  validateSearch: (search: Record<string, unknown>): { s?: PcSection | undefined } => ({
    s: (PC_SECTIONS as readonly string[]).includes(String(search["s"]))
      ? (search["s"] as PcSection)
      : undefined,
  }),
  component: PhonePage,
});

function PhonePage() {
  const { s } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <CrmGate>
      <PlanGate feature="telephony">
        <PhoneCenterPage
          section={s ?? "main"}
          onSection={(next) =>
            void navigate({ search: { s: next === "main" ? undefined : next }, replace: true })
          }
        />
      </PlanGate>
    </CrmGate>
  );
}
