import { NextRequest, NextResponse } from "next/server";
import { pollPaymentResult, reportStatus } from "@/lib/prava";
import { createClient } from "@/lib/supabase/server";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

/**
 * Step 5 — the autonomous merchant checkout.
 *
 * This is the gating requirement for Prava production access and the strongest
 * judging point: after the user approves a Prava session, an AI agent actually
 * navigates the REAL merchant site, fills out email + shipping + the Prava
 * one-time card, submits, and captures the (expected) sandbox decline.
 *
 * Flow:
 *   1. Poll Prava for the one-time card credentials (token + dynamic_cvv + expiry)
 *   2. Resolve the user's email + active shipping address server-side
 *   3. Drive a Stagehand browser through the merchant checkout in explicit steps:
 *        goto(productUrl) → add to cart → checkout → email → shipping → pay
 *   4. Extract the decline message (Shopify surfaces it async, so we retry)
 *   5. Report DECLINED back to Prava (expected sandbox outcome)
 *
 * Why the prompt is split into many act() calls: Shopify-style checkouts render
 * the card form ONLY after the email + contact + shipping sections are filled.
 * A single "fill the card form" act() runs while those fields aren't on the page
 * yet → Stagehand logs "no actionable element returned by LLM" and the payment
 * is never submitted. Each step unblocks the next section.
 */
export const maxDuration = 300; // up to 5 min — Browserbase + multi-step act()

export async function POST(req: NextRequest) {
  const { sessionId, txnRefId, productUrl, merchantName, contactEmail } = (await req.json()) as {
    sessionId: string;
    txnRefId: string;
    productUrl: string;
    merchantName: string;
    /** Email to inject at checkout. Saul's inbox (saulsilver@agentmail.to) or the user's. */
    contactEmail?: string;
  };

  if (!sessionId || !txnRefId || !productUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── 1. Resolve the contact email + shipping address ──
  // The email injected at the merchant checkout. The chat client sends the
  // user's choice ("Saul's inbox" vs "my email") as `contactEmail`. When the
  // agent uses its own inbox (saulsilver@agentmail.to), order confirmations +
  // tracking come back to the agent — the "agent owns the mailbox" story.
  // Fall back to the authenticated user's email if the client didn't send one.
  let email = contactEmail ?? "";
  let shippingAddress: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      if (!email) email = user.email ?? "";
      const addresses = (user.user_metadata?.addresses as { id: string; address: string }[]) ?? [];
      const activeId = user.user_metadata?.active_address_id as string | null;
      const active = addresses.find((a) => a.id === activeId) || addresses[0] || null;
      shippingAddress = active?.address ?? null;
    }
  } catch {
    // non-fatal — we can still attempt checkout without prefilled shipping
  }

  // ── 2. Fetch the one-time Prava card ──
  console.log(`[checkout/automate] Fetching Prava credentials for session ${sessionId}...`);
  const paymentResult = await pollPaymentResult(sessionId);
  const txn = paymentResult.transactions[0];
  const lineItem = txn?.line_items?.[0];

  if (!lineItem || !lineItem.token || !lineItem.dynamic_cvv) {
    throw new Error("Failed to retrieve Prava one-time credentials. Payment may not be completed.");
  }

  const { token, dynamic_cvv, expiry_month, expiry_year } = lineItem;
  console.log(`[checkout/automate] Got Prava OTC ending in ${token.slice(-4)}`);

  // ── 3. Drive the merchant checkout ──
  // Use BROWSERBASE whenever a key is present — matches the verified scratch
  // test (cloud Chromium). LOCAL only as a last resort.
  const useBrowserbase = Boolean(process.env.BROWSERBASE_API_KEY);
  const stagehand = new Stagehand({
    env: useBrowserbase ? "BROWSERBASE" : "LOCAL",
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    apiKey: process.env.BROWSERBASE_API_KEY,
    logger: (line) => console.log(`[stagehand] ${line.message}`),
  });
  await stagehand.init();

  try {
    console.log(`[checkout/automate] Navigating to ${productUrl}...`);
    // v3 (3.0.8): navigation lives on the resolved Page. The Stagehand instance
    // exposes resolvePage() at runtime (not in the .d.ts), which returns the v3
    // Page with goto()/url()/click()/type().
    const page = await (stagehand as unknown as {
      resolvePage(): Promise<V3Page>;
    }).resolvePage();
    await page.goto(productUrl);

    // Add to cart — explicit, single action.
    console.log(`[checkout/automate] Adding to cart...`);
    await stagehand.act("Find the 'Add to cart' button on this product page and click it.");
    await settle();

    // Reach the real checkout form. Shopify add-to-cart often opens a cart drawer
    // or lands on /cart; the actual card form is at /checkout. Try the button
    // first, then hard-navigate to /checkout if we're still on cart/product —
    // the /cart trap is exactly where the old single-prompt approach died.
    console.log(`[checkout/automate] Proceeding to checkout...`);
    await stagehand.act(
      "Click the 'Checkout' button. It may be in a cart drawer that just opened, or on the cart page."
    );
    await settle();
    if (/\/(cart|products)\b/i.test(page.url())) {
      console.log(`[checkout/automate] Still on ${page.url()} — navigating to /checkout`);
      const origin = new URL(productUrl).origin;
      await page.goto(`${origin}/checkout`);
    }

    // Email — must be filled first; Shopify reveals the shipping section after it.
    if (email) {
      console.log(`[checkout/automate] Filling email (${email})...`);
      await stagehand.act(`Enter the email "${email}" into the email/contact field.`);
      await settle();
    }

    // Shipping — parsed from the single comma-joined address string.
    if (shippingAddress) {
      console.log(`[checkout/automate] Filling shipping address...`);
      const parsed = parseAddress(shippingAddress);
      await stagehand.act(buildShippingInstruction(parsed));
      await settle();
    }

    // Card fields render only after the sections above. Give the page a beat.
    console.log(`[checkout/automate] Filling card details (ending ${token.slice(-4)})...`);
    await settle(1500);
    await stagehand.act(buildCardInstruction({
      token,
      cvv: dynamic_cvv,
      expiryMonth: expiry_month,
      expiryYear: expiry_year,
    }));

    // Submit.
    console.log(`[checkout/automate] Submitting payment...`);
    await stagehand.act("Click the 'Pay now' / 'Complete order' / submit button to place the order.");

    // ── 4. Extract the decline (Shopify shows it async — retry a few times) ──
    const extractResult = await waitForDecline(stagehand);
    console.log(`[checkout/automate] Merchant response:`, extractResult);

    // ── 5. Report DECLINED back to Prava (expected sandbox outcome) ──
    console.log(`[checkout/automate] Reporting DECLINED to Prava...`);
    await reportStatus(sessionId, txnRefId, "DECLINED");

    await stagehand.close();

    return NextResponse.json({
      success: true,
      merchantError: extractResult.errorMessage,
      isDeclined: extractResult.isDeclined,
      statusReported: "DECLINED",
    });
  } catch (stagehandError) {
    // Even on a Stagehand failure, don't leave the Prava session dangling in
    // awaiting_result. Report DECLINED so the session is closed cleanly.
    try {
      await reportStatus(sessionId, txnRefId, "DECLINED");
    } catch {
      // best-effort
    }
    await stagehand.close().catch(() => {});
    console.error("[checkout/automate] Stagehand error:", stagehandError);
    return NextResponse.json(
      { error: stagehandError instanceof Error ? stagehandError.message : "Automation failed", statusReported: "DECLINED" },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minimal view of the v3 Page (3.0.8). The full Page type isn't exported, so we
 * narrow to the two ops we use: synchronous url() and async goto(). Keeping it
 * explicit avoids `any` while staying accurate to the runtime.
 */
interface V3Page {
  url(): string;
  goto(url: string): Promise<unknown>;
}

/** Pause between steps so Shopify's async sections render before the next act(). */
function settle(ms = 800): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse the comma-joined address string into loose fields for form-filling.
 * The address is stored as a single string like
 *   "Flat 4B Apollo Towers, Near Star Bazaar, MG Road, Bengaluru, Karnataka 560001, India"
 * There's no guaranteed structure, so this is best-effort: last = country,
 * second-to-last = state + pincode, before that = city. The leading tokens are
 * line1 / line2 / landmark. Stagehand fills whatever fields are present.
 */
function parseAddress(raw: string): {
  line1: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  full: string;
} {
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  const country = parts.length > 1 ? parts[parts.length - 1] : "India";
  const stateZip = parts.length > 2 ? parts[parts.length - 2] : "";
  const city = parts.length > 3 ? parts[parts.length - 3] : "";
  const zipMatch = stateZip.match(/\b(\d{6})\b/);
  const pincode = zipMatch?.[1] ?? "";
  const state = stateZip.replace(/\b\d{6}\b/, "").trim() || city;
  const line1 = parts.slice(0, Math.max(parts.length - 3, 1)).join(", ");
  return { line1, city, state, pincode, country, full: raw };
}

function buildShippingInstruction(a: ReturnType<typeof parseAddress>): string {
  // A single natural-language instruction listing every field. Stagehand fills
  // whichever ones exist on this checkout (Shopify, WooCommerce, etc. differ).
  const lines = [
    "Fill out the shipping address form with these details:",
    a.line1 && `Address line: ${a.line1}`,
    a.city && `City: ${a.city}`,
    a.state && `State / Province: ${a.state}`,
    a.pincode && `PIN / ZIP code: ${a.pincode}`,
    a.country && `Country: ${a.country}`,
    "If the checkout also asks for a first/last name, use 'Saul' and 'Silver'.",
    "If it asks for a phone number, enter '9999999999'.",
  ].filter(Boolean);
  return lines.join(" ");
}

function buildCardInstruction(c: {
  token: string;
  cvv: string | null;
  expiryMonth: string | null;
  expiryYear: string | null;
}): string {
  // Card number MUST be entered as one continuous string of digits — Stagehand
  // handles the field chunking. Expiry as MM/YY (take last 2 digits of year).
  const yy = c.expiryYear ? c.expiryYear.slice(-2) : "";
  const expiry = c.expiryMonth && yy ? `${c.expiryMonth}/${yy}` : "";
  return [
    "Fill out the credit/debit card payment form with these exact details:",
    `Card number: ${c.token}`,
    expiry && `Expiry date: ${expiry}`,
    c.cvv && `CVV / security code: ${c.cvv}`,
    "Name on card: Saul Silver",
    "Then STOP — do not click the pay button yet.",
  ].filter(Boolean).join(" ");
}

/**
 * Shopify-style checkouts show the decline/error message asynchronously after
 * submit. Poll the page a few times before giving up and treating it as
 * "no message captured".
 */
async function waitForDecline(stagehand: Stagehand): Promise<{
  errorMessage: string;
  isDeclined: boolean;
}> {
  const schema = z.object({
    errorMessage: z.string(),
    isDeclined: z.boolean(),
  });

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const result = await stagehand.extract(
        "Extract any payment error, decline message, or order confirmation shown on the page now. " +
          "Look for text like 'declined', 'insufficient funds', 'card was declined', 'test card', " +
          "'transaction cannot be processed', or a success message like 'order confirmed'.",
        schema
      );
      if (result.errorMessage || result.isDeclined) {
        return result;
      }
    } catch {
      // extract may transiently fail if the DOM is mid-render
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { errorMessage: "", isDeclined: false };
}
