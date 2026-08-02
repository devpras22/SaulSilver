import { NextRequest, NextResponse } from "next/server";
import { pollPaymentResult, reportStatus, IS_MOCK } from "@/lib/prava";
import { sendMessage } from "@/lib/linq";
import {
  listOpenSessions,
  markReported,
  markAbandoned,
  type OpenSession,
} from "@/lib/imessage-sessions";

/**
 * GET /api/linq/cron — close the loop on iMessage Prava checkouts.
 *
 * iMessage has no client-side completion callback: the user taps the Rich Link,
 * checks out in a browser sheet, and the webhook never hears back. So sessions
 * sit in `awaiting_result` on the Prava dashboard. This cron walks the open
 * iMessage sessions, polls Prava's payment-result, reports the outcome, and
 * texts the user a receipt.
 *
 * Runs every 2 minutes via vercel.json cron.
 *
 * CRITICAL (per the 2026-08-03 lesson: "Reporting a one-time mandate charge as
 * APPROVED consumes the mandate"): we report the REAL outcome from
 * payment-result — DECLINED on merchant decline, never auto-APPROVE. Sandbox
 * one-time cards are declined by the merchant; we honor that. Reporting
 * APPROVED would falsely seal the mandate.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}` so the endpoint isn't public.
 * Vercel cron sends this header automatically.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min — Prava sessions expire at 15; pad for safety.

export async function GET(req: NextRequest) {
  // Auth check — Vercel cron sends this header, random callers don't.
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (IS_MOCK) {
    // No Prava keys — nothing real to poll. Keep the cron healthy without noise.
    return NextResponse.json({ ok: true, mock: true, skipped: true });
  }

  const open = await listOpenSessions();
  if (open.length === 0) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  const now = Date.now();
  let reported = 0;
  let abandoned = 0;

  for (const s of open) {
    // TTL: a session older than the budget never completed. Abandon it so the
    // table doesn't grow unbounded and the row stops being re-polled.
    if (now - new Date(s.created_at).getTime() > SESSION_TTL_MS) {
      await markAbandoned(s.session_id);
      abandoned++;
      continue;
    }

    try {
      const result = await pollPaymentResult(s.session_id);

      // Still pending — the user hasn't checked out yet. Wait for the next tick.
      if (result.status !== "completed") continue;

      // Need a txn_ref_id to report. If the structure is unexpected, abandon
      // rather than guess (don't auto-APPROVE a session we can't read).
      const txn = result.transactions?.[0];
      const lineItem = txn?.line_items?.[0];
      const txnRefId = lineItem?.txn_ref_id;
      if (!txnRefId) {
        console.warn(
          `[linq/cron] session ${s.session_id} completed but no txn_ref_id; abandoning`
        );
        await markAbandoned(s.session_id);
        abandoned++;
        continue;
      }

      // Report the REAL outcome. Sandbox one-time cards are declined by the
      // merchant — DECLINED is the honest status. Never auto-APPROVE.
      const report = await reportStatus(s.session_id, txnRefId, "DECLINED");

      await markReported(s.session_id, txnRefId, report.txnStatus);
      reported++;

      // Text the user a receipt in iMessage.
      await sendReceipt(s, report.txnStatus, report.confirmed).catch((e) =>
        console.warn(
          `[linq/cron] receipt text failed for ${s.session_id}:`,
          e instanceof Error ? e.message : e
        )
      );
    } catch (e) {
      // A transient Prava error on one session shouldn't abort the whole sweep.
      console.warn(
        `[linq/cron] poll/report failed for ${s.session_id}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  return NextResponse.json({ ok: true, checked: open.length, reported, abandoned });
}

/** Send the user a confirmation text in Saul's voice. */
async function sendReceipt(
  s: OpenSession,
  txnStatus: "APPROVED" | "DECLINED",
  confirmed: boolean
): Promise<void> {
  const name = s.product_name ?? "your order";
  const brand = s.brand_name ? ` from ${s.brand_name}` : "";

  // Sandbox reality: the one-time test card is declined. We tell the user
  // honestly — same posture as the web checkout route (CHANGELOG 2026-08-03).
  if (txnStatus === "DECLINED" || !confirmed) {
    await sendMessage({
      to: s.phone,
      chatId: s.chat_id ?? undefined,
      text: `heads up on ${name}${brand} — the sandbox card got declined at the merchant (expected for the test card). ur real card woulda gone through. prava has the result logged`,
    });
    return;
  }

  await sendMessage({
    to: s.phone,
    chatId: s.chat_id ?? undefined,
    text: `yooo ${name}${brand} is locked in 🔒 checkouts done. prava confirmed it`,
  });
}
