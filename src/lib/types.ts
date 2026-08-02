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
    | "catalog"
    | "brand_pills"
    | "status"
    | "payment"
    | "confirmation"
    | "dashboard"
    | "geo"
    | "priority"
    | "address_choice"
    | "research_status";
  data?: unknown;
}

/**
 * Outcome of a live research run. The client renders a distinct card per status:
 *  - new_brand_no_gummies   → honest decline card ("they sell oils, not gummies")
 *  - new_brand_added        → full brand report (the original live path)
 *  - existing_brand_refreshed → brand report + "N new added" badge
 *  - existing_brand_unchanged → one-line "still current" confidence card
 *  - cached                 → brand report served from the 7-day cache
 */
export type ResearchStatus =
  | "new_brand_no_gummies"
  | "new_brand_added"
  | "existing_brand_refreshed"
  | "existing_brand_unchanged"
  | "cached"
  | "research_unavailable"
  | "not_a_cannabis_brand"
  | "website_not_found";

// ─────────────────────────────────────────────────────────────────────────────
// CANNABIS DOMAIN — the SaulSilver catalog + matching types
// These sit alongside the legacy Kusushi types until the chat client is rewritten.
// ─────────────────────────────────────────────────────────────────────────────

/** What the user is chasing. The sommelier matches products to these. */
export type Effect =
  | "sleep"
  | "anxiety"
  | "pain"
  | "focus"
  | "euphoria"
  | "social"
  | "relax"
  | "couch_lock"
  | "munchies"
  | "creativity";

export const EFFECTS: { value: Effect; label: string; blurb: string }[] = [
  { value: "sleep", label: "Deep Sleep", blurb: "Knock out. Stay out." },
  { value: "anxiety", label: "Stress & Anxiety", blurb: "Quiet the noise." },
  { value: "pain", label: "Pain Relief", blurb: "Body settles." },
  { value: "focus", label: "Focus & Creativity", blurb: "Lock in. Ideas flow." },
  { value: "social", label: "Social & Uplift", blurb: "Talkative, good vibes." },
];

export type Tolerance = "first_time" | "occasional" | "seasoned";

export const TOLERANCES: { value: Tolerance; label: string; blurb: string }[] = [
  { value: "first_time", label: "First time", blurb: "Never touched it." },
  { value: "occasional", label: "Occasional", blurb: "Once in a while." },
  { value: "seasoned", label: "Seasoned", blurb: "Know your limit." },
];

/** The cannabinoid breakdown of a product. */
export interface Cannabinoids {
  thc_mg?: number;
  cbd_mg?: number;
  cbn_mg?: number;
  cbg_mg?: number;
  /** Total Vijaya/cannabis extract mg, if the brand states it as a blend */
  total_extract_mg?: number;
}

/** A cannabis brand (row in the `brands` table). */
export interface Brand {
  id: string; // slug
  name: string;
  website?: string;
  tagline?: string;
  category: "vijaya" | "cbd" | "hemp" | "isolate";
  region: string; // 'IN' | 'US-CA' | 'global'
  rail: "d2c" | "marketplace";
  marketplaces?: string[];
  legal_status: "schedule_e1_prescription" | "otc_cbd" | "unregulated";
  prescription_required: boolean;
  doctor_routing?: string;
  support_email?: string;
  licences?: { type: string; number: string }[];
  instagram_handle?: string;
  instagram_followers?: number;
  instagram_engagement?: number;
  trust_score: number; // 0-1
  verified: boolean;
  last_researched?: string | null;
  description?: string;
  packaging_notes?: string;
}

/** A cannabis product / SKU (row in the `products` table). */
export interface CannabisProduct {
  id: string;
  brand_id: string;
  name: string;
  variant?: string;
  cannabinoids: Cannabinoids;
  ratio?: string;
  spectrum?: "full" | "broad" | "isolate";
  effect_tags: Effect[];
  dose_level: "beginner" | "intermediate" | "heavy";
  onset_minutes?: number;
  duration_hours?: number;
  flavor?: string;
  pack_count: number;
  price_inr: number;
  in_stock: boolean;
  product_url?: string;
  description?: string;
  // The detail people read to compare brands
  key_uses?: string;
  warnings?: string[];
  composition?: Record<string, string>;
  side_effects?: string[];
}

/** A brand's research audit trail (row in `brand_research`). */
export interface BrandResearch {
  id: string;
  brand_id: string;
  query: string;
  verdict: "verified" | "caution" | "avoid" | "unverified";
  findings: {
    coa_status?: string;
    license?: string;
    reviews_summary?: string;
    red_flags?: string[];
    summary: string;
    /** Auditable deduction breakdown for the trust_score (manual seeds). */
    trust_breakdown?: {
      start: number;
      deductions: Record<string, number>;
      final: number;
    };
    /** Live-research catalog classification (cases 1/3/4). */
    sells_gummies?: boolean;
    non_gummy_summary?: string;
    other_products?: { name: string; type: string; status: string; description?: string }[];
    coming_soon_gummies?: { name: string; status: string; description?: string }[];
  };
  sources: string[];
  trust_score: number;
  created_at: string;
}

/** A matched product with the sommelier's reasoning attached. */
export interface ProductMatch {
  product: CannabisProduct;
  brand: Brand;
  score: number; // 0-1 match quality
  reasons: string[]; // human-readable why
  /** Warnings — dose too high for tolerance, out of stock, etc. */
  warnings?: string[];
  /** Full Markdown output from Senso AI analysis */
  sensoContext?: string;
}

/** The user's intent when they enter the chat. Routes the opening message. */
export type Intent = "match" | "verify" | "browse";

/** The sommelier interview state — what the agent knows about the user so far. */
export interface UserProfile {
  intent: Intent;
  effect?: Effect;
  tolerance?: Tolerance;
  ratioPreference?: "thc" | "cbd" | "balanced" | "you_decide";
  flavor?: string;
  budgetMax?: number;
  region?: string;
}

/** The priority for ranking — cannabis-specific. */
export type CannabisPriority = "effect" | "cheapest" | "fastest" | "confidence";

export const CANNABIS_PRIORITIES: {
  value: CannabisPriority;
  label: string;
  description: string;
}[] = [
  { value: "effect", label: "Best match", description: "Optimize for the vibe you want" },
  { value: "cheapest", label: "Lowest price", description: "Cheapest per gummy" },
  { value: "fastest", label: "Fastest delivery", description: "Quickest to your door" },
  { value: "confidence", label: "Most trusted", description: "Highest verified brand score" },
];

