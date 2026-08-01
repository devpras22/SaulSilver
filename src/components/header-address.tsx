"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { MapPin, Loader2, CheckCircle2, Search, ChevronDown, Trash2, Plus, Home, Briefcase, Map } from "lucide-react";
import type { GeoData } from "@/components/location-verified";

type Stage = "idle" | "verifying" | "verified" | "saving" | "error";

export interface AddressEntry {
  id: string;
  label: string;
  address: string;
}

export function HeaderAddress({ addresses, activeAddressId }: { addresses: AddressEntry[], activeAddressId: string | null }) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  
  const active = addresses.find(a => a.id === activeAddressId) || addresses[0];

  return (
    <>
      <button
        onClick={() => addresses.length === 0 ? setAddOpen(true) : setSelectorOpen(true)}
        className="group flex w-fit max-w-[160px] sm:max-w-[200px] items-center justify-center gap-1.5 rounded-full border border-border bg-noir-card px-3 py-1 transition-colors hover:border-matcha/40 hover:bg-matcha/5"
        title="Delivery address"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-matcha" />
        <span
          className="truncate text-center font-medium leading-tight text-ink-soft transition-colors group-hover:text-matcha text-sm"
        >
          {active ? active.label : "Add address"}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 text-ink-muted/60 transition-transform group-hover:text-matcha" />
      </button>

      <AddressSelectorDialog 
        open={selectorOpen} 
        onOpenChange={setSelectorOpen} 
        addresses={addresses} 
        activeAddressId={activeAddressId}
        onAddClick={() => setAddOpen(true)}
      />

      <AddressDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function AddressSelectorDialog({
  open,
  onOpenChange,
  addresses,
  activeAddressId,
  onAddClick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  addresses: AddressEntry[];
  activeAddressId: string | null;
  onAddClick: () => void;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const setActive = async (id: string) => {
    if (id === activeAddressId) {
      onOpenChange(false);
      return;
    }
    setLoadingId(id);
    try {
      await fetch("/api/profile/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_active", id }),
      });
      router.refresh();
      onOpenChange(false);
    } finally {
      setLoadingId(null);
    }
  };

  const removeAddress = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setLoadingId(`delete-${id}`);
    try {
      await fetch("/api/profile/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92%] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-cream p-6 shadow-xl data-[state=open]:animate-fade-in-up flex flex-col max-h-[85vh]">
            <div className="mb-4 flex items-center gap-2 shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-matcha/10">
                <MapPin className="h-4 w-4 text-matcha" />
              </div>
              <div>
                <Dialog.Title className="font-display text-lg font-semibold">
                  Delivery Addresses
                </Dialog.Title>
                <Dialog.Description className="text-xs text-ink-muted">
                  Choose where to deliver your next order.
                </Dialog.Description>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 py-2">
              {addresses.map((addr) => {
                const isActive = addr.id === activeAddressId || (addresses.length === 1 && addresses[0].id === addr.id);
                return (
                  <div
                    key={addr.id}
                    onClick={() => setActive(addr.id)}
                    className={`group relative flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      isActive ? "border-matcha bg-matcha/5" : "border-border bg-noir-card hover:border-matcha/40"
                    }`}
                  >
                    <div className="mt-0.5 text-matcha">
                      {addr.label.toLowerCase().includes("home") ? <Home className="h-4 w-4" /> : addr.label.toLowerCase().includes("work") ? <Briefcase className="h-4 w-4" /> : <Map className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 pr-8">
                      <p className="text-sm font-semibold text-ink flex items-center gap-2">
                        {addr.label}
                        {isActive && <span className="text-[10px] uppercase tracking-wider text-matcha font-bold">Active</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-muted line-clamp-2">{addr.address}</p>
                    </div>
                    <button 
                      onClick={(e) => removeAddress(addr.id, e)}
                      className="absolute right-3 top-3 p-1.5 text-ink-muted/50 hover:bg-vermillion/10 hover:text-vermillion rounded-md transition-colors"
                    >
                      {loadingId === `delete-${addr.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                    {loadingId === addr.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-cream/50 rounded-xl">
                        <Loader2 className="h-5 w-5 animate-spin text-matcha" />
                      </div>
                    )}
                  </div>
                );
              })}
              
              {addresses.length === 0 && (
                <div className="text-center py-8 text-ink-muted text-sm border border-dashed border-border rounded-xl">
                  No addresses saved yet.
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-border shrink-0">
              <button
                onClick={() => {
                  onOpenChange(false);
                  setTimeout(() => onAddClick(), 100);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-noir-card py-2.5 text-sm font-medium text-ink transition-colors hover:bg-cream-dark/40"
              >
                <Plus className="h-4 w-4" />
                {addresses.length === 0 ? "Add address" : "Add another address"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
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
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: (address: string) => void;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [apartment, setApartment] = useState("");
  const [landmark, setLandmark] = useState("");
  const [labelCategory, setLabelCategory] = useState<"Home" | "Work" | "Other">("Home");
  const [customLabel, setCustomLabel] = useState("");
  // Keep input in sync if the saved address changes (e.g. after a refresh).
  useEffect(() => {
    if (open) {
      setInput("");
      setGeo(null);
      setStage("idle");
      setError("");
      setSaving(false);
      setApartment("");
      setLandmark("");
      setLabelCategory("Home");
      setCustomLabel("");
    }
  }, [open]);

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
    if (!apartment.trim()) {
      setError("Please enter your Flat, House no., or Building name.");
      return;
    }
    setSaving(true);
    try {
      const parts = [apartment.trim()];
      if (landmark.trim()) parts.push(landmark.trim());
      parts.push(geo.formatted);
      const fullAddress = parts.join(", ");

      const finalLabel = labelCategory === "Other" ? (customLabel.trim() || "Other") : labelCategory;

      const res = await fetch("/api/profile/address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", address: fullAddress, label: finalLabel }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (onSaved) onSaved(fullAddress);
      onOpenChange(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-fade-in" />
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
              <div className="mb-4 rounded-lg border border-border bg-noir-card p-2.5 text-xs">
                <p className="font-medium text-ink">{geo.formatted}</p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-muted">
                  {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
                </p>
              </div>

              <div className="mb-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Flat, House no., Building, Apartment *</label>
                  <input
                    type="text"
                    value={apartment}
                    onChange={(e) => {
                      setApartment(e.target.value);
                      if (error) setError("");
                    }}
                    placeholder="e.g. Flat 4B, Apollo Towers"
                    disabled={saving}
                    className="w-full rounded-lg border border-border bg-noir-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-muted/60 focus:border-matcha disabled:opacity-60"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Landmark (Optional)</label>
                  <input
                    type="text"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="e.g. Near Star Bazaar"
                    disabled={saving}
                    className="w-full rounded-lg border border-border bg-noir-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-muted/60 focus:border-matcha disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-soft">Save as</label>
                  <div className="flex gap-2 mb-2">
                    {(["Home", "Work", "Other"] as const).map(l => (
                      <button
                        key={l}
                        onClick={() => setLabelCategory(l)}
                        className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${labelCategory === l ? 'border-matcha bg-matcha/10 text-matcha' : 'border-border bg-noir-card text-ink-muted hover:border-matcha/40'}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  {labelCategory === "Other" && (
                    <div className="animate-fade-in-up">
                      <input
                        type="text"
                        value={customLabel}
                        onChange={(e) => setCustomLabel(e.target.value)}
                        placeholder="e.g. Mom's House, Gym, Farmhouse..."
                        disabled={saving}
                        className="w-full rounded-lg border border-border bg-noir-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-ink-muted/60 focus:border-matcha disabled:opacity-60"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
