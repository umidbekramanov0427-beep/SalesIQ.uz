import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Shared by the funnel's two bulk message windows (ticked leads, and the
// "..." menu's stage-by-stage one).

export type Attachment = { name: string; type: string; size: number; base64: string };

/** Leads (of the given ids) whose customer has linked their Telegram chat. */
export function useTelegramLinked(ids: string[], enabled: boolean) {
  const key = useMemo(() => [...ids].sort().join(","), [ids]);
  return useQuery({
    queryKey: ["lead_telegram_links", "bulk", key],
    enabled: enabled && ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const linked = new Set<string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from("lead_telegram_links")
          .select("lead_id")
          .in("lead_id", ids.slice(i, i + 200));
        if (error) throw error;
        for (const r of data ?? []) if (r.lead_id) linked.add(r.lead_id);
      }
      return linked;
    },
  });
}

export async function readFile(file: File): Promise<Attachment> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    base64: btoa(bin),
  };
}
