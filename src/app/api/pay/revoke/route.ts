import { NextRequest, NextResponse } from "next/server";
import { IS_MOCK } from "@/lib/prava";

/**
 * POST /api/pay/revoke — cancel an open session that never reached a terminal state.
 * Body: { sessionId }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = (await req.json()) as { sessionId: string };
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    // Mock sessions just succeed (no backend to call)
    if (IS_MOCK || sessionId.startsWith("ses_mock_")) {
      return NextResponse.json({ success: true, mock: true });
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/v1/sessions/${sessionId}/revoke`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.MERCHANT_SECRET_KEY}`,
        },
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json({ error: err.error?.message || `HTTP ${res.status}` }, { status: res.status });
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
