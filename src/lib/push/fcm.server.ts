import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { clip, type PushMessage } from "./push";

// Firebase Cloud Messaging (HTTP v1) for the SalesIQ phone app. No
// firebase-admin package (bun.lock risk): a service-account JWT is signed
// with node:crypto and swapped for an access token, cached until it nearly
// expires. The service-account JSON is read from the file named by
// FCM_SERVICE_ACCOUNT_FILE (kept outside the repo); without it nothing is
// sent.

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

let account: ServiceAccount | null | undefined;
let cached: { token: string; until: number } | null = null;

function loadAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const file = process.env["FCM_SERVICE_ACCOUNT_FILE"];
  try {
    const json = file ? (JSON.parse(readFileSync(file, "utf8")) as Partial<ServiceAccount>) : null;
    account =
      json?.project_id && json.client_email && json.private_key
        ? { project_id: json.project_id, client_email: json.client_email, private_key: json.private_key }
        : null;
  } catch {
    account = null;
  }
  return account;
}

export function fcmConfigured(): boolean {
  return loadAccount() !== null;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  if (cached && cached.until > Date.now()) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`);
  const jwt = `${head}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cached = { token: json.access_token, until: Date.now() + ((json.expires_in ?? 3600) - 300) * 1000 };
  return json.access_token;
}

/**
 * Sends one notification to each token. Returns the tokens that were
 * delivered and the ones Firebase says are gone (uninstalled app), which
 * the caller removes.
 */
export async function sendFcm(
  tokens: string[],
  msg: PushMessage,
): Promise<{ sent: number; stale: string[] }> {
  const sa = loadAccount();
  if (!sa || !tokens.length) return { sent: 0, stale: [] };
  const bearer = await accessToken(sa).catch(() => null);
  if (!bearer) return { sent: 0, stale: [] };
  const url = /^\/(?!\/)/.test(msg.url) ? msg.url : "/";
  const stale: string[] = [];
  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: "POST",
          headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: clip(msg.title, 80), body: clip(msg.body) },
              data: { url, kind: msg.kind },
              android: {
                priority: msg.kind === "call" || msg.kind === "message" ? "HIGH" : "NORMAL",
                ttl: msg.kind === "call" ? "60s" : "21600s",
                notification: { channel_id: "salesiq", tag: msg.tag ?? msg.kind },
              },
            },
          }),
          signal: AbortSignal.timeout(6_000),
        });
        if (res.ok) return true;
        if (res.status === 404 || res.status === 400) {
          const text = await res.text();
          if (/UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(text)) stale.push(token);
        }
        return false;
      } catch {
        return false;
      }
    }),
  );
  return { sent: results.filter(Boolean).length, stale };
}
