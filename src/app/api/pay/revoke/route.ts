import { NextRequest, NextResponse } from "next/server";
import { prava, IS_MOCK, revokeSessionMock } from "@/lib/prava";

/**
 * POST /api/pay/revoke — cancel an open session that never reached a terminal
 * state. Mock sessions (ses_mock_ prefix) route to the mock function directly.
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const isMockSession = IS_MOCK || sessionId.startsWith("ses_mock_");
    if (isMockSession) {
      await revokeSessionMock(sessionId);
    } else {
      await prava.revoke(sessionId);
    }
    return NextResponse.json({ success: true, mock: isMockSession });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
