import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPrescriptionRoutingEmail, AGENTMAIL_ENABLED } from "@/lib/agentmail";

/**
 * POST /api/prescription
 *
 * After a successful payment for a prescription-required product, SaulSilver
 * emails the brand's support with the order ID to trigger the in-house doctor
 * consultation. This is the India-differentiator legal loop.
 *
 * Body:
 *   brandName, productName, orderId, doctorRouting?, brandWebsite?
 *
 * The brand support email is derived from the website domain (most Indian
 * cannabis D2C brands use support@<domain> or hello@<domain>). If we later add
 * a brands.support_email column, we use that instead.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

    const { brandName, productName, orderId, doctorRouting, brandWebsite, phone, hasFile } = (await req.json()) as {
      brandName: string;
      productName: string;
      orderId: string;
      doctorRouting?: string;
      brandWebsite?: string;
      phone?: string;
      hasFile?: boolean;
    };

    // Try to fetch the brand's explicit support email from the database
    let brandSupportEmail = "";
    const slug = brandName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: brand } = await supabase
      .from("brands")
      .select("website, support_email")
      .eq("id", slug)
      .maybeSingle();

    if (brand?.support_email) {
      brandSupportEmail = brand.support_email;
    } else {
      // Fallback to domain guessing if support_email is not yet filled out in Supabase
      const website = brandWebsite ?? brand?.website;
      if (website) {
        const domain = new URL(website).hostname.replace(/^www\./, "");
        brandSupportEmail = `support@${domain}`;
      }
    }

    if (!brandSupportEmail) {
      // Can't route without a domain — log but don't fail the order.
      console.warn("[prescription] no brand support email derivable for", brandName);
      return NextResponse.json({ ok: false, reason: "no_support_email", simulated: true });
    }

    let appendedDoctorRouting = doctorRouting || "";
    if (phone) {
      appendedDoctorRouting = `Please call the customer at ${phone} within 24 hours for a medical consultation.\n\n${appendedDoctorRouting}`;
    }
    if (hasFile) {
      appendedDoctorRouting = `The customer has uploaded a valid medical prescription.\n\n${appendedDoctorRouting}`;
    }

    const result = await sendPrescriptionRoutingEmail({
      brandName,
      brandSupportEmail,
      productName,
      orderId,
      customerEmail: user.email ?? "",
      doctorRouting: appendedDoctorRouting,
    });

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      sentTo: brandSupportEmail,
      agentmail: AGENTMAIL_ENABLED,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[prescription]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
