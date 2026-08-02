"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LogOut, Mail, Loader2, AlertTriangle, History, Package, Plus, Wallet, Phone, Pencil } from "lucide-react";
import { WalletModal, type SavedCard } from "@/components/wallet-modal";
import { useCallback, useEffect } from "react";

/**
 * UserMenu — the profile avatar in the header.
 *
 * Click → dropdown: email · Phone (view/edit) · New chat · History · Orders ·
 * Wallet · Sign out. The New Chat button (formerly a header icon) lives here
 * on ALL breakpoints.
 */
export function UserMenu({ email, phone: initialPhone }: { email: string; phone?: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [cards, setCards] = useState<SavedCard[]>([]);
  const [phone, setPhone] = useState<string | null>(initialPhone ?? null);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);

  const refreshCards = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/cards");
      const data = await res.json();
      setCards(data.cards ?? []);
    } catch {
      setCards([]);
    }
  }, []);

  useEffect(() => {
    refreshCards();
  }, [refreshCards]);

  const initial = email?.[0]?.toUpperCase() ?? "?";
  // Mask for display: 8452007727 → +91 •••• •7727
  const masked = phone ? `+91 •••• •${phone.replace(/\D/g, "").slice(-4)}` : null;

  const signOut = async () => {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // Stash the current chat so /app can archive it to Supabase before resetting.
  // Navigation is handled by the <Link href="/app?new=1"> wrapper — this just
  // sets the pending-archive key (onClick fires before the link resolves).
  const startNew = () => {
    try {
      const current = localStorage.getItem("kusushi:session:v2");
      if (current) {
        localStorage.setItem("kusushi:session:pending-archive", current);
      }
    } catch {
      // ignore quota errors
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-8 w-8 items-center justify-center rounded-full bg-matcha text-xs font-semibold text-cream transition-all hover:ring-2 hover:ring-matcha/30 focus:outline-none focus:ring-2 focus:ring-matcha/40"
            title={`Signed in as ${email}`}
          >
            {initial}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Account header */}
          <div className="px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Mail className="h-3 w-3" />
              Signed in
            </p>
            <p className="mt-0.5 truncate text-sm font-medium text-ink">{email}</p>
          </div>
          <DropdownMenuSeparator />
          {/* Phone (view + edit) — Shopflo's SMS OTP goes here. */}
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setPhoneDialogOpen(true);
            }}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Phone className="h-4 w-4" />
            <span className="flex-1">Phone</span>
            <span className="flex items-center gap-1.5 text-xs text-ink-muted">
              {masked ?? "Not set"}
              <Pencil className="h-3 w-3" />
            </span>
          </DropdownMenuItem>
          {/* New chat — stash current session, then navigate. onClick runs before
              the link resolves, so the archive key is set in time. Using asChild +
              Link (not onSelect + router.push) because Radix's onSelect focus-return
              can race with programmatic navigation. */}
          <DropdownMenuItem asChild>
            <Link href="/app?new=1" onClick={startNew} className="flex items-center gap-2 cursor-pointer">
              <Plus className="h-4 w-4" />
              New chat
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/chats" className="flex items-center gap-2 cursor-pointer">
              <History className="h-4 w-4" />
              History
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/orders" className="flex items-center gap-2 cursor-pointer">
              <Package className="h-4 w-4" />
              Orders
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem 
            onSelect={(e) => {
              e.preventDefault();
              setWalletOpen(true);
            }} 
            className="sm:hidden flex items-center gap-2 cursor-pointer"
          >
            <Wallet className="h-4 w-4" />
            Wallet
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
            className="text-vermillion focus:text-vermillion focus:bg-vermillion/5"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Confirm sign-out dialog */}
      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-fade-in" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-cream p-6 shadow-xl data-[state=open]:animate-fade-in-up">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-vermillion/10">
                <AlertTriangle className="h-4 w-4 text-vermillion" />
              </div>
              <Dialog.Title className="font-display text-lg font-semibold">
                Sign out?
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-sm text-ink-soft">
              You&apos;ll need to sign in again to continue. Your saved chats and orders will still be here.
            </Dialog.Description>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
                className="flex-1 rounded-lg border border-border bg-noir-card py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-cream-dark/40"
              >
                Cancel
              </button>
              <button
                onClick={signOut}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-vermillion py-2.5 text-sm font-medium text-cream transition-colors hover:bg-vermillion-dark disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                Sign out
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <WalletModal
        open={walletOpen}
        onOpenChange={setWalletOpen}
        cards={cards}
        onCardsChanged={refreshCards}
      />

      {/* Edit phone dialog — Shopflo sends its SMS OTP here. */}
      <PhoneDialog
        open={phoneDialogOpen}
        onOpenChange={setPhoneDialogOpen}
        phone={phone}
        onSaved={(p) => setPhone(p)}
      />
    </>
  );
}

/**
 * PhoneDialog — view + edit the saved phone number.
 *
 * Shopflo's checkout sends a real SMS OTP to this number; Saul stores it once
 * so he never has to ask in-chat. This dialog lets the user see/change it from
 * the avatar menu without going through checkout.
 */
function PhoneDialog({
  open,
  onOpenChange,
  phone,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  phone: string | null;
  onSaved: (phone: string) => void;
}) {
  const digits = phone ? phone.replace(/\D/g, "") : "";
  const [value, setValue] = useState(digits || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync the input when the dialog opens / external phone changes.
  useEffect(() => {
    if (open) {
      setValue(digits || "");
      setError(null);
    }
  }, [open, digits]);

  const masked = phone ? `+91 •••• •${digits.slice(-4)}` : null;

  const save = async () => {
    const clean = value.replace(/\D/g, "");
    if (clean.length < 10) {
      setError("Enter at least 10 digits.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const reason = typeof data.error === "string" && data.error.trim()
          ? data.error
          : "Couldn't save. Try again.";
        setError(reason);
        return;
      }
      onSaved(clean);
      onOpenChange(false);
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 data-[state=open]:animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[90%] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-cream p-6 shadow-xl data-[state=open]:animate-fade-in-up">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-matcha/10">
              <Phone className="h-4 w-4 text-matcha" />
            </div>
            <Dialog.Title className="font-display text-lg font-semibold">
              Phone number
            </Dialog.Title>
          </div>
          <Dialog.Description className="text-sm text-ink-soft">
            Used to verify you at checkout — the merchant&apos;s payment flow texts a one-time code here. Saul saves it so you never have to enter it mid-chat.
          </Dialog.Description>

          {masked && (
            <p className="mt-3 rounded-lg bg-noir-card px-3 py-2 text-xs text-ink-muted">
              Currently saved: <span className="font-medium text-ink">{masked}</span>
            </p>
          )}

          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-ink-muted">
              {phone ? "New number" : "Your number"}
            </label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="10-digit mobile number"
              className="w-full rounded-lg border border-border bg-cream px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-matcha focus:ring-2 focus:ring-matcha/20"
            />
            {error && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-vermillion">
                <AlertTriangle className="h-3 w-3" />
                {error}
              </p>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="flex-1 rounded-lg border border-border bg-noir-card py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-cream-dark/40"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || value.replace(/\D/g, "").length < 10}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-matcha py-2.5 text-sm font-medium text-cream transition-colors hover:bg-matcha-dark disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
