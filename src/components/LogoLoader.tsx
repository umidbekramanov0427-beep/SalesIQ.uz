import { useId } from "react";

// A loading state built from the app's own brand mark instead of a generic
// spinner: the center dot pulses in first, then all six petals bloom
// outward together, in unison, from the same center point, hold, and fade
// back — reads as a "thinking"/working motion rather than a bare rotating
// ring.
export function LogoLoader({ className }: { className?: string }) {
  const petalGrad = useId();
  const petalId = useId();
  const dotId = useId();
  const angles = [0, 60, 120, 180, 240, 300];

  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient
          id={petalGrad}
          x1="50"
          y1="50"
          x2="50"
          y2="12"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#3730A3" />
          <stop offset="0.55" stopColor="#4F46E5" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
        <path
          id={petalId}
          d="M50 50 C45.5 39 43.5 25 50 12 C59 20 63 33 56.5 43.5 C54.5 46.5 52 48.5 50 50 Z"
          fill={`url(#${petalGrad})`}
        />
        <circle id={dotId} cx="50" cy="6.5" r="3.2" fill="#4F46E5" />
      </defs>

      <circle cx="50" cy="50" r="4.5" fill="#4F46E5" className="logo-loader-core" />

      {angles.map((a) => (
        // The rotation lives on this <g> (an SVG attribute); the bloom
        // animation's CSS `transform: scale(...)` goes on the child <use>
        // instead of here, since a CSS transform replaces rather than
        // composes with an element's own `transform` attribute -- putting
        // both on the same node would silently drop the rotation.
        <g key={`petal-${a}`} transform={`rotate(${a} 50 50)`}>
          <use href={`#${petalId}`} className="logo-loader-petal" />
          <use href={`#${dotId}`} className="logo-loader-petal" />
        </g>
      ))}
    </svg>
  );
}
