"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MapPin, Loader2, CheckCircle2, Search, ChevronDown, Trash2 } from "lucide-react";
import type { GeoData } from "@/components/location-verified";

type Stage = "idle" | "verifying" | "verified" | "saving" | "error";

/**
 * HeaderAddress — the centered address pill in the app header.
 *
 * Shows the full saved delivery address (no truncation — smaller text on mobile
 * instead) with a map-pin + chevron. Clicking opens the verify-on-map dialog.
 * Mirrors the address control in the Prava playground header.
 */
export function HeaderAddress({ address }: { address: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex w-full items-center justify-center gap-1.5 rounded-full border border-border bg-noir-card px-3 py-1 transition-colors hover:border-matcha/40 hover:bg-matcha/5"
        title="Edit delivery address"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-matcha" />
        <span
          className="text-center font-medium leading-tight text-ink-soft transition-colors group-hover:text-matcha"
          style={{ fontSize: "clamp(0.65rem, 2.4vw, 0.8rem)" }}
        >
          {address ?? "Set delivery address"}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-ink-muted/60 transition-transform group-hover:text-matcha" />
      </button>
      <AddressDialog
        open={open}
        onOpenChange={setOpen}
        currentAddress={address}
      />
    </>
  );
}

/**
 * AddressDialog — the verify-on-map editor, reusable.
 *
 * Extracted from the old AddressEditor so it can be triggered from the header
 * pill. Flow: type → Verify → map preview "is this right?" → Confirm → saves
 * to user_metadata via /api/profile/address → router.refresh().
 */
export function AddressDialog({
  open,
  onOpenChange,
  currentAddress,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentAddress: string | null;
}) {
  const router = useRouter();
  const [input, setInput] = useState(currentAddress ?? "");
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Keep input in sync if the saved address changes (e.g. after a refresh).
  useEffect(() => {
    if (open) {
      setInput(currentAddress ?? "");
      setGeo(null);
      setStage("idle");
      setError("");
      setSaving(false);
    }
  }, [open, currentAddress]);

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
    setSaving(true);
    try {
      const res = await fetch("/api/profile/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: geo.formatted }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
      setStage("error");
    } finally {
      setSaving(false);
    }
  };

  const removeAddress = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile/address", { method: "DELETE" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove");
      setStage("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setGeo(null);
          setStage("idle");
          setError("");
          setSaving(false);
        }
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
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1 rounded-lg border border-border bg-noir-card py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-cream-dark/40 disabled:opacity-50"
            >
              Cancel
            </button>
            {stage === "verified" && geo && (
              <button
                onClick={confirm}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-matcha py-2.5 text-sm font-medium text-cream transition-colors hover:bg-matcha-dark disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm &amp; save
              </button>
            )}
          </div>

          {/* Remove saved address — for testing the fresh-account flow. */}
          {currentAddress && stage !== "verifying" && (
            <button
              onClick={removeAddress}
              disabled={saving}
              className="mx-auto mt-4 flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-vermillion disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Remove saved address
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
