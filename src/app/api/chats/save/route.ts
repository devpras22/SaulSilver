import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage, MedicineItem, Priority } from "@/lib/types";
import type { GeoData } from "@/components/location-verified";

/**
 * POST /api/chats/save
 *
 * Upserts (insert or update) the active chat. If `id` is provided and exists,
 * the row is updated; otherwise a new row is inserted and its id returned.
 * RLS applies via the session cookie — owner-scoped.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "not authenticated" }, { status: 401 });
    }

    const body = (await req.json()) as {
      id?: string;
      messages: ChatMessage[];
      items?: MedicineItem[];
      address?: string;
      geo?: GeoData | null;
      priority?: Priority;
      stage?: string;
    };

    if (!body.messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // Derive a human title from the first user message (fallback to first message)
    const firstUser = body.messages.find((m) => m.role === "user");
    const title =
      (firstUser?.content ?? body.messages[0]?.content ?? "New chat")
        .slice(0, 60)
        .trim() || "New chat";

    // Strip transient "thinking" bubbles before persisting — they're never
    // meaningful in a restored conversation.
    const cleanMessages = body.messages.filter((m) => m.kind !== "thinking");

    const row = {
      user_id: user.id,
      title,
      messages: cleanMessages,
      items: body.items ?? null,
      address: body.address ?? null,
      geo: body.geo ?? null,
      priority: body.priority ?? null,
      stage: body.stage ?? null,
      updated_at: new Date().toISOString(),
    };

    // Update existing row if id provided, else insert
    if (body.id) {
      const { data, error } = await supabase
        .from("chats")
        .update(row)
        .eq("id", body.id)
        .select("id")
        .single();

      if (error) {
        // Row may not belong to this user (RLS) or may not exist — fall back to insert
        const { data: ins, error: insErr } = await supabase
          .from("chats")
          .insert(row)
          .select("id")
          .single();
        if (insErr) {
          console.error("[chats/save] insert fallback:", insErr.message);
          return NextResponse.json({ error: insErr.message }, { status: 500 });
        }
        return NextResponse.json({ id: ins.id });
      }
      return NextResponse.json({ id: data.id });
    }

    const { data, error } = await supabase
      .from("chats")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("[chats/save] insert:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[chats/save]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
