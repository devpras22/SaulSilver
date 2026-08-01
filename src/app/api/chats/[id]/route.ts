import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * DELETE /api/chats/[id]
 *
 * Deletes a chat by id. RLS enforces ownership — the delete policy requires
 * auth.uid() = user_id, so a user can only delete their own chats.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "not authenticated" }, { status: 401 });
    }

    const { error } = await supabase.from("chats").delete().eq("id", id);

    if (error) {
      console.error("[chats/delete]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[chats/delete]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/chats/[id]
 *
 * Fetches a single chat by id (for loading a historical chat back into the app).
 * RLS enforces ownership.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("chats")
      .select("id, title, messages, items, address, geo, priority, stage, created_at, updated_at")
      .eq("id", id)
      .single();

    if (error) {
      console.error("[chats/get]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[chats/get]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
