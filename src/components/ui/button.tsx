import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    // `group` lets a trailing icon respond to the button's own hover.
    "group inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium tracking-[-0.006em]",
    "transition-[background-color,border-color,color,box-shadow,translate] duration-150",
    // The press: the surface dips by a pixel and its shadow settles back,
    // which reads as the control actually moving rather than just recolouring.
    "active:translate-y-px",
    // `focus-glow` supplies the soft ring; the global `:focus-visible` outline
    // still applies underneath it, so focus survives forced-colours mode where
    // box-shadow is dropped.
    "focus-glow",
    "disabled:pointer-events-none disabled:opacity-45 disabled:active:translate-y-0",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: "press bg-primary text-on-primary elevated-1 hover:bg-primary-hover",
        accent: "press bg-accent text-on-accent elevated-1 hover:bg-accent-hover",
        outline:
          "border border-border bg-card text-foreground hover:border-border-strong hover:bg-muted",
        subtle: "bg-muted text-foreground hover:bg-surface-raised",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive: "press bg-destructive text-on-destructive elevated-1 hover:opacity-90",
      },
      size: {
        // 44px on md and icon keeps the primary touch targets accessible;
        // sm is for dense toolbars that sit alongside other controls.
        sm: "h-9 px-3",
        md: "h-11 px-5",
        lg: "h-12 px-7 text-base",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
