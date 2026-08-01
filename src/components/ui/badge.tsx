import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// NOTE: legacy variant names (matcha/gold/vermillion) are preserved as aliases
// to the new cannabis palette so existing imports keep working during the
// rewrite. New code should use the semantic names (leaf/resin/ember/frost).
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-noir-raised text-ink-soft",
        // semantic
        leaf: "bg-leaf/15 text-leaf-light",
        resin: "bg-resin/15 text-resin-light",
        ember: "bg-ember/15 text-ember",
        frost: "bg-frost/15 text-frost",
        haze: "bg-haze/15 text-haze",
        outline: "border border-border text-ink-muted",
        // legacy aliases (remapped to new palette)
        matcha: "bg-leaf/15 text-leaf-light",
        gold: "bg-resin/15 text-resin-light",
        vermillion: "bg-ember/15 text-ember",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
