import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { clientAppEnv } from "@/lib/app-env";

// A thin amber strip across the top of every page on the staging copy:
// "this is the test environment". Decided after mount (the address is
// only known in the browser), so the server-rendered page never differs.
export function EnvRibbon() {
  const [staging, setStaging] = useState(false);
  useEffect(() => setStaging(clientAppEnv() === "staging"), []);
  if (!staging) return null;
  return (
    <div
      role="status"
      className="no-print pointer-events-none fixed inset-x-0 top-0 z-[200] flex h-6 items-center justify-center gap-1.5 bg-amber-400 text-[12px] font-bold tracking-wide text-amber-950 uppercase"
    >
      <FlaskConical className="h-3.5 w-3.5" />
      Test muhiti (staging) — haqiqiy mijozlar ma'lumotlari emas
    </div>
  );
}
