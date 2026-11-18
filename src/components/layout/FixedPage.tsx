import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A page pinned to the screen: it cancels <main>'s padding and its trailing
 * spacer (AppShell) and fills the whole area under the top bar, so the page
 * itself never scrolls -- only its own panes do (CRM Inbox, owner Arizalar
 * and Yordam). Children lay out in a column by default.
 */
export function FixedPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "-mx-4 -mb-20 -mt-4 flex h-[calc(100%+2rem)] flex-col overflow-hidden md:-mx-6 md:-mb-[104px] md:h-[calc(100%+2.5rem)] phone:-mx-3 phone:-mb-4 phone:-mt-3 phone:h-[calc(100%+0.75rem)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
