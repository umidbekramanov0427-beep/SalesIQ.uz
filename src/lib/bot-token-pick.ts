// Which token a platform bot uses (Platforma -> Botlar): the one saved in
// the panel wins, the server setting (.env.server) is the fallback -- so the
// owner can swap any of the three bots without touching the server. Pure.

export type TokenSource = "panel" | "env" | null;

export function pickToken(saved: string | null | undefined, env: string | null | undefined) {
  return saved?.trim() || env?.trim() || null;
}

export function tokenSource(
  saved: string | null | undefined,
  env: string | null | undefined,
): TokenSource {
  return saved?.trim() ? "panel" : env?.trim() ? "env" : null;
}
