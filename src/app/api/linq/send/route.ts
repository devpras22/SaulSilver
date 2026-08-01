import { NextRequest, NextResponse } from "next/server";
import { sendMessage, LINQ_CONFIGURED } from "@/lib/linq";

/**
 * POST /api/linq/send — test endpoint to send an outbound message.
 * Body: { to: "+13105551234", text: "hello" }
 */
export async function POST(req: NextRequest) {
  try {
    if (!LINQ_CONFIGURED) {
      return NextResponse.json({ error: "Linq not configured" }, { status: 503 });
    }
    const { to, text } = await req.json();
    if (!to || !text) {
      return NextResponse.json({ error: "to and text required" }, { status: 400 });
    }
    const result = await sendMessage({ to, text });
    return NextResponse.json({ success: true, result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
