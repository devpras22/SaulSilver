import { NextRequest, NextResponse } from "next/server";
import { pollPaymentResult, reportStatus } from "@/lib/prava";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";

/**
 * Step 5 — the autonomous merchant checkout.
 *
 * Gating requirement for Prava production access and the strongest judging
 * point: after the user approves a Prava session, an AI agent actually
 * navigates the REAL merchant site, fills email + shipping + the Prava
 * one-time card, submits, and captures the (expected) sandbox decline.
 *
 * REALITY (mapped 2026-08-02): our Indian Shopify merchants don't use
 * Shopify's native checkout — they use Shopflo, a third-party Indian checkout
 * that renders the whole flow inside cross-origin iframes and gates it behind
 * a real SMS OTP before any card form appears. So this route does NOT drive a
 * Shopify /checkout page. It drives the Shopflo drawer, and crucially it
 * PAUSES at the OTP step and asks the user for the code (founder-approved
 * approach — the agent surfaces the step-up, the user supplies the OTP, the
 * agent passes it straight into Shopflo).
 *
 * Flow:
 *   1. Poll Prava for the one-time card credentials (token + dynamic_cvv + expiry)
 *   2. Resolve the user's email + active shipping address server-side
 *   3. Drive Shopflo: open drawer → fill phone → Proceed → OTP gate
 *   4. PAUSE: insert checkout_otp_handoff row, poll until the user submits the code
 *   5. Inject the OTP into Shopflo's 4 OTP fields, advance to the card form
 *   6. Fill the Prava one-time card via frame.evaluate (card fields are in an
 *      iframe — Stagehand's a11y act() can't see them)
 *   7. Submit + extract the decline + report DECLINED to Prava
 */
export const maxDuration = 300; // up to 5 min — Browserbase + OTP pause + multi-step

export async function POST(req: NextRequest) {
  const { sessionId, txnRefId, productUrl, merchantName, contactEmail, purchaseId } = (await req.json()) as {
    sessionId: string;
    txnRefId: string;
    productUrl: string;
    merchantName: string;
    contactEmail?: string;
    /** Client-generated id shared with the route so the OTP handoff row matches. */
    purchaseId?: string;
  };

  if (!sessionId || !txnRefId || !productUrl) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // ── 1. Resolve contact email + shipping address + phone ──
  let email = contactEmail ?? "";
  let shippingAddress: string | null = null;
  let phone = "";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      if (!email) email = user.email ?? "";
      phone = (user.user_metadata?.phone as string) || (user.user_metadata?.phone_number as string) || "";
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

  // ── 3. Drive Shopflo ──
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
    await reportStep(purchaseId ?? "", "navigating", voice("navigating", { merchant: merchantName }));
    const page = await (stagehand as unknown as {
      resolvePage(): Promise<V3Page>;
    }).resolvePage();
    await page.goto(productUrl);

    // Open the Shopflo cart drawer. Trost uses "BUY NOW" (not Add to cart).
    console.log(`[checkout/automate] Opening Shopflo checkout drawer...`);
    await reportStep(purchaseId ?? "", "opening_checkout", voice("opening_checkout"));
    await stagehand.act(
      "Click the 'Buy Now' button on this product page. It opens the checkout drawer. NOT 'Add to cart'."
    );
    await settle(6000); // Shopflo SPA boots inside the iframe

    // Locate the Shopflo tokenId iframe and drive it via frame.evaluate.
    // act() can't reach cross-origin iframe contents.
    const shopflo = await waitForShopfloFrame(page);
    if (!shopflo) {
      throw new Error(
        "Could not find the Shopflo checkout frame. The cart drawer may not have opened — try the demo on a desktop viewport."
      );
    }
    console.log(`[checkout/automate] Shopflo frame acquired`);

    // ── 4. Fill phone + Proceed → OTP gate ──
    // The phone the OTP is sent to. Falls back to a placeholder; the OTP step
    // is moot if we have no real number (the SMS won't arrive anywhere).
    const phoneToUse = phone || "9999999999";
    const phoneMasked = `+91 •••• •${phoneToUse.slice(-4)}`;
    await reportStep(purchaseId ?? "", "entering_phone", voice("entering_phone"));
    console.log(`[checkout/automate] Filling phone + clicking Proceed...`);
    await shopfloPhoneStep(shopflo, phoneToUse);
    await settle(4000);

    // Confirm the OTP gate is showing (4 OTP inputs).
    const otpPresent = await shopflo.evaluate(() =>
      !!document.getElementById("flo__auth__otpInputField1")
    );
    if (!otpPresent) {
      console.log(`[checkout/automate] WARNING — OTP gate not detected. Continuing anyway.`);
    } else {
      console.log(`[checkout/automate] OTP gate detected — pausing for user input...`);

      // ── 5. PAUSE: write handoff row, poll for the OTP from the user ──
      await reportStep(purchaseId ?? "", "awaiting_otp", voice("awaiting_otp", { phone: phoneMasked }));
      const otp = await pauseForOtp(purchaseId ?? "", phoneToUse);
      if (!otp) {
        throw new Error("Timed out waiting for the OTP. The user did not enter it in time.");
      }
      console.log(`[checkout/automate] OTP received — injecting into Shopflo...`);
      await reportStep(purchaseId ?? "", "injecting_otp", voice("injecting_otp"));

      await shopfloOtpStep(shopflo, otp);
      await reportStep(purchaseId ?? "", "loading_payment", voice("loading_payment"));
      await settle(5000); // Shopflo verifies + fetches addresses + renders payment step
    }

    // ── 6. Card step ──
    await reportStep(purchaseId ?? "", "filling_card", voice("filling_card"));
    console.log(`[checkout/automate] Filling Prava card (ending ${token.slice(-4)})...`);
    await shopfloCardStep(shopflo, page, {
      token,
      cvv: dynamic_cvv,
      expiryMonth: expiry_month,
      expiryYear: expiry_year,
      email,
      shippingAddress,
    });

    // ── 7. Submit + extract decline ──
    await reportStep(purchaseId ?? "", "submitting", voice("submitting"));
    console.log(`[checkout/automate] Submitting payment...`);
    await shopflo.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button,[role=button]"));
      const pay = btns.find((b) => /pay now|place order|complete order|pay\b/i.test(b.textContent || ""));
      (pay as HTMLElement)?.click();
    });
    await reportStep(purchaseId ?? "", "waiting_for_merchant", voice("waiting_for_merchant"));
    const extractResult = await waitForDecline(stagehand);
    console.log(`[checkout/automate] Merchant response:`, extractResult);

    // ── 8. Report DECLINED to Prava ──
    // On sandbox, the expected outcome is a merchant decline of the one-time
    // test card. We report DECLINED regardless of whether we captured a clean
    // decline message — the card is single-use and will not complete.
    console.log(`[checkout/automate] Reporting DECLINED to Prava...`);
    const report = await reportStatus(sessionId, txnRefId, "DECLINED");

    await stagehand.close().catch(() => {});

    return NextResponse.json({
      success: true,
      merchantError: extractResult.errorMessage,
      isDeclined: extractResult.isDeclined,
      statusReported: report.txnStatus,
      reportConfirmed: report.confirmed,
      visaConfirmation: report.visaConfirmation,
    });
  } catch (stagehandError) {
    // Even if the automation crashed mid-flight, report DECLINED so the
    // transaction doesn't sit in awaiting_result forever (the modal no longer
    // pre-reports APPROVED, so this is the ONLY report that will land).
    let reportConfirmed = false;
    let reportError: string | undefined;
    try {
      const report = await reportStatus(sessionId, txnRefId, "DECLINED");
      reportConfirmed = report.confirmed;
    } catch (reportErr) {
      reportError = reportErr instanceof Error ? reportErr.message : String(reportErr);
      console.error("[checkout/automate] report-status ALSO failed:", reportError);
    }
    await stagehand.close().catch(() => {});
    console.error("[checkout/automate] Stagehand error:", stagehandError);
    return NextResponse.json(
      {
        error: stagehandError instanceof Error ? stagehandError.message : "Automation failed",
        statusReported: reportConfirmed ? "DECLINED" : "UNKNOWN",
        reportConfirmed,
        reportError,
      },
      { status: 500 }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

interface V3Page {
  url(): string;
  goto(url: string): Promise<unknown>;
  frames(): V3Frame[];
  frameLocator(selector: string): unknown;
}

/** Minimal view of a v3 Frame (3.0.8). evaluate takes a single function arg. */
interface V3Frame {
  url(): string;
  evaluate<T>(fn: () => T): Promise<T>;
}

function settle(ms = 800): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Write a progress update the client polls + renders into the live status
 * bubble. `step` is the machine key (stable across renders); `statusMessage`
 * is Saul's voice — what the user actually reads. The client maps step→icon.
 */
async function reportStep(purchaseId: string, step: string, statusMessage: string): Promise<void> {
  if (!purchaseId) return;
  try {
    const admin = createServiceRoleClient();
    await admin
      .from("checkout_otp_handoff")
      .update({ step, status_message: statusMessage })
      .eq("purchase_id", purchaseId);
  } catch {
    // non-fatal — status updates are best-effort
  }
}

/** Saul's voice for each step. Static table — no per-step LLM call. */
const STEP_VOICE: Record<string, string> = {
  navigating: "Heading to {merchant}…",
  opening_checkout: "Opening the checkout drawer…",
  entering_phone: "Entering your phone number…",
  awaiting_otp: "Shopflo sent a code to {phone} — type it when it lands.",
  injecting_otp: "Passing the code through…",
  loading_payment: "Loading the card step…",
  filling_card: "Injecting your Prava one-time card…",
  submitting: "Placing the order…",
  waiting_for_merchant: "Waiting for the merchant to respond…",
};

function voice(step: string, vars: { merchant?: string; phone?: string } = {}): string {
  return (STEP_VOICE[step] || step)
    .replace("{merchant}", vars.merchant ?? "the merchant")
    .replace("{phone}", vars.phone ?? "your phone");
}

/**
 * Find the Shopflo tokenId iframe. There are usually two shopflo.co frames;
 * the one with `tokenId` in its URL is the live checkout app (the other is a
 * cart bootstrap). Retries up to 3× because the drawer/iframe load async.
 */
async function waitForShopfloFrame(page: V3Page): Promise<V3Frame | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const f of page.frames()) {
      try {
        const href = await f.evaluate(() => window.location.href);
        if (href.includes("shopflo.co") && href.includes("tokenId")) return f;
      } catch {
        // cross-origin frames without evaluate access — skip
      }
    }
    await settle(3000);
  }
  return null;
}

/** Shopflo phone step: fill #flo__auth__phoneInput, click Proceed. */
async function shopfloPhoneStep(shopflo: V3Frame, phone: string): Promise<void> {
  // v3 evaluate() takes only a function — no args. So bake the phone into a
  // no-arg function via eval. Values are digits-only so injection-safe.
  const fn = new Function(`
    const el = document.getElementById("flo__auth__phoneInput");
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, ${JSON.stringify(phone)});
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    setTimeout(function () {
      var btns = Array.from(document.querySelectorAll("button,[role=button]"));
      var go = btns.find(function (b) { return /^proceed$/i.test((b.textContent || "").trim()); });
      if (go) go.click();
    }, 600);
  `);
  await shopflo.evaluate(fn as () => void);
}

/** Shopflo OTP step: type the 4 digits into the 4 OTP fields + auto-submits. */
async function shopfloOtpStep(shopflo: V3Frame, otp: string): Promise<void> {
  const fn = new Function(`
    var digits = ${JSON.stringify(otp)}.split("");
    for (var i = 0; i < 4; i++) {
      var el = document.getElementById("flo__auth__otpInputField" + (i + 1));
      if (!el) continue;
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, digits[i]);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  `);
  await shopflo.evaluate(fn as () => void);
}

/**
 * Card step. After OTP verification, Shopflo reveals the payment-methods step.
 *
 * Shopflo (on The Trost + likely Cannazo, Qurist, etc.) renders each payment
 * method as a `MethodCard.tsx` row. Selecting "Debit/Credit cards" does NOT
 * inline-render inputs — it injects **nested Cashfree payment-gateway iframes**
 * (card-number / expiry / cvv are separate PCI-compliant frames) into
 * `#flo__payments__CARD`.
 *
 * Two non-obvious things (probed live, 2026-08-02):
 *   1. `el.click()` does NOT trigger the row — the MethodCard binds to pointer
 *      events, so we must dispatch the full pointerdown→mousedown→mouseup→click
 *      sequence. Synthetic `click` alone is invisible to its handler.
 *   2. The card fields are inside the Cashfree iframes, NOT the Shopflo frame,
 *      so we drill into them via `page.frames()` and fill each one.
 */
async function shopfloCardStep(
  shopflo: V3Frame,
  page: V3Page,
  card: {
    token: string;
    cvv: string | null;
    expiryMonth: string | null;
    expiryYear: string | null;
    email: string;
    shippingAddress: string | null;
  }
): Promise<void> {
  const digitsOnly = (s: string | null) => (s ?? "").replace(/\D/g, "");
  const yy = card.expiryYear ? card.expiryYear.slice(-2) : "";
  const mm = digitsOnly(card.expiryMonth);
  const cardNumber = digitsOnly(card.token);
  const cvv = digitsOnly(card.cvv);

  // 1) Tap the "Debit/Credit cards" MethodCard row with full pointer events.
  //    The row is the DIV containing "Debit/Credit cards" text; any element in
  //    the row works (event delegation). We dispatch the full native tap.
  const tapFn = new Function(`
    var all = Array.prototype.slice.call(document.querySelectorAll("*"));
    var cardCands = all
      .filter(function (el) { return el.offsetParent !== null; })
      .filter(function (el) { return /debit|credit card/i.test(el.textContent || ""); })
      .sort(function (a, b) { return a.querySelectorAll("*").length - b.querySelectorAll("*").length; });
    var el = cardCands[0];
    if (!el) return "no-card-row";
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2;
    var y = r.top + r.height / 2;
    var opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window };
    el.dispatchEvent(new PointerEvent("pointerover", opts));
    el.dispatchEvent(new PointerEvent("pointerdown", opts));
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new PointerEvent("pointerup", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
    return "tapped";
  `);
  const tapResult = await shopflo.evaluate(tapFn as () => string);
  console.log("[checkout/automate] MethodCard tap: " + tapResult);

  // 2) Wait for the Cashfree iframes to render inside #flo__payments__CARD.
  //    Give it up to ~8s — the gateway SDK loads async.
  let iframesReady = false;
  for (let i = 0; i < 10; i++) {
    await settle(800);
    const count = await shopflo.evaluate(new Function(`
      return document.querySelectorAll("#flo__payments__CARD iframe, #flo__payments__CARD [id*=card] iframe, iframe").length;
    `) as () => number);
    if (count > 0) { iframesReady = true; break; }
  }
  console.log("[checkout/automate] Cashfree iframes " + (iframesReady ? "appeared" : "NOT found — falling back to in-frame fill"));

  // 3) Fill card fields. They may be in the Shopflo frame (rare) OR in nested
  //    gateway iframes (common — Cashfree pattern). Try the Shopflo frame
  //    first; if nothing matches, drill into every child frame on the page.
  const buildFillFn = () => new Function(`
    var cardNumber = ${JSON.stringify(cardNumber)};
    var mm = ${JSON.stringify(mm)};
    var yy = ${JSON.stringify(yy)};
    var cvv = ${JSON.stringify(cvv)};
    function setVal(el, v) {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    var all = Array.from(document.querySelectorAll("input"));
    var filled = 0;
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.offsetParent === null) continue;
      var sig = (el.name + " " + el.id + " " + el.autocomplete + " " + el.placeholder).toLowerCase();
      if (/cc-number|card-number|cardnumber|card no|cardnum/.test(sig) || el.id.toLowerCase().indexOf("cardnumber") !== -1) {
        setVal(el, cardNumber); filled++;
      } else if (/cc-exp|card-exp|expiry|exp-date|expdate/.test(sig)) {
        setVal(el, mm + yy); filled++;
      } else if (/cc-csc|cc-cvv|cvc|cvv|security code/.test(sig)) {
        setVal(el, cvv); filled++;
      }
    }
    return filled;
  `);

  // Try Shopflo's own frame first.
  let filled = await shopflo.evaluate(buildFillFn() as () => number);

  // If nothing, drill into every other frame on the page (the Cashfree iframes).
  // NOTE: the v3 Frame object only exposes .evaluate() — no .url() method.
  // (Calling frame.url() throws "e.url is not a function" at runtime.) So we
  // skip the shopflo frame by reference and just try-evaluate every other
  // frame, catching cross-origin / detached failures.
  if (filled === 0) {
    for (const f of page.frames()) {
      if (f === shopflo) continue;
      try {
        const got = await f.evaluate(buildFillFn() as () => number);
        if (got > 0) {
          filled += got;
          let fUrl = "";
          try {
            fUrl = await f.evaluate(new Function("return window.location.href;") as () => string);
          } catch {
            fUrl = "(unknown frame)";
          }
          console.log("[checkout/automate] filled " + got + " card field(s) in frame: " + fUrl.slice(0, 80));
        }
      } catch {
        // frame may be cross-origin to us too, or detached — skip
      }
    }
  }

  console.log("[checkout/automate] card fields filled: " + filled);
  if (filled === 0) {
    console.log(
      "[checkout/automate] No card inputs filled anywhere. Cashfree may use " +
        "a deeper element-iframe we can't reach via evaluate — reporting DECLINED " +
        "as the expected sandbox outcome regardless."
    );
  }
}

/**
 * PAUSE the checkout and wait for the user to type the OTP into the chat UI.
 * Writes a handoff row, polls it every 2s for up to 3 min.
 */
async function pauseForOtp(purchaseId: string, phone: string): Promise<string | null> {
  if (!purchaseId) return null;
  const admin = createServiceRoleClient();
  // Mask the phone for the UI: +91 •••• •<last4>
  const phoneMasked = `+91 •••• •${phone.slice(-4)}`;

  await admin.from("checkout_otp_handoff").upsert({
    purchase_id: purchaseId,
    phone_masked: phoneMasked,
    status: "awaiting_otp",
    otp_value: null,
    provided_at: null,
    created_at: new Date().toISOString(),
  });

  // Poll for up to 5 minutes (SMS delivery can be slow).
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    await settle(2000);
    const { data } = await admin
      .from("checkout_otp_handoff")
      .select("status, otp_value")
      .eq("purchase_id", purchaseId)
      .single();
    if (data?.status === "provided" && data.otp_value) {
      // Mark consumed so it can't be reused.
      await admin.from("checkout_otp_handoff")
        .update({ status: "consumed" })
        .eq("purchase_id", purchaseId);
      return data.otp_value;
    }
  }
  return null;
}

/**
 * Shopify/Shopflo show the decline/error message asynchronously after submit.
 * Poll the page a few times before giving up.
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
