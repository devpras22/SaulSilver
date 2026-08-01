import { NextRequest, NextResponse } from "next/server";
import { prava, IS_MOCK, reportStatusMock } from "@/lib/prava";

/**
 * POST /api/pay/report — report the final checkout outcome to Prava.
 * This completes the transaction lifecycle and moves the session to `completed`.
 *
 * Mock sessions (ses_mock_ prefix) route to the mock function directly.
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, txnRefId, status, amountPaid } = await req.json();
    if (!sessionId || !txnRefId || !status) {
      return NextResponse.json(
        { error: "sessionId, txnRefId, status required" },
        { status: 400 }
      );
    }

    const isMockSession = IS_MOCK || sessionId.startsWith("ses_mock_");
    if (isMockSession) {
      await reportStatusMock({ sessionId, txnRefId, status, amountPaid });
    } else {
      await prava.reportStatus({ sessionId, txnRefId, status, amountPaid });
    }
    return NextResponse.json({ success: true, mock: isMockSession });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
