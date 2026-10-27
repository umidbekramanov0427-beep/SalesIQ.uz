import type { ComponentProps } from "react";
import { useRecordingUrl } from "@/hooks/use-recording-url";

/** A link to a call recording; our own (private) recordings get a signed link first. */
export function RecordingLink({
  url,
  ...props
}: { url: string } & Omit<ComponentProps<"a">, "href">) {
  const href = useRecordingUrl(url);
  return <a {...props} href={href ?? undefined} aria-disabled={!href || undefined} />;
}

/** An <audio> player for a call recording; our own (private) recordings get a signed link first. */
export function RecordingAudio({
  url,
  ...props
}: { url: string } & Omit<ComponentProps<"audio">, "src">) {
  const src = useRecordingUrl(url);
  return <audio {...props} src={src ?? undefined} />;
}
