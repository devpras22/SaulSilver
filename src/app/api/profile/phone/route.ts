import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Save the user's phone number to user_metadata.
 *
 * Used by Saul when the user reaches checkout but has no phone on file —
 * Shopflo (the Indian checkout) sends a real SMS OTP to this number. We store
 * it once so the user is never asked again.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    const { phone } = (await req.json()) as { phone: string };
    if (!phone?.trim()) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }
    // Normalize: strip non-digits, keep it simple. Shopflo prepends +91.
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      return NextResponse.json({ error: "that doesn't look like a valid phone number" }, { status: 400 });
    }

    // Store as user_metadata ONLY — not the auth `phone` field. The auth
    // `phone` field enrolls phone-OTP auth (sends a verification code), which
    // we don't want; we just need a stored contact number for Shopflo's SMS.
    const { error } = await supabase.auth.updateUser({
      data: { ...user.user_metadata, phone: cleanPhone },
    });

    if (error) {
      const msg = error.message || JSON.stringify(error) || "unknown error";
      console.error("[profile/phone] updateUser error:", msg);
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    return NextResponse.json({ ok: true, phone: cleanPhone });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save phone";
    console.error("[profile/phone] exception:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
