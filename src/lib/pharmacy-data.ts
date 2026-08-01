import type { MedicineItem, PharmacyQuote } from "./types";
import { getPharmacyTrustContext } from "./senso";

/**
 * Mock pharmacy dataset — represents what the Discovery Agent would
 * return from real Google Maps Places + live inventory checks.
 * Replace with real discovery once Maps API is wired.
 */

export interface MockPharmacy {
  id: string;
  name: string;
  area: string;
  distanceKm: number;
  /** Base reliability score 0-1 */
  baseConfidence: number;
  /** Real checkout URL — what Prava binds the virtual card to. Online pharmacies only. */
  merchantUrl?: string;
  /** "online" = has a checkout portal (Prava-compatible). "local" = physical store, roadmap. */
  tier?: "online" | "local";
}

export const MOCK_PHARMACIES: MockPharmacy[] = [
  { id: "apollo_andheri", name: "Apollo Pharmacy", area: "Andheri West", distanceKm: 0.8, baseConfidence: 0.95, merchantUrl: "https://www.apollopharmacy.in", tier: "online" },
  { id: "1mg_andheri", name: "Tata 1mg", area: "Online · 2.5km hub", distanceKm: 2.5, baseConfidence: 0.91, merchantUrl: "https://www.1mg.com", tier: "online" },
  { id: "medplus_lokhandwala", name: "MedPlus", area: "Lokhandwala", distanceKm: 1.4, baseConfidence: 0.82, tier: "local" },
  { id: "wellness_andheri", name: "Wellness Forever", area: "Andheri West", distanceKm: 1.1, baseConfidence: 0.88, tier: "local" },
];

/** Deterministic pseudo-random price generator based on pharmacy + item name */
function priceFor(pharmacyId: string, item: MedicineItem): { price: number; inStock: boolean; eta: number } {
  let seed = 0;
  const key = pharmacyId + item.name + (item.dosage ?? "");
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) % 100000;
  const base = item.type === "device" ? 850 : item.type === "supplement" ? 320 : 95;
  const price = Math.round((base + (seed % 60) - 15) * item.quantity * 0.6);
  // 1mg slightly cheaper for supplements, Apollo slightly more reliable stock
  const isOnline = pharmacyId.includes("1mg");
  const onlineDiscount = isOnline && item.type === "supplement" ? 0.88 : 1;
  const inStock = seed % 11 !== 0; // ~90% in stock
  const eta = isOnline ? 90 + (seed % 60) : 25 + (seed % 30);
  return { price: Math.max(20, Math.round(price * onlineDiscount)), inStock, eta };
}

export async function generateQuotes(items: MedicineItem[]): Promise<PharmacyQuote[]> {
  const sensoContexts = await Promise.all(
    MOCK_PHARMACIES.map(p => getPharmacyTrustContext(p.name))
  );

  return MOCK_PHARMACIES.map((p, idx) => {
    const lineItems = items.map((item) => {
      const { price, inStock, eta } = priceFor(p.id, item);
      return {
        itemId: item.id,
        inStock,
        price,
        etaMinutes: eta,
      };
    });
    const allInStock = lineItems.every((i) => i.inStock);
    const total = lineItems.reduce((sum, i) => sum + i.price, 0);
    // ETA for combined order is max of individual ETAs
    const deliveryEtaMinutes = Math.max(...lineItems.map((i) => i.etaMinutes ?? 60));
    
    const sensoData = sensoContexts[idx];
    const confidence = allInStock
      ? sensoData.score
      : sensoData.score * 0.55;

    return {
      pharmacyId: p.id,
      pharmacyName: p.name,
      pharmacyArea: p.area,
      distanceKm: p.distanceKm,
      merchantUrl: p.merchantUrl,
      tier: p.tier,
      items: lineItems,
      total,
      deliveryEtaMinutes,
      allInStock,
      confidenceScore: confidence,
      rationale: `Verified by Senso: ${sensoData.context.replace(/\*\*/g, '')}`,
    };
  });
}

/** Pick the best quote by priority and attach rationale. */
export function pickBest(
  quotes: PharmacyQuote[],
  priority: string
): { best: PharmacyQuote; alternatives: PharmacyQuote[]; explanation: string } {
  // Only consider pharmacies that have everything in stock, or fall back to all
  const inStock = quotes.filter((q) => q.allInStock);
  const pool = inStock.length > 0 ? inStock : quotes;

  const sorted = [...pool].sort((a, b) => {
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
  const alternatives = sorted.slice(1).slice(0, 2);

  let explanation = "";
  switch (priority) {
    case "cheapest":
      explanation = `${best.pharmacyName} has the lowest total at ₹${best.total}, ${best.allInStock ? "with all items in stock" : "though some items may need substituting"}. Delivery in ${best.deliveryEtaMinutes} min.`;
      break;
    case "fastest":
      explanation = `${best.pharmacyName} can deliver fastest — ${best.deliveryEtaMinutes} min — with all items confirmed in stock.`;
      break;
    case "closest":
      explanation = `${best.pharmacyName} is the closest at ${best.distanceKm} km away, with ${best.allInStock ? "everything in stock" : "partial availability"}.`;
      break;
    case "confidence":
      explanation = `${best.pharmacyName} has the highest stock confidence (${Math.round(best.confidenceScore * 100)}%) and full availability.`;
      break;
  }

  return { best, alternatives, explanation };
}
