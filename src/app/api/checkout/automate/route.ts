import { NextRequest, NextResponse } from "next/server";
import { pollPaymentResult, reportStatus } from "@/lib/prava";
import { Stagehand } from "@browserbasehq/stagehand";

export const maxDuration = 300; // Allow up to 5 minutes for the Stagehand automation

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, txnRefId, productUrl, merchantName } = body;

    if (!sessionId || !txnRefId || !productUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch the one-time Prava card details
    console.log(`[checkout/automate] Fetching Prava credentials for session ${sessionId}...`);
    const paymentResult = await pollPaymentResult(sessionId);
    
    const txn = paymentResult.transactions[0];
    const lineItem = txn?.line_items?.[0];
    
    if (!lineItem || !lineItem.token || !lineItem.dynamic_cvv) {
      throw new Error("Failed to retrieve Prava one-time credentials. Payment may not be completed.");
    }

    const { token, dynamic_cvv, expiry_month, expiry_year } = lineItem;
    console.log(`[checkout/automate] Successfully retrieved Prava OTC ending in ${token.slice(-4)}`);

    // 2. Initialize Stagehand for the headless checkout
    console.log(`[checkout/automate] Initializing Stagehand for ${merchantName}...`);
    const stagehand = new Stagehand({
      env: "LOCAL", // Use local Playwright instance
      enableCaching: false,
    });
    await stagehand.init();

    try {
      // 3. Navigate to the specific product URL
      console.log(`[checkout/automate] Navigating to ${productUrl}...`);
      await stagehand.page.goto(productUrl);

      // 4. Add to Cart & Go to Checkout
      console.log(`[checkout/automate] Adding to cart and proceeding to checkout...`);
      await stagehand.page.act("Add the product to cart and proceed to the checkout page.");

      // 5. Fill out payment details
      console.log(`[checkout/automate] Injecting Prava OTC into payment form...`);
      await stagehand.page.act(`
        Fill out the credit card payment form using these details:
        Card Number: ${token}
        CVV: ${dynamic_cvv}
        Expiry: ${expiry_month}/${expiry_year}
        Submit the payment.
      `);

      // 6. Wait for and detect the decline
      console.log(`[checkout/automate] Waiting for merchant decline...`);
      const extractResult = await stagehand.page.extract({
        instruction: "Extract the payment error or decline message shown on the page after submitting the card.",
        schema: {
          errorMessage: "string",
          isDeclined: "boolean"
        }
      });
      
      console.log(`[checkout/automate] Merchant response:`, extractResult);

      // 7. Report the DECLINED status back to Prava
      console.log(`[checkout/automate] Reporting DECLINED status back to Prava...`);
      await reportStatus(sessionId, txnRefId, "DECLINED");

      await stagehand.close();

      return NextResponse.json({ 
        success: true, 
        merchantError: extractResult.errorMessage,
        statusReported: "DECLINED"
      });

    } catch (stagehandError) {
      await stagehand.close();
      throw stagehandError;
    }

  } catch (error) {
    console.error("[checkout/automate] Error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Automation failed" }, { status: 500 });
  }
}
