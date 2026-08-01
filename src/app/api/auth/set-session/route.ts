import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/set-session
 *
 * Takes access/refresh tokens from the implicit auth flow (which the server
 * can't read from the URL fragment) and establishes the session cookie
 * server-side using @supabase/ssr's setSession.
 */
export async function POST(req: NextRequest) {
  try {
    const { accessToken, refreshToken } = (await req.json()) as {
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: string;
      tokenType?: string;
    };

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: "tokens required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error("[set-session]", error.message);
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    console.log("[set-session] ok for user:", data.user?.email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[set-session]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
