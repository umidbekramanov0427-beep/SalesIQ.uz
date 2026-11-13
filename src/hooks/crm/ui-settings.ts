import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { parseUiSettings, type UiSettings } from "@/lib/ui-settings";
import { useOrgGeneralSettings } from "./settings";
import { usePlatformSettings } from "./duplicates-billing";

// The company's card and page settings (⚙️, src/lib/ui-settings.ts): read
// by every card and page, changed by its super admin / head of sales. On
// the owner panel's pages they are the platform's own (platform_settings),
// changed by the platform owner.

export type UiSettingsScope = "org" | "platform";

export function useUiSettings(): {
  settings: UiSettings;
  canEdit: boolean;
  scope: UiSettingsScope;
  save: (next: UiSettings) => Promise<void>;
  saving: boolean;
} {
  const { user } = useAuth();
  const qc = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const scope: UiSettingsScope =
    user?.role === "platform_owner" && pathname.startsWith("/platform") ? "platform" : "org";
  const org = useOrgGeneralSettings();
  const platform = usePlatformSettings();
  const raw =
    scope === "platform"
      ? (platform.data as { ui_settings?: unknown } | null | undefined)?.ui_settings
      : (org.data as { ui_settings?: unknown } | null | undefined)?.ui_settings;
  const key = JSON.stringify(raw ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const settings = useMemo(() => parseUiSettings(raw), [key]);
  const canEdit =
    scope === "platform"
      ? user?.role === "platform_owner"
      : !!user?.organizationId && (user.role === "super_admin" || user.role === "rop");

  const mutation = useMutation({
    mutationFn: async (next: UiSettings) => {
      const value = next as unknown as Json;
      if (scope === "platform") {
        const { error } = await supabase
          .from("platform_settings")
          .update({ ui_settings: value })
          .eq("id", true);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("org_general_settings").upsert(
        {
          organization_id: user!.organizationId!,
          ui_settings: value,
          updated_by: user?.id ?? null,
        },
        { onConflict: "organization_id" },
      );
      if (error) throw error;
    },
    // The page changes at once; a failed save puts it back.
    onMutate: async (next) => {
      const qk =
        scope === "platform"
          ? ["platform_settings"]
          : ["org_general_settings", user?.organizationId];
      await qc.cancelQueries({ queryKey: qk });
      const before = qc.getQueryData(qk);
      qc.setQueryData(qk, (old: Record<string, unknown> | null | undefined) => ({
        ...(old ?? {}),
        ui_settings: next,
      }));
      return { qk, before };
    },
    onError: (_e, _n, ctx) => {
      if (ctx) qc.setQueryData(ctx.qk, ctx.before);
    },
    onSettled: (_d, _e, _n, ctx) => {
      if (ctx) void qc.invalidateQueries({ queryKey: ctx.qk });
    },
  });

  return {
    settings,
    canEdit,
    scope,
    save: async (next) => {
      await mutation.mutateAsync(next);
    },
    saving: mutation.isPending,
  };
}

/** A save error's message: the database update not run yet, or the error itself. */
export function uiSaveErrorKey(err: unknown): "pending" | "other" {
  const m =
    err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
  return /ui_settings/.test(m) ? "pending" : "other";
}
