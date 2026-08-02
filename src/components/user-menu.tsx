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
import { LogOut, Mail, Loader2, AlertTriangle, History, Package, Plus, Wallet } from "lucide-react";
import { WalletModal, type SavedCard } from "@/components/wallet-modal";
import { useCallback, useEffect } from "react";

/**
 * UserMenu — the profile avatar in the header.
 *
 * Click → dropdown: email · New chat · History · Orders · Sign out.
 * The New Chat button (formerly a header icon) lives here on ALL breakpoints.
 */
export function UserMenu({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [cards, setCards] = useState<SavedCard[]>([]);

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
    </>
  );
}
