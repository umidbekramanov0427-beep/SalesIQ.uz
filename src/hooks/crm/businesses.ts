// Bizneslar (the logo bar → «Biznes»): my businesses, adding one and
// switching to another. A switch reloads the app in the new business --
// on its own address when it has one (the session goes along).
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { BusinessesState } from "@/lib/businesses";
import { moveSessionToPanel } from "@/lib/subdomain-handoff";
import { companyOrigin, ROOT_DOMAIN } from "@/lib/subdomain";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json;
}

export function useBusinesses(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["businesses", user?.id, user?.organizationId],
    enabled: enabled && !!user?.id && user.role !== "platform_owner",
    queryFn: () => call<BusinessesState>("/businesses"),
    staleTime: 60_000,
  });
}

type Moved = { ok: true; orgId: string; subdomain: string | null };

/** Opens the app in the business just switched to. */
async function openBusiness(sub: string | null) {
  const host = window.location.hostname.toLowerCase();
  const onPlatform = host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`);
  if (onPlatform && new URL(companyOrigin(sub)).hostname !== host) {
    if (await moveSessionToPanel("crm", sub, "/")) return;
  }
  window.location.assign("/");
}

export function useSwitchBusiness() {
  return useMutation({
    mutationFn: (orgId: string) =>
      call<Moved>("/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "switch", orgId }),
      }),
    onSuccess: (r) => void openBusiness(r.subdomain),
  });
}

export function useCreateBusiness() {
  return useMutation({
    mutationFn: (name: string) =>
      call<Moved>("/businesses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name }),
      }),
    onSuccess: (r) => void openBusiness(r.subdomain),
  });
}
