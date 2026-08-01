"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * PaymentMode — shared state for the Demo/Live Prava toggle.
 *
 * Lives in a context so the header "wallet" button and the chat page's
 * runPayment() read/write the same value.
 *
 * The toggle is always enabled — this is sandbox-only, never production,
 * so there's no need to gate it behind a specific auth method.
 */
type PaymentModeValue = {
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
};

const PaymentModeContext = createContext<PaymentModeValue | null>(null);

export function PaymentModeProvider({ children }: { children: ReactNode }) {
  const [demoMode, setDemoMode] = useState(true); // default Demo

  return (
    <PaymentModeContext.Provider value={{ demoMode, setDemoMode }}>
      {children}
    </PaymentModeContext.Provider>
  );
}

export function usePaymentMode() {
  const ctx = useContext(PaymentModeContext);
  if (!ctx) throw new Error("usePaymentMode must be used within PaymentModeProvider");
  return ctx;
}
