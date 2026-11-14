import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  PC_SECTIONS,
  PhoneCenterPage,
  type PcSection,
} from "@/components/phone/center/PhoneCenterPage";
import { samplePhoneCenter } from "@/lib/phone-center-sample";

// Dev only: the Telefon window with sample figures, for screenshots without
// a company account. Nothing here in a production build.
export const Route = createFileRoute("/dev/phone")({
  validateSearch: (search: Record<string, unknown>): { s?: PcSection | undefined } => ({
    s: (PC_SECTIONS as readonly string[]).includes(String(search["s"]))
      ? (search["s"] as PcSection)
      : undefined,
  }),
  component: DevPhone,
});

function DevPhone() {
  const { s } = Route.useSearch();
  const [section, setSection] = useState<PcSection>(s ?? "main");
  if (!import.meta.env.DEV) return null;
  return (
    <div className="min-h-dvh bg-background p-6 text-foreground">
      <div>
        <PhoneCenterPage section={section} onSection={setSection} preview={samplePhoneCenter} />
      </div>
    </div>
  );
}
