"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, CheckCircle2, Navigation, ChevronDown, ChevronUp } from "lucide-react";

/**
 * "Proof we looked at the map" card.
 *
 * Shows the canonical address Google resolved the user's free text to, the
 * coordinates, and an embedded map with a pin. This is the evidence that the
 * agent actually geocoded the location instead of echoing the input back.
 */
export interface GeoData {
  input: string;
  formatted: string;
  lat: number;
  lng: number;
  mock: boolean;
  embedUrl: string;
}

export function LocationVerifiedCard({ geo }: { geo: GeoData }) {
  const [showMap, setShowMap] = useState(true);

  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-matcha/10 text-matcha">
        <MapPin className="h-5 w-5" />
      </div>
      <div className="w-full max-w-[85%]">
        <Card className="overflow-hidden border-matcha/30 shadow-sm">
          <div className="bg-matcha/5 px-4 py-2.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-matcha">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Location verified
              </span>
              {geo.mock ? (
                <Badge variant="outline" className="text-[10px]">mock geo</Badge>
              ) : (
                <Badge variant="matcha" className="text-[10px]">Google Maps</Badge>
              )}
            </div>
          </div>
          <CardContent className="p-4">
            {/* What the user typed → what Google resolved it to */}
            <div className="space-y-1.5">
              <div className="flex items-start gap-2 text-xs">
                <span className="w-12 shrink-0 pt-0.5 text-ink-muted">You said</span>
                <span className="text-ink-muted line-through decoration-ink-muted/40">
                  “{geo.input}”
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className="w-12 shrink-0 pt-0.5 text-ink-muted">Resolved</span>
                <span className="font-medium text-ink">{geo.formatted}</span>
              </div>
              <div className="flex items-start gap-2 text-xs">
                <span className="w-12 shrink-0 pt-0.5 text-ink-muted">Coords</span>
                <span className="font-mono text-ink-soft">
                  {geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowMap((s) => !s)}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-white py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-cream-dark/40"
            >
              <Navigation className="h-3 w-3 text-matcha" />
              {showMap ? "Hide map" : "Show map"}
              {showMap ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>

            {showMap && (
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <iframe
                  src={geo.embedUrl}
                  className="h-44 w-full"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`Map of ${geo.formatted}`}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
