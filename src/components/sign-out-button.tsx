"use client";

import { createClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";

export function SignOutButton({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // Show first letter of email as an avatar; click = sign out
  const initial = email?.[0]?.toUpperCase() ?? "?";

  return (
    <button
      onClick={signOut}
      disabled={busy}
      title={`Signed in as ${email} — click to sign out`}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-matcha/10 text-xs font-medium text-matcha transition-colors hover:bg-vermillion/10 hover:text-vermillion"
    >
      {busy ? <LogOut className="h-3.5 w-3.5" /> : initial}
    </button>
  );
}
