import { NextRequest, NextResponse } from "next/server";
import { geocode, findNearbyPharmacies, IS_MOCK_MAPS, type Pharmacy } from "@/lib/maps";
import { simulateCall } from "@/lib/call-simulator";
import { getBrandTrustScore as getPharmacyTrustContext } from "@/lib/senso";
import type { MedicineItem, Priority } from "@/lib/types";

/**
 * POST /api/discover
 *
 * The full agent discovery + procurement flow:
 *   1. Geocode the user's address
 *   2. Find real nearby pharmacies (Google Maps Places) — or mock dataset
 *   3. Pick the top-rated ones (the ones worth calling)
 *   4. Agent "calls" each (simulated) → gets stock, price, delivery ETA
 *   5. Rank quotes by the user's priority
 *   6. Return everything: pharmacies, call logs, quotes, recommendation
 *
 * The dashboard renders steps 1-4 as a live agent activity feed.
 */
export async function POST(req: NextRequest) {
  try {
    const { items, priority, address } = (await req.json()) as {
      items: MedicineItem[];
      priority: Priority;
      address?: string;
    };

    if (!items?.length) {
      return NextResponse.json({ error: "items required" }, { status: 400 });
    }
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }

    // ── Step 1: Geocode ──
    const geo = await geocode(address);

    // ── Step 2: Find nearby pharmacies ──
    const pharmacies = await findNearbyPharmacies(geo.lat, geo.lng, 1500);

    // ── Step 3: Pick top candidates (top 3 by rating) ──
    const candidates = [...pharmacies]
      .sort((a, b) => {
        const ratingDiff = (b.rating ?? 4.0) - (a.rating ?? 4.0);
        if (Math.abs(ratingDiff) > 0.1) return ratingDiff;
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, 3);

    // ── Step 4: Simulate calls to each ──
    const calls = candidates.map((p) =>
      simulateCall(p.name, p.id, items, p.distanceKm)
    );

    // ── Step 4.5: Fetch Verified Trust Context from Senso ──
    const sensoContexts = await Promise.all(
      candidates.map(p => getPharmacyTrustContext(p.name))
    );

    // ── Step 5: Build quotes from call outcomes ──
    // Uses the call's per-item results DIRECTLY — the call-simulator is the
    // single source of truth for price + stock. We do NOT re-derive them here.
    const quotes = candidates.map((pharm, idx) => {
      const call = calls[idx];
      const sensoData = sensoContexts[idx];
      const sensoScore = sensoData.score;

      // Confidence: Senso base, reduced for partial stock, further reduced for low ratings
      const ratingFactor = pharm.rating ? Math.min(1, pharm.rating / 5) : 0.8;
      const stockFactor = call.outcome.allInStock ? 1 : 0.65;
      const confidence = call.status === "no-answer"
        ? 0.1
        : Math.max(0.1, Math.min(1, sensoScore * stockFactor * ratingFactor));

      const mapsRatingStr = (pharm.rating && pharm.rating >= 4.0) ? ` Rated ${pharm.rating}★ on Google Maps.` : "";

      return {
        pharmacyId: pharm.id,
        pharmacyName: pharm.name,
        pharmacyArea: pharm.area,
        distanceKm: pharm.distanceKm,
        rating: pharm.rating,
        merchantUrl: pharm.merchantUrl,
        tier: pharm.tier,
        // Per-item data comes straight from the call — no re-derivation.
        items: call.outcome.lineItems,
        total: call.outcome.quotedTotal,
        deliveryEtaMinutes: call.outcome.deliveryEtaMinutes,
        allInStock: call.outcome.allInStock,
        confidenceScore: confidence,
        rationale: call.status === "no-answer"
          ? "Did not answer the call."
          : call.outcome.allInStock
          ? `All items in stock. Verified by Senso: ${sensoData.context.replace(/\*\*/g, '')}${mapsRatingStr} Delivery in ${call.outcome.deliveryEtaMinutes} min.`
          : `${call.outcome.itemsAvailable}/${call.outcome.itemsTotal} items available. Verified by Senso: ${sensoData.context.replace(/\*\*/g, '')}${mapsRatingStr}`,
        call,
      };
    });

    // ── Step 6: Rank by priority ──
    // Prefer pharmacies that answered and have full stock; fall back to partial;
    // never recommend a no-answer.
    const fullStock = quotes.filter((q) => q.call.status !== "no-answer" && q.allInStock && q.total > 0);
    const partialStock = quotes.filter((q) => q.call.status !== "no-answer" && !q.allInStock && q.total > 0);
    const validQuotes = [...fullStock, ...partialStock];
    const pool = validQuotes.length > 0 ? validQuotes : quotes.filter((q) => q.call.status !== "no-answer");

    const sorted = [...pool].sort((a, b) => {
      // Full stock always beats partial stock, regardless of priority
      if (a.allInStock !== b.allInStock) return a.allInStock ? -1 : 1;
      switch (priority) {
        case "cheapest":
          return a.total - b.total;
        case "fastest":
          return a.deliveryEtaMinutes - b.deliveryEtaMinutes;
        case "closest":
          return a.distanceKm - b.distanceKm;
        case "confidence":
          return b.confidenceScore - a.confidenceScore;
        default:
          return a.total - b.total;
      }
    });

    const best = sorted[0];
    const alternatives = sorted.slice(1, 3);

    // Count out-of-stock items on the best quote
    const outOfStockItems = best && best.items ? best.items.filter((it) => !it.inStock) : [];
    const outOfStockCount = outOfStockItems.length;

    let explanation = "";
    switch (priority) {
      case "cheapest":
        explanation = `${best.pharmacyName} offered the lowest total at ₹${best.total}.`;
        break;
      case "fastest":
        explanation = `${best.pharmacyName} can deliver fastest — ${best.deliveryEtaMinutes} minutes.`;
        break;
      case "closest":
        explanation = `${best.pharmacyName} is closest at ${best.distanceKm.toFixed(1)} km.`;
        break;
      case "confidence":
        explanation = `${best.pharmacyName} has the highest confidence (${Math.round(best.confidenceScore * 100)}%)${best.allInStock ? " — all items confirmed in stock" : ""}.`;
        break;
    }

    if (outOfStockCount > 0) {
      const names = outOfStockItems
        .map((it) => {
          const item = items.find((i) => i.id === it.itemId);
          return item ? `${item.name}${item.dosage ? ` ${item.dosage}` : ""}` : "an item";
        })
        .join(", ");
      explanation += ` ${best.pharmacyName} is out of ${names}. I'll source ${outOfStockCount === 1 ? "it" : "them"} from ${
        alternatives[0]?.pharmacyName ?? "another nearby pharmacy"
      } so your full order arrives together.`;
    }

    return NextResponse.json({
      geo: { ...geo, mock: IS_MOCK_MAPS },
      pharmaciesFound: pharmacies.length,
      candidatesContacted: candidates.length,
      calls,
      quotes: sorted,
      best,
      alternatives,
      explanation,
      mock: IS_MOCK_MAPS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[discover]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
