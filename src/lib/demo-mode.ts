/**
 * Demo mode toggle.
 *
 * When true, the app uses mock implementations even if real API keys are present.
 * Lets us demo the full flow without burning Prava transactions (30/day limit)
 * or making real OpenAI/Maps calls during repeated demos.
 *
 * Read from env (set PRAVA_DEMO_MODE=true to force mock) but also overridable
 * via the client-side toggle in the app header.
 */

// Server-side default: demo mode OFF unless explicitly set
export const DEFAULT_DEMO_MODE = process.env.PRAVA_DEMO_MODE === "true";

/**
 * The cookie name we use to persist the user's toggle choice.
 * Read by both server routes (via cookie header) and client.
 */
export const DEMO_COOKIE = "kusushi_demo_mode";
