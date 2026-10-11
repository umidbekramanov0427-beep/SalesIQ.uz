import { cn } from "@/lib/utils";

// SalesIQ brand mark: a folded ribbon forming an "S" that flows into a
// rising arrow (growth, read by an intelligent system -- the "IQ").
// This is the actual brand asset (public/logo-icon.webp -- a 240px-tall
// WebP of public/logo-icon.png, ~25 KB instead of ~120 KB -- a cyan-to-violet
// 3D render), not a hand-drawn approximation -- a flat SVG stroke pair
// could never reproduce its lighting/gloss, so the real artwork ships as
// a transparent PNG instead and every call site just sizes the box.
// object-contain preserves the mark's own aspect ratio (it isn't square)
// inside whatever square/rectangular className a caller sizes it to. The
// same mark as the login screen's BrandMark, just without the wordmark --
// sized for compact use (sidebar header, favicons, mobile header).
export function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo-icon.webp"
      alt=""
      aria-hidden="true"
      className={cn("brand-logo object-contain", className)}
    />
  );
}
