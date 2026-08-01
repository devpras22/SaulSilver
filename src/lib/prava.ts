/**
 * Prava payment client.
 *
 * Implements the real Prava SDK/API flow:
 *   1. Create a session (merchant, amount, mandate)
 *   2. User approves via passkey (handled by Prava's hosted surface)
 *   3. Poll GET /v1/sessions/{id}/payment-result → awaiting_result yields token + dynamic_cvv
 *   4. Agent uses those credentials at merchant checkout
 *   5. POST /v1/sessions/{id}/report-status → APPROVED / DECLINED
 *
 * Until PRAVA_SECRET_KEY is set, runs in MOCK mode that simulates the exact
 * same lifecycle so the UI lights up identically.
 *
 * Refs:
 *   https://docs.prava.space/api-reference/create-session
 *   https://docs.prava.space/api-reference/get-payment-result
 *   https://docs.prava.space/api-reference/report-status
 */

import type { MedicineItem } from "./types";

const PRAVA_BASE =
  process.env.PRAVA_BASE_URL ??
  (process.env.PRAVA_SECRET_KEY?.startsWith("sk_test") ? "https://sandbox.api.prava.space" : "https://api.prava.space");

const SECRET_KEY = process.env.PRAVA_SECRET_KEY;
export const IS_MOCK = !SECRET_KEY;

export interface PravaLineItem {
  description: string;
  unit_price: string;
  quantity?: number;
}

export interface CreateSessionInput {
  userId: string;
  userEmail: string;
  merchantName: string;
  merchantUrl: string;
  merchantCountry: string; // ISO2
  totalAmount: string; // string per Prava API
  currency: string; // "INR"
  items: PravaLineItem[];
}

export interface PravaSession {
  sessionId: string;
  orderId?: string;
  /** Hosted Prava surface — embed in iframe for card entry + passkey approval */
  iframeUrl?: string;
  sessionToken?: string;
  expiresAt?: string;
  status: "pending" | "awaiting_result" | "completed" | "failed";
  /** Present when status === awaiting_result */
  credentials?: {
    token: string;          // virtual card number (network token)
    dynamicCvv: string;     // single-use CVV
    expiryMonth: string;
    expiryYear: string;
  };
  txnRefId?: string;
  error?: { code: string; message: string };
}

export interface ReportStatusInput {
  sessionId: string;
  txnRefId: string;
  status: "APPROVED" | "DECLINED";
  amountPaid?: string;
}

/** Build the purchase_context line items from our medicine items. */
export function toPravaLineItems(items: MedicineItem[]): PravaLineItem[] {
  return items.map((item) => ({
    description: `${item.name}${item.dosage ? ` ${item.dosage}` : ""}${item.notes ? ` (${item.notes})` : ""}`,
    unit_price: "0", // populated by caller with real price
    quantity: item.quantity,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL Prava API calls
// ─────────────────────────────────────────────────────────────────────────────

async function pravaFetch(path: string, body: unknown, method = "POST") {
  if (!SECRET_KEY) throw new Error("PRAVA_SECRET_KEY not set");
  const res = await fetch(`${PRAVA_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SECRET_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Prava API ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

async function createSessionReal(input: CreateSessionInput): Promise<PravaSession> {
  const data = await pravaFetch("/v1/sessions", {
    user_id: input.userId,
    user_email: input.userEmail,
    total_amount: input.totalAmount,
    currency: input.currency,
    purchase_context: [
      {
        merchant_details: {
          name: input.merchantName,
          url: input.merchantUrl,
          country_code_iso2: input.merchantCountry,
        },
        product_details: input.items.map((i) => ({
          description: i.description,
          unit_price: i.unit_price,
          quantity: i.quantity ?? 1,
        })),
      },
    ],
  });
  return {
    sessionId: data.session_id,
    orderId: data.order_id,
    iframeUrl: data.iframe_url,
    sessionToken: data.session_token,
    expiresAt: data.expires_at,
    status: "pending",
  };
}

async function getPaymentResultReal(sessionId: string): Promise<PravaSession> {
  const data = await pravaFetch(`/v1/sessions/${sessionId}/payment-result`, {}, "GET");
  const txn = data.transactions?.[0];
  const lineItem = txn?.line_items?.[0];
  return {
    sessionId: data.session_id,
    orderId: data.order_id,
    status: data.status,
    credentials:
      data.status === "awaiting_result" && lineItem
        ? {
            token: lineItem.token,
            dynamicCvv: lineItem.dynamic_cvv,
            expiryMonth: lineItem.expiry_month,
            expiryYear: lineItem.expiry_year,
          }
        : undefined,
    txnRefId: lineItem?.txn_ref_id,
    error: data.status === "failed" ? txn?.error : undefined,
  };
}

async function reportStatusReal(input: ReportStatusInput): Promise<void> {
  await pravaFetch(`/v1/sessions/${input.sessionId}/report-status`, {
    txn_ref_id: input.txnRefId,
    txn_status: input.status,
    amount_paid: input.amountPaid,
  });
}

async function revokeSessionReal(sessionId: string): Promise<void> {
  // revoke takes an empty body per the Prava docs (POST /v1/sessions/:id/revoke).
  // pravaFetch JSON.stringifies the body; {} is acceptable.
  await pravaFetch(`/v1/sessions/${sessionId}/revoke`, {});
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK implementations — same lifecycle, no network
// ─────────────────────────────────────────────────────────────────────────────

const mockSessions = new Map<string, PravaSession & { createdAt: number }>();

async function createSessionMock(input: CreateSessionInput): Promise<PravaSession> {
  const sessionId = `ses_mock_${Date.now().toString(36)}`;
  const session: PravaSession & { createdAt: number } = {
    sessionId,
    status: "pending",
    createdAt: Date.now(),
  };
  mockSessions.set(sessionId, session);
  return { ...session };
}

async function getPaymentResultMock(sessionId: string): Promise<PravaSession> {
  const session = mockSessions.get(sessionId);
  if (!session) throw new Error(`Mock session ${sessionId} not found`);
  const elapsed = Date.now() - session.createdAt;
  // Simulate: pending for 1s, then awaiting_result with credentials
  if (elapsed < 1500) {
    return { ...session, status: "pending" };
  }
  if (session.status === "awaiting_result" || session.status === "completed") {
    return session;
  }
  const updated: PravaSession & { createdAt: number } = {
    ...session,
    status: "awaiting_result",
    txnRefId: `txnref_mock_${sessionId.slice(-8)}`,
    credentials: {
      token: "0000000000000000", // mock-only placeholder, never a real card
      dynamicCvv: "000",
      expiryMonth: "12",
      expiryYear: "30",
    },
  };
  mockSessions.set(sessionId, updated);
  return { ...updated };
}

async function reportStatusMock(input: ReportStatusInput): Promise<void> {
  const session = mockSessions.get(input.sessionId);
  if (!session) throw new Error(`Mock session ${input.sessionId} not found`);
  mockSessions.set(input.sessionId, {
    ...session,
    status: input.status === "APPROVED" ? "completed" : "failed",
  });
}

async function revokeSessionMock(sessionId: string): Promise<void> {
  const session = mockSessions.get(sessionId);
  if (session) {
    mockSessions.set(sessionId, { ...session, status: "failed" });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — switches on IS_MOCK automatically
// ─────────────────────────────────────────────────────────────────────────────

// Export both the bound object (auto-switches on IS_MOCK) AND the individual
// functions so callers can override per-request (e.g. demo mode forcing mock
// even when the real secret key is configured).
export { createSessionMock, getPaymentResultMock, reportStatusMock, revokeSessionMock };

export const prava = {
  createSession: IS_MOCK ? createSessionMock : createSessionReal,
  getPaymentResult: IS_MOCK ? getPaymentResultMock : getPaymentResultReal,
  reportStatus: IS_MOCK ? reportStatusMock : reportStatusReal,
  revoke: IS_MOCK ? revokeSessionMock : revokeSessionReal,
};
