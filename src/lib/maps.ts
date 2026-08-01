/**
 * Google Maps discovery layer for Kusushi.
 *
 * Two modes:
 * - Real: GOOGLE_MAPS_API_KEY present → uses Places API to find real nearby pharmacies
 * - Mock: no key → uses a static dataset (Mumbai pharmacies)
 *
 * The app UI is identical either way; this just swaps the data source.
 */

import type { MedicineItem } from "./types";

export interface Pharmacy {
  id: string;
  name: string;
  address: string;
  area: string;
  rating?: number;
  userRatingsTotal?: number;
  distanceKm: number;
  lat: number;
  lng: number;
  openNow?: boolean;
  placeId?: string;
  /** Real checkout URL — what Prava binds the virtual card to. Online pharmacies only. */
  merchantUrl?: string;
  /** "online" = has a checkout portal (Prava-compatible). "local" = physical store, roadmap. */
  tier?: "online" | "local";
}

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;
export const IS_MOCK_MAPS = !API_KEY;

// ─────────────────────────────────────────────────────────────────────────────
// GEOCODING — turn an address string into lat/lng
// ─────────────────────────────────────────────────────────────────────────────

export async function geocode(address: string): Promise<{ lat: number; lng: number; formatted: string }> {
  if (IS_MOCK_MAPS) {
    // Default to Andheri West, Mumbai
    return { lat: 19.1197, lng: 72.8468, formatted: `${address} (mock geocode)` };
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${API_KEY}&components=country:IN`;
  const res = await fetch(url);
  const data = await res.json();
  const loc = data.results?.[0]?.geometry?.location;
  const formatted = data.results?.[0]?.formatted_address ?? address;
  if (!loc) throw new Error(`Geocode failed for: ${address}`);
  return { lat: loc.lat, lng: loc.lng, formatted };
}

// ─────────────────────────────────────────────────────────────────────────────
// NEARBY PHARMACY DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

/** Haversine distance in km */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find pharmacies near a location.
 * @param lat
 * @param lng
 * @param radiusMeters default 1000 (1km)
 */
export async function findNearbyPharmacies(
  lat: number,
  lng: number,
  radiusMeters = 1500
): Promise<Pharmacy[]> {
  if (IS_MOCK_MAPS) {
    return mockPharmacies(lat, lng);
  }

  // Real Places API — Nearby Search
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=pharmacy&keyword=pharmacy|chemist|medical store&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Places API error: ${data.status} — ${data.error_message ?? ""}`);
  }

  const places = (data.results ?? [])
    .filter((p: { business_status?: string }) => p.business_status !== "CLOSED_PERMANENTLY")
    .map((p: Record<string, unknown>) => {
      const loc = p.geometry as { location: { lat: number; lng: number } };
      const name = p.name as string;
      const tag = tagOnlineChain(name);
      return {
        id: p.place_id as string,
        name,
        address: p.vicinity as string,
        area: (p.vicinity as string)?.split(",")?.slice(-2)?.join(", ") ?? "",
        rating: p.rating as number | undefined,
        userRatingsTotal: p.user_ratings_total as number | undefined,
        lat: loc.location.lat,
        lng: loc.location.lng,
        distanceKm: haversine(lat, lng, loc.location.lat, loc.location.lng),
        openNow: (p.opening_hours as { open_now?: boolean })?.open_now,
        placeId: p.place_id as string,
        merchantUrl: tag.merchantUrl,
        tier: tag.tier,
      };
    })
    .filter((p: Pharmacy) => p.distanceKm <= radiusMeters / 1000 + 0.3) // slight buffer
    .sort((a: Pharmacy, b: Pharmacy) => {
      // Sort by rating (desc) then distance (asc)
      const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
      if (Math.abs(ratingDiff) > 0.2) return ratingDiff;
      return a.distanceKm - b.distanceKm;
    })
    .slice(0, 6); // Top 6

  return places as Pharmacy[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK pharmacy dataset (when no Maps key)
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_PHARMACY_DATA: {
  name: string;
  area: string;
  dLat: number;
  dLng: number;
  rating: number;
  total: number;
  merchantUrl?: string;
  tier: "online" | "local";
}[] = [
  // Tier 1 — online pharmacies & quick-commerce (real checkout URLs, Prava-compatible)
  { name: "Apollo Pharmacy", area: "Andheri West", dLat: 0.006, dLng: 0.004, rating: 4.5, total: 320, merchantUrl: "https://www.apollopharmacy.in", tier: "online" },
  { name: "Tata 1mg", area: "Andheri East", dLat: -0.015, dLng: 0.02, rating: 4.4, total: 260, merchantUrl: "https://www.1mg.com", tier: "online" },
  { name: "Netmeds", area: "Online · 2.5km hub", dLat: 0.018, dLng: 0.011, rating: 4.3, total: 180, merchantUrl: "https://www.netmeds.com", tier: "online" },
  { name: "Pharmeasy", area: "Jogeshwari", dLat: 0.02, dLng: 0.015, rating: 4.1, total: 150, merchantUrl: "https://pharmeasy.in", tier: "online" },
  { name: "Zepto", area: "Online · 10-min", dLat: -0.01, dLng: -0.012, rating: 4.4, total: 340, merchantUrl: "https://www.zeptonow.com", tier: "online" },
  { name: "Blinkit", area: "Online · 10-min", dLat: 0.009, dLng: -0.018, rating: 4.3, total: 290, merchantUrl: "https://www.blinkit.com", tier: "online" },
  { name: "Swiggy Instamart", area: "Online · 15-min", dLat: -0.014, dLng: 0.006, rating: 4.2, total: 310, merchantUrl: "https://www.swiggy.com/instamart", tier: "online" },
  // Tier 2 — local Kirana / physical stores (discovery works today; payment is the roadmap)
  { name: "MedPlus Mart", area: "Lokhandwala", dLat: -0.008, dLng: 0.01, rating: 4.2, total: 180, tier: "local" },
  { name: "Wellness Forever", area: "Andheri West", dLat: 0.012, dLng: -0.006, rating: 4.6, total: 410, tier: "local" },
  { name: "Local Chemist", area: "Andheri West", dLat: -0.004, dLng: -0.009, rating: 4.3, total: 95, tier: "local" },
];

/**
 * Recognized online pharmacy chains → real checkout URL + tier.
 * Used to tag real Google Places results that match a known chain name,
 * so the live discovery path also benefits from Prava-compatible merchants.
 */
const ONLINE_CHAINS: { match: RegExp; merchantUrl: string }[] = [
  { match: /apollo/i, merchantUrl: "https://www.apollopharmacy.in" },
  { match: /1mg|tata\s*1mg/i, merchantUrl: "https://www.1mg.com" },
  { match: /netmeds/i, merchantUrl: "https://www.netmeds.com" },
  { match: /pharmeasy|pharm\s*easy/i, merchantUrl: "https://pharmeasy.in" },
  { match: /zepto/i, merchantUrl: "https://www.zeptonow.com" },
  { match: /blinkit/i, merchantUrl: "https://www.blinkit.com" },
  { match: /instamart|swiggy/i, merchantUrl: "https://www.swiggy.com/instamart" },
];

/** Attach a known merchant URL + tier to a Place name, if it matches a chain. */
function tagOnlineChain(name: string): { merchantUrl?: string; tier: "online" | "local" } {
  const chain = ONLINE_CHAINS.find((c) => c.match.test(name));
  return chain
    ? { merchantUrl: chain.merchantUrl, tier: "online" }
    : { tier: "local" };
}

function mockPharmacies(lat: number, lng: number): Pharmacy[] {
  return MOCK_PHARMACY_DATA.map((p, i) => ({
    id: `mock_pharm_${i}`,
    name: p.name,
    address: `${p.area}, Mumbai`,
    area: p.area,
    rating: p.rating,
    userRatingsTotal: p.total,
    distanceKm: haversine(lat, lng, lat + p.dLat, lng + p.dLng),
    lat: lat + p.dLat,
    lng: lng + p.dLng,
    openNow: true,
    merchantUrl: p.merchantUrl,
    tier: p.tier,
  }))
    .sort((a, b) => {
      const rd = (b.rating ?? 0) - (a.rating ?? 0);
      if (Math.abs(rd) > 0.2) return rd;
      return a.distanceKm - b.distanceKm;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCOMPLETE — for the address input (client-side callable)
// ─────────────────────────────────────────────────────────────────────────────

export function buildAutocompleteUrl(input: string): string | null {
  if (IS_MOCK_MAPS) return null;
  return `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
    input
  )}&components=country:IN&types=address&key=${API_KEY}`;
}
