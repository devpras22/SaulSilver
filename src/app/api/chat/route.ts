import { NextRequest, NextResponse } from "next/server";
import { askSaul } from "@/lib/saul-agent";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    const response = await askSaul(messages);

    return NextResponse.json(response.choices[0].message);
  } catch (error) {
    console.error("[/api/chat]", error);
    return NextResponse.json({ error: "Failed to process chat" }, { status: 500 });
  }
}
