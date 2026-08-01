import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Wordmark } from "@/components/brand";
import Link from "next/link";
import { ArrowLeft, History, MessageSquare, MapPin, Plus } from "lucide-react";
import { ChatDeleteButton } from "@/components/chats/delete-button";

export const dynamic = "force-dynamic";

type ChatRow = {
  id: string;
  title: string;
  updated_at: string;
  address: string | null;
  priority: string | null;
  stage: string | null;
  items: { name: string; dosage?: string; quantity: number }[] | null;
};

export default async function ChatsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: chats } = await supabase
    .from("chats")
    .select("id, title, updated_at, address, priority, stage, items")
    .order("updated_at", { ascending: false })
    .limit(50);

  const rows = (chats ?? []) as ChatRow[];

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-cream/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link href="/app" className="flex items-center gap-2 text-ink-muted transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden text-sm sm:inline">Back</span>
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-matcha" />
            <span className="font-display text-lg font-semibold">Chat History</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-ink-muted">
            {rows.length} saved conversation{rows.length === 1 ? "" : "s"}
          </p>
          <Link
            href="/app?new=1"
            className="flex items-center gap-1.5 rounded-full bg-matcha px-4 py-2 text-xs font-medium text-cream transition-colors hover:bg-matcha-dark"
          >
            <Plus className="h-3.5 w-3.5" /> New chat
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-white/50 p-12 text-center">
            <MessageSquare className="mx-auto mb-3 h-8 w-8 text-ink-muted/50" />
            <p className="text-sm text-ink-soft">No saved chats yet.</p>
            <p className="mt-1 text-xs text-ink-muted">
              Start a conversation and it&apos;ll be saved here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((c) => {
              const itemCount = c.items?.length ?? 0;
              const isComplete = c.stage === "completed";
              return (
                <div
                  key={c.id}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-white p-3 transition-colors hover:border-matcha/30"
                >
                  <Link href={`/app?chat=${c.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                      {isComplete && (
                        <span className="shrink-0 rounded-full bg-matcha/10 px-2 py-0.5 text-[10px] font-medium text-matcha">
                          completed
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                      {c.address && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{c.address}</span>
                        </span>
                      )}
                      {itemCount > 0 && (
                        <span className="rounded-full bg-cream-dark/60 px-2 py-0.5 text-[10px]">
                          {itemCount} item{itemCount === 1 ? "" : "s"}
                        </span>
                      )}
                      <span>
                        {new Date(c.updated_at).toLocaleString("en-IN", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </Link>
                  <ChatDeleteButton id={c.id} />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
