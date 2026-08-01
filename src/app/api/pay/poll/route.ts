import { NextRequest, NextResponse } from "next/server";
import { prava, IS_MOCK, getPaymentResultMock } from "@/lib/prava";

/** POST /api/pay/poll — poll the payment result for a session.
 *
 * Mock sessions use the `ses_mock_` prefix (see createSessionMock in prava.ts).
 * We route those to the mock function directly, because prava.getPaymentResult
 * is bound to the REAL implementation at module load when PRAVA_SECRET_KEY is set.
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 });
    }

    const isMockSession = IS_MOCK || sessionId.startsWith("ses_mock_");
    const result = isMockSession
      ? await getPaymentResultMock(sessionId)
      : await prava.getPaymentResult(sessionId);

    return NextResponse.json({ ...result, mock: isMockSession });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
