import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space", display: "swap" });

export const metadata: Metadata = {
  title: "Saul Silver — The Vijaya Sommelier",
  description:
    "Too many brands. One opinionated guide. Saul Silver interviews you like a sommelier, verifies the pick is legit, then buys it.",
  keywords: ["vijaya", "gummies", "vijaya sommelier", "agentic commerce", "Prava hackathon", "India vijaya"],
  openGraph: {
    title: "Saul Silver — The Vijaya Sommelier",
    description: "Too many brands. One opinionated guide. Saul Silver interviews you, verifies the pick, then buys it.",
    url: "https://saul.pras.fun",
    siteName: "Saul Silver",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Saul Silver — The Vijaya Sommelier",
      }
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Saul Silver — The Vijaya Sommelier",
    description: "Too many brands. One opinionated guide. Saul Silver interviews you, verifies the pick, then buys it.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
