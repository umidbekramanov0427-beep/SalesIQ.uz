import { cn } from "@/lib/utils";

// Full splash lockup for decorative/marketing placements (the login
// screen's branding panel): the same real brand-mark artwork as
// Logo.tsx (public/logo-icon.png), plus the "SalesIQ" wordmark on one
// line beneath it. The small in-app icon used everywhere else (sidebar,
// compact headers) stays Logo.tsx -- this version is only meant for a
// larger, decorative size.
export function BrandMark({
  className,
  iconClassName,
  wordmarkClassName,
}: {
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <img
        src="/logo-icon.png"
        alt=""
        aria-hidden="true"
        className={cn("h-16 w-16 object-contain", iconClassName)}
      />

      <p
        className={cn(
          "whitespace-nowrap text-xl font-extrabold tracking-tight text-indigo-400",
          wordmarkClassName,
        )}
      >
        SalesIQ
      </p>
    </div>
  );
}
