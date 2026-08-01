/**
 * Auth callback.
 *
 * Two flows can land here:
 *  1. PKCE:       /auth/callback?code=...        → exchange server-side
 *  2. Implicit:   /auth/callback#access_token=... → browser reads fragment
 *
 * KEY: the server NEVER sees URL fragments (browsers strip them). So when
 * there's no `code`, we return a tiny HTML page that reads the fragment
 * client-side and POSTs the tokens to /api/auth/set-session.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const { origin } = url;
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/app";
  const errorParam = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  console.log("[auth/callback]", { code: !!code, errorParam });

  if (errorParam && !code) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorParam)}`);
  }

  // ── PKCE flow ──
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      console.log("[auth/callback] PKCE ok →", next);
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error("[auth/callback] PKCE failed:", error.message);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // ── No code → return bootstrap page. The browser has the tokens in the
  //    fragment (which it didn't send us). Client script reads + posts them.
  console.log("[auth/callback] returning bootstrap page (implicit or empty)");
  return new NextResponse(BOOTSTRAP_HTML(origin, next), {
    headers: { "Content-Type": "text/html" },
  });
}

function BOOTSTRAP_HTML(origin: string, next: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Signing in…</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#050505;color:#f5f5f5;margin:0;">
<div style="text-align:center">
  <div style="font-size:14px;opacity:0.7;color:#9b8f2d">Saul Silver</div>
  <div style="margin-top:8px;font-size:18px">Signing you in…</div>
</div>
<script>
  (async () => {
    try {
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const error = params.get("error_description") || params.get("error");

      if (error) throw new Error(error);
      if (!accessToken || !refreshToken) throw new Error("no session tokens");

      const res = await fetch("${origin}/api/auth/set-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, refreshToken }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      window.location.replace("${next}");
    } catch (e) {
      window.location.replace("/login?error=" + encodeURIComponent(e.message));
    }
  })();
</script>
</body>
</html>`;
}
