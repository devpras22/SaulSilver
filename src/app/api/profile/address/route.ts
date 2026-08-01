import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/profile/address
 *
 * Updates the user's saved default address in auth.users.user_metadata.
 * This is the per-user JSON blob Supabase maintains for each user — no new
 * table needed. RLS on auth.users only allows service-role writes, so we use
 * the admin API.
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

    const { address } = (await req.json()) as { address?: string };
    if (!address?.trim()) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }

    // Use the admin API to update user_metadata — RLS blocks direct updates
    // to auth.users from the anon/session client.
    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, default_address: address.trim() },
    });

    if (error) {
      console.error("[profile/address]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ address: address.trim() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[profile/address]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/profile/address
 *
 * Removes the saved default address (sets it to null). Useful for testing the
 * fresh-account flow without an address on file.
 */
export async function DELETE() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "not authenticated" }, { status: 401 });
    }

    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...user.user_metadata, default_address: null },
    });

    if (error) {
      console.error("[profile/address DELETE]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[profile/address DELETE]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
