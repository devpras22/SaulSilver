import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * POST /api/dev-login
 *
 * DEV-ONLY instant login. Bypasses the rate-limited built-in email sender by
 * using the service-role admin API to generate a magic link directly — no email
 * is sent, so the email rate limit can never be tripped.
 *
 * Hard-gated to non-production. The production demo uses real magic links
 * (configure SMTP in Supabase → Authentication → SMTP Settings).
 */
export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: string };
  if (!email?.trim()) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const supabase = createServiceRoleClient();

  // Ensure the user exists (idempotent — ignore "already exists" errors)
  await supabase.auth.admin
    .createUser({ email: email.trim(), email_confirm: true })
    .catch(() => {});

  // Generate a magic link WITHOUT sending an email — admin generateLink is
  // specifically for this. redirectTo flows through our normal /auth/callback,
  // which sets the session cookie and lands the user on /app.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email: email.trim(),
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      { error: error?.message ?? "could not generate link" },
      { status: 500 }
    );
  }

  return NextResponse.json({ actionLink: data.properties.action_link });
}
