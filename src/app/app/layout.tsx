import { Wordmark } from "@/components/brand";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserMenu } from "@/components/user-menu";
import { HeaderAddress } from "@/components/header-address";
import { WalletButton } from "@/components/wallet-button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Support for multiple addresses
  const addresses = (user.user_metadata?.addresses as any[]) ?? [];
  const activeAddressId = (user.user_metadata?.active_address_id as string) ?? null;

  return (
    <div className="relative min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-cream/95">
        {/* ── DESKTOP: single row (brand · address · actions) ── */}
        <div className="hidden w-full items-center justify-between gap-2 px-6 py-3 sm:flex">
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/" className="transition-opacity hover:opacity-80">
              <Wordmark />
            </Link>
          </div>

          <div className="flex min-w-0 flex-1 justify-center px-1">
            <HeaderAddress addresses={addresses} activeAddressId={activeAddressId} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <WalletButton />
            <UserMenu email={user.email ?? ""} />
          </div>
        </div>

        {/* ── MOBILE: two rows ──
            Row 1: brand · wallet · avatar
            Row 2: address (full width, its own line) */}
        <div className="sm:hidden">
          <div className="flex w-full items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Link href="/" className="transition-opacity hover:opacity-80">
                <Wordmark />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <WalletButton />
              <UserMenu email={user.email ?? ""} />
            </div>
          </div>
          <div className="w-full px-3 pb-2.5">
            <HeaderAddress addresses={addresses} activeAddressId={activeAddressId} />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pt-4 sm:px-6">{children}</main>
    </div>
  );
}
