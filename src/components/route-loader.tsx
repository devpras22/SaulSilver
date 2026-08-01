import { Logo } from "@/components/brand";

/**
 * RouteLoader — shown by loading.tsx during route transitions.
 * Next.js App Router renders this instantly while the real page's server
 * data fetches run, then swaps it out when the page is ready.
 */
export function RouteLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative">
        <Logo className="text-matcha/20" size={48} />
        <div className="absolute inset-0 animate-spin [animation-duration:1.4s]">
          <Logo className="text-matcha" size={48} />
        </div>
      </div>
      <p className="text-sm text-ink-muted">{label}…</p>
    </div>
  );
}
