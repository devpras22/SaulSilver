# Changelog

## 2026-08-02
- **Critical Fix — Card Rendering Regression:** Removed an early `return` in `MessageBubble` (introduced by the UI overhaul) that was rendering *every* assistant message as a plain text bubble. Restored the Location Verified card, PriorityPicker, Prava payment iframe (PaymentCard), ConfirmationCard, RecommendationCard, and AgentDashboard.
- **Prava Loop Always Closes:** `completeRealPayment` now reports status (or revokes the session) on *every* exit path — success, failure, and timeout. No real Prava session is ever left dangling as `pending`. Added `POST /api/pay/revoke` + `prava.revoke()` for sessions that never issued a `txn_ref_id`.
- **Real Merchant URLs:** Payment sessions now pin the pharmacy's real checkout URL (e.g. `apollopharmacy.in`, `1mg.com`) as the Prava merchant, instead of the Kusushi site itself.
- **Two-Tier Pharmacy Dataset:** Expanded the pharmacy set to two tiers: Tier 1 online/quick-commerce (Apollo, Tata 1mg, Netmeds, Pharmeasy, Zepto, Blinkit, Swiggy Instamart) with real checkout URLs and a `"online"` tier tag; Tier 2 local Kirana stores (MedPlus, Wellness Forever, Local Chemist) tagged `"local"` as the roadmap. Each `Pharmacy` and `PharmacyQuote` now carries `merchantUrl` + `tier`.
- **Two-Tier Landing Section:** Added a "What works today / What comes next" section explaining the Prava merchant constraint honestly — online pharmacies close the payment loop live; local stores are the roadmap (merchant onboarding or UPI rail).
- **One-Click Demo Prompts:** Empty intake state now shows three clickable sample-request pills so judges can trigger the full flow in one click.
- **Repo Cleanup:** Untracked `senso-context/` (104 generated files) and `fetch_pharmacies.js` from git and added them to `.gitignore`. Local copies retained.

## 2026-08-01
- **UI Overhaul (Mobile & Desktop):** Implemented a high-end glassmorphic UI for the mock chat widget and primary buttons on the homepage.
- **Video Layout Fix:** Mathematically pinned the mobile background video to the button container to ensure perfect responsive alignment across all device heights, completely eliminating pixel-based margin hacks.
- **Animation Reliability:** Stripped out buggy `IntersectionObserver` client-side scroll logic and replaced it with ultra-reliable CSS animations on load, guaranteeing the widget always appears.
- **Legibility Fix:** Ensured solid, opaque backgrounds for chat bubbles and the primary CTA button within the frosted-glass containers to maintain high-contrast readability against the bright video.
- **Senso Integration:** Integrated Senso to fetch real-world trust context and dynamic reputation scores for pharmacies in the discovery and ranking engine. Updated `pharmacy-data.ts` to utilize Senso context for confidence scoring.
- **Media Additions:** Added Torii gate videos (`torii.webm`, `torii.mp4`) and fallback images (`torii.jpg`) to `public/media/`.
- **Bug Fix:** Fixed mobile auto-scroll bug on reload by removing global smooth scrolling and implementing a precise client-side scroll handler for hash links.
- **Sponsorship Links:** Added hyperlinked text for Prava (updated to prava.space), Linq, Senso, and OpenAI in the footer with default underlines for better tappable UI visibility.
- **Guest Auth Mode:** Enabled the "Sign in instantly" button on production and implemented a `localStorage` guest flag. Guest users are visibly locked into Demo mode (grayed-out toggle with tooltip) to prevent accidental Prava transaction exhaustion while still allowing full app exploration.
- **Auth Fix:** Stripped query parameters from the admin `generateLink` redirect options to ensure strict matching with Supabase's wildcard URL whitelist.
