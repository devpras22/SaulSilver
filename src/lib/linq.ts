/**
 * Linq client — iMessage/SMS/RCS infrastructure for Kusushi.
 *
 * Lets the agent operate over iMessage: the caregiver narrative.
 * "Adult children ordering for parents" — that conversation already happens
 * in Messages. Now Kusushi lives inside it.
 *
 * Docs: https://docs.linqapp.com
 * Base:  https://api.linqapp.com/api/partner/v3
 * Auth:  Authorization: Bearer <token>
 *
 * Refs:
 *   Send message: /guides/messaging/sending-messages/
 *   Webhooks:     /guides/webhooks/
 *   Events:       /guides/webhooks/events/  (message.received, payment.succeeded, etc.)
 */

const API_KEY = process.env.LINQ_API_KEY;
const BASE = process.env.LINQ_BASE_URL ?? "https://api.linqapp.com/api/partner/v3";
const FROM = process.env.LINQ_FROM_NUMBER;

export const LINQ_CONFIGURED = Boolean(API_KEY && FROM);

export interface MessagePart {
  type: "text" | "media" | "link" | "imessage_app";
  value?: string;
  url?: string;
  attachment_id?: string;
  app?: {
    name: string;
    team_id: string;
    bundle_id: string;
    app_store_id?: number;
  };
  fallback_text?: string;
  interactive?: boolean;
  layout?: {
    caption?: string;
    subcaption?: string;
    trailing_caption?: string;
    trailing_subcaption?: string;
    image_url?: string;
    image_title?: string;
    image_subtitle?: string;
  };
}

export interface SendOptions {
  to: string;           // E.164, e.g. +13105551234
  text?: string;
  link?: string;        // URL for iMessage App attachment
  parts?: MessagePart[]; // Array of message parts (overrides text/link if provided)
  /** Start a new chat vs reply in existing — Linq handles dedup */
  chatId?: string;
}

async function linqFetch(path: string, body: unknown, method = "POST") {
  if (!API_KEY) throw new Error("LINQ_API_KEY not set");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(`Linq ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

/** Send a text, link, or multi-part message. */
export async function sendMessage({ to, text, link, parts, chatId }: SendOptions) {
  if (!FROM) throw new Error("LINQ_FROM_NUMBER not set");

  const finalParts: MessagePart[] = parts ? [...parts] : [];
  if (!parts) {
    if (text) finalParts.push({ type: "text", value: text });
    if (link) finalParts.push({ type: "link", url: link });
  }

  // Use existing chat endpoint if we have a chatId, else create a new chat
  const path = chatId ? `/chats/${chatId}/messages` : "/chats";
  const payload = chatId
    ? {
        from: FROM,
        message: { parts: finalParts },
      }
    : {
        from: FROM,
        to: [to],
        message: { parts: finalParts },
      };

  return linqFetch(path, payload);
}

/**
 * Send a typing indicator — "messaging primitives as UI."
 * Per Linq idea-starter: a typing indicator IS a loading state.
 */
export async function setTyping(chatId: string, typing = true) {
  return linqFetch(`/chats/${chatId}/typing`, { typing });
}

/** Send a multi-line status update as one text bubble. */
export async function sendStatus(to: string, lines: string[], chatId?: string) {
  return sendMessage({ to, chatId, text: lines.join("\n") });
}

// ─── Webhook helpers ──────────────────────────────────────────────────────

/**
 * Verify a Linq webhook signature (Standard Webhooks spec, HMAC-SHA256).
 * Reject if timestamp older than 5 minutes.
 *
 * TODO: once we have the signing secret, implement constant-time compare.
 * For now we accept the payload (acceptable for hackathon dev, NOT production).
 */
export function verifyWebhook(
  payload: string,
  signature: string,
  timestamp: string,
  secret: string
): boolean {
  if (!secret) return true; // dev mode — accept all
  const fiveMin = 5 * 60 * 1000;
  const age = Date.now() - parseInt(timestamp) * 1000;
  if (Math.abs(age) > fiveMin) return false;

  // Standard Webhooks: signed payload = `${timestamp}.${payload}`
  // Header format: "v1,signature_base64" (wh-id prefix variant) — check Linq SDK
  // For hackathon: compare directly
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require("crypto");
  const signed = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signed)
    .digest("hex");
  // Extract sig from "v1,sig" header
  const sigPart = signature.split(",").find((s) => s.startsWith("v1=")) ?? signature;
  const provided = sigPart.replace("v1=", "");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(provided, "hex")
    );
  } catch {
    return false;
  }
}

/** Parse the relevant fields out of a Linq inbound message webhook. */
export function parseInbound(body: unknown): {
  from: string;
  to: string;
  text: string;
  chatId: string;
  messageId: string;
} | null {
  const b = body as Record<string, unknown>;
  const data = (b.data ?? b) as Record<string, unknown>;

  // Handle both webhook versions (2025-01-01 and 2026-02-03)
  const from =
    (data.sender_handle as { handle?: string })?.handle ??
    (data.from as string) ??
    (data.from_handle as { handle?: string })?.handle;
  const to =
    (data.chat as { owner_handle?: { handle?: string } })?.owner_handle?.handle ??
    (data.recipient_handle as { handle?: string })?.handle;

  const parts =
    (data.parts as MessagePart[]) ?? (data.message as { parts?: MessagePart[] })?.parts;
  const textPart = parts?.find((p) => p.type === "text");
  const text = textPart?.value ?? "";

  const chatId = (data.chat as { id?: string })?.id ?? (data.chat_id as string) ?? "";
  const messageId = (data.id as string) ?? (data.message_id as string) ?? "";

  if (!from || !text) return null;
  return { from, to: to ?? FROM ?? "", text, chatId, messageId };
}
