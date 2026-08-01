import { NextRequest, NextResponse } from "next/server";
import { pollPaymentResult } from "@/lib/prava";

/**
 * GET /api/wallet/result?sessionId=...
 *
 * Polls the payment result for a wallet enrollment session. Cache-busted
 * (?_t=) per the skill gotcha to prevent Next.js stale responses.
 */
export async function GET(req: NextRequest) {
  try {
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    const result = await pollPaymentResult(sessionId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
