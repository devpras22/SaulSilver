import { NextRequest, NextResponse } from "next/server";
import { geocode, IS_MOCK_MAPS } from "@/lib/maps";

/**
 * POST /api/geocode
 *
 * Verifies a free-text address against Google Maps Geocoding API and returns
 * the canonical formatted address, lat/lng, and an embeddable map URL so the
 * UI can prove to the user that the agent actually located them — not just
 * echoed their text back.
 *
 * In mock mode (no Maps key) we still resolve a plausible location and serve
 * an OpenStreetMap embed (no key needed), so the proof surface is identical.
 */
export async function POST(req: NextRequest) {
  try {
    const { address } = (await req.json()) as { address?: string };
    if (!address?.trim()) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }

    const geo = await geocode(address.trim());

    // Build an embeddable map. In real mode we sign the Google Maps Embed URL
    // server-side (key stays out of client bundle; it's only in the iframe src,
    // which is the intended Embed API usage and is referrer-restricted in GCP).
    // In mock mode, fall back to OpenStreetMap so we still show a real map.
    let embedUrl: string;
    if (IS_MOCK_MAPS) {
      const d = 0.008;
      embedUrl =
        `https://www.openstreetmap.org/export/embed.html` +
        `?bbox=${geo.lng - d}%2C${geo.lat - d}%2C${geo.lng + d}%2C${geo.lat + d}` +
        `&layer=mapnik&marker=${geo.lat}%2C${geo.lng}`;
    } else {
      const key = process.env.GOOGLE_MAPS_API_KEY!;
      embedUrl =
        `https://www.google.com/maps/embed/v1/place?key=${key}` +
        `&q=${geo.lat},${geo.lng}&zoom=15`;
    }

    return NextResponse.json({
      input: address.trim(),
      formatted: geo.formatted,
      lat: geo.lat,
      lng: geo.lng,
      mock: IS_MOCK_MAPS,
      embedUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[geocode]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
