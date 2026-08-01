import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { MedicineItem, Priority, PharmacyQuote, Recommendation } from "@/lib/types";
import type { GeoData } from "@/components/location-verified";
import type { CallTranscript } from "@/lib/call-simulator";

/**
 * POST /api/orders/save
 *
 * Persists a completed procurement as a row in `orders`. Uses the user's
 * session cookie (RLS applies — the insert policy requires user_id = auth.uid()).
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
      items: MedicineItem[];
      address: string;
      geo?: GeoData;
      priority: Priority;
      quote: PharmacyQuote;
      recommendation?: Recommendation;
      calls?: CallTranscript[];
      pravaSessionId?: string;
      pravaTxnRef?: string;
      paymentMode: "demo" | "live";
      status: "completed" | "declined" | "failed";
    };

    const { quote } = body;
    if (!quote?.pharmacyName || !quote?.total) {
      return NextResponse.json({ error: "quote required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        user_email: user.email,
        items: body.items,
        address: body.address,
        geo: body.geo ? { formatted: body.geo.formatted, lat: body.geo.lat, lng: body.geo.lng } : null,
        priority: body.priority,
        chosen_pharmacy: quote.pharmacyName,
        total: quote.total,
        delivery_eta: quote.deliveryEtaMinutes,
        prava_session_id: body.pravaSessionId ?? null,
        prava_txn_ref: body.pravaTxnRef ?? null,
        payment_mode: body.paymentMode,
        status: body.status,
        recommendation: body.recommendation ?? null,
        calls: body.calls ?? null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[orders/save]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[orders/save]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
