import { NextRequest, NextResponse } from "next/server";
import { pollPaymentResult } from "@/lib/prava";

/**
 * POST /api/pay/poll — poll the payment result for a purchase session.
 * Cache-busted (?_t=) per the skill gotcha. Body: { sessionId }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = (await req.json()) as { sessionId: string };
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    const result = await pollPaymentResult(sessionId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
