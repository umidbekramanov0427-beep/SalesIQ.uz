// Instagram Direct webhook payloads ("Instagram API with Instagram Login"),
// flattened into one shape per message. Pure, so the parsing is
// unit-tested; instagram.webhook.ts acts on the result.
//
// { object: "instagram", entry: [{ id: <our account>, time, messaging: [
//   { sender: { id }, recipient: { id }, timestamp,
//     message: { mid, text?, attachments?: [{ type, payload: { url } }],
//                is_echo?, is_deleted?, is_unsupported? } } ] }] }
//
// For a message the client sent, sender = the client and recipient = our
// account; for an echo (a reply sent from our account, also from the
// Instagram app itself), the other way round.

export type IgFileKind = "photo" | "video" | "voice" | "document";

export type IgMessage = {
  /** Our connected account (the entry id). */
  accountId: string;
  /** The client's Instagram-scoped id, whichever side sent it. */
  clientId: string;
  /** true = sent from our account (an echo). */
  echo: boolean;
  mid: string | null;
  text: string;
  file: { kind: IgFileKind; url: string } | null;
  at: number;
};

const FILE_KIND: Record<string, IgFileKind> = {
  image: "photo",
  video: "video",
  audio: "voice",
  file: "document",
};

/** Text for attachments that aren't a file (shared post, story mention...). */
const LINK_LABEL: Record<string, string> = {
  share: "🔗 Ulashilgan post",
  ig_reel: "🎬 Reels",
  reel: "🎬 Reels",
  story_mention: "📣 Hikoyada belgiladi",
  ig_story: "📣 Hikoya",
  story_reply: "💬 Hikoyaga javob",
  like_heart: "❤️",
  sticker: "🙂",
};

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => (v && typeof v === "object" ? (v as Raw) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function parseInstagramWebhook(body: unknown): IgMessage[] {
  const root = obj(body);
  if (!root || root["object"] !== "instagram" || !Array.isArray(root["entry"])) return [];
  const out: IgMessage[] = [];
  for (const e of root["entry"] as unknown[]) {
    const entry = obj(e);
    const accountId =
      str(entry?.["id"]) ?? (typeof entry?.["id"] === "number" ? String(entry["id"]) : null);
    if (!entry || !accountId || !Array.isArray(entry["messaging"])) continue;
    for (const m of entry["messaging"] as unknown[]) {
      const ev = obj(m);
      const message = obj(ev?.["message"]);
      if (!ev || !message) continue; // reads, reactions, postbacks: not messages
      if (message["is_deleted"] === true) continue;
      const sender = str(obj(ev["sender"])?.["id"]);
      const recipient = str(obj(ev["recipient"])?.["id"]);
      if (!sender || !recipient) continue;
      const echo: boolean = message["is_echo"] === true || sender === accountId;
      const clientId: string = echo ? recipient : sender;
      if (clientId === accountId) continue;

      let text = (str(message["text"]) ?? "").trim();
      let file: IgMessage["file"] = null;
      const attachments = Array.isArray(message["attachments"]) ? message["attachments"] : [];
      for (const a of attachments as unknown[]) {
        const att = obj(a);
        const type = str(att?.["type"]) ?? "";
        const url = str(obj(att?.["payload"])?.["url"]);
        const kind = FILE_KIND[type];
        if (kind && url && !file) {
          file = { kind, url };
        } else {
          const label = LINK_LABEL[type] ?? "📎 Ilova";
          const line = url ? `${label}: ${url}` : label;
          text = text ? `${text}\n${line}` : line;
        }
      }
      if (!text && !file) {
        if (message["is_unsupported"] === true) text = "Instagram bu xabar turini ko'rsatmaydi";
        else continue;
      }
      out.push({
        accountId,
        clientId,
        echo,
        mid: str(message["mid"]),
        text,
        file,
        at: typeof ev["timestamp"] === "number" ? ev["timestamp"] : Date.now(),
      });
    }
  }
  return out;
}

/** Only Meta's own CDNs are fetched when the app shows an Instagram file. */
export function isInstagramCdnUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    return [".fbcdn.net", ".cdninstagram.com", ".fbsbx.com", ".instagram.com"].some((d) =>
      u.hostname.endsWith(d),
    );
  } catch {
    return false;
  }
}

/**
 * Where the browser goes back to after connecting: the company's own
 * address (or the root site, localhost). Anything else
 * falls back to the root site.
 */
export function safeReturnOrigin(origin: string | null, rootDomain: string): string {
  const fallback = `https://${rootDomain}`;
  if (!origin) return fallback;
  try {
    const u = new URL(origin);
    const host = u.hostname;
    const local = host === "localhost" || host === "127.0.0.1";
    if (local) return u.origin;
    if (u.protocol !== "https:") return fallback;
    if (host === rootDomain || host.endsWith(`.${rootDomain}`)) return u.origin;
    return fallback;
  } catch {
    return fallback;
  }
}
