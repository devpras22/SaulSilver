/**
 * AgentMail — SaulSilver's agent inbox.
 *
 * Inbox: saulsilver@agentmail.to (created via the AgentMail API).
 * Used to email brand support for the prescription doctor-consultation flow:
 * when a user orders a prescription product without an existing Rx, SaulSilver
 * emails the brand's support with the order ID to trigger the in-house doctor
 * call. This is the India differentiator — the agent closes the legal loop.
 *
 * API: https://api.agentmail.to/v0
 * Auth: Bearer <AGENTMAIL_API_KEY>
 */

const BASE = "https://api.agentmail.to/v0";
const API_KEY = process.env.AGENTMAIL_API_KEY;
const INBOX_ID = process.env.AGENTMAIL_INBOX_ID ?? "saulsilver@agentmail.to";

export const AGENTMAIL_ENABLED = !!API_KEY;

export interface SendMailInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export interface SendMailResult {
  messageId: string;
  threadId: string;
}

/**
 * Send an email from the SaulSilver inbox.
 * Falls back to a no-op + console log if AGENTMAIL_API_KEY is unset (dev/test).
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!API_KEY) {
    console.warn("[agentmail] AGENTMAIL_API_KEY not set — simulating send:", input.to, input.subject);
    return { messageId: `sim_${Date.now().toString(36)}`, threadId: `sim_thread_${Date.now().toString(36)}` };
  }

  const res = await fetch(`${BASE}/inboxes/${encodeURIComponent(INBOX_ID)}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to: input.replyTo,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`AgentMail ${res.status}: ${JSON.stringify(data)}`);
  }
  return {
    messageId: data.message_id,
    threadId: data.thread_id,
  };
}

/**
 * The prescription-routing email — sent to brand support after a successful
 * payment for a prescription-required product, when the user has no existing Rx.
 *
 * Triggers the brand's in-house doctor consultation (typically a 5-min call).
 */
export async function sendPrescriptionRoutingEmail(params: {
  brandName: string;
  brandSupportEmail: string;
  productName: string;
  orderId: string;
  customerEmail: string;
  customerName?: string;
  doctorRouting?: string;
}): Promise<SendMailResult> {
  const { brandName, brandSupportEmail, productName, orderId, customerEmail, customerName, doctorRouting } = params;

  const subject = `Doctor consultation request — Order ${orderId} — ${productName}`;
  const greeting = customerName ? `Hi ${customerName}` : "Hi";

  const text = `Hi ${brandName} team,

SaulSilver (the cannabis sommelier) is forwarding a completed order that requires a prescription.

ORDER
  Product: ${productName}
  Order ID: ${orderId}
  Customer: ${customerEmail}${customerName ? ` (${customerName})` : ""}

REQUEST
  Please initiate the in-house doctor consultation for this customer.
${doctorRouting ? `  Routing notes: ${doctorRouting}` : ""}

The customer has been informed to expect contact within 24 hours.

— SaulSilver
saulsilver@agentmail.to`;

  const html = `
<div style="font-family:-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <p>Hi ${brandName} team,</p>
  <p>SaulSilver (the cannabis sommelier) is forwarding a completed order that requires a prescription.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 0;color:#666;width:120px">Product</td><td style="padding:6px 0"><strong>${productName}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#666">Order ID</td><td style="padding:6px 0"><strong>${orderId}</strong></td></tr>
    <tr><td style="padding:6px 0;color:#666">Customer</td><td style="padding:6px 0">${customerEmail}${customerName ? ` (${customerName})` : ""}</td></tr>
  </table>
  <p style="margin-top:16px"><strong>Request:</strong> please initiate the in-house doctor consultation for this customer.</p>
  ${doctorRouting ? `<p style="color:#666;font-size:13px">Routing notes: ${doctorRouting}</p>` : ""}
  <p>The customer has been informed to expect contact within 24 hours.</p>
  <p style="margin-top:24px;color:#666;font-size:13px">— SaulSilver<br/>saulsilver@agentmail.to</p>
</div>`;

  return sendMail({ to: brandSupportEmail, subject, text, html, replyTo: customerEmail });
}
