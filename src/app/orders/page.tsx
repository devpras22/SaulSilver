import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Wordmark } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, History, MapPin, Clock, Package } from "lucide-react";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  created_at: string;
  items: { name: string; dosage?: string; quantity: number }[];
  address: string;
  chosen_pharmacy: string;
  total: number;
  delivery_eta: number | null;
  priority: string;
  status: string;
  payment_mode: string | null;
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, created_at, items, address, chosen_pharmacy, total, delivery_eta, priority, status, payment_mode")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (orders ?? []) as OrderRow[];

  // ── Aggregate stats for the top banner ──
  const totalOrders = rows.length;
  const totalSpent = rows.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const avgEta = rows.length
    ? Math.round(rows.reduce((s, o) => s + (o.delivery_eta ?? 0), 0) / rows.length)
    : 0;
  const liveOrders = rows.filter((o) => o.payment_mode === "live").length;

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
            <span className="font-display text-lg font-semibold">Order History</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Orders", value: totalOrders.toString() },
            { label: "Total", value: formatINR(totalSpent) },
            { label: "Avg ETA", value: `${avgEta}m` },
            { label: "Live txns", value: liveOrders.toString() },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-white p-3">
              <p className="text-xs text-ink-muted">{s.label}</p>
              <p className="font-display text-lg font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-white/50 p-12 text-center">
            <Package className="mx-auto mb-3 h-8 w-8 text-ink-muted/50" />
            <p className="text-sm text-ink-soft">No orders yet.</p>
            <p className="mt-1 text-xs text-ink-muted">
              Place your first order and it&apos;ll show up here.
            </p>
            <Link
              href="/app"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-matcha px-4 py-2 text-xs font-medium text-cream transition-colors hover:bg-matcha-dark"
            >
              Start an order →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((o) => (
              <div key={o.id} className="rounded-xl border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{o.chosen_pharmacy}</p>
                      <StatusBadge status={o.status} />
                      {o.payment_mode === "live" && (
                        <Badge variant="matcha" className="text-[10px]">live</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-muted">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{o.address}</span>
                    </p>
                  </div>
                  <p className="font-display text-lg font-semibold text-matcha">
                    {formatINR(Number(o.total))}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-soft">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-matcha" />
                    {o.delivery_eta ? `${o.delivery_eta}m ETA` : "—"}
                  </span>
                  <span className="text-ink-muted">
                    {new Date(o.created_at).toLocaleString("en-IN", {
                      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  <span className="rounded-full bg-cream-dark/60 px-2 py-0.5 text-[10px] capitalize text-ink-muted">
                    {o.priority}
                  </span>
                </div>
                {/* Items */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(o.items ?? []).slice(0, 5).map((it, i) => (
                    <span
                      key={i}
                      className="rounded-md bg-cream-dark/40 px-2 py-0.5 text-[11px] text-ink-soft"
                    >
                      {it.name}{it.dosage ? ` ${it.dosage}` : ""} × {it.quantity}
                    </span>
                  ))}
                  {o.items.length > 5 && (
                    <span className="rounded-md bg-cream-dark/40 px-2 py-0.5 text-[11px] text-ink-muted">
                      +{o.items.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "completed") {
    return <Badge variant="matcha" className="text-[10px]">completed</Badge>;
  }
  if (status === "declined") {
    return <Badge variant="outline" className="text-[10px] text-gold">declined</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] text-vermillion">{status}</Badge>;
}
