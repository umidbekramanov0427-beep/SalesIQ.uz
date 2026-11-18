import { createFileRoute } from "@tanstack/react-router";
import { getRequestUserId, isPlatformOwner } from "@/lib/auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readSupportFile } from "@/lib/support-files.server";

// GET /support/file?id=<message id> -> the file of one support message:
// for the person whose thread it is, or a platform owner.
export const Route = createFileRoute("/support/file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await getRequestUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const id = new URL(request.url).searchParams.get("id") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad id", { status: 400 });
        const { data: row } = await supabaseAdmin
          .from("support_messages")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        const msg = row as {
          user_id: string;
          file_path?: string | null;
          file_name?: string | null;
          file_type?: string | null;
        } | null;
        if (!msg?.file_path) return new Response("Not found", { status: 404 });
        if (msg.user_id !== userId && !(await isPlatformOwner(userId)))
          return new Response("Forbidden", { status: 403 });
        const bytes = await readSupportFile(msg.file_path);
        if (!bytes) return new Response("Not found", { status: 404 });
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "content-type": msg.file_type || "application/octet-stream",
            "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(msg.file_name ?? "file")}`,
            "cache-control": "private, max-age=3600",
          },
        });
      },
    },
  },
});
