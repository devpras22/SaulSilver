import { NextRequest, NextResponse } from "next/server";
import { createSession, IS_MOCK } from "@/lib/prava";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/pay — create a Prava session for a gummy purchase.
 *
 * Built to the skill template: real merchant + real amount + real product.
 * If cardId is passed, Prava pre-selects that saved card (passkey-only flow).
 * Otherwise Prava auto-shows the user's saved cards.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    const { items, total, merchantName, merchantUrl: merchantUrlFromClient, cardId } = (await req.json()) as {
      items: { name: string; dosage?: string }[];
      total: number;
      merchantName: string;
      merchantUrl: string;
      cardId?: string;
    };

    if (!total || !merchantName) {
      return NextResponse.json({ error: "total and merchantName required" }, { status: 400 });
    }

    const productDescription = items.map((i) => `${i.name}${i.dosage ? ` ${i.dosage}` : ""}`).join(", ");

    const origin = req.headers.get("origin") || "https://saul.pras.fun";

    // merchantUrl = the REAL destination merchant the agent is buying from
    // (brand.website / product_url host), NOT our own app origin. This is what
    // makes the Prava virtual card scoped to the actual checkout target — the
    // gating requirement for Step 5 (agent checks out on the end merchant).
    // Default to origin only if the client genuinely sent nothing.
    const merchantUrl = merchantUrlFromClient || origin;

    const session = await createSession({
      userId: user.id,
      userEmail: user.email ?? "",
      totalAmount: total.toFixed(2),
      currency: "INR",
      description: productDescription,
      merchantName,
      merchantUrl,
      merchantCountryIso2: "IN",
      productDescription,
      cardId,
      // On WebKit/Safari the checkout opens in a hosted tab; ask Prava to
      // redirect it back to the app on completion. Points to the chat.
      callbackUrl: `${origin}/app`,
    });

    return NextResponse.json({ ...session, mock: IS_MOCK });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[pay]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
