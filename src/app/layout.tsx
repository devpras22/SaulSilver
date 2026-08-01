import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: "Kusushi — Your AI Pharmacy Agent",
  description:
    "Tell Kusushi what you need. It finds the medicine, prices it, and delivers — without the phone calls.",
  keywords: ["AI pharmacy", "medicine delivery", "agentic commerce", "Prava hackathon", "health tech"],
  openGraph: {
    title: "Kusushi — Your AI Pharmacy Agent",
    description: "Tell Kusushi what you need. It finds the medicine, prices it, and delivers — without the phone calls.",
    url: "https://kusushi.vercel.app",
    siteName: "Kusushi",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Kusushi AI Pharmacy Assistant",
      }
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kusushi — Your AI Pharmacy Agent",
    description: "Tell Kusushi what you need. It finds the medicine, prices it, and delivers — without the phone calls.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
