/**
 * Core domain types for Kusushi.
 * These define the contract between the agent, the UI, and the Prava payment layer.
 */

export type Priority = "fastest" | "cheapest" | "closest" | "confidence";

export const PRIORITIES: { value: Priority; label: string; description: string }[] = [
  { value: "fastest", label: "Fastest", description: "Prioritize delivery time" },
  { value: "cheapest", label: "Lowest price", description: "Find the cheapest source" },
  { value: "closest", label: "Closest", description: "Nearest pharmacy first" },
  { value: "confidence", label: "Most reliable", description: "Stock certainty + reputation" },
];

/** A single medicine or health item the user needs. */
export interface MedicineItem {
  id: string;
  name: string;
  dosage?: string;        // e.g. "500mg"
  quantity: number;       // e.g. 30 (tablets)
  type: "prescription" | "otc" | "supplement" | "device" | "personal_care";
  notes?: string;
}

/** A pharmacy quote returned by the discovery agent. */
export interface PharmacyQuote {
  pharmacyId: string;
  pharmacyName: string;
  pharmacyArea: string;
  distanceKm: number;
  /** Per-item availability + price */
  items: {
    itemId: string;
    inStock: boolean;
    price: number;        // INR
    stripSize?: string;   // e.g. "15 tablets"
    etaMinutes?: number;  // delivery ETA if ordered alone
  }[];
  /** Aggregated */
  total: number;          // INR
  deliveryEtaMinutes: number;
  allInStock: boolean;
  confidenceScore: number; // 0-1
  rationale: string;      // why this option
  /** Real checkout URL — what Prava binds the virtual card to. Online pharmacies only. */
  merchantUrl?: string;
  /** "online" = has a checkout portal (Prava-compatible). "local" = physical store, roadmap. */
  tier?: "online" | "local";
}

/** A recommendation the agent surfaces to the user. */
export interface Recommendation {
  bestQuote: PharmacyQuote;
  alternatives: PharmacyQuote[];
  chosenPriority: Priority;
  explanation: string;    // human-readable reasoning
  savingsVsHighest?: number;
}

export type OrderStatus =
  | "intake"            // gathering the request
  | "understanding"     // agent parsing the request
  | "discovering"       // finding pharmacies
  | "recommending"      // showing options
  | "awaiting_approval" // user must approve
  | "paying"            // Prava transaction in progress
  | "completed"         // done
  | "failed";           // failed

/** The full conversation/order state. */
export interface Order {
  id: string;
  status: OrderStatus;
  items: MedicineItem[];
  address?: string;
  priority: Priority;
  quotes?: PharmacyQuote[];
  recommendation?: Recommendation;
  prava?: {
    sessionId?: string;
    paymentStatus?: "pending" | "awaiting_result" | "completed" | "failed";
    txnId?: string;
    merchantName?: string;
    total?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  /** Optional UI hints attached to a message */
  kind?:
    | "text"
    | "thinking"
    | "recommendation"
    | "status"
    | "payment"
    | "confirmation"
    | "dashboard"
    | "geo"
    | "priority"
    | "address_choice";
  data?: unknown;
}
