import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  Images,
  Loader2,
  Trash2,
  Users,
} from "lucide-react";
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
import { downloadXlsx } from "@/lib/xlsx-write";
import { shotsSummary } from "@/lib/marketing-projects";
import {
  useShotDelete,
  useShotUpload,
  useShots,
  useWebinars,
  type ShotRow,
} from "@/hooks/use-crm-data";

// Rasmlar: the proof pictures of live webinars -- frames taken by the
// cron every few minutes (YouTube, Telegram) or uploaded by hand -- grouped
// by webinar. Each says "Screenshot N · 19:05 · 5 456 tomoshabin"; under
// each group, a short report (how many, from-to, peak, average). A picture
// opens large with arrows; Excel lists them with time and viewers.

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dateText = (iso: string) => new Date(iso).toLocaleDateString("ru-RU");
const num = (n: number) => n.toLocaleString("ru-RU").replace(/\u00a0/g, " ");

export function ShotsGallery({
  projectId,
  webinarId,
  title,
}: {
  projectId?: string | null;
  webinarId?: string | null;
  title?: string;
}) {
  const { t } = useI18n();
  const q = useShots({ projectId: projectId ?? null, webinarId: webinarId ?? null });
  const { data: wd } = useWebinars();
  const titleOf = useMemo(() => new Map((wd?.rows ?? []).map((w) => [w.id, w.title])), [wd?.rows]);
  const shots = q.data ?? [];
  const groups = useMemo(() => {
    const m = new Map<string, ShotRow[]>();
    for (const s of shots) {
      const k = s.webinar_id ?? "";
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()].sort((a, b) =>
      (b[1][b[1].length - 1]?.at ?? "").localeCompare(a[1][a[1].length - 1]?.at ?? ""),
    );
  }, [shots]);
  const [open, setOpen] = useState<{ list: ShotRow[]; i: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  function exportXlsx() {
    downloadXlsx(`rasmlar-${new Date().toISOString().slice(0, 10)}.xlsx`, [
      {
        name: t("mkt.shots.title"),
        rows: [
          [
            t("mkt.shots.webinar"),
            "#",
            t("mkt.shots.date"),
            t("mkt.shots.time"),
            t("mkt.shots.viewers"),
            t("mkt.shots.source"),
            t("mkt.shots.link"),
          ],
          ...groups.flatMap(([wid, list]) =>
            list.map((s, i) => [
              titleOf.get(wid) ?? t("mkt.shots.noWebinar"),
              i + 1,
              dateText(s.at),
              clock(s.at),
              s.viewers,
              t(`mkt.shots.src.${s.source}`),
              s.url ?? "",
            ]),
          ),
        ],
      },
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {title && <p className="mr-auto text-[15px] font-bold text-foreground">{title}</p>}
        <Button variant="outline" onClick={() => setUploading(true)}>
          <ImagePlus className="h-4 w-4" />
          {t("mkt.shots.upload")}
        </Button>
        <Button variant="outline" onClick={exportXlsx} disabled={!shots.length}>
          <Download className="h-4 w-4" />
          Excel
        </Button>
      </div>

      {q.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : shots.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
            <Images className="h-6 w-6" />
          </span>
          <p className="max-w-[440px] text-[13.5px] text-muted-foreground">
            {t("mkt.shots.empty")}
          </p>
        </div>
      ) : (
        groups.map(([wid, list]) => {
          const sum = shotsSummary(list);
          return (
            <section key={wid || "none"} className="surface-card overflow-hidden">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
                <p className="text-[14.5px] font-bold text-foreground">
                  {titleOf.get(wid) ?? t("mkt.shots.noWebinar")}
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                  {sum.from ? dateText(sum.from) : ""}
                </p>
              </header>
              <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {list.map((s, i) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => setOpen({ list, i })}
                      className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-primary/40 hover:shadow-md"
                    >
                      <ShotPicture s={s} />
                      <div className="px-3 py-2">
                        <p className="text-[12.5px] font-semibold text-foreground">
                          {t("mkt.shots.caption", {
                            n: i + 1,
                            time: clock(s.at),
                          })}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[12.5px] text-muted-foreground">
                          <Users className="h-3.5 w-3.5" />
                          {s.viewers != null
                            ? t("mkt.shots.viewersN", { n: num(s.viewers) })
                            : t("mkt.shots.noCount")}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {/* The little report under each group. */}
              <footer className="grid gap-px border-t border-border bg-border sm:grid-cols-4">
                {[
                  [t("mkt.shots.sumCount"), String(sum.count)],
                  [
                    t("mkt.shots.sumRange"),
                    sum.from && sum.to ? `${clock(sum.from)} – ${clock(sum.to)}` : "—",
                  ],
                  [
                    t("mkt.shots.sumPeak"),
                    sum.peak ? `${num(sum.peak.viewers)} · ${clock(sum.peak.at)}` : "—",
                  ],
                  [t("mkt.shots.sumAvg"), sum.avg != null ? num(sum.avg) : "—"],
                ].map(([k, v]) => (
                  <div key={k} className="bg-surface/60 px-4 py-2.5">
                    <p className="text-[11.5px] text-muted-foreground">{k}</p>
                    <p className="text-[14px] font-bold tabular-nums text-foreground">{v}</p>
                  </div>
                ))}
              </footer>
            </section>
          );
        })
      )}

      {open && <Lightbox list={open.list} start={open.i} onClose={() => setOpen(null)} />}
      {uploading && (
        <UploadDialog
          projectId={projectId ?? null}
          webinarId={webinarId ?? null}
          onClose={() => setUploading(false)}
        />
      )}
    </div>
  );
}

/** The picture, or -- when no frame could be taken -- a card with the count. */
function ShotPicture({ s, large = false }: { s: ShotRow; large?: boolean }) {
  const { t } = useI18n();
  return s.url ? (
    <img
      src={s.url}
      alt=""
      loading="lazy"
      className={cn(
        "w-full bg-black object-cover",
        large ? "max-h-[70vh] object-contain" : "aspect-video",
      )}
    />
  ) : (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-fuchsia-600 to-violet-800 text-white",
        large ? "aspect-video max-h-[70vh]" : "aspect-video",
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75">
        {t(`mkt.shots.src.${s.source}`)} · {t("mkt.shots.proof")}
      </span>
      <span className={cn("font-bold tabular-nums", large ? "text-[56px]" : "text-[30px]")}>
        {s.viewers != null ? num(s.viewers) : "—"}
      </span>
      <span className="text-[12px] text-white/85">
        {dateText(s.at)} · {clock(s.at)}
      </span>
    </div>
  );
}

function Lightbox({
  list,
  start,
  onClose,
}: {
  list: ShotRow[];
  start: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [i, setI] = useState(start);
  const del = useShotDelete();
  const s = list[i];
  if (!s) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-[960px]"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setI((x) => Math.min(list.length - 1, x + 1));
          if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t("mkt.shots.caption", { n: i + 1, time: clock(s.at) })}
            {s.viewers != null && (
              <span className="ml-2 font-normal text-muted-foreground">
                · {t("mkt.shots.viewersN", { n: num(s.viewers) })}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="relative overflow-hidden rounded-xl">
          <ShotPicture s={s} large />
          {i > 0 && (
            <button
              type="button"
              onClick={() => setI(i - 1)}
              className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="‹"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {i < list.length - 1 && (
            <button
              type="button"
              onClick={() => setI(i + 1)}
              className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="›"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-[12.5px] text-muted-foreground">
            {dateText(s.at)} · {t(`mkt.shots.src.${s.source}`)} · {i + 1}/{list.length}
          </span>
          <div className="flex gap-2">
            {s.url && (
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border px-3 text-[13px] font-semibold hover:border-primary/40"
              >
                <Download className="h-4 w-4" />
                {t("mkt.shots.open")}
              </a>
            )}
            {s.source === "manual" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void del
                    .mutateAsync(s.id)
                    .then(onClose)
                    .catch((e) => toast.error(describeError(e, t("mkt.arch.failed"))))
                }
              >
                <Trash2 className="h-4 w-4" />
                {t("common.delete")}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  projectId,
  webinarId,
  onClose,
}: {
  projectId: string | null;
  webinarId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const up = useShotUpload();
  const { data: wd } = useWebinars();
  const [file, setFile] = useState<File | null>(null);
  const [viewers, setViewers] = useState("");
  const [wid, setWid] = useState(webinarId ?? "");
  const options = (wd?.rows ?? []).filter(
    (w) => !w.archived_at && (!projectId || w.project_id === projectId),
  );
  async function submit() {
    if (!file) return;
    try {
      await up.mutateAsync({
        file,
        webinarId: wid || null,
        projectId,
        viewers: viewers.trim() ? Number(viewers.replace(/\D/g, "")) : null,
      });
      toast.success(t("mkt.shots.uploaded"));
      onClose();
    } catch (err) {
      toast.error(describeError(err, t("mkt.shots.uploadFailed")));
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{t("mkt.shots.upload")}</DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("mkt.shots.uploadDesc")}</p>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground hover:border-primary/40">
            <ImagePlus className="h-6 w-6" />
            {file ? <b className="text-foreground">{file.name}</b> : t("mkt.shots.pick")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {!webinarId && (
            <select
              value={wid}
              onChange={(e) => setWid(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-card px-3 text-[13.5px]"
            >
              <option value="">{t("mkt.shots.noWebinar")}</option>
              {options.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
          )}
          <input
            value={viewers}
            onChange={(e) => setViewers(e.target.value)}
            inputMode="numeric"
            placeholder={t("mkt.shots.viewersPh")}
            className="h-10 w-full rounded-xl border border-border bg-input px-3 text-[14px] tabular-nums outline-none focus:border-primary"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={!file || up.isPending}>
            {up.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("mkt.shots.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The "Rasmlar" button: the gallery in a large window. */
export function ShotsDialog({
  projectId,
  title,
  onClose,
}: {
  projectId: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400">
              <Images className="h-[18px] w-[18px]" />
            </span>
            {t("mkt.shots.titleOf", { name: title })}
          </DialogTitle>
          <p className="text-[13px] text-muted-foreground">{t("mkt.shots.desc")}</p>
        </DialogHeader>
        <ShotsGallery projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}
