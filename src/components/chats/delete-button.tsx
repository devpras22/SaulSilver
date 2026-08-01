"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";

/**
 * Delete button for a chat row. Calls DELETE /api/chats/[id], then refreshes
 * the route so the list re-renders without the deleted row.
 */
export function ChatDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const del = async () => {
    setBusy(true);
    try {
      await fetch(`/api/chats/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      console.error("[chats/delete]", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={del}
      disabled={busy}
      title="Delete chat"
      className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-vermillion/10 hover:text-vermillion disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );
}
