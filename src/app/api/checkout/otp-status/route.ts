import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Client polls this while the checkout route is mid-flight. Returns the
 * OTP handoff row for the active purchaseId so the UI can surface the OTP
 * input the moment the agent hits Shopflo's gate.
 */
export async function GET(req: NextRequest) {
  const purchaseId = req.nextUrl.searchParams.get("purchaseId");
  if (!purchaseId) {
    return NextResponse.json({ error: "purchaseId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("checkout_otp_handoff")
    .select("status, phone_masked, step, status_message")
    .eq("purchase_id", purchaseId)
    .single();

  if (error) {
    // No row yet — the route hasn't reached the OTP step (or won't).
    return NextResponse.json({ status: "pending" });
  }

  return NextResponse.json(data);
}
