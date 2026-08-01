import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: "SaulSilver — The Cannabis Sommelier",
  description:
    "Too many brands. One opinionated guide. SaulSilver interviews you like a sommelier, verifies the pick is legit, then buys it.",
  keywords: ["cannabis", "CBD gummies", "cannabis sommelier", "agentic commerce", "Prava hackathon", "India cannabis"],
  openGraph: {
    title: "SaulSilver — The Cannabis Sommelier",
    description: "Too many brands. One opinionated guide. SaulSilver interviews you, verifies the pick, then buys it.",
    url: "https://saulsilver.vercel.app",
    siteName: "SaulSilver",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SaulSilver — The Cannabis Sommelier",
      }
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SaulSilver — The Cannabis Sommelier",
    description: "Too many brands. One opinionated guide. SaulSilver interviews you, verifies the pick, then buys it.",
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
