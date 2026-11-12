import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";
import { cn, describeError } from "@/lib/utils";
import { parseYoutubeId } from "@/lib/webinars";
import { useChannels, useWebinarMutations, type WebinarRow } from "@/hooks/use-crm-data";

// Shared by the webinar list and a webinar's page: the status chip and the
// create / edit dialog.

export function StatusChip({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11.5px] font-semibold",
        status === "live"
          ? "bg-red-500/12 text-red-700 dark:text-red-300"
          : status === "ended"
            ? "bg-muted text-muted-foreground"
            : "bg-sky-500/12 text-sky-700 dark:text-sky-300",
      )}
    >
      {status === "live" && <Radio className="h-3 w-3 animate-pulse" />}
      {t(`mkt.wb.status.${status}`)}
    </span>
  );
}

const input =
  "h-10 w-full rounded-xl border border-border bg-input px-3 text-[14px] text-foreground outline-none focus:border-primary";

export function WebinarDialog({ w, onClose }: { w?: WebinarRow; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { save } = useWebinarMutations();
  const { data: channels } = useChannels();
  const [title, setTitle] = useState(w?.title ?? "");
  const [platform, setPlatform] = useState(w?.platform ?? "youtube");
  const [link, setLink] = useState(
    w?.youtube_video_id ? `https://youtu.be/${w.youtube_video_id}` : "",
  );
  const [channelId, setChannelId] = useState(w?.channel_id ?? "");
  const [startsAt, setStartsAt] = useState(
    w?.starts_at
      ? new Date(new Date(w.starts_at).getTime() + 5 * 3_600_000).toISOString().slice(0, 16)
      : "",
  );
  const [registrations, setRegistrations] = useState(
    w?.registrations != null ? String(w.registrations) : "",
  );
  const videoId = parseYoutubeId(link);

  async function submit() {
    if (!title.trim()) return void toast.error(t("mkt.wb.titleNeeded"));
    if (platform === "youtube" && link.trim() && !videoId)
      return void toast.error(t("mkt.wb.badLink"));
    try {
      const id = await save.mutateAsync({
        ...(w ? { id: w.id } : {}),
        patch: {
          title: title.trim(),
          platform,
          youtube_video_id: platform === "youtube" ? videoId : null,
          channel_id: channelId || null,
          starts_at: startsAt ? new Date(`${startsAt}:00+05:00`).toISOString() : null,
          registrations: registrations ? Number(registrations) || 0 : null,
        },
      });
      onClose();
      if (!w) void navigate({ to: "/marketing/webinars/$id", params: { id } });
    } catch (err) {
      toast.error(describeError(err, t("mkt.wb.saveFailed")));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{t(w ? "mkt.wb.edit" : "mkt.wb.new")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-1">
            <span className="text-[12.5px] font-medium text-muted-foreground">
              {t("mkt.wb.title")}
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={input}
              autoFocus
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["youtube", "telegram", "other"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={cn(
                  "h-10 rounded-xl border text-[13px] font-semibold transition-colors",
                  platform === p
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`mkt.wb.platform.${p}`)}
              </button>
            ))}
          </div>
          {platform === "youtube" ? (
            <label className="space-y-1">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {t("mkt.wb.ytLink")}
              </span>
              <input
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://www.youtube.com/live/..."
                className={cn(input, link && !videoId && "border-destructive")}
              />
              <span className="block text-[12px] text-muted-foreground">{t("mkt.wb.ytHint")}</span>
            </label>
          ) : (
            <p className="rounded-lg bg-surface px-3 py-2 text-[12.5px] text-muted-foreground">
              {t("mkt.wb.manualHint")}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {t("mkt.wb.startsAt")}
              </span>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={input}
              />
            </label>
            <label className="space-y-1">
              <span className="text-[12.5px] font-medium text-muted-foreground">
                {t("mkt.wb.registered")}
              </span>
              <input
                inputMode="numeric"
                value={registrations}
                onChange={(e) => setRegistrations(e.target.value.replace(/\D/g, ""))}
                className={cn(input, "text-right font-mono tabular-nums")}
              />
            </label>
          </div>
          <label className="space-y-1">
            <span className="text-[12.5px] font-medium text-muted-foreground">
              {t("mkt.wb.channel")}
            </span>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className={input}
            >
              <option value="">—</option>
              {(channels?.rows ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || `@${c.username}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
