// Server-only. A lead's Telegram chat beyond plain text: the files a client
// sends (photo, document, audio, voice, video, sticker), the files the team
// sends from the lead card, the client's profile photo and reactions on the
// client's messages. Files stay on Telegram's side and are referred to by
// file_id; the app streams them through /telegram/lead-file when shown.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChatFileKind =
  "photo" | "document" | "audio" | "voice" | "video" | "video_note" | "sticker" | "animation";

export type IncomingFile = { kind: ChatFileKind; fileId: string; name: string | null };

type TgFile = { file_id?: string; file_name?: string; title?: string; performer?: string };

/** The one file a Telegram message carries, if any (the largest photo size). */
export function incomingFile(message: {
  photo?: { file_id?: string }[];
  document?: TgFile;
  audio?: TgFile;
  voice?: TgFile;
  video?: TgFile;
  video_note?: TgFile;
  sticker?: TgFile & { emoji?: string };
  animation?: TgFile;
}): IncomingFile | null {
  const photo = message.photo?.length ? message.photo[message.photo.length - 1] : null;
  if (photo?.file_id) return { kind: "photo", fileId: photo.file_id, name: null };
  const audio = message.audio;
  if (audio?.file_id) {
    const title = [audio.performer, audio.title].filter(Boolean).join(" - ");
    return { kind: "audio", fileId: audio.file_id, name: title || audio.file_name || null };
  }
  const pairs: [ChatFileKind, TgFile | undefined][] = [
    ["animation", message.animation],
    ["document", message.document],
    ["voice", message.voice],
    ["video", message.video],
    ["video_note", message.video_note],
    ["sticker", message.sticker],
  ];
  for (const [kind, f] of pairs) {
    if (f?.file_id) {
      const name = kind === "sticker" ? (message.sticker?.emoji ?? null) : (f.file_name ?? null);
      return { kind, fileId: f.file_id, name };
    }
  }
  return null;
}

/** How a file reads where there is room for one line (chat history, card bubble). */
export function fileLabel(kind: string | null, name: string | null): string {
  const icon: Record<string, string> = {
    photo: "🖼",
    document: "📎",
    audio: "🎵",
    voice: "🎤",
    video: "🎬",
    video_note: "🎬",
    sticker: name ?? "🙂",
    animation: "🎞",
  };
  if (kind === "sticker") return icon["sticker"]!;
  return `${icon[kind ?? "document"] ?? "📎"} ${name ?? ""}`.trim();
}

export type LeadChatRow = {
  organization_id: string;
  lead_id: string;
  direction: "in" | "out";
  text: string;
  sent_by?: string | null;
  tg_message_id?: number | null;
  file_kind?: string | null;
  file_id?: string | null;
  file_name?: string | null;
  /** "telegram" (default) or "instagram". */
  channel?: "telegram" | "instagram";
  /** The platform's own message id (Instagram mid), for de-duplication. */
  ext_message_id?: string | null;
};

/**
 * Inserts one chat message. Before the file columns exist (migration
 * 20261126000000 not applied yet) the file is still recorded, as a line of
 * text, so nothing the client sent is lost.
 */
export async function insertLeadChatMessage(row: LeadChatRow): Promise<void> {
  const { error } = await supabaseAdmin.from("lead_telegram_messages").insert(row);
  if (!error) return;
  if (!/column|schema cache/i.test(error.message)) throw error;
  const label = row.file_kind ? fileLabel(row.file_kind, row.file_name ?? null) : "";
  const { error: again } = await supabaseAdmin.from("lead_telegram_messages").insert({
    organization_id: row.organization_id,
    lead_id: row.lead_id,
    direction: row.direction,
    text: [label, row.text].filter(Boolean).join("\n"),
    sent_by: row.sent_by ?? null,
  });
  if (again) throw again;
}

function botToken(): string | null {
  return process.env["TELEGRAM_BOT_TOKEN"] ?? null;
}

async function telegram<T>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  const token = botToken();
  if (!token) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T };
    return json.ok ? (json.result ?? null) : null;
  } finally {
    clearTimeout(timer);
  }
}

/** Bots can download files up to 20 MB. */
const MAX_DOWNLOAD = 20 * 1024 * 1024;

/** The file's bytes from Telegram, or null (gone, too big, no bot token). */
export async function downloadChatFile(
  fileId: string,
): Promise<{ data: ArrayBuffer; path: string } | null> {
  const token = botToken();
  if (!token) return null;
  const meta = await telegram<{ file_path?: string; file_size?: number }>("getFile", {
    file_id: fileId,
  });
  if (!meta?.file_path || (meta.file_size ?? 0) > MAX_DOWNLOAD) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${token}/${meta.file_path}`);
  if (!res.ok) return null;
  return { data: await res.arrayBuffer(), path: meta.file_path };
}

/** Content type for a downloaded file, by its kind and path. */
export function chatFileType(kind: string | null, path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const byExt: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    opus: "audio/ogg",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    pdf: "application/pdf",
    tgs: "application/x-tgsticker",
  };
  if (byExt[ext]) return byExt[ext]!;
  if (kind === "photo") return "image/jpeg";
  if (kind === "voice") return "audio/ogg";
  return "application/octet-stream";
}

/**
 * Remembers the client's current Telegram profile photo on the chat link
 * (looked up at most once a day per chat).
 */
export async function refreshChatPhoto(link: {
  lead_id: string;
  chat_id: number;
  photo_checked_at?: string | null;
}): Promise<void> {
  const checked = link.photo_checked_at ? new Date(link.photo_checked_at).getTime() : 0;
  if (Date.now() - checked < 24 * 60 * 60 * 1000) return;
  const photos = await telegram<{ photos?: { file_id: string }[][] }>("getUserProfilePhotos", {
    user_id: link.chat_id,
    limit: 1,
  }).catch(() => null);
  const sizes = photos?.photos?.[0] ?? [];
  // Sizes come smallest first; the second (~160px) is enough for an avatar.
  const pick = sizes[Math.min(1, sizes.length - 1)] ?? null;
  await supabaseAdmin
    .from("lead_telegram_links")
    .update({ photo_file_id: pick?.file_id ?? null, photo_checked_at: new Date().toISOString() })
    .eq("lead_id", link.lead_id)
    .then(
      () => undefined,
      () => undefined,
    );
}

/** Puts (or with null, takes off) the team's reaction on a client's message. */
export async function setChatReaction(
  chatId: number,
  messageId: number,
  emoji: string | null,
): Promise<boolean> {
  const done = await telegram<boolean>("setMessageReaction", {
    chat_id: chatId,
    message_id: messageId,
    reaction: emoji ? [{ type: "emoji", emoji }] : [],
  });
  return done === true;
}
