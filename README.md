# SaulSilver 🌿

> *The Cannabis Sommelier. Built for the Agentic Commerce Hackathon.*

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![Prava](https://img.shields.io/badge/Powered%20By-Prava-gold)](https://prava.space)
[![Senso](https://img.shields.io/badge/Verified%20By-Senso-blue)](https://senso.ai)
[![OpenAI](https://img.shields.io/badge/Intelligence-OpenAI-green)](https://openai.com)
[![Linq](https://img.shields.io/badge/Message%20Native-Linq-purple)](https://linqapp.com)

---

## 🛑 The Problem

Pharmacies know stock. Stoners know strains. But the average consumer doesn't know what's safe. 

The Indian cannabis/hemp market is flooded with dozens of brands (Magiccann, The Trost, Sanan Relief) and hundreds of gummy variations. Users are constantly guessing what dose to take, what effects to expect, and whether a brand is legally compliant and safe. 

Other commerce agents just find you the cheapest gummy. **SaulSilver finds you the *right* one.**

## 💡 The Solution

**SaulSilver** is an opinionated, AI-powered cannabis concierge that aggregates legitimate Indian cannabis brands and acts as a trusted advisor to guide purchases across direct-to-consumer websites and marketplaces.

It operates in a strict, three-step loop:
1. **The Interview (Match):** It talks to the user to understand their tolerance, desired effects (sleep, focus, euphoria), and ratio preferences. 
2. **The Trust Check (Verify):** It verifies the recommended brand's lab tests, licenses, and reviews.
3. **The Checkout (Buy):** It finds who stocks it, compares prices, and executes a real-world checkout.

## 🏗 Architecture: Reliability over Magic

A medical/cannabis agent cannot hallucinate doses. We built SaulSilver on the philosophy of **Reliability over Magic**.

**The Dual AI Stack:** 
* **The Builder (OpenAI Codex):** This entire application—from the glassmorphic UI down to the database schema and Senso ingestion pipeline—was aggressively scaffolded and iteratively refined using **OpenAI Codex** as the underlying code-generation engine, orchestrated through agentic coding environments like Antigravity and Claude Code. 
* **The Brain (OpenAI LLMs):** The runtime conversational UI is powered natively by OpenAI, using strict function calling and natural language parsing to flawlessly extract user intent, chat conversationally, and drive the underlying mathematical routing engine.

**Deterministic Math + Senso Intelligence:** 
Other agents just query an LLM and pray. Our matching engine (`src/lib/sommelier.ts`) is a strict mathematical scoring matrix. We filter based on effects, tolerance, and budget, and then pipe the candidates into a `50/50` weighted ranking algorithm: 50% static trust (Supabase metrics like license validity and verified lab tests) and 50% dynamic trust (Senso vector retrieval of public sentiment and recent controversies).

## 🔌 Hackathon Sponsor Integrations

We natively integrated the core hackathon sponsors directly into the critical path of the agent:

### 1. Prava (Agentic Checkout)
SaulSilver uses the Prava API to close the loop. Once the sommelier matches the perfect gummy, it issues a virtual card scoped securely to the merchant and executes the transaction on the user's behalf. 
* *Support for DTC:* Closes end-to-end on real `https` checkouts for direct-to-consumer brands.
* *Support for Marketplaces:* Architected to resolve to marketplace rails identically.

### 2. Senso (Trust & Verification)
Before SaulSilver recommends a gummy, it uses Senso's intelligence to verify the brand. We pass brand context to Senso to validate lab results, compliance, and public sentiment, ensuring we never recommend a shady product. As outlined above, this real-time Senso signal directly influences the mathematical matching algorithm to actively re-rank and filter candidates based on trust.

**Live Trust Leaderboard:**
| Rank | Brand | Trust Score | Products | License Info | Category |
|------|-------|-------------|----------|--------------|----------|
| 1 | Cannavedic | 0.90 | 3 | ✅ text (2) | vijaya |
| 2 | Andyou | 0.86 | 3 | ✅ text (2) | cbd |
| 3 | Moon Impact | 0.85 ⬆ from 0.72 | 2 | ✅ 25D/55/96 | vijaya |
| 3 | Cannazo | 0.85 | 3 | ✅ text (2) | vijaya |
| 5 | Qurist | 0.82 | 1 | ⚠️ no # | cbd |
| 6 | The Trost | 0.80 | 9 | ✅ A-4906/2021 | vijaya |
| 7 | Cure By Design | 0.73 | 4 | ⚠️ no # | vijaya |
| 7 | Medicann | 0.73 | 2 | ⚠️ no # | vijaya |
| 7 | Kushiva | 0.73 | 1 | ⚠️ on request | vijaya |
| 10 | Hebe Wellness | 0.71 | 10 | ⚠️ image only | vijaya |
| 10 | Polyherbs | 0.71 | 5 | ⚠️ no # | vijaya (marketplace) |
| 12 | Magiccann | 0.67 | 6 | ✅ text (3) | vijaya |

### 3. Linq (iMessage Infrastructure)
SaulSilver lives natively inside your phone. Using Linq, we built a message-native agent that operates entirely over iMessage and SMS. It features typing indicators for loading states and responds with rich iMessage App deep-links so users can seamlessly browse recommendations and checkout without ever leaving the blue bubble.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Supabase Project (for Auth & Database)
- Prava API Keys
- Senso API Keys
- OpenAI API Key

### Installation

1. **Clone & Install**
   ```bash
   git clone https://github.com/devpras22/SaulSilver.git
   cd SaulSilver
   npm install
   ```

2. **Environment Variables**
   Create a `.env.local` file and fill in all required keys:
   ```env
   # OpenAI (Agent)
   OPENAI_API_KEY=your_openai_key

   # Prava (Payments)
   NEXT_PUBLIC_BACKEND_URL=https://sandbox.api.prava.space
   MERCHANT_SECRET_KEY=your_prava_secret_key
   NEXT_PUBLIC_PUBLISHABLE_KEY=your_prava_publishable_key
   PRAVA_SECRET_KEY=your_prava_secret_key
   PRAVA_PUBLIC_KEY=your_prava_publishable_key
   NEXT_PUBLIC_PRAVA_PUBLIC_KEY=your_prava_publishable_key

   # Supabase (Auth, Persistence, Orders)
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role

   # Google Maps (Location Verification)
   GOOGLE_MAPS_API_KEY=your_google_maps_key

   # Senso (Brand Trust & Discovery)
   SENSO_API_KEY=your_senso_key

   # Linq (iMessage Infrastructure)
   LINQ_API_KEY=your_linq_key
   LINQ_FROM_NUMBER=your_linq_number
   LINQ_BASE_URL=https://api.linqapp.com/api/partner/v3

   # AgentMail (Agent Inbox)
   AGENTMAIL_API_KEY=your_agentmail_key
   AGENTMAIL_INBOX_ID=your_inbox_id
   AGENTMAIL_FROM=your_agentmail_from
   ```

3. **Run the Development Server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to start matching.

## 🟥 Current Issues

Live tracker of the real state of Step 5 (autonomous merchant checkout).
Full detail in **[`CURRENT-ISSUES.md`](./CURRENT-ISSUES.md)** — kept separate so
this README stays stable. Summary:

- **🟢 Shopflo SMS-OTP wall — SOLVED.** Founder-approved approach: surface the
  OTP step in our UI, take the code from the user, pass it into Shopflo. Built
  + proven across multiple live runs. Now a shipped feature and a demo moment,
  not a blocker.
- **🟡 Card step — root cause cracked, fix wired in.** Two non-obvious things
  found by live probing: (1) the "Debit/Credit cards" row binds to
  `onPointerDown`, so `el.click()` is invisible — we dispatch the full native
  tap sequence; (2) card fields live in **nested Cashfree payment-gateway
  iframes** inside `#flo__payments__CARD`, so we drill into each child frame to
  fill them. Mechanics proven; end-to-end fill against a real Prava card is the
  last verification.
- **🔴 The real, honest blocker — every platform × gateway is a different
  snowflake.** There is no universal checkout. Shopify-native, Shopify+Shopflo,
  WooCommerce, custom SPA each render a different DOM; Cashfree, Razorpay,
  Juspay, Stripe Elements each inject their own PCI card iframes. The Trost
  path (Shopflo + Cashfree) is now mapped end-to-end and is the demo target.
  Cannazo/Qurist are likely the same stack; AarogyaCBD (WooCommerce) is a
  completely different flow. The architecture (OTP pause, live status, pointer
  taps, nested-iframe drill) is reusable; the per-merchant selectors are not.
  This is grinding per-combination work, not one clever fix.
- **🟡 Moon Impact cannot accept payments** — `trymoonimpact.com/checkout`
  shows *"This store can't accept payments right now."* Dead as a demo target.
- **🟡 iMessage can't close the checkout loop in the blue bubble** — The full
  autonomous checkout (Stagehand headless browser + live OTP/status UI + Prava
  card fill in Cashfree iframes) lives on the **web** path. The iMessage path
  sends Prava's `iframe_url` as a Rich Link; the user pays in **Safari**, and
  then the loop can't return to iMessage — there's no URL that lands you back in
  Messages, so "Payment successful → redirect" (which works on web via
  `callback_url` → `/app`) structurally cannot work on iMessage. The ideal UX is
  a Prava iMessage app extension rendering an in-bubble bottom sheet (App Clip)
  so checkout never leaves the blue bubble — that needs Prava to ship the
  extension. Until then: **web = full autonomous-checkout demo; iMessage =
  native payment link in the blue bubble + cron-fired receipt text.** The
  agent-driven merchant checkout is proven on web; iMessage is the distribution
  surface.

## 📜 Disclaimer
*For legal markets only. Not medical advice. Not a seller. SaulSilver is a discovery, trust, and orchestration layer.*
