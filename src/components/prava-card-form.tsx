"use client";

/**
 * PravaCardForm — mounts Prava's secure iframe for card collection.
 *
 * Built from the official prava-sdk-integration skill template
 * (templates/nextjs/card-form-component.tsx). The critical logic is preserved
 * exactly; only the rendering is adapted to our design system.
 *
 * CRITICAL LOGIC (do not change):
 *   - hasStarted ref for React Strict Mode double-mount handling
 *   - MutationObserver + timeout fallback for onReady detection
 *   - SDK cleanup on unmount
 *   - Session passed as prop (NOT created internally) to avoid duplicate-session bug
 *   - onSuccess is a no-op — payment completion is detected by the PARENT via polling
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { PravaSDK } from "@prava-sdk/core";
import type { PravaError, CardValidationState } from "@prava-sdk/core";
import { Loader2, AlertCircle } from "lucide-react";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_PUBLISHABLE_KEY || "";

interface PravaCardFormProps {
  /** Pre-created session from the server. Do NOT create a session inside this component. */
  session: {
    session_token: string;
    iframe_url: string;
    order_id: string;
    expires_at: string;
  };
  onError?: (error: PravaError | Error) => void;
}

export default function PravaCardForm({ session, onError }: PravaCardFormProps) {
  const sdkRef = useRef<PravaSDK | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // CRITICAL: React Strict Mode double-mount guard.
  const hasStarted = useRef(false);

  const [loading, setLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationState, setValidationState] = useState<CardValidationState | null>(null);

  const mountSdk = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSdkReady(false);

    if (sdkRef.current) {
      sdkRef.current.destroy();
      sdkRef.current = null;
    }

    try {
      const sdk = new PravaSDK({ publishableKey: PUBLISHABLE_KEY });
      sdkRef.current = sdk;

      if (containerRef.current) {
        await sdk.collectPAN({
          sessionToken: session.session_token,
          iframeUrl: session.iframe_url,
          container: containerRef.current,
          onReady: () => {
            setSdkReady(true);
            setLoading(false);
          },
          onChange: (state: CardValidationState) => setValidationState(state),
          onSuccess: () => {
            // Payment completion is handled by the PARENT via polling.
            // Do NOT add payment-result logic here.
          },
          onError: (err: PravaError) => {
            console.error("[prava] collectPAN error:", err.code, err.message);
            setError(err.message);
            onError?.(err);
          },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      onError?.(err instanceof Error ? err : new Error(msg));
      setLoading(false);
    }
  }, [session, onError]);

  // CRITICAL: Mount with Strict Mode handling
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      mountSdk();
    }
    return () => {
      sdkRef.current?.destroy();
      sdkRef.current = null;
      hasStarted.current = false; // ← Reset so remount (Strict Mode) re-initializes
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CRITICAL: Fallback for onReady not firing.
  // MutationObserver detects iframe appearance + 5s hard timeout.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sdkReady) return;

    const hideLoading = () => {
      setSdkReady(true);
      setLoading(false);
    };

    const observer = new MutationObserver(() => {
      if (container.querySelector("iframe")) hideLoading();
    });
    observer.observe(container, { childList: true, subtree: true });

    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      observer.disconnect();
      clearTimeout(timeout);
    };
  }, [sdkReady]);

  return (
    <div>
      {error && (
        <div role="alert" className="rounded-xl border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember">
          <p className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
          <button onClick={mountSdk} className="mt-2 text-xs font-medium underline hover:opacity-80">
            Try again
          </button>
        </div>
      )}

      {loading && !sdkReady && !error && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin text-resin" />
          Loading secure card form…
        </div>
      )}

      {validationState && sdkReady && !error && (
        <div className="mb-2 flex flex-wrap gap-3 text-xs text-ink-muted">
          <span className={validationState.cardNumber.isValid ? "text-leaf-light" : ""}>
            {validationState.cardNumber.isValid ? "✓" : "○"} Card number
          </span>
          <span className={validationState.expiry.isValid ? "text-leaf-light" : ""}>
            {validationState.expiry.isValid ? "✓" : "○"} Expiry
          </span>
          <span className={validationState.cvv.isValid ? "text-leaf-light" : ""}>
            {validationState.cvv.isValid ? "✓" : "○"} CVV
          </span>
        </div>
      )}

      {/* REQUIRED: iframe mounts here. Tall fixed height so Prava's multi-screen
          flow (card form → OTP → passkey) has room — no cramped scroll window. */}
      <div
        ref={containerRef}
        id="prava-card-form"
        style={{ minHeight: "560px", height: "560px", overflow: "hidden" }}
      />
    </div>
  );
}
