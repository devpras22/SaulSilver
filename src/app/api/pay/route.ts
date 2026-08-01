import { NextRequest, NextResponse } from "next/server";
import {
  prava,
  IS_MOCK,
  createSessionMock,
  getPaymentResultMock,
  reportStatusMock,
  revokeSessionMock,
} from "@/lib/prava";
import type { MedicineItem } from "@/lib/types";

/**
 * POST /api/pay — create a Prava session for the chosen pharmacy/quote.
 *
 * Body can include `demo: true` to force mock mode (no real Prava transaction),
 * even when PRAVA_SECRET_KEY is set. This lets us demo freely without burning
 * the 30/day transaction limit.
 *
 * CRITICAL: when demo=true we must call the MOCK functions directly, NOT
 * prava.createSession (which is bound to the real implementation at module load
 * when PRAVA_SECRET_KEY is set). The prava.* object can't be overridden per-
 * request — it's fixed at import time.
 */
export async function POST(req: NextRequest) {
  try {
    const {
      items,
      total,
      merchantName,
      merchantUrl,
      userEmail,
      demo = false,
    } = await req.json() as {
      items: MedicineItem[];
      total: number;
      merchantName: string;
      merchantUrl: string;
      userEmail: string;
      demo?: boolean;
    };

    if (!total || !merchantName) {
      return NextResponse.json({ error: "total and merchantName required" }, { status: 400 });
    }

    const useMock = IS_MOCK || demo;

    if (useMock) {
      // Call mock functions DIRECTLY — do not route through prava.createSession,
      // which is bound to the real implementation when the secret key is set.
      const session = await createSessionMock({
        userId: `kusushi_user_${Date.now().toString(36)}`,
        userEmail: userEmail || "demo@kusushi.app",
        merchantName,
        merchantUrl: merchantUrl || "https://kusushi.pras.fun",
        merchantCountry: "IN",
        totalAmount: total.toFixed(2),
        currency: "INR",
        items: items.map((i) => ({
          description: `${i.name}${i.dosage ? ` ${i.dosage}` : ""}`,
          unit_price: "0",
          quantity: i.quantity,
        })),
      });
      return NextResponse.json({ ...session, mock: true });
    }

    // Real Prava
    const session = await prava.createSession({
      userId: `kusushi_user_${Date.now().toString(36)}`,
      userEmail: userEmail || "demo@kusushi.app",
      merchantName,
      merchantUrl: merchantUrl || "https://kusushi.pras.fun",
      merchantCountry: "IN",
      totalAmount: total.toFixed(2),
      currency: "INR",
      items: items.map((i) => ({
        description: `${i.name}${i.dosage ? ` ${i.dosage}` : ""}`,
        unit_price: "0",
        quantity: i.quantity,
      })),
    });

    return NextResponse.json({ ...session, mock: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
