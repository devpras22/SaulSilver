"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import type { CallTranscript } from "@/lib/call-simulator";
import {
  Phone,
  PhoneMissed,
  PhoneCall,
  ChevronDown,
  ChevronUp,
  MapPin,
  Star,
  Clock,
  Shield,
  CheckCircle2,
  AlertCircle,
  Navigation,
  Loader2,
} from "lucide-react";

export interface AgentActivityStep {
  step: string;
  label: string;
  status: "pending" | "active" | "done";
  detail?: string;
}

export interface DashboardData {
  steps: AgentActivityStep[];
  calls: CallTranscript[];
  pharmaciesFound: number;
  candidatesContacted: number;
  geo?: { formatted: string; lat: number; lng: number; mock: boolean };
}

export function AgentDashboard({
  data,
  bestQuote,
  onApprove,
}: {
  data: DashboardData | null;
  bestQuote: (import("@/lib/types").PharmacyQuote & { call?: CallTranscript; rating?: number }) | null;
  onApprove: () => void;
}) {
  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Activity steps */}
      <Card className="overflow-hidden">
        <div className="border-b border-border bg-cream-dark/40 px-4 py-2.5">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Agent Activity
          </span>
        </div>
        <CardContent className="p-4">
          <div className="space-y-2.5">
            {data.steps.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5">
                  {s.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-matcha" />
                  ) : s.status === "active" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-matcha" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-border" />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm ${
                      s.status === "pending" ? "text-ink-muted" : "text-ink"
                    }`}
                  >
                    {s.label}
                    {s.status === "active" && (
                      <span className="ml-2 text-xs text-matcha">working…</span>
                    )}
                  </p>
                  {s.detail && (
                    <p className="text-xs text-ink-muted">{s.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Location found */}
      {data.geo && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-noir-card/60 px-3 py-2 text-xs text-ink-soft">
          <MapPin className="h-3.5 w-3.5 text-matcha" />
          <span className="font-medium">{data.geo.formatted}</span>
          {data.geo.mock && <Badge variant="outline" className="text-[10px]">mock geo</Badge>}
        </div>
      )}

      {/* Pharmacy call cards */}
      <div className="space-y-2">
        {data.calls.map((call) => (
          <PharmacyCallCard key={call.pharmacyId} call={call} isBest={bestQuote?.pharmacyId === call.pharmacyId} />
        ))}
      </div>

      {/* Recommendation + approve */}
      {bestQuote && bestQuote.call?.status !== "no-answer" && (
        <Card className="border-matcha/40 shadow-md animate-fade-in-up">
          <div className="bg-matcha/5 px-4 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-matcha">
              Recommended
            </span>
          </div>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-lg font-semibold">{bestQuote.pharmacyName}</p>
                {bestQuote.rating && (
                  <p className="flex items-center gap-1 text-sm text-ink-muted">
                    <Star className="h-3 w-3 fill-gold text-gold" />
                    {bestQuote.rating} · {bestQuote.distanceKm.toFixed(1)} km away
                  </p>
                )}
              </div>
              <p className="font-display text-2xl font-semibold text-matcha">
                {formatINR(bestQuote.total)}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <Clock className="h-4 w-4 text-matcha" />
                {bestQuote.deliveryEtaMinutes} min
              </span>
              <span className="flex items-center gap-1.5 text-ink-soft">
                <Shield className="h-4 w-4 text-matcha" />
                {Math.round(bestQuote.confidenceScore * 100)}% confidence
              </span>
            </div>
            <Button className="mt-4 w-full" onClick={onApprove}>
              <Shield className="h-4 w-4" />
              Approve &amp; pay {formatINR(bestQuote.total)} via Prava
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PharmacyCallCard({ call, isBest }: { call: CallTranscript; isBest: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    completed: { icon: PhoneCall, color: "text-matcha", bg: "bg-matcha/10", label: "Answered" },
    partial: { icon: AlertCircle, color: "text-gold", bg: "bg-gold/10", label: "Partial stock" },
    "no-answer": { icon: PhoneMissed, color: "text-vermillion", bg: "bg-vermillion/10", label: "No answer" },
  } as const;

  const config = statusConfig[call.status];
  const StatusIcon = config.icon;

  return (
    <Card className={`overflow-hidden transition-all ${isBest ? "border-matcha/40" : ""}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-cream-dark/30"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${config.bg}`}>
            <StatusIcon className={`h-4 w-4 ${config.color}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{call.pharmacyName}</p>
            <p className="text-xs text-ink-muted">
              {call.durationSeconds}s call ·{" "}
              {call.outcome.itemsAvailable > 0
                ? `${formatINR(call.outcome.quotedTotal)} · ${call.outcome.deliveryEtaMinutes} min`
                : config.label}
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-ink-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-ink-muted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border bg-cream-dark/20 px-4 py-3">
          {call.outcome.allInStock && (
            <Badge variant="matcha" className="mb-2">
              <CheckCircle2 className="h-3 w-3" /> All items in stock
            </Badge>
          )}
          <div className="space-y-2">
            {call.transcript.map((line, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span
                  className={`shrink-0 font-medium ${
                    line.speaker === "agent" ? "text-matcha" : "text-ink-soft"
                  }`}
                >
                  {line.speaker === "agent" ? "Agent" : "Pharmacist"}:
                </span>
                <span className="text-ink-soft">{line.text}</span>
              </div>
            ))}
          </div>
          {call.outcome.notes && (
            <p className="mt-2 text-xs italic text-ink-muted">Note: {call.outcome.notes}</p>
          )}
        </div>
      )}
    </Card>
  );
}
