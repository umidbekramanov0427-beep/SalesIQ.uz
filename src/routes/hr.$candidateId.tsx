import { useEffect, useRef, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  MessageSquareText,
  Phone,
  Send,
  MessageSquare,
  Paperclip,
  Music,
  MapPin,
  X,
  FileText,
  Download,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionCard, Pill } from "@/components/layout/Primitives";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { HR_STATUS_META } from "@/lib/hr-status";
import {
  useHrCandidateDetail,
  useUpdateHrCandidateStatus,
  useHrCandidateMessages,
  useSendHrCandidateMessage,
  useUploadHrChatAttachment,
  useDeleteHrCandidate,
  HR_CANDIDATE_STATUSES,
  type HrCandidateStatus,
  type HrCandidateMessageRow,
  type HrCandidateAnswerWithQuestion,
} from "@/hooks/use-crm-data";

export const Route = createFileRoute("/hr/$candidateId")({
  head: () => ({
    meta: [{ title: "Nomzod — Kadrlar bo'limi — SalesIQ" }],
  }),
  component: HrCandidateDetailPage,
});

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uz-UZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message || fallback;
  }
  return fallback;
}

function ChangeStatusDialog({
  candidateId,
  currentStatus,
}: {
  candidateId: string;
  currentStatus: string;
}) {
  const updateStatus = useUpdateHrCandidateStatus();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<HrCandidateStatus>(currentStatus as HrCandidateStatus);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await updateStatus.mutateAsync({ candidateId, status, reason: reason.trim() });
      toast.success("Holat yangilandi.");
      setReason("");
      setOpen(false);
    } catch (err) {
      toast.error(errorMessage(err, "Holatni yangilab bo'lmadi."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setStatus(currentStatus as HrCandidateStatus);
          setReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Holatni o'zgartirish
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Holatni o'zgartirish</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Yangi holat</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as HrCandidateStatus)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HR_CANDIDATE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {HR_STATUS_META[s].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="hr-status-reason">Sababi (majburiy)</Label>
            <Textarea
              id="hr-status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Nima uchun bu holat qo'yilyapti, aniq yozing..."
              className="mt-1.5"
              rows={4}
              required
            />
          </div>
          <DialogFooter>
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Saqlash
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const DELETE_REASONS = [
  "Xato yoki dublikat kiritilgan",
  "Nomzod o'zi so'radi",
  "Spam yoki noto'g'ri ariza",
  "Sinov/test uchun yaratilgan edi",
  "Boshqa sabab",
] as const;

function DeleteCandidateDialog({
  candidateId,
  candidateLabel,
}: {
  candidateId: string;
  candidateLabel: string;
}) {
  const navigate = useNavigate();
  const deleteCandidate = useDeleteHrCandidate();
  const [open, setOpen] = useState(false);
  const [reasonPreset, setReasonPreset] = useState<string>(DELETE_REASONS[0]);
  const [customReason, setCustomReason] = useState("");

  const finalReason = reasonPreset === "Boshqa sabab" ? customReason.trim() : reasonPreset;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!finalReason) return;
    try {
      await deleteCandidate.mutateAsync({ candidateId, reason: finalReason });
      toast.success("Nomzod o'chirildi.");
      setOpen(false);
      void navigate({ to: "/hr" });
    } catch (err) {
      toast.error(errorMessage(err, "Nomzodni o'chirib bo'lmadi."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setReasonPreset(DELETE_REASONS[0]);
          setCustomReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          title="Nomzodni o'chirish"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-destructive transition-colors hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{candidateLabel}ni o'chirish</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Bu amalni ortga qaytarib bo'lmaydi — nomzodning barcha javoblari, holat tarixi va
            yozishmalari butunlay o'chiriladi.
          </p>
          <div>
            <Label>Nima sababdan o'chirmoqchisiz?</Label>
            <Select value={reasonPreset} onValueChange={setReasonPreset}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELETE_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {reasonPreset === "Boshqa sabab" && (
            <div>
              <Label htmlFor="hr-delete-custom-reason">Sababni yozing</Label>
              <Textarea
                id="hr-delete-custom-reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Nima uchun o'chirilyapti, aniq yozing..."
                className="mt-1.5"
                rows={3}
                required
              />
            </div>
          )}
          <DialogFooter>
            <button
              type="submit"
              disabled={deleteCandidate.isPending || !finalReason}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {deleteCandidate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              O'chirish
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// No structured phone field is collected -- if the org asked a screening
// question with "telefon" in its text, that answer is the closest thing to
// one, so Call/SMS use it. No such question means no number to call/text.
function findPhone(answers: HrCandidateAnswerWithQuestion[]): string | null {
  const match = answers.find((a) => a.hr_questions?.question.toLowerCase().includes("telefon"));
  return match?.answer_text.trim() || null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
}

function filenameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").pop() ?? "fayl";
    return decodeURIComponent(last.replace(/^[0-9a-f-]{36}-/i, ""));
  } catch {
    return "fayl";
  }
}

function MessageBubble({ message }: { message: HrCandidateMessageRow }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={cn("flex flex-col", outbound ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
          outbound
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md border border-border bg-background text-foreground",
        )}
      >
        {message.attachment_type === "image" && message.attachment_url && (
          <img
            src={message.attachment_url}
            alt="Rasm"
            className="mb-1.5 max-h-64 w-full rounded-lg object-cover"
          />
        )}
        {message.attachment_type === "document" && message.attachment_url && (
          <a
            href={message.attachment_url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "mb-1.5 flex items-center gap-2.5 rounded-xl px-3 py-2.5",
              outbound ? "bg-primary-foreground/10" : "bg-accent",
            )}
          >
            <FileText className="h-8 w-8 shrink-0 opacity-80" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {filenameFromUrl(message.attachment_url)}
            </span>
            <Download className="h-4 w-4 shrink-0 opacity-70" />
          </a>
        )}
        {message.attachment_type === "audio" && message.attachment_url && (
          <audio controls src={message.attachment_url} className="mb-1.5 h-9 w-64 max-w-full" />
        )}
        {message.attachment_type === "location" &&
          message.location_lat != null &&
          message.location_lng != null && (
            <a
              href={`https://www.google.com/maps?q=${message.location_lat},${message.location_lng}`}
              target="_blank"
              rel="noreferrer"
              className="mb-1.5 block overflow-hidden rounded-xl border border-border/60"
            >
              <iframe
                title="location"
                className="h-32 w-64 max-w-full"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${message.location_lng - 0.01}%2C${message.location_lat - 0.01}%2C${message.location_lng + 0.01}%2C${message.location_lat + 0.01}&layer=mapnik&marker=${message.location_lat}%2C${message.location_lng}`}
              />
            </a>
          )}
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
      </div>
      <span className="mt-1 px-1 text-[11px] text-subtle">{fmtTime(message.created_at)}</span>
    </div>
  );
}

type NominatimResult = { display_name: string; lat: string; lon: string };

function LocationPickerButton({
  onPick,
}: {
  onPick: (loc: { lat: number; lng: number; label: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<NominatimResult | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setPicked(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 3) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`,
      )
        .then((res) => res.json())
        .then((json: NominatimResult[]) => setResults(Array.isArray(json) ? json : []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [query, open]);

  const previewLat = picked ? Number(picked.lat) : undefined;
  const previewLon = picked ? Number(picked.lon) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Lokatsiya yuborish"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-subtle transition-colors hover:bg-accent hover:text-foreground"
        >
          <MapPin className="h-[18px] w-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2.5 p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPicked(null);
            }}
            placeholder="Manzil qidirish..."
            className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-sm outline-none focus:border-primary/40"
          />
        </div>
        {searching && (
          <div className="flex items-center gap-2 text-xs text-subtle">
            <Loader2 className="h-3 w-3 animate-spin" /> Qidirilmoqda...
          </div>
        )}
        {results.length > 0 && (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {results.map((r) => (
              <li key={`${r.lat}-${r.lon}`}>
                <button
                  type="button"
                  onClick={() => setPicked(r)}
                  className={cn(
                    "flex w-full items-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                    picked?.display_name === r.display_name && "bg-primary/10 text-primary",
                  )}
                >
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span className="truncate">{r.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {picked && previewLat !== undefined && previewLon !== undefined && (
          <iframe
            title="location-preview"
            className="h-32 w-full rounded-lg border border-border"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${previewLon - 0.01}%2C${previewLat - 0.01}%2C${previewLon + 0.01}%2C${previewLat + 0.01}&layer=mapnik&marker=${previewLat}%2C${previewLon}`}
          />
        )}
        <button
          type="button"
          onClick={() => {
            if (!picked) return;
            onPick({
              lat: Number(picked.lat),
              lng: Number(picked.lon),
              label: picked.display_name,
            });
            setOpen(false);
          }}
          disabled={!picked}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Shu manzilni yuborish
        </button>
      </PopoverContent>
    </Popover>
  );
}

type PendingAttachment =
  | { kind: "file"; type: "image" | "document" | "audio"; url: string; name: string }
  | { kind: "location"; lat: number; lng: number; label: string };

function TelegramChatDialog({
  candidateId,
  candidateLabel,
}: {
  candidateId: string;
  candidateLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: messages } = useHrCandidateMessages(open ? candidateId : null);
  const sendMessage = useSendHrCandidateMessage();
  const uploadAttachment = useUploadHrChatAttachment();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleFileSelect(file: File, type: "image" | "document" | "audio") {
    try {
      const url = await uploadAttachment.mutateAsync(file);
      setPending({ kind: "file", type, url, name: file.name });
    } catch (err) {
      toast.error(errorMessage(err, "Faylni yuklab bo'lmadi."));
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !pending) return;
    try {
      const trimmed = text.trim();
      if (pending?.kind === "location") {
        await sendMessage.mutateAsync({
          candidateId,
          ...(trimmed ? { text: trimmed } : {}),
          attachmentType: "location",
          locationLat: pending.lat,
          locationLng: pending.lng,
        });
      } else if (pending?.kind === "file") {
        await sendMessage.mutateAsync({
          candidateId,
          ...(trimmed ? { text: trimmed } : {}),
          attachmentType: pending.type,
          attachmentUrl: pending.url,
        });
      } else {
        await sendMessage.mutateAsync({ candidateId, text: text.trim() });
      }
      setText("");
      setPending(null);
    } catch (err) {
      toast.error(errorMessage(err, "Xabar yuborib bo'lmadi."));
    }
  }

  const busy = sendMessage.isPending || uploadAttachment.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
        >
          <Send className="h-4 w-4" /> Telegram
        </button>
      </DialogTrigger>
      <DialogContent className="flex h-[75vh] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Send className="h-4 w-4" />
            </span>
            {candidateLabel}
          </DialogTitle>
        </DialogHeader>
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-accent/40 px-5 py-4">
          {(messages ?? []).length === 0 && (
            <p className="py-10 text-center text-sm text-subtle">Hali xabar yo'q.</p>
          )}
          {(messages ?? []).map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>

        {pending && (
          <div className="flex items-center gap-2.5 border-t border-border bg-background px-5 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-accent px-3 py-2 text-sm">
              {pending.kind === "location" ? (
                <>
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{pending.label}</span>
                </>
              ) : (
                <>
                  {pending.type === "image" && (
                    <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  {pending.type === "document" && (
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                  )}
                  {pending.type === "audio" && <Music className="h-4 w-4 shrink-0 text-primary" />}
                  <span className="truncate">{pending.name}</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <form
          onSubmit={submit}
          className="flex items-center gap-1.5 border-t border-border bg-background px-3 py-3"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file)
                void handleFileSelect(file, file.type.startsWith("image/") ? "image" : "document");
            }}
          />
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFileSelect(file, "audio");
            }}
          />
          <button
            type="button"
            title="Fayl yoki rasm biriktirish"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-subtle transition-colors hover:bg-accent hover:text-foreground"
          >
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            title="Audio biriktirish"
            onClick={() => audioInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-subtle transition-colors hover:bg-accent hover:text-foreground"
          >
            <Music className="h-[18px] w-[18px]" />
          </button>
          <LocationPickerButton onPick={(loc) => setPending({ kind: "location", ...loc })} />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Xabar yozing..."
            className="h-10 flex-1 rounded-full border border-border bg-accent px-4 text-sm outline-none focus:border-primary/40"
          />
          <button
            type="submit"
            disabled={busy || (!text.trim() && !pending)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HrCandidateDetailPage() {
  const { candidateId } = Route.useParams();
  const { data, isLoading, error } = useHrCandidateDetail(candidateId);

  return (
    <>
      <Link
        to="/hr"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-subtle transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Kadrlar bo'limiga qaytish
      </Link>

      {isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      )}
      {error && (
        <p className="py-6 text-sm text-destructive">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {data && (
        <>
          <PageHeader
            title={
              data.candidate.telegram_username
                ? `@${data.candidate.telegram_username}`
                : `Chat #${data.candidate.telegram_chat_id}`
            }
            description={`Vakansiya: ${data.candidate.hr_vacancies?.title ?? "—"} · Murojaat: ${fmtDate(data.candidate.created_at)}`}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <Pill
                  tone={
                    HR_STATUS_META[data.candidate.status as HrCandidateStatus]?.tone ?? "neutral"
                  }
                >
                  {HR_STATUS_META[data.candidate.status as HrCandidateStatus]?.label ??
                    data.candidate.status}
                </Pill>
                {(() => {
                  const phone = findPhone(data.answers);
                  return (
                    <>
                      <a
                        href={phone ? `tel:${phone}` : undefined}
                        title={phone ? `Qo'ng'iroq: ${phone}` : "Telefon raqami topilmadi"}
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent",
                          !phone && "pointer-events-none opacity-40",
                        )}
                      >
                        <Phone className="h-4 w-4" /> Qo'ng'iroq
                      </a>
                      <a
                        href={phone ? `sms:${phone}` : undefined}
                        title={phone ? `SMS: ${phone}` : "Telefon raqami topilmadi"}
                        className={cn(
                          "inline-flex h-10 items-center gap-2 rounded-xl border border-border px-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent",
                          !phone && "pointer-events-none opacity-40",
                        )}
                      >
                        <MessageSquare className="h-4 w-4" /> SMS
                      </a>
                    </>
                  );
                })()}
                <TelegramChatDialog
                  candidateId={data.candidate.id}
                  candidateLabel={
                    data.candidate.telegram_username
                      ? `@${data.candidate.telegram_username}`
                      : `Chat #${data.candidate.telegram_chat_id}`
                  }
                />
                <ChangeStatusDialog
                  candidateId={data.candidate.id}
                  currentStatus={data.candidate.status}
                />
                <DeleteCandidateDialog
                  candidateId={data.candidate.id}
                  candidateLabel={
                    data.candidate.telegram_username
                      ? `@${data.candidate.telegram_username}`
                      : `Chat #${data.candidate.telegram_chat_id}`
                  }
                />
              </div>
            }
          />

          <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
            <SectionCard title="Savollar va javoblar">
              {data.answers.length === 0 ? (
                <p className="py-4 text-sm text-subtle">
                  {data.candidate.completed_at
                    ? "Javoblar topilmadi."
                    : "Nomzod hali savollarga javob berishni yakunlamagan."}
                </p>
              ) : (
                <div className="space-y-4">
                  {data.answers.map((a, i) => (
                    <div key={a.id} className="rounded-xl bg-accent p-4">
                      <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
                        <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {i + 1}. {a.hr_questions?.question ?? "Savol o'chirilgan"}
                      </p>
                      <p className="mt-2 pl-6 text-sm text-muted-foreground">{a.answer_text}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Holat tarixi" description="Har bir o'zgarish sababi bilan birga.">
              {data.history.length === 0 ? (
                <p className="py-4 text-sm text-subtle">Hali holat o'zgartirilmagan.</p>
              ) : (
                <div className="space-y-4">
                  {data.history.map((h) => (
                    <div key={h.id} className="border-l-2 border-border pl-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill
                          tone={HR_STATUS_META[h.status as HrCandidateStatus]?.tone ?? "neutral"}
                        >
                          {HR_STATUS_META[h.status as HrCandidateStatus]?.label ?? h.status}
                        </Pill>
                        <span className="flex items-center gap-1 text-xs text-subtle">
                          <Clock className="h-3 w-3" /> {fmtDate(h.created_at)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-foreground">{h.reason}</p>
                      <p className="mt-1 text-xs text-subtle">
                        {h.profiles?.full_name || h.profiles?.email || "Noma'lum"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </>
  );
}
