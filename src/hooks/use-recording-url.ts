import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RECORDINGS_BUCKET, ownRecordingPath } from "@/lib/recording-url";

const SIGNED_TTL_SECONDS = 60 * 60;

/**
 * The link to play or download a call recording. Our own recordings (private
 * bucket) get a one-hour signed link — null while it is being made or if the
 * viewer may not read it; amoCRM / PBX links are returned unchanged.
 */
export function useRecordingUrl(url: string | null | undefined): string | null {
  const path = ownRecordingPath(url);
  const { data } = useQuery({
    queryKey: ["recording-url", path],
    enabled: !!path,
    staleTime: (SIGNED_TTL_SECONDS - 10 * 60) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(RECORDINGS_BUCKET)
        .createSignedUrl(path!, SIGNED_TTL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  if (!url) return null;
  return path ? (data ?? null) : url;
}
