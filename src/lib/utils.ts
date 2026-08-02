import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (minutes < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Resolve a product's image URL.
 * Live-researched brands carry a scraped image_url (og:image / JSON-LD); seeded
 * brands use curated local files at /public/products/<brand>/<slug>.jpg. Falls
 * back to the local path when no scraped URL is present.
 */
export function productImage(
  brandId: string,
  productName: string,
  imageUrl?: string | null
): string {
  if (imageUrl) return imageUrl;
  const slug = productName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return `/products/${brandId}/${slug}.jpg`;
}
