import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSession, IS_MOCK } from "@/lib/prava";

/**
 * POST /api/wallet/session
 *
 * Creates a Prava session for card enrollment. Built to the skill template:
 * real merchant, real amount, real product. NO mandate_setup / integration_type
 * (those fields don't exist in the canonical API).
 *
 * Prava auto-detects returning users and shows their saved cards. First time:
 * card form → OTP (456789) → passkey registration. Repeat: saved-cards → passkey.
 *
 * The amount is a small real value (₹1) — a zero-amount session fails at
 * verification ("transaction cancelled"). This is a card-enrollment charge that
 * completes the device-binding + passkey flow.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    const origin = req.headers.get("origin") || "https://saul.pras.fun";

    const session = await createSession({
      userId: user.id,
      userEmail: user.email ?? "",
      totalAmount: "1.00",
      currency: "INR",
      description: "Wallet card enrollment",
      merchantName: "Saul Silver",
      merchantUrl: origin,
      merchantCountryIso2: "IN",
      productDescription: "Card enrollment",
    });

    return NextResponse.json({ ...session, mock: IS_MOCK });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[wallet/session]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
