import { NextRequest, NextResponse } from "next/server";
import { agent, IS_MOCK_AGENT } from "@/lib/agent";

/** POST /api/extract — parse a natural-language medicine request into structured items. */
export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    const result = await agent.extract(message);
    return NextResponse.json({ ...result, mock: IS_MOCK_AGENT });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
