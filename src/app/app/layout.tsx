import { Wordmark } from "@/components/brand";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/user-menu";
import { HeaderAddress } from "@/components/header-address";
import { WalletButton } from "@/components/wallet-button";
import { PaymentModeProvider } from "@/lib/payment-mode";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Pull the saved default address from user_metadata (set via /api/profile/address),
  // falling back to the most recent order's address.
  const savedAddress =
    (user.user_metadata?.default_address as string | undefined) ?? null;

  let fallbackAddress = savedAddress;
  if (!fallbackAddress) {
    const { data: recentOrder } = await supabase
      .from("orders")
      .select("address")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fallbackAddress = (recentOrder as { address?: string } | null)?.address ?? null;
  }
  const addressProp: string | null = fallbackAddress ?? null;

  return (
    <PaymentModeProvider>
      <div className="relative min-h-screen">
        <header className="sticky top-0 z-40 border-b border-border bg-cream/85 backdrop-blur-md">
          {/* ── DESKTOP: single row (back/brand · address · actions) ── */}
          <div className="mx-auto hidden max-w-5xl items-center justify-between gap-2 px-6 py-3 sm:flex">
            <div className="flex shrink-0 items-center gap-3">
              <Link href="/" className="flex items-center gap-1.5 text-ink-muted transition-colors hover:text-ink">
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm">Home</span>
              </Link>
              <div className="h-5 w-px bg-border" />
              <Wordmark />
            </div>

            <div className="flex min-w-0 max-w-[50%] justify-center px-1">
              <HeaderAddress address={addressProp} />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <WalletButton />
              <UserMenu email={user.email ?? ""} />
            </div>
          </div>

          {/* ── MOBILE: two rows ──
              Row 1: back + brand · wallet · avatar
              Row 2: address (full width, its own line) */}
          <div className="sm:hidden">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Link href="/" className="text-ink-muted transition-colors hover:text-ink">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <Wordmark />
              </div>
              <div className="flex items-center gap-2">
                <WalletButton />
                <UserMenu email={user.email ?? ""} />
              </div>
            </div>
            <div className="mx-auto max-w-5xl px-3 pb-2.5">
              <HeaderAddress address={addressProp} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">{children}</main>
      </div>
    </PaymentModeProvider>
  );
}
