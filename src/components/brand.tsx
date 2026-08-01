import { cn } from "@/lib/utils";

/**
 * Kusushi mark — a stylized 薬 (kusuri, "medicine") inspired apothecary cross.
 * Combines a mortar-and-pestle silhouette with the plus of pharmacy.
 */
export function Logo({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={cn("shrink-0", className)}
      aria-label="Kusushi"
    >
      <circle cx="20" cy="20" r="19" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <path
        d="M20 9v22M9 20h22"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="20" cy="20" r="4.5" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Logo className="text-matcha" size={28} />
      <span className="font-display text-xl font-semibold tracking-tight">
        Kusushi
      </span>
    </div>
  );
}
