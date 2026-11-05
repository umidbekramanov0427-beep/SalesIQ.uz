// Lidlar savati, browser side: after deleting leads, a toast with
// "Qaytarish" puts them straight back (POST /leads/trash, super admin --
// the same people who may delete). Admin → Lidlar savati lists the rest.
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";

type T = (key: string, vars?: Record<string, string | number>) => string;

export async function restoreLeadsFromTrash(ids: string[]): Promise<number> {
  const res = await apiFetch("/leads/trash", {
    method: "POST",
    body: JSON.stringify({ action: "restore", ids }),
  });
  const json = (await res.json().catch(() => ({}))) as { restored?: number; error?: string };
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json.restored ?? 0;
}

/** "N ta lid savatga o'tkazildi" with an undo button that restores them. */
export function toastLeadsTrashed(t: T, qc: QueryClient, ids: string[]) {
  toast.success(t("trash.moved", { n: ids.length }), {
    duration: 8000,
    action: {
      label: t("trash.undo"),
      onClick: () => {
        void restoreLeadsFromTrash(ids)
          .then((n) => {
            void qc.invalidateQueries({ queryKey: ["leads"] });
            void qc.invalidateQueries({ queryKey: ["pipeline_board_leads"] });
            void qc.invalidateQueries({ queryKey: ["leads-trash"] });
            if (n) toast.success(t("trash.restored", { n }));
            else toast.error(t("trash.failed"));
          })
          .catch((e: unknown) =>
            toast.error(
              e instanceof Error && e.message === "MIGRATION_PENDING"
                ? t("trash.pending")
                : t("trash.failed"),
            ),
          );
      },
    },
  });
}
