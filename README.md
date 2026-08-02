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

## 📜 Disclaimer
*For legal markets only. Not medical advice. Not a seller. SaulSilver is a discovery, trust, and orchestration layer.*
