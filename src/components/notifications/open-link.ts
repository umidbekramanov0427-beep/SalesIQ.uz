import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { leadIdFromLink } from "@/lib/live-notifications";

/** Opens a notification's link; a lead opens as its CRM card, like from Voronkalar. */
export function useOpenNotificationLink() {
  const navigate = useNavigate();
  return useCallback(
    (link: string) => {
      const leadId = leadIdFromLink(link);
      if (leadId) {
        void navigate({
          to: "/crm/leads/$leadId",
          params: { leadId },
          search: { from: "funnels" },
        });
      } else {
        void navigate({ to: link });
      }
    },
    [navigate],
  );
}
