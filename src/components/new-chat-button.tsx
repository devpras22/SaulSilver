"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * NewChatButton — starts a fresh conversation.
 *
 * The current chat is saved to localStorage (the autosave in /app already does this),
 * so starting a new chat just needs to clear the active session key and reload /app.
 * The previous chat is picked up by the chats history page on its next save.
 */
export function NewChatButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const startNew = () => {
    setBusy(true);
    // Bump the session key so /app starts fresh on load. The old key is preserved
    // under a "pending archive" key so it can be saved to Supabase on next mount
    // — but simplest correct behavior: just clear and reload. The user can always
    // find completed orders in /orders.
    try {
      const current = localStorage.getItem("kusushi:session:v2");
      if (current) {
        // Stash it so /app can archive it to Supabase before resetting
        localStorage.setItem("kusushi:session:pending-archive", current);
      }
    } catch {
      // ignore quota errors
    }
    router.push("/app?new=1");
  };

  return (
    <button
      onClick={startNew}
      disabled={busy}
      title="Start a new chat"
      className="flex items-center gap-1.5 rounded-full border border-border bg-noir-card px-3 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-matcha/40 hover:text-matcha"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">New</span>
    </button>
  );
}
