// Server-only. Appends a row to a Google Sheet via a service account --
// a bare Sheet URL alone can't be written to; the URL just tells us *which*
// sheet, while write access comes from sharing that sheet (as Editor) with
// a Google Cloud service account's email and giving this server that
// account's private key. Until GOOGLE_SERVICE_ACCOUNT_EMAIL and
// GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY are set, appendRowToGoogleSheet is a
// silent no-op (see its callers) so the rest of the daily report pipeline
// keeps working with Sheets sync simply not active yet.
//
// JWT signing uses Web Crypto (crypto.subtle) instead of a Node crypto/JWT
// library -- it's available in every runtime this app runs on, so there's
// no reason to add a Node-only dependency here.

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of arr) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(s: string): string {
  return base64UrlEncode(new TextEncoder().encode(s));
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getServiceAccountAccessToken(): Promise<string | null> {
  const email = process.env["GOOGLE_SERVICE_ACCOUNT_EMAIL"];
  const rawKey = process.env["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"];
  if (!email || !rawKey) return null;
  const privateKeyPem = rawKey.replace(/\\n/g, "\n");

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsigned = `${base64UrlEncodeString(JSON.stringify(header))}.${base64UrlEncodeString(JSON.stringify(claims))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token exchange returned no access_token");
  return json.access_token;
}

function extractSpreadsheetId(sheetUrl: string): string | null {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}

/**
 * Appends one row to the given Google Sheet (Sheet1, columns starting at A).
 * A no-op when the service account isn't configured yet -- callers should
 * treat that as "Sheets sync not set up", not an error, since it's an
 * optional, opt-in per-org integration.
 */
export async function appendRowToGoogleSheet(
  sheetUrl: string,
  values: (string | number)[],
): Promise<{ skipped: boolean }> {
  const accessToken = await getServiceAccountAccessToken();
  if (!accessToken) return { skipped: true };

  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) throw new Error("Google Sheets havolasi noto'g'ri ko'rinishda.");

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ values: [values] }),
    },
  );
  if (!res.ok) throw new Error(`Google Sheets append failed (${res.status}): ${await res.text()}`);
  return { skipped: false };
}
