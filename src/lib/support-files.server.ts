// Server-only. Files in the live-support chat (the assistant's Operator tab
// and the owner's Yordam inbox): photos, documents, voice notes, videos.
// They live in the private "lead-files" bucket under <org>/support/ -- the
// browser uploads straight there through a one-time signed URL, the message
// names the path, and /support/file streams it back to the people allowed.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { botToken } from "@/lib/bot-tokens.server";
import { telegramFileKind } from "@/lib/telegram-report.server";

const BUCKET = "lead-files";
export const MAX_SUPPORT_FILE = 20 * 1024 * 1024;

export type SupportFileInput = {
  path: string;
  name: string;
  type: string;
  size: number;
  /** How it was meant to show: "voice" for a recording, else by type. */
  kind?: string | null;
};

export type SupportFileRow = {
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;
  file_kind: string;
};

const prefixFor = (orgId: string) => `${orgId}/support/`;

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
}

/** A one-time upload slot for one support file of a company. */
export async function signSupportUpload(
  orgId: string,
  name: string,
  size: number,
): Promise<{ path: string; token: string }> {
  if (size > MAX_SUPPORT_FILE) throw new Error("TOO_BIG");
  const path = `${prefixFor(orgId)}${crypto.randomUUID()}-${safeName(name)}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("Could not create an upload URL.");
  return { path: data.path, token: data.token };
}

/** The columns for a message's file, or null when the path isn't this company's. */
export function supportFileRow(orgId: string, f: unknown): SupportFileRow | null {
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;
  const path = typeof o["path"] === "string" ? o["path"] : "";
  if (!path.startsWith(prefixFor(orgId)) || path.includes("..")) return null;
  const name = (typeof o["name"] === "string" ? o["name"] : "file").slice(0, 160) || "file";
  const type =
    (typeof o["type"] === "string" ? o["type"] : "").slice(0, 120) || "application/octet-stream";
  const size = typeof o["size"] === "number" ? Math.round(o["size"]) : 0;
  const kind =
    typeof o["kind"] === "string" && /^(voice|video_note|document)$/.test(o["kind"])
      ? o["kind"]
      : telegramFileKind(type, name);
  return { file_path: path, file_name: name, file_type: type, file_size: size, file_kind: kind };
}

/** A support file's bytes (for streaming and for sending to Telegram). */
export async function readSupportFile(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data || data.size > MAX_SUPPORT_FILE) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * A file someone sent in Telegram as a support reply: downloaded with the
 * bot that received it and kept in the company's support folder.
 */
export async function storeTelegramSupportFile(
  orgId: string,
  file: { fileId: string; kind: string; name: string | null },
  via: "shared" | "ops",
): Promise<SupportFileRow | null> {
  const tokens = [via === "ops" ? botToken("ops") : null, botToken("staff"), botToken("client")];
  for (const token of tokens) {
    if (!token) continue;
    const meta = (await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: file.fileId }),
    })
      .then((r) => r.json())
      .catch(() => null)) as {
      ok?: boolean;
      result?: { file_path?: string; file_size?: number };
    } | null;
    const tgPath = meta?.result?.file_path;
    if (!meta?.ok || !tgPath) continue;
    if ((meta.result?.file_size ?? 0) > MAX_SUPPORT_FILE) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${tgPath}`);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = tgPath.split(".").pop() ?? "bin";
    const name = file.name || `${file.kind}-${Date.now()}.${ext}`;
    const type = res.headers.get("content-type") || "application/octet-stream";
    const path = `${prefixFor(orgId)}${crypto.randomUUID()}-${safeName(name)}`;
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: type });
    if (error) return null;
    return {
      file_path: path,
      file_name: name,
      file_type: type,
      file_size: bytes.length,
      file_kind: file.kind,
    };
  }
  return null;
}

/** "📎 hisobot.pdf" -- how a file reads in Telegram text and previews. */
export function supportFileLabel(kind: string | null, name: string | null): string {
  const icon: Record<string, string> = {
    photo: "🖼",
    voice: "🎤",
    audio: "🎵",
    video: "🎬",
    video_note: "🎬",
    animation: "🎞",
  };
  return `${icon[kind ?? ""] ?? "📎"} ${name ?? "fayl"}`;
}
