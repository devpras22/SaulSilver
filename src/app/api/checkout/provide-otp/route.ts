import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Client → OTP handoff.
 *
 * When the autonomous checkout route hits Shopflo's SMS-OTP gate, it inserts a
 * row into `checkout_otp_handoff` with status `awaiting_otp` and polls it
 * (service-role, bypassing RLS). The chat UI sees that status and renders an
 * OTP input. The user types the code; this endpoint writes it back.
 *
 * The route then picks the code up, injects it into Shopflo's 4 OTP fields,
 * and proceeds to the card step. One long-lived checkout request, paused.
 *
 * Auth: must be the logged-in user. The route tags each row with the
 * purchase_id derived from the active purchase the client already knows.
 */
export async function POST(req: NextRequest) {
  const { purchaseId, otp } = (await req.json()) as { purchaseId: string; otp: string };

  if (!purchaseId || !otp) {
    return NextResponse.json({ error: "purchaseId and otp are required" }, { status: 400 });
  }
  // 4-digit OTP from Shopflo. Strip anything that isn't a digit.
  const cleanOtp = otp.replace(/\D/g, "");
  if (!/^\d{4}$/.test(cleanOtp)) {
    return NextResponse.json({ error: "OTP must be 4 digits" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // NOTE: do NOT use .single() here. If no row matches (the route hasn't
  // written its awaiting_otp row yet, or it was already consumed), .single()
  // throws PGRP116 "Cannot coerce the result to a single JSON object" — which
  // is what surfaced as the cryptic client error. Use .select() + check length.
  const { data, error } = await supabase
    .from("checkout_otp_handoff")
    .update({ otp_value: cleanOtp, status: "provided", provided_at: new Date().toISOString() })
    .eq("purchase_id", purchaseId)
    .eq("status", "awaiting_otp") // can't override an already-provided/consumed row
    .select("purchase_id, status");

  if (error) {
    console.error("[provide-otp] db error:", error.message);
    return NextResponse.json(
      { error: "Couldn't save the OTP. Try again." },
      { status: 500 }
    );
  }

  if (!data || data.length === 0) {
    // No awaiting_otp row. Either the route hasn't reached the OTP gate yet
    // (race — Shopflo still booting) or the OTP was already consumed. Return
    // a specific, retryable signal so the client can decide what to do.
    return NextResponse.json(
      { error: "Checkout isn't waiting for an OTP yet — give it a moment and try again.", retryable: true },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, status: data[0].status });
}
