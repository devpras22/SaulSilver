import { cn } from "@/lib/utils";

/**
 * SaulSilver mark — a seven-pointed cannabis leaf sealed in a resin ring.
 * Premium, geometric, restrained. Reads as a sommelier's seal, not a novelty.
 * The ring = the trichome; the leaf = the cultivar. Two ideas, one mark.
 * Named for Saul Silver — the dealer who actually knew his strains.
 */
export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={cn("shrink-0", className)}
      aria-label="SaulSilver"
    >
      {/* Resin ring */}
      <circle cx="20" cy="20" r="18.5" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <circle cx="20" cy="20" r="15.5" stroke="currentColor" strokeWidth="0.75" opacity="0.18" />

      {/* Seven-pointed leaf — symmetric, centered, geometric */}
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none">
        {/* Center spine */}
        <path d="M20 9 L20 31" />
        {/* Upper pair */}
        <path d="M20 14 L13 10.5" />
        <path d="M20 14 L27 10.5" />
        {/* Middle pair */}
        <path d="M20 20 L11.5 17" />
        <path d="M20 20 L28.5 17" />
        {/* Lower pair */}
        <path d="M20 26 L14 27" />
        <path d="M20 26 L26 27" />
      </g>
      {/* Trichome dot at the crown */}
      <circle cx="20" cy="8.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo className="text-resin" size={26} />
      <span className="font-display text-xl font-semibold tracking-tight text-ink">
        Saul Silver
      </span>
    </div>
  );
}
