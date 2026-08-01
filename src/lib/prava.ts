/**
 * Prava client — built to the official prava-sdk-integration skill template.
 *
 * ONE session API for everything. No mandate_setup, no integration_type —
 * those fields don't exist in the canonical Session API reference. A plain
 * session with a real merchant + real amount is the card-enrollment flow;
 * Prava auto-detects returning users and shows their saved cards.
 *
 * Refs (from ~/.agents/skills/prava-sdk-integration):
 *   references/session-api-reference.md
 *   references/integration-flow.md
 *   templates/nextjs/server-action.ts
 */

// Matches the skill's env convention exactly.
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "https://sandbox.api.prava.space";
const MERCHANT_SECRET_KEY = process.env.MERCHANT_SECRET_KEY;

export const IS_MOCK = !MERCHANT_SECRET_KEY || MERCHANT_SECRET_KEY.includes("YOUR_SECRET_KEY");

// ── Types (from the skill's SessionResponse / PaymentResult) ─────────────────

export interface SessionResponse {
  session_id: string;
  session_token: string;
  iframe_url: string;
  order_id: string;
  expires_at: string;
}

export interface PaymentLineItem {
  txn_ref_id: string;
  merchant_name: string;
  merchant_url: string;
  total_amount: string;
  status: string;
  token: string | null;
  dynamic_cvv: string | null;
  expiry_month: string | null;
  expiry_year: string | null;
}

export interface PaymentTransaction {
  txn_id: string;
  status: string;
  line_items: PaymentLineItem[];
  error?: { code: string; message: string };
}

export interface PaymentResultResponse {
  session_id: string;
  order_id: string | null;
  status: "pending" | "awaiting_result" | "completed" | "failed" | string;
  transactions: PaymentTransaction[];
}

export interface CreateSessionInput {
  userId: string;
  userEmail: string;
  totalAmount: string; // real amount, e.g. "49.99" — never "0.00"
  currency: string;
  description?: string;
  merchantName: string; // the DESTINATION merchant (where the user buys from)
  merchantUrl: string;
  merchantCountryIso2: string;
  productDescription: string;
  /** Reuse a saved card (skip card entry — Prava shows saved-cards list) */
  cardId?: string;
}

// ── Session creation (server-side) ───────────────────────────────────────────

export async function createSession(input: CreateSessionInput): Promise<SessionResponse> {
  if (IS_MOCK) return createSessionMock(input);

  const body: Record<string, unknown> = {
    user_id: input.userId,
    user_email: input.userEmail,
    total_amount: input.totalAmount,
    currency: input.currency,
    description: input.description || "Purchase",
    // integration_type:"embedding" → undocumented but functional embedded skin.
    // Hides the redundant merchant-header/product-details/shipping sections
    // inside the iframe (we show them in our own UI). Without it, Prava renders
    // the full hosted checkout including a shipping-details form to re-fill.
    integration_type: "embedding",
    purchase_context: [
      {
        merchant_details: {
          name: input.merchantName,
          url: input.merchantUrl,
          country_code_iso2: input.merchantCountryIso2,
        },
        product_details: [
          {
            description: input.productDescription,
            unit_price: input.totalAmount,
            quantity: 1,
          },
        ],
        effective_until_minutes: 15,
      },
    ],
  };

  // Pre-select a saved card if we have one (repeat-purchase / passkey-only flow).
  if (input.cardId) {
    body.card = { card_id: input.cardId };
  }

  const res = await fetch(`${BACKEND_URL}/v1/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MERCHANT_SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(err.error?.message || `Failed to create session (HTTP ${res.status})`);
  }

  return res.json();
}

// ── Poll for payment result (cache-busted per skill gotcha) ──────────────────

export async function pollPaymentResult(sessionId: string): Promise<PaymentResultResponse> {
  if (IS_MOCK) return pollPaymentResultMock(sessionId);

  const res = await fetch(
    `${BACKEND_URL}/v1/sessions/${sessionId}/payment-result?_t=${Date.now()}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${MERCHANT_SECRET_KEY}` },
      cache: "no-store" as RequestCache,
      next: { revalidate: 0 },
    }
  );

  if (!res.ok) {
    if (res.status === 404) throw new Error("Session not found");
    const err = await res.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(err.error?.message || `Failed to poll result (HTTP ${res.status})`);
  }

  return res.json();
}

// ── Report outcome (required — or transactions stick in awaiting_result) ─────

export async function reportStatus(
  sessionId: string,
  txnRefId: string,
  txnStatus: "APPROVED" | "DECLINED"
): Promise<void> {
  if (IS_MOCK) return;

  await fetch(`${BACKEND_URL}/v1/sessions/${sessionId}/report-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MERCHANT_SECRET_KEY}`,
    },
    body: JSON.stringify({ txn_ref_id: txnRefId, txn_status: txnStatus }),
  });
}

// ── List saved cards (for showing card-on-file) ──────────────────────────────

export interface SavedCard {
  card_id: string;
  card_last4: string | null;
  card_brand: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
}

export async function listCards(userId: string): Promise<SavedCard[]> {
  if (IS_MOCK) return [];

  const res = await fetch(
    `${BACKEND_URL}/v1/listCards?customer_id=${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${MERCHANT_SECRET_KEY}` } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.cards ?? []).map((c: Record<string, unknown>) => ({
    card_id: c.card_id as string,
    card_last4: (c.card_last4 as string) ?? null,
    card_brand: (c.card_brand as string) ?? null,
    card_exp_month: (c.card_exp_month as number) ?? null,
    card_exp_year: (c.card_exp_year as number) ?? null,
  }));
}

// ── Delete a saved card (retires its network token) ──────────────────────────

export async function deleteCard(customerId: string, cardId: string): Promise<void> {
  if (IS_MOCK) return;

  const res = await fetch(`${BACKEND_URL}/v1/deleteCard`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MERCHANT_SECRET_KEY}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      card_id: cardId,
      reason: "CUSTOMER_CONFIRMED",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Failed to delete card (HTTP ${res.status})`);
  }
}

// ── Mock implementations (no secret key) ─────────────────────────────────────
// Same lifecycle so the UI lights up without keys.

const mockSessions = new Map<string, { createdAt: number; status: string }>();

function createSessionMock(input: CreateSessionInput): SessionResponse {
  const id = `sess_mock_${Date.now().toString(36)}`;
  mockSessions.set(id, { createdAt: Date.now(), status: "pending" });
  return {
    session_id: id,
    session_token: `mock_token_${id}`,
    iframe_url: `https://sandbox.collect.prava.space?session=${id}`,
    order_id: `ord_mock_${id}`,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  };
  // NOTE: input intentionally unused in mock — real path uses it.
  void input;
}

function pollPaymentResultMock(sessionId: string): PaymentResultResponse {
  const s = mockSessions.get(sessionId);
  if (!s) throw new Error("Session not found");
  const elapsed = Date.now() - s.createdAt;
  // pending for 2s, then completed with a credential
  if (elapsed < 2000) {
    return { session_id: sessionId, order_id: null, status: "pending", transactions: [] };
  }
  s.status = "completed";
  return {
    session_id: sessionId,
    order_id: `ord_mock_${sessionId}`,
    status: "completed",
    transactions: [
      {
        txn_id: `txn_mock_${sessionId}`,
        status: "completed",
        line_items: [
          {
            txn_ref_id: `tli_mock_${sessionId}`,
            merchant_name: "Mock Merchant",
            merchant_url: "https://example.com",
            total_amount: "0.01",
            status: "completed",
            token: "0000000000000000",
            dynamic_cvv: "000",
            expiry_month: "12",
            expiry_year: "2030",
          },
        ],
      },
    ],
  };
}
