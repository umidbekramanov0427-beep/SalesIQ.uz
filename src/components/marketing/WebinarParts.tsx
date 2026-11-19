import { useMarketingFilters } from "@/components/marketing/MarketingFilters";
import { PROJECT_DOT } from "@/lib/marketing-projects";
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
  // The desk's state tag: a lamp and mono capitals -- red and blinking
  // while on air, blue when planned, grey once over.
  return (
    <span
      className="studio-tag"
      data-tone={status === "live" ? "live" : status === "ended" ? undefined : "info"}
    >
      <span className="studio-lamp" />
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
  const [link, setLink] = useState(
    w?.youtube_video_id ? `https://youtu.be/${w.youtube_video_id}` : "",
  );
  const [channelId, setChannelId] = useState(w?.channel_id ?? "");
  const f = useMarketingFilters();
  const [projectId, setProjectId] = useState<string | null>(w ? w.project_id : f.projectId);
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
    if (link.trim() && !videoId) return void toast.error(t("mkt.wb.badLink"));
    try {
      const id = await save.mutateAsync({
        ...(w ? { id: w.id } : {}),
        patch: {
          title: title.trim(),
          // YouTube and a Telegram channel may both be set: one webinar,
          // two streams at once. The platform is the main one.
          platform: videoId ? "youtube" : channelId ? "telegram" : "other",
          youtube_video_id: videoId,
          channel_id: channelId || null,
          project_id: projectId,
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
          <div className="rounded-xl border border-border bg-surface/60 p-3">
            <p className="text-[12.5px] font-semibold text-foreground">{t("mkt.wb.sources")}</p>
            <p className="mb-2.5 text-[12px] text-muted-foreground">{t("mkt.wb.sourcesHint")}</p>
            <div className="grid gap-2.5">
              <label className="space-y-1">
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-[#ef4444]" /> {t("mkt.wb.ytLink")}
                </span>
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://www.youtube.com/live/..."
                  className={cn(input, link && !videoId && "border-destructive")}
                />
              </label>
              <label className="space-y-1">
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-[#0ea5e9]" /> {t("mkt.wb.channel")}
                </span>
                <select
                  value={channelId}
                  onChange={(e) => setChannelId(e.target.value)}
                  className={input}
                >
                  <option value="">—</option>
                  {(channels?.rows ?? [])
                    .filter((c) => !c.archived_at)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title || `@${c.username}`}
                        {c.track_live ? "" : ` · ${t("mkt.wb.noTrack")}`}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            {!videoId && !channelId && (
              <p className="mt-2 text-[12px] text-muted-foreground">{t("mkt.wb.manualHint")}</p>
            )}
          </div>
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
          <div className="space-y-1">
            <span className="text-[12.5px] font-medium text-muted-foreground">
              {t("mkt.p.filter")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[null, ...f.projects].map((p) => {
                const on = (p?.id ?? null) === projectId;
                return (
                  <button
                    key={p?.id ?? "none"}
                    type="button"
                    onClick={() => setProjectId(p?.id ?? null)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                      on
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/40",
                    )}
                  >
                    {p && (
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          PROJECT_DOT[p.color] ?? "bg-sky-500",
                        )}
                      />
                    )}
                    {p?.name ?? t("mkt.p.none")}
                  </button>
                );
              })}
            </div>
          </div>
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
