import { NextRequest, NextResponse } from "next/server";
import { reportStatus } from "@/lib/prava";

/**
 * POST /api/pay/report — report the final checkout outcome to Prava.
 * Body: { sessionId, txnRefId, status: "APPROVED" | "DECLINED" }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, txnRefId, status } = (await req.json()) as {
      sessionId: string;
      txnRefId: string;
      status: "APPROVED" | "DECLINED";
    };
    if (!sessionId || !txnRefId || !status) {
      return NextResponse.json({ error: "sessionId, txnRefId, status required" }, { status: 400 });
    }
    await reportStatus(sessionId, txnRefId, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
