"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MapPin, Loader2, CheckCircle2, Search, Pencil } from "lucide-react";
import type { GeoData } from "@/components/location-verified";

type Stage = "idle" | "verifying" | "verified" | "saving" | "error";

/**
 * AddressEditor — a row in the profile dropdown that shows the saved address
 * and lets the user update it with a verify-on-map step.
 *
 * Flow: click address → dialog opens → type → Verify → map preview + "is this
 * right?" → Confirm → saves to user_metadata via /api/profile/address.
 */
export function AddressEditor({ currentAddress }: { currentAddress: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(currentAddress ?? "");
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [savedAddress, setSavedAddress] = useState(currentAddress);

  const reset = () => {
    setInput(savedAddress ?? "");
    setGeo(null);
    setStage("idle");
    setError("");
  };

  const verify = async () => {
    if (!input.trim()) return;
    setStage("verifying");
    setError("");
    try {
      const res = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: input.trim() }),
      });
      const data = (await res.json()) as GeoData & { error?: string };
      if (data.error) throw new Error(data.error);
      setGeo(data);
      setStage("verified");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't verify that address");
      setStage("error");
    }
  };

  const confirm = async () => {
    if (!geo) return;
    setStage("saving");
    try {
      const res = await fetch("/api/profile/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: geo.formatted }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSavedAddress(data.address ?? geo.formatted);
      setStage("idle");
      setOpen(false);
      // Re-render the server layout so user_metadata refreshes — without this
      // the dropdown shows the stale server-side address on next open.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setStage("error");
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-cream-dark/40"
      >
        <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-matcha" />
        <span className="flex-1">
          <span className="block text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Delivery address
          </span>
          <span className="mt-0.5 block line-clamp-2 text-ink-soft group-hover:text-ink">
            {savedAddress ?? "Set your address"}
          </span>
        </span>
        <Pencil className="mt-0.5 h-3 w-3 shrink-0 text-ink-muted/60 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>

      <Dialog.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm data-[state=open]:animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-cream p-6 shadow-xl data-[state=open]:animate-fade-in-up">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-matcha/10">
                <MapPin className="h-4 w-4 text-matcha" />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-semibold">
                  Delivery address
                </Dialog.Title>
                <Dialog.Description className="text-xs text-ink-muted">
                  We&apos;ll verify it on the map before saving.
                </Dialog.Description>
              </div>
            </div>

            {/* Input + verify */}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (stage === "error") setStage("idle");
                  if (geo) setGeo(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim() && stage !== "verifying") verify();
                }}
                placeholder="Enter your address…"
                disabled={stage === "verifying" || stage === "saving"}
                className="flex-1 rounded-lg border border-border bg-noir-card px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-ink-muted/60 focus:border-matcha disabled:opacity-60"
              />
              <button
                onClick={verify}
                disabled={!input.trim() || stage === "verifying" || stage === "saving"}
                className="flex items-center gap-1.5 rounded-lg bg-matcha px-3 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-matcha-dark disabled:opacity-50"
              >
                {stage === "verifying" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Verify
              </button>
            </div>

            {/* Verified map preview */}
            {stage === "verified" && geo && (
              <div className="mt-4 animate-fade-in-up">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-matcha">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Is this the right place?
                </div>
                <div className="mb-2 rounded-lg border border-border bg-noir-card p-2.5 text-xs">
                  <p className="font-medium text-ink">{geo.formatted}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                    {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
                  </p>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <iframe
                    src={geo.embedUrl}
                    className="h-40 w-full"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Address preview"
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {stage === "error" && error && (
              <div className="mt-3 rounded-lg border border-vermillion/30 bg-vermillion/5 p-2.5 text-xs text-vermillion">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={stage === "saving"}
                className="flex-1 rounded-lg border border-border bg-noir-card py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-cream-dark/40"
              >
                Cancel
              </button>
              {stage === "verified" && geo && (
                <button
                  onClick={confirm}
                  disabled={stage === ("saving" as Stage)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-matcha py-2.5 text-sm font-medium text-cream transition-colors hover:bg-matcha-dark disabled:opacity-50"
                >
                  {stage === ("saving" as Stage) ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Confirm &amp; save
                </button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
